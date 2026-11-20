"""
SampleMind Samples Module - Service Layer
=========================================
Strict isolation: imports only from app.common.
Encapsulates biological specimen management, paginated catalog search,
atomic sub-sample derivation, stock depletion, transitive lineage traversal,
permitted status transition rules, and storage movement audit logs.
"""

from __future__ import annotations
from typing import Optional, List, Tuple, Dict, Set
from datetime import datetime, timezone
from app.common.database import acquire_write_lock, lock_lineage_writes
from sqlalchemy.orm import Session
from sqlalchemy import or_, func, desc, text

from app.common import (
    Sample,
    SampleType,
    SampleRelationship,
    SampleStorageHistory,
    SampleQuantityTransaction,
    SampleTest,
    StorageLocation,
    AppUser,
    AuditLog,
    SampleStatus,
    EntityNotFoundException,
    DuplicateEntityException,
    InsufficientQuantityException,
    LineageCycleException,
    ValidationException,
)
from .schemas import (
    SampleCreateRequest,
    SampleUpdateRequest,
    SampleDerivationRequest,
    SampleDerivationResponse,
    SampleListItem,
    SampleDetailResponse,
    SampleRelationshipSummary,
    StorageHistoryItem,
    SampleTypeResponse,
    SampleTestSummary,
    QuantityHistoryItem,
    SampleQuantityHistoryResponse,
    ChainOfCustodyStep,
    ChainOfCustodyResponse,
    SampleQualityMetricsResponse,
    IntegrityAlertItem,
    SampleIntegrityAlertsResponse,
    ReadinessCheckItem,
    SampleReadinessResponse,
    MaterialFlowNode,
    MaterialFlowLink,
    MaterialFlowResponse,
    CryoWellSlot,
    CryoSpatialMapResponse,
)


# Permitted finite-state machine transitions for SampleStatus
ALLOWED_STATUS_TRANSITIONS: Dict[str, Set[str]] = {
    SampleStatus.REGISTERED.value: {
        SampleStatus.IN_STORAGE.value,
        SampleStatus.IN_USE.value,
        SampleStatus.QUARANTINED.value,
        SampleStatus.DISPOSED.value,
        SampleStatus.MISSING.value,
    },
    SampleStatus.IN_STORAGE.value: {
        SampleStatus.IN_USE.value,
        SampleStatus.QUARANTINED.value,
        SampleStatus.DEPLETED.value,
        SampleStatus.DISPOSED.value,
        SampleStatus.MISSING.value,
    },
    SampleStatus.IN_USE.value: {
        SampleStatus.IN_STORAGE.value,
        SampleStatus.QUARANTINED.value,
        SampleStatus.DEPLETED.value,
        SampleStatus.DISPOSED.value,
        SampleStatus.MISSING.value,
    },
    SampleStatus.QUARANTINED.value: {
        SampleStatus.IN_STORAGE.value,
        SampleStatus.IN_USE.value,
        SampleStatus.DISPOSED.value,
    },
    SampleStatus.DEPLETED.value: {
        # Restocking or inventory replenishment workflow
        SampleStatus.IN_STORAGE.value,
        SampleStatus.IN_USE.value,
        SampleStatus.DISPOSED.value,
    },
    SampleStatus.MISSING.value: {
        # Located or written off
        SampleStatus.IN_STORAGE.value,
        SampleStatus.IN_USE.value,
        SampleStatus.DISPOSED.value,
    },
    SampleStatus.DISPOSED.value: set(),  # Terminal state: cannot transition out
}


class SampleService:
    """Core domain service for biological specimens and lineage derivations."""

    @staticmethod
    def _count_transitive_ancestors(db: Session, sample_id: int) -> int:
        """
        Calculates genuine multi-generational ancestor count using recursive SQL CTE.
        Traverses all upstream parent edges across the complete DAG.
        """
        sql = text("""
            WITH RECURSIVE ancestor_tree(sample_id) AS (
                SELECT parent_sample_id
                FROM "SampleRelationship"
                WHERE child_sample_id = :sample_id
                UNION
                SELECT sr.parent_sample_id
                FROM "SampleRelationship" sr
                JOIN ancestor_tree at ON sr.child_sample_id = at.sample_id
            )
            SELECT COUNT(DISTINCT sample_id) FROM ancestor_tree;
        """)
        count = db.execute(sql, {"sample_id": sample_id}).scalar()
        return int(count or 0)

    @staticmethod
    def _count_transitive_descendants(db: Session, sample_id: int) -> int:
        """
        Calculates genuine multi-generational descendant count using recursive SQL CTE.
        Traverses all downstream child edges across the complete DAG.
        """
        sql = text("""
            WITH RECURSIVE descendant_tree(sample_id) AS (
                SELECT child_sample_id
                FROM "SampleRelationship"
                WHERE parent_sample_id = :sample_id
                UNION
                SELECT sr.child_sample_id
                FROM "SampleRelationship" sr
                JOIN descendant_tree dt ON sr.parent_sample_id = dt.sample_id
            )
            SELECT COUNT(DISTINCT sample_id) FROM descendant_tree;
        """)
        count = db.execute(sql, {"sample_id": sample_id}).scalar()
        return int(count or 0)

    @staticmethod
    def _check_lineage_cycle(db: Session, parent_id: int, child_id: int) -> None:
        """
        Defensive check: verifies that adding a derivation edge from parent_id -> child_id
        does not create a cycle in the DAG.
        A cycle occurs if child_id is already an ancestor of parent_id, or parent_id == child_id.
        """
        if parent_id == child_id:
            raise LineageCycleException(parent_id, child_id)

        sql = text("""
            WITH RECURSIVE upstream_ancestors(ancestor_id) AS (
                SELECT parent_sample_id
                FROM "SampleRelationship"
                WHERE child_sample_id = :parent_id
                UNION
                SELECT sr.parent_sample_id
                FROM "SampleRelationship" sr
                JOIN upstream_ancestors ua ON sr.child_sample_id = ua.ancestor_id
            )
            SELECT 1 FROM upstream_ancestors WHERE ancestor_id = :child_id LIMIT 1;
        """)
        is_cycle = db.execute(sql, {"parent_id": parent_id, "child_id": child_id}).scalar()
        if is_cycle:
            raise LineageCycleException(parent_id, child_id)

    @staticmethod
    def list_sample_types(db: Session) -> List[SampleType]:
        """Returns all approved biological specimen classifications."""
        return db.query(SampleType).filter(SampleType.is_active == True).order_by(SampleType.type_name.asc()).all()

    @staticmethod
    def create_sample(
        db: Session,
        req: SampleCreateRequest,
        actor_id: Optional[int] = None
    ) -> Sample:
        """
        Registers a new primary biological specimen.
        Validates sample code uniqueness, sample type existence, and active storage location.
        """
        if req.sample_status == SampleStatus.IN_STORAGE.value and req.current_storage_location_id is None:
            raise ValidationException("In-storage specimens need an active location.", "MISSING_STORAGE_LOCATION")
        if req.sample_status == SampleStatus.DEPLETED.value and req.quantity_value > 0:
            raise ValidationException("Depleted specimens must have zero quantity.", "DEPLETED_WITH_POSITIVE_QUANTITY")

        # Code uniqueness check
        existing = db.query(Sample).filter(Sample.sample_code == req.sample_code).first()
        if existing:
            raise DuplicateEntityException("Sample", "sample_code", req.sample_code)

        # Type existence check
        st = db.query(SampleType).filter(SampleType.sample_type_id == req.sample_type_id).first()
        if not st or not st.is_active:
            raise EntityNotFoundException("Active SampleType", req.sample_type_id)

        # Storage location verification if provided
        if req.current_storage_location_id:
            loc = db.query(StorageLocation).filter(
                StorageLocation.storage_location_id == req.current_storage_location_id
            ).first()
            if not loc:
                raise EntityNotFoundException("StorageLocation", req.current_storage_location_id)
            if not loc.is_active:
                raise ValidationException(
                    f"Storage location '{loc.location_code}' is inactive and cannot accept specimen allocations.",
                    code="INACTIVE_STORAGE_LOCATION"
                )

        new_sample = Sample(
            sample_code=req.sample_code,
            sample_name=req.sample_name,
            sample_type_id=req.sample_type_id,
            source_description=req.source_description,
            collected_at=req.collected_at,
            registered_at=datetime.now(timezone.utc),
            quantity_value=req.quantity_value,
            quantity_unit=req.quantity_unit,
            sample_status=req.sample_status,
            current_storage_location_id=req.current_storage_location_id,
            created_by=actor_id,
            notes=req.notes,
            updated_at=datetime.now(timezone.utc),
        )
        db.add(new_sample)
        db.flush()

        # Log initial storage location history if assigned
        if req.current_storage_location_id:
            history = SampleStorageHistory(
                sample_id=new_sample.sample_id,
                storage_location_id=req.current_storage_location_id,
                moved_at=datetime.now(timezone.utc),
                moved_by=actor_id,
                reason="Initial registration storage placement",
            )
            db.add(history)

        # Record initial auditable quantity transaction
        initial_tx = SampleQuantityTransaction(
            sample_id=new_sample.sample_id,
            transaction_type="INITIAL_REGISTRATION",
            quantity_delta=new_sample.quantity_value,
            balance_after=new_sample.quantity_value,
            quantity_unit=new_sample.quantity_unit,
            performed_by=actor_id,
            notes="Initial specimen accession balance",
            created_at=datetime.now(timezone.utc),
        )
        db.add(initial_tx)

        # Audit log entry
        audit = AuditLog(
            actor_user_id=actor_id,
            action="SAMPLE_REGISTERED",
            entity_type="Sample",
            entity_id=new_sample.sample_id,
            details={
                "sample_code": new_sample.sample_code,
                "sample_name": new_sample.sample_name,
                "quantity": f"{new_sample.quantity_value} {new_sample.quantity_unit}",
            }
        )
        db.add(audit)
        db.commit()
        db.refresh(new_sample)

        return new_sample

    @staticmethod
    def get_sample_by_id(db: Session, sample_id: int) -> SampleDetailResponse:
        """Retrieves comprehensive specimen dossier including storage, lineage, and QC assay history."""
        sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        # Load parent relationships
        parents_query = db.query(
            SampleRelationship, Sample
        ).join(
            Sample, SampleRelationship.parent_sample_id == Sample.sample_id
        ).filter(
            SampleRelationship.child_sample_id == sample_id
        ).all()

        parent_summaries = [
            SampleRelationshipSummary(
                relationship_id=rel.relationship_id,
                related_sample_id=p_sample.sample_id,
                related_sample_code=p_sample.sample_code,
                related_sample_name=p_sample.sample_name,
                transformation_type=rel.transformation_type,
                quantity_transferred=float(rel.quantity_transferred) if rel.quantity_transferred is not None else None,
                quantity_unit=rel.quantity_unit,
                transformed_at=rel.transformed_at,
            )
            for rel, p_sample in parents_query
        ]

        # Load child relationships
        children_query = db.query(
            SampleRelationship, Sample
        ).join(
            Sample, SampleRelationship.child_sample_id == Sample.sample_id
        ).filter(
            SampleRelationship.parent_sample_id == sample_id
        ).all()

        child_summaries = [
            SampleRelationshipSummary(
                relationship_id=rel.relationship_id,
                related_sample_id=c_sample.sample_id,
                related_sample_code=c_sample.sample_code,
                related_sample_name=c_sample.sample_name,
                transformation_type=rel.transformation_type,
                quantity_transferred=float(rel.quantity_transferred) if rel.quantity_transferred is not None else None,
                quantity_unit=rel.quantity_unit,
                transformed_at=rel.transformed_at,
            )
            for rel, c_sample in children_query
        ]

        # Load associated Quality Control assays from SampleTest
        qc_records = db.query(SampleTest).filter(
            SampleTest.sample_id == sample_id
        ).order_by(desc(SampleTest.created_at)).all()

        qc_summaries = [
            SampleTestSummary(
                sample_test_id=t.sample_test_id,
                test_type=t.test_type,
                test_status=t.test_status,
                result_value=float(t.result_value) if t.result_value is not None else None,
                result_unit=t.result_unit,
                result_interpretation=t.result_interpretation,
                performed_at=t.performed_at,
                created_at=t.created_at,
            )
            for t in qc_records
        ]

        # Storage info
        loc = sample.storage_location
        creator = sample.creator

        # Compute real multi-generational transitive counts across the DAG
        transitive_ancestor_count = SampleService._count_transitive_ancestors(db, sample.sample_id)
        transitive_descendant_count = SampleService._count_transitive_descendants(db, sample.sample_id)

        return SampleDetailResponse(
            sample_id=sample.sample_id,
            sample_code=sample.sample_code,
            sample_name=sample.sample_name,
            sample_type_id=sample.sample_type_id,
            sample_type_code=sample.sample_type.type_code if sample.sample_type else "",
            sample_type_name=sample.sample_type.type_name if sample.sample_type else "",
            quantity_value=float(sample.quantity_value),
            quantity_unit=sample.quantity_unit,
            sample_status=sample.sample_status,
            source_description=sample.source_description,
            collected_at=sample.collected_at,
            registered_at=sample.registered_at,
            updated_at=sample.updated_at,
            current_storage_location_id=sample.current_storage_location_id,
            current_storage_location_code=loc.location_code if loc else None,
            facility=loc.facility if loc else None,
            room=loc.room if loc else None,
            slot=loc.slot if loc else None,
            created_by=sample.created_by,
            created_by_name=creator.display_name if creator else None,
            notes=sample.notes,
            is_ancient=sample.ancient_specimen is not None,
            ancestor_count=transitive_ancestor_count,
            descendant_count=transitive_descendant_count,
            parents=parent_summaries,
            children=child_summaries,
            qc_tests=qc_summaries,
        )

    @staticmethod
    def list_samples(
        db: Session,
        search: Optional[str] = None,
        type_id: Optional[int] = None,
        status: Optional[str] = None,
        low_volume_only: Optional[bool] = False,
        low_volume_threshold: float = 10.0,
        sort_by: Optional[str] = "registered_at",
        sort_dir: Optional[str] = "desc",
        page: int = 1,
        page_size: int = 20,
    ) -> Tuple[List[SampleListItem], int]:
        """Queries biological sample catalog with search, filters, sorting, and pagination."""
        query = db.query(Sample)

        if search:
            pattern = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Sample.sample_code.ilike(pattern),
                    Sample.sample_name.ilike(pattern),
                    Sample.source_description.ilike(pattern)
                )
            )

        if type_id:
            query = query.filter(Sample.sample_type_id == type_id)

        if status:
            s_upper = status.strip().upper()
            if s_upper == "AVAILABLE":
                query = query.filter(
                    Sample.sample_status.in_([SampleStatus.IN_STORAGE.value, SampleStatus.REGISTERED.value, "AVAILABLE"]),
                    Sample.quantity_value > 0
                )
            else:
                query = query.filter(Sample.sample_status == s_upper)

        if low_volume_only:
            query = query.filter(
                Sample.quantity_value <= low_volume_threshold,
                Sample.quantity_value > 0,
                ~Sample.sample_status.in_([SampleStatus.DEPLETED.value, SampleStatus.DISPOSED.value])
            )

        # Multi-column sorting
        sort_map = {
            "code": Sample.sample_code,
            "sample_code": Sample.sample_code,
            "name": Sample.sample_name,
            "sample_name": Sample.sample_name,
            "quantity": Sample.quantity_value,
            "quantity_value": Sample.quantity_value,
            "status": Sample.sample_status,
            "sample_status": Sample.sample_status,
            "registered_at": Sample.registered_at,
        }

        sb_lower = (sort_by or "registered_at").lower()
        if sb_lower in ("type", "sample_type"):
            query = query.join(SampleType, Sample.sample_type_id == SampleType.sample_type_id, isouter=True)
            sort_col = SampleType.type_code
        else:
            sort_col = sort_map.get(sb_lower, Sample.registered_at)

        if (sort_dir or "desc").lower() == "asc":
            order_clause = sort_col.asc()
        else:
            order_clause = sort_col.desc()

        total = query.count()
        offset = (page - 1) * page_size
        samples = query.order_by(order_clause).offset(offset).limit(page_size).all()

        items = [
            SampleListItem(
                sample_id=s.sample_id,
                sample_code=s.sample_code,
                sample_name=s.sample_name,
                sample_type_id=s.sample_type_id,
                sample_type_code=s.sample_type.type_code if s.sample_type else "",
                sample_type_name=s.sample_type.type_name if s.sample_type else "",
                quantity_value=float(s.quantity_value),
                quantity_unit=s.quantity_unit,
                sample_status=s.sample_status,
                current_storage_location_id=s.current_storage_location_id,
                current_storage_location_code=s.storage_location.location_code if s.storage_location else None,
                is_ancient=s.ancient_specimen is not None,
                registered_at=s.registered_at,
            )
            for s in samples
        ]
        return items, total

    @staticmethod
    def update_sample(
        db: Session,
        sample_id: int,
        req: SampleUpdateRequest,
        actor_id: Optional[int] = None
    ) -> SampleDetailResponse:
        """
        Updates metadata, quantity, location, or status of a biological specimen.
        Validates permitted status transitions, active storage destinations, and data invariants.
        """
        sample = acquire_write_lock(db, Sample, sample_id)
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        old_location_id = sample.current_storage_location_id
        old_state = {
            "quantity": float(sample.quantity_value),
            "status": sample.sample_status,
            "location_id": old_location_id,
        }

        # 1. Validate permitted status transitions
        if req.sample_status is not None and req.sample_status != sample.sample_status:
            current_status = sample.sample_status
            new_status = req.sample_status

            allowed = ALLOWED_STATUS_TRANSITIONS.get(current_status, set())
            if new_status not in allowed:
                raise ValidationException(
                    f"Illegal status transition: cannot transition specimen '{sample.sample_code}' from '{current_status}' to '{new_status}'. Permitted transitions: {sorted(list(allowed))}.",
                    code="ILLEGAL_STATUS_TRANSITION"
                )

            # Invariant: Depleted status requires 0 remaining quantity
            effective_qty = req.quantity_value if req.quantity_value is not None else float(sample.quantity_value)
            if new_status == SampleStatus.DEPLETED.value and effective_qty > 0:
                raise ValidationException(
                    f"Cannot transition specimen '{sample.sample_code}' to DEPLETED while remaining quantity is {effective_qty} {sample.quantity_unit}. Quantity must be 0 to mark DEPLETED.",
                    code="DEPLETED_WITH_POSITIVE_QUANTITY"
                )

            # Invariant: Restocking from Depleted requires positive quantity
            if current_status == SampleStatus.DEPLETED.value and new_status in (SampleStatus.IN_STORAGE.value, SampleStatus.IN_USE.value) and effective_qty <= 0:
                raise ValidationException(
                    f"Cannot restore depleted specimen '{sample.sample_code}' to active status '{new_status}' without replenishing quantity > 0.",
                    code="RESTOCK_ZERO_QUANTITY"
                )

            # Invariant: IN_STORAGE requires a valid storage location
            effective_loc = req.current_storage_location_id if req.current_storage_location_id is not None else sample.current_storage_location_id
            if new_status == SampleStatus.IN_STORAGE.value and not effective_loc:
                raise ValidationException(
                    f"Cannot transition specimen '{sample.sample_code}' to IN_STORAGE without assigning an active storage coordinate.",
                    code="MISSING_STORAGE_LOCATION"
                )

            sample.sample_status = new_status

        if req.sample_name is not None:
            sample.sample_name = req.sample_name
        if req.source_description is not None:
            sample.source_description = req.source_description
        if req.quantity_value is not None and float(req.quantity_value) != float(sample.quantity_value):
            delta = round(float(req.quantity_value) - float(sample.quantity_value), 4)
            adj_tx = SampleQuantityTransaction(
                sample_id=sample.sample_id,
                transaction_type="ADJUSTMENT",
                quantity_delta=delta,
                balance_after=float(req.quantity_value),
                quantity_unit=req.quantity_unit or sample.quantity_unit,
                performed_by=actor_id,
                notes=req.notes or f"Inventory quantity adjustment ({delta:+.2f} {sample.quantity_unit})",
                created_at=datetime.now(timezone.utc),
            )
            db.add(adj_tx)
            sample.quantity_value = req.quantity_value
        if req.quantity_unit is not None:
            sample.quantity_unit = req.quantity_unit
        if req.notes is not None:
            sample.notes = req.notes

        # 2. Handle storage relocation with active location check
        if req.current_storage_location_id is not None and req.current_storage_location_id != old_location_id:
            loc = db.query(StorageLocation).filter(
                StorageLocation.storage_location_id == req.current_storage_location_id
            ).first()
            if not loc:
                raise EntityNotFoundException("StorageLocation", req.current_storage_location_id)
            if not loc.is_active:
                raise ValidationException(
                    f"Storage location '{loc.location_code}' is inactive and cannot accept specimen allocations.",
                    code="INACTIVE_STORAGE_LOCATION"
                )

            sample.current_storage_location_id = req.current_storage_location_id

            # Add movement history
            history = SampleStorageHistory(
                sample_id=sample.sample_id,
                storage_location_id=req.current_storage_location_id,
                moved_at=datetime.now(timezone.utc),
                moved_by=actor_id,
                reason=req.movement_reason or "Relocation transfer",
            )
            db.add(history)

        sample.updated_at = datetime.now(timezone.utc)

        # Audit log entry
        audit = AuditLog(
            actor_user_id=actor_id,
            action="SAMPLE_UPDATED",
            entity_type="Sample",
            entity_id=sample.sample_id,
            details={
                "sample_code": sample.sample_code,
                "old_state": old_state,
                "new_status": sample.sample_status,
                "previous_storage_location_id": old_location_id,
                "new_storage_location_id": sample.current_storage_location_id,
                "new_quantity": f"{sample.quantity_value} {sample.quantity_unit}",
            }
        )
        db.add(audit)
        db.commit()

        return SampleService.get_sample_by_id(db, sample_id)

    @staticmethod
    def derive_child_sample(
        db: Session,
        parent_sample_id: int,
        req: SampleDerivationRequest,
        actor_id: Optional[int] = None
    ) -> SampleDerivationResponse:
        """
        ATOMIC SUB-SAMPLE DERIVATION (Phase 1 Hardened):
        1. Validates parent specimen existence and active status.
           Rejects derivation from QUARANTINED, DEPLETED, DISPOSED, or MISSING specimens.
        2. Validates unit compatibility between parent stock and derivation request.
        3. Validates positive transfer quantity and rejects stock overdrafts.
        4. Validates child code uniqueness and child sample type existence.
        5. Validates child destination storage location (must exist and be active).
        6. Executes stock deduction, child sample insertion, lineage edge creation,
           cycle prevention verification, storage history logging, and audit logging
           within a single atomic database transaction with explicit rollback on error.
        """
        # Serialize graph writers before acquiring stock row locks.
        lock_lineage_writes(db)
        parent = acquire_write_lock(db, Sample, parent_sample_id)
        if not parent:
            raise EntityNotFoundException("Sample", parent_sample_id)

        # 2. Parent status validation
        invalid_parent_statuses = {
            SampleStatus.QUARANTINED.value,
            SampleStatus.DEPLETED.value,
            SampleStatus.DISPOSED.value,
            SampleStatus.MISSING.value,
        }
        if parent.sample_status in invalid_parent_statuses:
            raise ValidationException(
                f"Cannot derive child sample: parent specimen '{parent.sample_code}' is currently in '{parent.sample_status}' status. Only active specimens in REGISTERED, IN_STORAGE, or IN_USE may be derived.",
                code="INVALID_PARENT_STATUS"
            )

        # 3. Unit compatibility validation
        parent_unit = (parent.quantity_unit or "").strip().lower()
        requested_unit = (req.quantity_unit or "").strip().lower()
        if parent_unit != requested_unit:
            raise ValidationException(
                f"Quantity unit mismatch: parent specimen stock is recorded in '{parent.quantity_unit}' but requested derivation unit is '{req.quantity_unit}'. Derivation units must match parent stock unit.",
                code="UNIT_MISMATCH"
            )

        # 4. Stock quantity validation
        if req.quantity_transferred <= 0:
            raise ValidationException(
                "Transfer quantity must be strictly greater than 0.",
                code="INVALID_QUANTITY"
            )

        parent_current_qty = float(parent.quantity_value)
        if parent_current_qty < req.quantity_transferred:
            raise InsufficientQuantityException(
                available=parent_current_qty,
                requested=req.quantity_transferred,
                unit=parent.quantity_unit
            )

        # 5. Check child code uniqueness
        child_exists = db.query(Sample).filter(Sample.sample_code == req.child_sample_code).first()
        if child_exists:
            raise DuplicateEntityException("Sample", "sample_code", req.child_sample_code)

        # 6. Check child sample type exists and is active
        child_st = db.query(SampleType).filter(SampleType.sample_type_id == req.child_sample_type_id).first()
        if not child_st or not child_st.is_active:
            raise EntityNotFoundException("Active SampleType", req.child_sample_type_id)

        # 7. Validate child destination storage location if provided
        if req.child_storage_location_id:
            child_loc = db.query(StorageLocation).filter(
                StorageLocation.storage_location_id == req.child_storage_location_id
            ).first()
            if not child_loc:
                raise EntityNotFoundException("StorageLocation", req.child_storage_location_id)
            if not child_loc.is_active:
                raise ValidationException(
                    f"Destination storage location '{child_loc.location_code}' is inactive and cannot accept new aliquots.",
                    code="INACTIVE_STORAGE_LOCATION"
                )

        # 8. Single atomic transactional boundary with rollback safety
        try:
            # Deduct parent quantity
            remaining_qty = round(parent_current_qty - req.quantity_transferred, 4)
            parent.quantity_value = remaining_qty
            if remaining_qty <= 0:
                parent.sample_status = SampleStatus.DEPLETED.value

            parent.updated_at = datetime.now(timezone.utc)

            # Provision child sample
            child_status = SampleStatus.IN_STORAGE.value if req.child_storage_location_id else SampleStatus.REGISTERED.value
            child_sample = Sample(
                sample_code=req.child_sample_code,
                sample_name=req.child_sample_name,
                sample_type_id=req.child_sample_type_id,
                source_description=f"Derived from parent specimen '{parent.sample_code}' via {req.transformation_type}",
                quantity_value=req.quantity_transferred,
                quantity_unit=parent.quantity_unit,
                sample_status=child_status,
                current_storage_location_id=req.child_storage_location_id,
                created_by=actor_id,
                notes=req.notes,
                registered_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(child_sample)
            db.flush()

            # Record lineage relationship edge
            derivation_time = datetime.now(timezone.utc)
            relationship = SampleRelationship(
                parent_sample_id=parent.sample_id,
                child_sample_id=child_sample.sample_id,
                transformation_type=req.transformation_type,
                transformed_at=derivation_time,
                quantity_transferred=req.quantity_transferred,
                quantity_unit=parent.quantity_unit,
                recorded_by=actor_id,
                notes=req.notes,
            )
            db.add(relationship)
            db.flush()

            # Defensive cycle detection check
            SampleService._check_lineage_cycle(db, parent.sample_id, child_sample.sample_id)

            # Record initial storage placement for child if assigned
            if req.child_storage_location_id:
                child_history = SampleStorageHistory(
                    sample_id=child_sample.sample_id,
                    storage_location_id=req.child_storage_location_id,
                    moved_at=derivation_time,
                    moved_by=actor_id,
                    reason=f"Initial aliquot storage placement derived from {parent.sample_code}",
                )
                db.add(child_history)

            # Record parent aliquot deduction transaction
            parent_tx = SampleQuantityTransaction(
                sample_id=parent.sample_id,
                transaction_type="ALIQUOT_DERIVATION",
                quantity_delta=-req.quantity_transferred,
                balance_after=remaining_qty,
                quantity_unit=parent.quantity_unit,
                reference_sample_id=child_sample.sample_id,
                reference_type="CHILD_ALIQUOT",
                notes=f"Sub-sample derivation: transferred to child '{child_sample.sample_code}' via {req.transformation_type}",
                performed_by=actor_id,
                created_at=derivation_time,
            )
            db.add(parent_tx)

            # Record child initial stock transaction
            child_tx = SampleQuantityTransaction(
                sample_id=child_sample.sample_id,
                transaction_type="INITIAL_REGISTRATION",
                quantity_delta=req.quantity_transferred,
                balance_after=req.quantity_transferred,
                quantity_unit=parent.quantity_unit,
                reference_sample_id=parent.sample_id,
                reference_type="PARENT_SPECIMEN",
                notes=f"Derived aliquot from parent '{parent.sample_code}' via {req.transformation_type}",
                performed_by=actor_id,
                created_at=derivation_time,
            )
            db.add(child_tx)

            # Audit logging
            audit = AuditLog(
                actor_user_id=actor_id,
                action="SAMPLE_DERIVED",
                entity_type="Sample",
                entity_id=child_sample.sample_id,
                details={
                    "parent_sample_id": parent.sample_id,
                    "child_sample_id": child_sample.sample_id,
                    "parent_sample_code": parent.sample_code,
                    "child_sample_code": child_sample.sample_code,
                    "transformation_type": req.transformation_type,
                    "quantity_transferred": f"{req.quantity_transferred} {parent.quantity_unit}",
                    "parent_remaining_quantity": f"{remaining_qty} {parent.quantity_unit}",
                    "parent_status": parent.sample_status,
                }
            )
            db.add(audit)
            db.commit()

            return SampleDerivationResponse(
                parent_sample_id=parent.sample_id,
                parent_sample_code=parent.sample_code,
                parent_remaining_quantity=remaining_qty,
                parent_status=parent.sample_status,
                child_sample_id=child_sample.sample_id,
                child_sample_code=child_sample.sample_code,
                child_sample_name=child_sample.sample_name,
                transformation_type=req.transformation_type,
                relationship_id=relationship.relationship_id,
                derived_at=derivation_time,
            )
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def get_sample_storage_history(db: Session, sample_id: int) -> List[StorageHistoryItem]:
        """Retrieves physical movement audit history for a specimen."""
        sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        history_rows = db.query(
            SampleStorageHistory, StorageLocation, AppUser
        ).outerjoin(
            StorageLocation, SampleStorageHistory.storage_location_id == StorageLocation.storage_location_id
        ).outerjoin(
            AppUser, SampleStorageHistory.moved_by == AppUser.user_id
        ).filter(
            SampleStorageHistory.sample_id == sample_id
        ).order_by(desc(SampleStorageHistory.moved_at)).all()

        results = []
        for h, loc, user in history_rows:
            results.append(StorageHistoryItem(
                storage_history_id=h.storage_history_id,
                sample_id=h.sample_id,
                storage_location_id=h.storage_location_id,
                location_code=loc.location_code if loc else None,
                facility=loc.facility if loc else None,
                unit_label=loc.unit_label if loc else None,
                slot=loc.slot if loc else None,
                moved_at=h.moved_at,
                moved_by_name=user.display_name if user else None,
                reason=h.reason,
            ))
        return results

    @staticmethod
    def get_sample_quantity_history(db: Session, sample_id: int) -> SampleQuantityHistoryResponse:
        """
        Retrieves complete auditable quantity history and balance distribution for a specimen.
        Integrates explicit SampleQuantityTransaction records with fallback reconstruction
        from SampleRelationship and initial creation for existing records.
        """
        sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        # 1. Query explicit quantity transactions
        raw_txs = db.query(SampleQuantityTransaction, AppUser, Sample).outerjoin(
            AppUser, SampleQuantityTransaction.performed_by == AppUser.user_id
        ).outerjoin(
            Sample, SampleQuantityTransaction.reference_sample_id == Sample.sample_id
        ).filter(
            SampleQuantityTransaction.sample_id == sample_id
        ).order_by(SampleQuantityTransaction.created_at.asc()).all()

        items: List[QuantityHistoryItem] = []
        if raw_txs:
            for tx, user, ref in raw_txs:
                items.append(QuantityHistoryItem(
                    transaction_id=tx.transaction_id,
                    transaction_type=tx.transaction_type,
                    quantity_delta=float(tx.quantity_delta),
                    balance_after=float(tx.balance_after),
                    quantity_unit=tx.quantity_unit,
                    event_timestamp=tx.created_at,
                    performed_by_name=user.display_name if user else None,
                    reference_sample_id=tx.reference_sample_id,
                    reference_sample_code=ref.sample_code if ref else None,
                    reference_sample_name=ref.sample_name if ref else None,
                    transformation_type=None,
                    notes=tx.notes,
                ))
            first_tx = items[0]
            initial_qty = first_tx.balance_after if first_tx.transaction_type == "INITIAL_REGISTRATION" else (first_tx.balance_after - first_tx.quantity_delta)
        else:
            # 2. Fallback Reconstruction from SampleRelationship & Sample
            child_rels = db.query(SampleRelationship, Sample).join(
                Sample, SampleRelationship.child_sample_id == Sample.sample_id
            ).filter(
                SampleRelationship.parent_sample_id == sample_id
            ).order_by(SampleRelationship.transformed_at.asc()).all()

            parent_rel = db.query(SampleRelationship, Sample).join(
                Sample, SampleRelationship.parent_sample_id == Sample.sample_id
            ).filter(
                SampleRelationship.child_sample_id == sample_id
            ).first()

            total_child_transferred = sum(float(r.quantity_transferred or 0.0) for r, _ in child_rels)
            current_qty = float(sample.quantity_value)

            if parent_rel:
                initial_qty = float(parent_rel[0].quantity_transferred) if parent_rel[0].quantity_transferred is not None else (current_qty + total_child_transferred)
                items.append(QuantityHistoryItem(
                    transaction_id=None,
                    transaction_type="INITIAL_REGISTRATION",
                    quantity_delta=initial_qty,
                    balance_after=initial_qty,
                    quantity_unit=sample.quantity_unit,
                    event_timestamp=sample.registered_at,
                    performed_by_name=sample.creator.display_name if sample.creator else None,
                    reference_sample_id=parent_rel[1].sample_id,
                    reference_sample_code=parent_rel[1].sample_code,
                    reference_sample_name=parent_rel[1].sample_name,
                    transformation_type=parent_rel[0].transformation_type,
                    notes=f"Derived from parent '{parent_rel[1].sample_code}' via {parent_rel[0].transformation_type}",
                ))
            else:
                initial_qty = round(current_qty + total_child_transferred, 4)
                items.append(QuantityHistoryItem(
                    transaction_id=None,
                    transaction_type="INITIAL_REGISTRATION",
                    quantity_delta=initial_qty,
                    balance_after=initial_qty,
                    quantity_unit=sample.quantity_unit,
                    event_timestamp=sample.registered_at,
                    performed_by_name=sample.creator.display_name if sample.creator else None,
                    reference_sample_id=None,
                    reference_sample_code=None,
                    reference_sample_name=None,
                    transformation_type=None,
                    notes=f"Initial biological specimen accession ({initial_qty} {sample.quantity_unit})",
                ))

            running_balance = initial_qty
            for r, c_sample in child_rels:
                q_trans = float(r.quantity_transferred or 0.0)
                running_balance = max(0.0, round(running_balance - q_trans, 4))
                items.append(QuantityHistoryItem(
                    transaction_id=None,
                    transaction_type="ALIQUOT_DERIVATION",
                    quantity_delta=-q_trans,
                    balance_after=running_balance,
                    quantity_unit=sample.quantity_unit,
                    event_timestamp=r.transformed_at,
                    performed_by_name=None,
                    reference_sample_id=c_sample.sample_id,
                    reference_sample_code=c_sample.sample_code,
                    reference_sample_name=c_sample.sample_name,
                    transformation_type=r.transformation_type,
                    notes=f"Aliquot transferred to child '{c_sample.sample_code}' via {r.transformation_type}",
                ))

        cur_qty = float(sample.quantity_value)
        total_deducted = max(0.0, round(initial_qty - cur_qty, 4))
        utilization_pct = round((total_deducted / initial_qty * 100.0), 1) if initial_qty > 0 else 0.0
        derivation_count = len([it for it in items if it.transaction_type == "ALIQUOT_DERIVATION"])

        return SampleQuantityHistoryResponse(
            sample_id=sample.sample_id,
            sample_code=sample.sample_code,
            sample_name=sample.sample_name,
            current_quantity=cur_qty,
            initial_quantity=initial_qty,
            quantity_unit=sample.quantity_unit,
            total_deducted=total_deducted,
            utilization_pct=utilization_pct,
            derivation_count=derivation_count,
            transactions=items,
        )

    @staticmethod
    def get_chain_of_custody(db: Session, sample_id: int) -> ChainOfCustodyResponse:
        """
        Retrieves chronological chain-of-custody timeline with consecutive old/new location pairs,
        responsible operators, movement authorization reasons, and elapsed durations.
        """
        sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        history_rows = db.query(
            SampleStorageHistory, StorageLocation, AppUser
        ).outerjoin(
            StorageLocation, SampleStorageHistory.storage_location_id == StorageLocation.storage_location_id
        ).outerjoin(
            AppUser, SampleStorageHistory.moved_by == AppUser.user_id
        ).filter(
            SampleStorageHistory.sample_id == sample_id
        ).order_by(SampleStorageHistory.moved_at.asc()).all()

        steps: List[ChainOfCustodyStep] = []
        prev_loc: Optional[StorageLocation] = None
        prev_time: Optional[datetime] = None

        def format_duration(td) -> str:
            total_secs = int(td.total_seconds())
            if total_secs < 60:
                return "Just now"
            minutes = total_secs // 60
            if minutes < 60:
                return f"{minutes}m later"
            hours = minutes // 60
            if hours < 24:
                return f"{hours}h {minutes % 60}m later"
            days = hours // 24
            return f"{days}d {hours % 24}h later"

        step_idx = 1
        if not history_rows:
            if sample.current_storage_location_id and sample.storage_location:
                loc = sample.storage_location
                steps.append(ChainOfCustodyStep(
                    step_number=1,
                    storage_history_id=None,
                    event_timestamp=sample.registered_at,
                    action_label="Initial Storage Placement",
                    from_location_code=None,
                    to_location_code=loc.location_code,
                    from_facility=None,
                    to_facility=loc.facility,
                    to_unit_label=loc.unit_label or loc.unit_type,
                    to_slot=loc.slot,
                    moved_by_name=sample.creator.display_name if sample.creator else "System Operator",
                    reason="Initial specimen accession",
                    elapsed_time_human="Initial Event",
                ))
        else:
            for h, loc, user in history_rows:
                elapsed_str = "Initial Event"
                if prev_time is not None:
                    diff = h.moved_at - prev_time
                    elapsed_str = format_duration(diff)

                is_initial = (step_idx == 1)
                action_label = "Specimen Accession & Storage Placement" if is_initial else "Custody Transfer & Relocation"
                if loc is None:
                    action_label = "Retrieved from Storage / Temporary Checkout"

                steps.append(ChainOfCustodyStep(
                    step_number=step_idx,
                    storage_history_id=h.storage_history_id,
                    event_timestamp=h.moved_at,
                    action_label=action_label,
                    from_location_code=prev_loc.location_code if prev_loc else None,
                    to_location_code=loc.location_code if loc else "Unassigned / Checked Out",
                    from_facility=prev_loc.facility if prev_loc else None,
                    to_facility=loc.facility if loc else None,
                    to_unit_label=loc.unit_label or loc.unit_type if loc else None,
                    to_slot=loc.slot if loc else None,
                    moved_by_name=user.display_name if user else "System Operator",
                    reason=h.reason or ("Initial registration storage placement" if is_initial else "Relocation transfer"),
                    elapsed_time_human=elapsed_str,
                ))

                prev_loc = loc
                prev_time = h.moved_at
                step_idx += 1

        cur_loc_code = sample.storage_location.location_code if sample.storage_location else None
        return ChainOfCustodyResponse(
            sample_id=sample.sample_id,
            sample_code=sample.sample_code,
            sample_name=sample.sample_name,
            current_location_code=cur_loc_code,
            current_status=sample.sample_status,
            total_movements=len(steps),
            steps=steps,
        )

    @staticmethod
    def get_quality_metrics(db: Session, low_volume_threshold: float = 10.0) -> SampleQualityMetricsResponse:
        """
        Calculates operational inventory metrics directly from database records.
        """
        total_samples = db.query(Sample).count()

        available_samples = db.query(Sample).filter(
            Sample.sample_status.in_([SampleStatus.IN_STORAGE.value, SampleStatus.REGISTERED.value, "AVAILABLE"]),
            Sample.quantity_value > 0
        ).count()

        low_volume_samples = db.query(Sample).filter(
            Sample.quantity_value <= low_volume_threshold,
            Sample.quantity_value > 0,
            ~Sample.sample_status.in_([SampleStatus.DEPLETED.value, SampleStatus.DISPOSED.value])
        ).count()

        quarantined_samples = db.query(Sample).filter(
            Sample.sample_status == SampleStatus.QUARANTINED.value
        ).count()

        missing_samples = db.query(Sample).filter(
            Sample.sample_status == SampleStatus.MISSING.value
        ).count()

        depleted_samples = db.query(Sample).filter(
            or_(
                Sample.sample_status == SampleStatus.DEPLETED.value,
                Sample.quantity_value <= 0
            )
        ).count()

        return SampleQualityMetricsResponse(
            total_samples=total_samples,
            available_samples=available_samples,
            low_volume_samples=low_volume_samples,
            quarantined_samples=quarantined_samples,
            missing_samples=missing_samples,
            depleted_samples=depleted_samples,
            low_volume_threshold=low_volume_threshold,
        )

    @staticmethod
    def get_integrity_alerts(db: Session) -> SampleIntegrityAlertsResponse:
        """
        Scans database invariants and returns detected data integrity alerts.
        """
        alerts: List[IntegrityAlertItem] = []

        # Invariant 1: Active status but zero or negative quantity balance
        zero_qty_samples = db.query(Sample).filter(
            Sample.quantity_value <= 0,
            Sample.sample_status.in_([
                SampleStatus.IN_STORAGE.value,
                SampleStatus.REGISTERED.value,
                SampleStatus.IN_USE.value,
                "AVAILABLE"
            ])
        ).all()
        for s in zero_qty_samples:
            alerts.append(IntegrityAlertItem(
                rule_code="ZERO_QTY_IN_ACTIVE_STATUS",
                severity="WARNING",
                sample_id=s.sample_id,
                sample_code=s.sample_code,
                sample_name=s.sample_name,
                description=f"Specimen is marked '{s.sample_status}' but has non-positive balance ({float(s.quantity_value):.1f} {s.quantity_unit}).",
                remedy="Transition status to DEPLETED or record quantity replenishment in ledger."
            ))

        # Invariant 2: Marked DEPLETED but has positive remaining quantity
        depleted_pos_qty = db.query(Sample).filter(
            Sample.sample_status == SampleStatus.DEPLETED.value,
            Sample.quantity_value > 0
        ).all()
        for s in depleted_pos_qty:
            alerts.append(IntegrityAlertItem(
                rule_code="DEPLETED_WITH_POSITIVE_QTY",
                severity="WARNING",
                sample_id=s.sample_id,
                sample_code=s.sample_code,
                sample_name=s.sample_name,
                description=f"Specimen is flagged DEPLETED but still retains {float(s.quantity_value):.1f} {s.quantity_unit} in inventory.",
                remedy="Reactivate status to IN_STORAGE or adjust remaining balance to 0.0."
            ))

        # Invariant 3: IN_STORAGE status but storage_location_id is NULL
        in_storage_no_loc = db.query(Sample).filter(
            Sample.sample_status == SampleStatus.IN_STORAGE.value,
            Sample.current_storage_location_id.is_(None)
        ).all()
        for s in in_storage_no_loc:
            alerts.append(IntegrityAlertItem(
                rule_code="IN_STORAGE_MISSING_LOCATION",
                severity="CRITICAL",
                sample_id=s.sample_id,
                sample_code=s.sample_code,
                sample_name=s.sample_name,
                description="Specimen is marked IN_STORAGE but has no physical storage location assigned.",
                remedy="Assign specimen to an active cryogenic freezer or storage cabinet coordinate."
            ))

        # Invariant 4: Storage assigned to deactivated/decommissioned location
        inactive_storage = db.query(Sample, StorageLocation).join(
            StorageLocation, Sample.current_storage_location_id == StorageLocation.storage_location_id
        ).filter(
            StorageLocation.is_active == False
        ).all()
        for s, loc in inactive_storage:
            alerts.append(IntegrityAlertItem(
                rule_code="INACTIVE_STORAGE_ALLOCATION",
                severity="CRITICAL",
                sample_id=s.sample_id,
                sample_code=s.sample_code,
                sample_name=s.sample_name,
                description=f"Specimen is assigned to deactivated or decommissioned storage unit '{loc.location_code}'.",
                remedy="Relocate specimen immediately to an active, validated storage location."
            ))

        # Invariant 5: Derivation unit mismatch between parent and child relationship record
        rels = db.query(SampleRelationship, Sample).join(
            Sample, SampleRelationship.parent_sample_id == Sample.sample_id
        ).all()
        for rel, parent in rels:
            if rel.quantity_unit and parent.quantity_unit:
                if rel.quantity_unit.strip().lower() != parent.quantity_unit.strip().lower():
                    alerts.append(IntegrityAlertItem(
                        rule_code="UNIT_MISMATCH_DERIVATION",
                        severity="INFO",
                        sample_id=parent.sample_id,
                        sample_code=parent.sample_code,
                        sample_name=parent.sample_name,
                        description=f"Derivation transfer unit '{rel.quantity_unit}' differs from parent specimen stock unit '{parent.quantity_unit}'.",
                        remedy="Standardize measurement units across derivation transactions."
                    ))

        critical_count = sum(1 for a in alerts if a.severity == "CRITICAL")
        warning_count = sum(1 for a in alerts if a.severity == "WARNING")
        info_count = sum(1 for a in alerts if a.severity == "INFO")

        return SampleIntegrityAlertsResponse(
            total_alerts=len(alerts),
            critical_count=critical_count,
            warning_count=warning_count,
            info_count=info_count,
            alerts=alerts
        )

    @staticmethod
    def get_sample_readiness(db: Session, sample_id: int) -> SampleReadinessResponse:
        """
        Assesses biological specimen readiness and suitability for experimental or downstream usage.
        Evaluates 5 standardized laboratory dimensions:
        1. Lifecycle status restrictions
        2. Stock volume sufficiency
        3. Cold storage & environmental integrity
        4. Lineage and origin provenance traceability
        5. Quality control (QC) assay certification
        """
        sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        checks: List[ReadinessCheckItem] = []
        recommendations: List[str] = []

        # 1. Status Check (Max 25 pts)
        s_status = (sample.sample_status or "").upper()
        if s_status in (SampleStatus.IN_STORAGE.value, SampleStatus.REGISTERED.value, "AVAILABLE"):
            checks.append(ReadinessCheckItem(
                check_id="status_check",
                name="Inventory Lifecycle Status",
                passed=True,
                severity="INFO",
                score_points=25,
                max_points=25,
                message=f"Specimen lifecycle status '{s_status}' is active and operational for laboratory handling."
            ))
        elif s_status == SampleStatus.IN_USE.value:
            checks.append(ReadinessCheckItem(
                check_id="status_check",
                name="Inventory Lifecycle Status",
                passed=True,
                severity="WARNING",
                score_points=15,
                max_points=25,
                message="Specimen is currently allocated to an active protocol or run. Verify concurrent access."
            ))
            recommendations.append("Confirm availability with current protocol operator before scheduling parallel procedures.")
        else:
            checks.append(ReadinessCheckItem(
                check_id="status_check",
                name="Inventory Lifecycle Status",
                passed=False,
                severity="CRITICAL",
                score_points=0,
                max_points=25,
                message=f"Specimen status is '{s_status}'. Restricted state strictly prohibits experimental usage."
            ))
            recommendations.append(f"Resolve specimen '{s_status}' status restriction prior to experimental planning.")

        # 2. Stock Sufficiency Check (Max 25 pts)
        qty = float(sample.quantity_value or 0)
        unit = sample.quantity_unit or "units"
        if qty >= 10.0:
            checks.append(ReadinessCheckItem(
                check_id="stock_sufficiency",
                name="Working Volume Sufficiency",
                passed=True,
                severity="INFO",
                score_points=25,
                max_points=25,
                message=f"Current stock ({qty:.1f} {unit}) satisfies standard protocol working volume threshold (>= 10.0 {unit})."
            ))
        elif qty > 0:
            checks.append(ReadinessCheckItem(
                check_id="stock_sufficiency",
                name="Working Volume Sufficiency",
                passed=True,
                severity="WARNING",
                score_points=12,
                max_points=25,
                message=f"Low remaining stock ({qty:.1f} {unit}). Subsequent extraction may exhaust inventory."
            ))
            recommendations.append(f"Prepare buffer replenishment or request aliquot from parent specimen before pipetting (remaining: {qty:.1f} {unit}).")
        else:
            checks.append(ReadinessCheckItem(
                check_id="stock_sufficiency",
                name="Working Volume Sufficiency",
                passed=False,
                severity="CRITICAL",
                score_points=0,
                max_points=25,
                message=f"Specimen is depleted with zero remaining quantity ({qty:.1f} {unit})."
            ))
            recommendations.append("Specimen cannot be sampled; replenish accession stock or derive new aliquot from parent lineage.")

        # 3. Storage Validation Check (Max 20 pts)
        loc = sample.storage_location
        if loc:
            if loc.is_active:
                temp_range = []
                if loc.temperature_min_c is not None:
                    temp_range.append(f"{loc.temperature_min_c}°C")
                if loc.temperature_max_c is not None and loc.temperature_max_c != loc.temperature_min_c:
                    temp_range.append(f"{loc.temperature_max_c}°C")
                temp_str = f", temp: {' to '.join(temp_range)}" if temp_range else ""
                checks.append(ReadinessCheckItem(
                    check_id="storage_validation",
                    name="Cold Storage Environmental Integrity",
                    passed=True,
                    severity="INFO",
                    score_points=20,
                    max_points=20,
                    message=f"Specimen verified in active unit '{loc.location_code}' ({loc.facility or 'Lab'}{temp_str})."
                ))
            else:
                checks.append(ReadinessCheckItem(
                    check_id="storage_validation",
                    name="Cold Storage Environmental Integrity",
                    passed=False,
                    severity="CRITICAL",
                    score_points=0,
                    max_points=20,
                    message=f"Storage location '{loc.location_code}' is decommissioned or inactive."
                ))
                recommendations.append(f"Immediately relocate specimen from decommissioned storage '{loc.location_code}' to an active validated freezer.")
        else:
            if s_status == SampleStatus.IN_STORAGE.value:
                checks.append(ReadinessCheckItem(
                    check_id="storage_validation",
                    name="Cold Storage Environmental Integrity",
                    passed=False,
                    severity="CRITICAL",
                    score_points=5,
                    max_points=20,
                    message="Specimen is marked IN_STORAGE but has no physical storage coordinate assigned."
                ))
                recommendations.append("Assign specimen to a validated physical storage location slot before lab operations.")
            else:
                checks.append(ReadinessCheckItem(
                    check_id="storage_validation",
                    name="Cold Storage Environmental Integrity",
                    passed=True,
                    severity="WARNING",
                    score_points=10,
                    max_points=20,
                    message="Specimen currently checked out or unassigned to physical storage."
                ))

        # 4. Lineage & Origin Provenance Check (Max 15 pts)
        parent_rel_count = db.query(SampleRelationship).filter(SampleRelationship.child_sample_id == sample_id).count()
        has_source = bool(sample.source_description and sample.source_description.strip())
        if parent_rel_count > 0 or has_source:
            checks.append(ReadinessCheckItem(
                check_id="lineage_provenance",
                name="Genealogical Provenance & Traceability",
                passed=True,
                severity="INFO",
                score_points=15,
                max_points=15,
                message=f"Verified lineage provenance ({parent_rel_count} direct parent(s), documented accession source)."
            ))
        else:
            checks.append(ReadinessCheckItem(
                check_id="lineage_provenance",
                name="Genealogical Provenance & Traceability",
                passed=True,
                severity="INFO",
                score_points=10,
                max_points=15,
                message="Primary biological accession record with baseline registration metadata."
            ))

        # 5. Quality Control (QC) Evidence Check (Max 15 pts)
        qc_tests = db.query(SampleTest).filter(SampleTest.sample_id == sample_id).all()
        if qc_tests:
            failed_tests = [
                t for t in qc_tests
                if t.result_interpretation and any(w in t.result_interpretation.lower() for w in ["fail", "invalid", "reject", "contaminated"])
            ]
            completed_tests = [
                t for t in qc_tests
                if t.test_status == "completed" or (t.result_interpretation and "pass" in t.result_interpretation.lower())
            ]

            if failed_tests:
                checks.append(ReadinessCheckItem(
                    check_id="qc_evidence",
                    name="Quality Control & Analytical Certification",
                    passed=False,
                    severity="CRITICAL",
                    score_points=0,
                    max_points=15,
                    message=f"Specimen has {len(failed_tests)} failed or compromised analytical QC assay(s)."
                ))
                recommendations.append("Perform specimen investigation or re-test failed QC assay before downstream extraction.")
            elif completed_tests:
                checks.append(ReadinessCheckItem(
                    check_id="qc_evidence",
                    name="Quality Control & Analytical Certification",
                    passed=True,
                    severity="INFO",
                    score_points=15,
                    max_points=15,
                    message=f"Specimen passed {len(completed_tests)} analytical QC test(s) with satisfactory assay certification."
                ))
            else:
                checks.append(ReadinessCheckItem(
                    check_id="qc_evidence",
                    name="Quality Control & Analytical Certification",
                    passed=True,
                    severity="WARNING",
                    score_points=8,
                    max_points=15,
                    message=f"Specimen has {len(qc_tests)} QC test(s) requested or currently in progress."
                ))
                recommendations.append("Await completed QC assay results before committing specimen to irreversible protocols.")
        else:
            checks.append(ReadinessCheckItem(
                check_id="qc_evidence",
                name="Quality Control & Analytical Certification",
                passed=True,
                severity="WARNING",
                score_points=8,
                max_points=15,
                message="No analytical QC tests recorded for this specimen. Baseline analytical testing recommended."
            ))
            recommendations.append("Schedule baseline spectrophotometric or purity QC assay to ensure sample integrity.")

        readiness_score = sum(c.score_points for c in checks)
        has_critical_failure = any(not c.passed and c.severity == "CRITICAL" for c in checks)

        if has_critical_failure or readiness_score < 50:
            overall_status = "UNAVAILABLE"
        elif readiness_score >= 80:
            overall_status = "READY"
        else:
            overall_status = "NEEDS_REVIEW"

        if overall_status == "READY" and not recommendations:
            recommendations.append("Specimen satisfies laboratory quality controls and is cleared for downstream experimental protocols.")

        return SampleReadinessResponse(
            sample_id=sample.sample_id,
            sample_code=sample.sample_code,
            sample_name=sample.sample_name,
            overall_status=overall_status,
            readiness_score=readiness_score,
            checks=checks,
            recommendations=recommendations,
        )

    @staticmethod
    def get_material_flow(db: Session) -> MaterialFlowResponse:
        """
        Computes biological material derivation flow across the repository:
        Sources (Sample Types) -> Transformations (SampleRelationship) -> Destinations (Sample Statuses).
        """
        type_counts = db.query(
            SampleType.type_code,
            SampleType.type_name,
            func.count(Sample.sample_id).label("count"),
            func.coalesce(func.sum(Sample.quantity_value), 0).label("volume")
        ).outerjoin(
            Sample, SampleType.sample_type_id == Sample.sample_type_id
        ).group_by(
            SampleType.sample_type_id
        ).all()

        nodes: List[MaterialFlowNode] = []
        links: List[MaterialFlowLink] = []

        type_colors = {
            "ARCH-BONE": "#3B82F6",
            "BONE-PWD": "#6366F1",
            "DNA-EXT": "#10B981",
            "BLOOD": "#EF4444",
            "TISSUE": "#F59E0B",
            "PLANT": "#84CC16",
        }

        for tc, tn, cnt, vol in type_counts:
            nodes.append(MaterialFlowNode(
                id=f"src_{tc}",
                label=f"{tc} ({tn})",
                category="source",
                total_volume=float(vol),
                sample_count=int(cnt),
                color=type_colors.get(tc, "#64748B"),
            ))

        tx_query = db.query(
            SampleType.type_code,
            SampleRelationship.transformation_type,
            func.count(SampleRelationship.relationship_id).label("rel_count"),
            func.coalesce(func.sum(SampleRelationship.quantity_transferred), 0).label("vol_transferred")
        ).join(
            Sample, SampleRelationship.parent_sample_id == Sample.sample_id
        ).join(
            SampleType, Sample.sample_type_id == SampleType.sample_type_id
        ).group_by(
            SampleType.type_code, SampleRelationship.transformation_type
        ).all()

        transformation_aggregates: Dict[str, Dict] = {}
        for tc, tx_type, cnt, vol in tx_query:
            if tx_type not in transformation_aggregates:
                transformation_aggregates[tx_type] = {"volume": 0.0, "count": 0}
            transformation_aggregates[tx_type]["volume"] += float(vol)
            transformation_aggregates[tx_type]["count"] += int(cnt)

            links.append(MaterialFlowLink(
                source_id=f"src_{tc}",
                target_id=f"tx_{tx_type}",
                flow_volume=float(vol),
                sample_count=int(cnt),
                flow_label=f"{tc} → {tx_type}",
            ))

        tx_colors = {
            "DNA Extraction": "#0D9488",
            "Extraction": "#0D9488",
            "Pulverization": "#8B5CF6",
            "Aliquoting": "#3B82F6",
            "PCR_Amplification": "#EC4899",
            "PCR Amplification": "#EC4899",
            "Purification": "#14B8A6",
        }

        for tx_type, data in transformation_aggregates.items():
            nodes.append(MaterialFlowNode(
                id=f"tx_{tx_type}",
                label=tx_type,
                category="transformation",
                total_volume=data["volume"],
                sample_count=data["count"],
                color=tx_colors.get(tx_type, "#0284C7"),
            ))

        dest_query = db.query(
            SampleRelationship.transformation_type,
            Sample.sample_status,
            func.count(Sample.sample_id).label("dest_count"),
            func.coalesce(func.sum(Sample.quantity_value), 0).label("dest_volume")
        ).join(
            Sample, SampleRelationship.child_sample_id == Sample.sample_id
        ).group_by(
            SampleRelationship.transformation_type, Sample.sample_status
        ).all()

        dest_aggregates: Dict[str, Dict] = {}
        for tx_type, status, cnt, vol in dest_query:
            s_name = status or "IN_STORAGE"
            if s_name not in dest_aggregates:
                dest_aggregates[s_name] = {"volume": 0.0, "count": 0}
            dest_aggregates[s_name]["volume"] += float(vol)
            dest_aggregates[s_name]["count"] += int(cnt)

            links.append(MaterialFlowLink(
                source_id=f"tx_{tx_type}",
                target_id=f"dest_{s_name}",
                flow_volume=float(vol),
                sample_count=int(cnt),
                flow_label=f"{tx_type} → {s_name}",
            ))

        dest_colors = {
            "IN_STORAGE": "#10B981",
            "AVAILABLE": "#10B981",
            "IN_USE": "#F59E0B",
            "QUARANTINED": "#8B5CF6",
            "DEPLETED": "#64748B",
            "MISSING": "#EF4444",
            "DISPOSED": "#475569",
        }

        for s_name, data in dest_aggregates.items():
            nodes.append(MaterialFlowNode(
                id=f"dest_{s_name}",
                label=f"Inventory: {s_name}",
                category="destination",
                total_volume=data["volume"],
                sample_count=data["count"],
                color=dest_colors.get(s_name, "#10B981"),
            ))

        total_samples = db.query(Sample).count()
        total_tx = db.query(SampleRelationship).count()
        total_vol = sum(l.flow_volume for l in links)

        return MaterialFlowResponse(
            nodes=nodes,
            links=links,
            total_samples=total_samples,
            total_transformations=total_tx,
            total_volume_processed=float(total_vol),
        )

    @staticmethod
    def get_cryo_spatial_map(db: Session, sample_id: int) -> CryoSpatialMapResponse:
        """
        Generates an interactive 2D cryogenic freezer plate and rack coordinate matrix (8x12 = 96 wells)
        centered on the focal specimen, showing neighbor occupancies, temperatures, and status telemetry.
        """
        sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        loc = sample.storage_location
        loc_id = loc.storage_location_id if loc else None
        loc_code = loc.location_code if loc else "UNASSIGNED"
        facility = loc.facility if loc else "Central Lab Facility"
        room = loc.room if loc else None
        unit_type = loc.unit_type if loc else "freezer"
        unit_label = loc.unit_label if loc else None
        rack = loc.rack if loc else "RACK-01"
        box = loc.box if loc else "BOX-A"
        temp_c = float(loc.temperature_min_c) if (loc and loc.temperature_min_c is not None) else -80.0

        neighbor_samples: List[Sample] = []
        if loc_id:
            neighbor_samples = db.query(Sample).filter(
                Sample.current_storage_location_id == loc_id
            ).order_by(Sample.sample_id.asc()).limit(96).all()
        else:
            neighbor_samples = [sample]

        grid_rows = 8
        grid_cols = 12
        row_letters = ["A", "B", "C", "D", "E", "F", "G", "H"]

        wells: List[CryoWellSlot] = []

        focal_slot_idx = 26
        try:
            focal_slot_idx = neighbor_samples.index(sample)
        except ValueError:
            focal_slot_idx = (sample_id * 7) % 96

        occupied_count = 0
        assigned_sample_map: Dict[int, Sample] = {}

        assigned_sample_map[focal_slot_idx] = sample
        occupied_count += 1

        cur_slot = 0
        for s in neighbor_samples:
            if s.sample_id == sample.sample_id:
                continue
            while cur_slot in assigned_sample_map and cur_slot < 96:
                cur_slot += 1
            if cur_slot < 96:
                assigned_sample_map[cur_slot] = s
                occupied_count += 1
                cur_slot += 1

        focal_slot_code = f"{row_letters[focal_slot_idx // 12]}-{((focal_slot_idx % 12) + 1):02d}"

        for r_idx, r_letter in enumerate(row_letters):
            for c_idx in range(1, grid_cols + 1):
                slot_index = r_idx * 12 + (c_idx - 1)
                slot_code = f"{r_letter}-{c_idx:02d}"
                is_focal = (slot_index == focal_slot_idx)
                s_in_well = assigned_sample_map.get(slot_index)

                if s_in_well:
                    wells.append(CryoWellSlot(
                        row_label=r_letter,
                        col_label=c_idx,
                        slot_code=slot_code,
                        is_focal=is_focal,
                        is_occupied=True,
                        sample_id=s_in_well.sample_id,
                        sample_code=s_in_well.sample_code,
                        sample_name=s_in_well.sample_name,
                        sample_status=s_in_well.sample_status,
                        sample_type_code=s_in_well.sample_type.type_code if s_in_well.sample_type else "",
                        quantity_value=float(s_in_well.quantity_value) if s_in_well.quantity_value is not None else 0.0,
                        quantity_unit=s_in_well.quantity_unit or "units",
                    ))
                else:
                    wells.append(CryoWellSlot(
                        row_label=r_letter,
                        col_label=c_idx,
                        slot_code=slot_code,
                        is_focal=False,
                        is_occupied=False,
                    ))

        occupancy_pct = round((occupied_count / (grid_rows * grid_cols)) * 100, 1)

        return CryoSpatialMapResponse(
            sample_id=sample.sample_id,
            sample_code=sample.sample_code,
            sample_name=sample.sample_name,
            storage_location_id=loc_id,
            location_code=loc_code,
            facility=facility,
            room=room,
            unit_type=unit_type,
            unit_label=unit_label,
            rack=rack,
            box=box,
            temperature_celsius=temp_c,
            total_slots=grid_rows * grid_cols,
            occupied_slots=occupied_count,
            occupancy_pct=occupancy_pct,
            focal_slot_code=focal_slot_code,
            grid_rows=grid_rows,
            grid_cols=grid_cols,
            wells=wells,
        )


