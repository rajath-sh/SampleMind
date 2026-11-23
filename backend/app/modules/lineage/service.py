"""
SampleMind Lineage Module - Service Layer
=========================================
Strict isolation: imports only from app.common and local lineage schemas.
Implements:
1. Recursive CTE traversal for multi-generational ancestry trees (upstream).
2. Recursive CTE traversal for multi-generational descendant trees (downstream).
3. DAG graph layout generation with nodes, edges, generation depths, and root/leaf flags.
4. Lineage edge creation with cycle detection and self-reference prevention.
"""

from __future__ import annotations
from typing import List, Dict, Set, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from app.common.database import lock_lineage_writes

from app.common import (
    Sample,
    SampleRelationship,
    AuditLog,
    EntityNotFoundException,
    DuplicateEntityException,
    LineageCycleException,
    SampleMindException,
)
from .schemas import (
    LineageNodeItem,
    LineageEdgeItem,
    LineageGraphResponse,
    RelationshipCreateRequest,
    RelationshipResponse,
)


class LineageService:

    @staticmethod
    def _fetch_node_item(
        db: Session,
        sample: Sample,
        generation: int,
        is_focus: bool = False
    ) -> LineageNodeItem:
        """Helper to compute node metadata including root/leaf topology flags."""
        parent_count = db.query(func.count(SampleRelationship.relationship_id)).filter(
            SampleRelationship.child_sample_id == sample.sample_id
        ).scalar() or 0

        child_count = db.query(func.count(SampleRelationship.relationship_id)).filter(
            SampleRelationship.parent_sample_id == sample.sample_id
        ).scalar() or 0

        loc_code = sample.storage_location.location_code if sample.storage_location else None
        type_code = sample.sample_type.type_code if sample.sample_type else "UNKNOWN"
        type_name = sample.sample_type.type_name if sample.sample_type else "Unknown Type"

        return LineageNodeItem(
            sample_id=sample.sample_id,
            sample_code=sample.sample_code,
            sample_name=sample.sample_name,
            sample_type_code=type_code,
            sample_type_name=type_name,
            sample_status=sample.sample_status,
            quantity_value=float(sample.quantity_value),
            quantity_unit=sample.quantity_unit,
            storage_location_code=loc_code,
            generation=generation,
            is_root=(parent_count == 0),
            is_leaf=(child_count == 0),
            is_focus=is_focus,
            is_ancient=(sample.ancient_specimen is not None),
        )

    @classmethod
    def get_ancestors(
        cls,
        db: Session,
        sample_id: int,
        max_depth: int = 10
    ) -> List[LineageNodeItem]:
        """
        Executes recursive CTE to find all upstream ancestor specimens.
        Generations are negative integers (-1 = direct parent, -2 = grandparent, etc.).
        """
        sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        # SQL Recursive CTE for upstream ancestry
        sql = text("""
            WITH RECURSIVE ancestor_tree(sample_id, depth) AS (
                SELECT parent_sample_id, -1
                FROM "SampleRelationship"
                WHERE child_sample_id = :sample_id AND :max_depth >= 1
                UNION
                SELECT sr.parent_sample_id, at.depth - 1
                FROM "SampleRelationship" sr
                JOIN ancestor_tree at ON sr.child_sample_id = at.sample_id
                WHERE at.depth > -:max_depth
            )
            SELECT sample_id, MAX(depth) as gen
            FROM ancestor_tree
            GROUP BY sample_id
            ORDER BY gen DESC;
        """)

        rows = db.execute(sql, {"sample_id": sample_id, "max_depth": max_depth}).fetchall()
        if not rows:
            return []

        ancestor_ids = [r[0] for r in rows]
        gen_map = {r[0]: r[1] for r in rows}

        samples = db.query(Sample).filter(Sample.sample_id.in_(ancestor_ids)).all()
        sample_map = {s.sample_id: s for s in samples}

        items: List[LineageNodeItem] = []
        for sid in ancestor_ids:
            if sid in sample_map:
                items.append(cls._fetch_node_item(db, sample_map[sid], generation=gen_map[sid]))

        return items

    @classmethod
    def get_descendants(
        cls,
        db: Session,
        sample_id: int,
        max_depth: int = 10
    ) -> List[LineageNodeItem]:
        """
        Executes recursive CTE to find all downstream derived child specimens and aliquots.
        Generations are positive integers (+1 = direct child, +2 = grandchild, etc.).
        """
        sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        # SQL Recursive CTE for downstream descendants
        sql = text("""
            WITH RECURSIVE descendant_tree(sample_id, depth) AS (
                SELECT child_sample_id, 1
                FROM "SampleRelationship"
                WHERE parent_sample_id = :sample_id AND :max_depth >= 1
                UNION
                SELECT sr.child_sample_id, dt.depth + 1
                FROM "SampleRelationship" sr
                JOIN descendant_tree dt ON sr.parent_sample_id = dt.sample_id
                WHERE dt.depth < :max_depth
            )
            SELECT sample_id, MIN(depth) as gen
            FROM descendant_tree
            GROUP BY sample_id
            ORDER BY gen ASC;
        """)

        rows = db.execute(sql, {"sample_id": sample_id, "max_depth": max_depth}).fetchall()
        if not rows:
            return []

        descendant_ids = [r[0] for r in rows]
        gen_map = {r[0]: r[1] for r in rows}

        samples = db.query(Sample).filter(Sample.sample_id.in_(descendant_ids)).all()
        sample_map = {s.sample_id: s for s in samples}

        items: List[LineageNodeItem] = []
        for sid in descendant_ids:
            if sid in sample_map:
                items.append(cls._fetch_node_item(db, sample_map[sid], generation=gen_map[sid]))

        return items

    @classmethod
    def get_lineage_graph(
        cls,
        db: Session,
        sample_id: int,
        direction: str = "all",
        max_depth: int = 10
    ) -> LineageGraphResponse:
        """
        Assembles full DAG payload with nodes, edges, relative generations,
        and topological properties for React Flow rendering.
        """
        focus_sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not focus_sample:
            raise EntityNotFoundException("Sample", sample_id)

        direction_norm = direction.lower().strip()
        nodes_dict: Dict[int, LineageNodeItem] = {}

        # 1. Add focus node at generation 0
        focus_node = cls._fetch_node_item(db, focus_sample, generation=0, is_focus=True)
        nodes_dict[focus_sample.sample_id] = focus_node

        # 2. Add upstream ancestors if requested
        if direction_norm in ("all", "upstream", "up"):
            ancestors = cls.get_ancestors(db=db, sample_id=sample_id, max_depth=max_depth)
            for a in ancestors:
                nodes_dict[a.sample_id] = a

        # 3. Add downstream descendants if requested
        if direction_norm in ("all", "downstream", "down"):
            descendants = cls.get_descendants(db=db, sample_id=sample_id, max_depth=max_depth)
            for d in descendants:
                nodes_dict[d.sample_id] = d

        node_ids = list(nodes_dict.keys())

        # 4. Fetch all relationship edges between nodes in the graph
        relationships = db.query(SampleRelationship).filter(
            SampleRelationship.parent_sample_id.in_(node_ids),
            SampleRelationship.child_sample_id.in_(node_ids)
        ).all()

        edges: List[LineageEdgeItem] = []
        for r in relationships:
            parent_code = nodes_dict[r.parent_sample_id].sample_code if r.parent_sample_id in nodes_dict else "UNK"
            child_code = nodes_dict[r.child_sample_id].sample_code if r.child_sample_id in nodes_dict else "UNK"
            edges.append(LineageEdgeItem(
                relationship_id=r.relationship_id,
                source=r.parent_sample_id,
                target=r.child_sample_id,
                source_code=parent_code,
                target_code=child_code,
                transformation_type=r.transformation_type,
                quantity_transferred=float(r.quantity_transferred) if r.quantity_transferred is not None else None,
                quantity_unit=r.quantity_unit,
                transformed_at=r.transformed_at,
                notes=r.notes
            ))

        return LineageGraphResponse(
            focus_sample_id=focus_sample.sample_id,
            focus_sample_code=focus_sample.sample_code,
            direction=direction,
            max_depth=max_depth,
            total_nodes=len(nodes_dict),
            total_edges=len(edges),
            nodes=list(nodes_dict.values()),
            edges=edges
        )

    @classmethod
    def create_relationship(
        cls,
        db: Session,
        req: RelationshipCreateRequest,
        actor_id: Optional[int] = None
    ) -> RelationshipResponse:
        """
        Creates a directed derivation edge from parent to child with strict cycle detection.
        Rejects self-lineage (parent == child) with HTTP 400.
        Rejects cycles (child is already an ancestor of parent) with HTTP 409 LineageCycleException.
        """
        # 1. Reject self-referential lineage
        if req.parent_sample_id == req.child_sample_id:
            raise SampleMindException(
                status_code=400,
                detail="Self-referential lineage links are prohibited: parent and child sample IDs must be distinct.",
                code="SELF_LINEAGE_PROHIBITED"
            )

        lock_lineage_writes(db)

        # 2. Verify parent exists
        parent = db.query(Sample).filter(Sample.sample_id == req.parent_sample_id).first()
        if not parent:
            raise EntityNotFoundException("Parent Sample", req.parent_sample_id)

        # 3. Verify child exists
        child = db.query(Sample).filter(Sample.sample_id == req.child_sample_id).first()
        if not child:
            raise EntityNotFoundException("Child Sample", req.child_sample_id)

        # 4. Check for duplicate relationship edge
        existing = db.query(SampleRelationship).filter(
            SampleRelationship.parent_sample_id == req.parent_sample_id,
            SampleRelationship.child_sample_id == req.child_sample_id,
            SampleRelationship.transformation_type == req.transformation_type
        ).first()
        if existing:
            raise DuplicateEntityException(
                "SampleRelationship",
                "derivation",
                f"Parent {parent.sample_code} -> Child {child.sample_code} ({req.transformation_type})"
            )

        # 5. Cycle Detection: Check if child is already an ancestor of parent!
        # If child is in ancestors of parent, adding parent -> child would create a directed loop.
        cycle = db.execute(text("""
            WITH RECURSIVE descendants(sample_id) AS (
                SELECT child_sample_id FROM "SampleRelationship" WHERE parent_sample_id = :child
                UNION
                SELECT edge.child_sample_id FROM "SampleRelationship" AS edge
                JOIN descendants ON edge.parent_sample_id = descendants.sample_id
            )
            SELECT 1 FROM descendants WHERE sample_id = :parent
        """), {"child": req.child_sample_id, "parent": req.parent_sample_id}).scalar()
        if cycle:
            raise LineageCycleException(req.parent_sample_id, req.child_sample_id)

        # 6. Insert new lineage relationship edge
        rel = SampleRelationship(
            parent_sample_id=req.parent_sample_id,
            child_sample_id=req.child_sample_id,
            transformation_type=req.transformation_type,
            quantity_transferred=req.quantity_transferred,
            quantity_unit=req.quantity_unit,
            recorded_by=actor_id,
            notes=req.notes
        )
        db.add(rel)
        db.flush()

        # Audit logging
        audit = AuditLog(
            action="CREATE_LINEAGE_EDGE",
            entity_type="SampleRelationship",
            entity_id=rel.relationship_id,
            actor_user_id=actor_id,
            details={
                "parent_sample_id": req.parent_sample_id,
                "parent_sample_code": parent.sample_code,
                "child_sample_id": req.child_sample_id,
                "child_sample_code": child.sample_code,
                "transformation_type": req.transformation_type,
            }
        )
        db.add(audit)
        db.commit()
        db.refresh(rel)

        return RelationshipResponse(
            relationship_id=rel.relationship_id,
            parent_sample_id=rel.parent_sample_id,
            parent_sample_code=parent.sample_code,
            child_sample_id=rel.child_sample_id,
            child_sample_code=child.sample_code,
            transformation_type=rel.transformation_type,
            quantity_transferred=float(rel.quantity_transferred) if rel.quantity_transferred is not None else None,
            quantity_unit=rel.quantity_unit,
            transformed_at=rel.transformed_at,
            recorded_by=rel.recorded_by,
            notes=rel.notes
        )

    @classmethod
    def delete_relationship(
        cls,
        db: Session,
        relationship_id: int,
        actor_id: Optional[int] = None
    ) -> bool:
        """
        Deletes a directed derivation relationship edge between specimens and logs an audit record.
        """
        lock_lineage_writes(db)
        rel = db.query(SampleRelationship).filter(SampleRelationship.relationship_id == relationship_id).first()
        if not rel:
            raise EntityNotFoundException("SampleRelationship", relationship_id)

        parent = db.query(Sample).filter(Sample.sample_id == rel.parent_sample_id).first()
        child = db.query(Sample).filter(Sample.sample_id == rel.child_sample_id).first()

        audit = AuditLog(
            action="DELETE_LINEAGE_EDGE",
            entity_type="SampleRelationship",
            entity_id=rel.relationship_id,
            actor_user_id=actor_id,
            details={
                "parent_sample_id": rel.parent_sample_id,
                "parent_sample_code": parent.sample_code if parent else f"ID#{rel.parent_sample_id}",
                "child_sample_id": rel.child_sample_id,
                "child_sample_code": child.sample_code if child else f"ID#{rel.child_sample_id}",
                "transformation_type": rel.transformation_type,
            }
        )
        db.add(audit)
        db.delete(rel)
        db.commit()
        return True
