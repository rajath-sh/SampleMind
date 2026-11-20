"""
Comprehensive Rigorous Test Suite for Module 4: Lineage Service Layer
======================================================================
Tests recursive CTE queries (ancestors, descendants), DAG graph assembly,
self-lineage prevention, direct cycle detection (A->B->A), and multi-hop cycle detection (A->B->C->A).
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from app.common import SessionLocal, Sample, SampleRelationship, LineageCycleException, SampleMindException
from app.modules.lineage.service import LineageService
from app.modules.lineage.schemas import RelationshipCreateRequest


def run_all_tests():
    print("=" * 65)
    print(" Executing Rigorous Test Suite for Module 4: Lineage Service")
    print("=" * 65)

    db = SessionLocal()

    try:
        # Create 3 test samples for multi-hop lineage testing: Node A -> Node B -> Node C
        code_a = f"SMP-A-{uuid.uuid4().hex[:5].upper()}"
        code_b = f"SMP-B-{uuid.uuid4().hex[:5].upper()}"
        code_c = f"SMP-C-{uuid.uuid4().hex[:5].upper()}"

        sample_a = Sample(
            sample_code=code_a,
            sample_name="Root Specimen A",
            sample_type_id=1,
            quantity_value=100.0,
            quantity_unit="mg",
            sample_status="IN_STORAGE"
        )
        sample_b = Sample(
            sample_code=code_b,
            sample_name="Intermediate Aliquot B",
            sample_type_id=1,
            quantity_value=50.0,
            quantity_unit="mg",
            sample_status="IN_STORAGE"
        )
        sample_c = Sample(
            sample_code=code_c,
            sample_name="Terminal Extract C",
            sample_type_id=1,
            quantity_value=20.0,
            quantity_unit="mg",
            sample_status="IN_STORAGE"
        )
        db.add_all([sample_a, sample_b, sample_c])
        db.commit()
        db.refresh(sample_a)
        db.refresh(sample_b)
        db.refresh(sample_c)
        print(f"[PASS] Test 01: Created lineage test node triad: {code_a} -> {code_b} -> {code_c}")

        # 1. Self-lineage rejection
        try:
            LineageService.create_relationship(
                db=db,
                req=RelationshipCreateRequest(
                    parent_sample_id=sample_a.sample_id,
                    child_sample_id=sample_a.sample_id,
                    transformation_type="Self Clone"
                )
            )
            assert False, "Expected self-lineage to raise exception"
        except SampleMindException as exc:
            assert exc.status_code == 400
            print("[PASS] Test 02: Self-referential lineage (A -> A) rejected with 400.")

        # 2. Link A -> B
        rel_ab = LineageService.create_relationship(
            db=db,
            req=RelationshipCreateRequest(
                parent_sample_id=sample_a.sample_id,
                child_sample_id=sample_b.sample_id,
                transformation_type="Pulverization",
                quantity_transferred=50.0,
                quantity_unit="mg"
            )
        )
        assert rel_ab.relationship_id is not None
        assert rel_ab.parent_sample_code == code_a
        assert rel_ab.child_sample_code == code_b
        print(f"[PASS] Test 03: Created lineage edge A -> B (Pulverization, ID: {rel_ab.relationship_id}).")

        # 3. Direct cycle detection: B -> A must fail!
        try:
            LineageService.create_relationship(
                db=db,
                req=RelationshipCreateRequest(
                    parent_sample_id=sample_b.sample_id,
                    child_sample_id=sample_a.sample_id,
                    transformation_type="Reverse Link"
                )
            )
            assert False, "Expected direct cycle B -> A to raise LineageCycleException"
        except LineageCycleException:
            print("[PASS] Test 04: Direct cycle (B -> A) rejected with 409 LineageCycleException.")

        # 4. Link B -> C
        rel_bc = LineageService.create_relationship(
            db=db,
            req=RelationshipCreateRequest(
                parent_sample_id=sample_b.sample_id,
                child_sample_id=sample_c.sample_id,
                transformation_type="DNA Extraction",
                quantity_transferred=20.0,
                quantity_unit="mg"
            )
        )
        assert rel_bc.relationship_id is not None
        print(f"[PASS] Test 05: Created lineage edge B -> C (DNA Extraction, ID: {rel_bc.relationship_id}).")

        # 5. Multi-hop cycle detection: C -> A must fail! (Since A -> B -> C)
        try:
            LineageService.create_relationship(
                db=db,
                req=RelationshipCreateRequest(
                    parent_sample_id=sample_c.sample_id,
                    child_sample_id=sample_a.sample_id,
                    transformation_type="Multi Hop Cycle"
                )
            )
            assert False, "Expected multi-hop cycle C -> A to raise LineageCycleException"
        except LineageCycleException:
            print("[PASS] Test 06: Multi-hop cycle (C -> A) rejected with 409 LineageCycleException.")

        # 6. Ancestor recursive CTE traversal from C
        ancestors_c = LineageService.get_ancestors(db=db, sample_id=sample_c.sample_id)
        assert len(ancestors_c) == 2, f"Expected 2 ancestors for C (B and A), got {len(ancestors_c)}"
        ancestor_codes = {a.sample_code for a in ancestors_c}
        assert code_b in ancestor_codes
        assert code_a in ancestor_codes
        # Verify generations: B is -1, A is -2
        b_node = next(a for a in ancestors_c if a.sample_code == code_b)
        a_node = next(a for a in ancestors_c if a.sample_code == code_a)
        assert b_node.generation == -1
        assert a_node.generation == -2
        assert a_node.is_root is True
        print(f"[PASS] Test 07: Recursive CTE ancestors of C verified (B at gen -1, A at gen -2 [is_root=True]).")

        # 7. Descendant recursive CTE traversal from A
        descendants_a = LineageService.get_descendants(db=db, sample_id=sample_a.sample_id)
        assert len(descendants_a) == 2, f"Expected 2 descendants for A (B and C), got {len(descendants_a)}"
        b_desc = next(d for d in descendants_a if d.sample_code == code_b)
        c_desc = next(d for d in descendants_a if d.sample_code == code_c)
        assert b_desc.generation == 1
        assert c_desc.generation == 2
        assert c_desc.is_leaf is True
        print(f"[PASS] Test 08: Recursive CTE descendants of A verified (B at gen +1, C at gen +2 [is_leaf=True]).")

        # 8. Full DAG graph assembly from focus B
        graph_b = LineageService.get_lineage_graph(db=db, sample_id=sample_b.sample_id, direction="all")
        assert graph_b.total_nodes == 3, f"Expected 3 nodes in graph, got {graph_b.total_nodes}"
        assert graph_b.total_edges == 2, f"Expected 2 edges in graph, got {graph_b.total_edges}"
        focus_item = next(n for n in graph_b.nodes if n.is_focus)
        assert focus_item.sample_code == code_b
        assert focus_item.generation == 0
        print(f"[PASS] Test 09: Full DAG graph payload verified for {code_b}: 3 nodes, 2 edges.")

        # 9. Upstream-only graph query from C
        graph_up = LineageService.get_lineage_graph(db=db, sample_id=sample_c.sample_id, direction="upstream")
        assert graph_up.total_nodes == 3  # C, B, A
        print(f"[PASS] Test 10: Upstream-only DAG query verified ({graph_up.total_nodes} nodes).")

        print("=" * 65)
        print(" [ALL 10 MODULE 4 LINEAGE SERVICE TESTS PASSED 100%!] ")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_all_tests()
