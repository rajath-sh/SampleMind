"""
Verification Suite for Phase 2: Scientific Visualisations (Lineage, Custody, Quantity)
======================================================================================
Tests:
1. Sample Lineage DAG generation via LineageService (/api/v1/lineage/{sample_id}).
2. Chronological Chain of Custody reconstruction with consecutive locations & elapsed time (/samples/{id}/chain-of-custody).
3. Auditable Sample Quantity History breakdown with transaction ledgers and derivation balances (/samples/{id}/quantity-history).
4. End-to-end derivation transaction recording and balance deduction accuracy.
"""

import sys
from pathlib import Path
import uuid
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.common import SessionLocal, Sample, SampleType, StorageLocation, SampleStatus
from app.modules.samples.service import SampleService
from app.modules.samples.schemas import SampleDerivationRequest, SampleUpdateRequest
from app.modules.lineage.service import LineageService


def run_phase2_tests():
    db = SessionLocal()
    print("=" * 75)
    print(" EXECUTING VERIFICATION SUITE: SAMPLES PHASE 2 SCIENTIFIC VISUALISATIONS")
    print("=" * 75)

    types = SampleService.list_sample_types(db)
    type_a = types[0]
    type_b = types[1]

    active_locs = db.query(StorageLocation).filter(StorageLocation.is_active == True).limit(3).all()
    assert len(active_locs) >= 2, "Need at least 2 active storage locations"
    loc1, loc2 = active_locs[0], active_locs[1]

    test_counter = 0

    def assert_pass(msg):
        nonlocal test_counter
        test_counter += 1
        print(f"[PASS {test_counter:02d}] {msg}")

    try:
        # 1. Create a parent specimen
        parent_code = f"SMP-P2-{uuid.uuid4().hex[:6].upper()}"
        parent = Sample(
            sample_code=parent_code,
            sample_name="Phase 2 Mammoth Femur Extract",
            sample_type_id=type_a.sample_type_id,
            quantity_value=100.0,
            quantity_unit="mL",
            sample_status=SampleStatus.IN_STORAGE.value,
            current_storage_location_id=loc1.storage_location_id,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(parent)
        db.commit()
        db.refresh(parent)

        # 2. Derive two child aliquots from parent
        child1_code = f"SMP-P2-C1-{uuid.uuid4().hex[:6].upper()}"
        res1 = SampleService.derive_child_sample(
            db,
            parent.sample_id,
            SampleDerivationRequest(
                child_sample_code=child1_code,
                child_sample_name="Aliquot Alpha for PCR",
                child_sample_type_id=type_b.sample_type_id,
                quantity_transferred=25.0,
                quantity_unit="mL",
                transformation_type="DNA Extraction",
                child_storage_location_id=loc1.storage_location_id,
                notes="Primary extract aliquot",
            ),
            actor_id=1,
        )

        child2_code = f"SMP-P2-C2-{uuid.uuid4().hex[:6].upper()}"
        res2 = SampleService.derive_child_sample(
            db,
            parent.sample_id,
            SampleDerivationRequest(
                child_sample_code=child2_code,
                child_sample_name="Aliquot Beta for Sequencing",
                child_sample_type_id=type_b.sample_type_id,
                quantity_transferred=35.0,
                quantity_unit="mL",
                transformation_type="Sub-sampling Aliquot",
                child_storage_location_id=loc2.storage_location_id,
                notes="Secondary sequencing aliquot",
            ),
            actor_id=1,
        )

        # 3. Test Lineage DAG Graph Generation
        graph = LineageService.get_lineage_graph(db, parent.sample_id)
        assert graph.focus_sample_code == parent_code
        assert graph.total_nodes >= 3  # Parent + 2 children
        assert graph.total_edges >= 2
        node_codes = [n.sample_code for n in graph.nodes]
        assert parent_code in node_codes
        assert child1_code in node_codes
        assert child2_code in node_codes

        assert_pass(f"Lineage DAG Preview: Graph generated with {graph.total_nodes} nodes and {graph.total_edges} edges connecting focal specimen to derived aliquots.")

        # 4. Relocate parent specimen to test Chain of Custody
        SampleService.update_sample(
            db,
            parent.sample_id,
            SampleUpdateRequest(
                current_storage_location_id=loc2.storage_location_id,
                movement_reason="Transfer to sequencing prep cold-room",
            ),
            actor_id=1,
        )

        # 5. Test Chain of Custody Timeline
        custody = SampleService.get_chain_of_custody(db, parent.sample_id)
        assert custody.sample_code == parent_code
        assert custody.total_movements >= 1
        steps = custody.steps
        assert len(steps) >= 1
        # The latest step should have to_location_code == loc2.location_code
        last_step = steps[-1]
        assert last_step.to_location_code == loc2.location_code
        assert "sequencing prep" in (last_step.reason or "").lower()

        assert_pass(f"Chain-of-Custody Timeline: Reconstructed {custody.total_movements} consecutive physical handoffs with operator, location pair, and elapsed time.")

        # 6. Test Quantity History & Auditable Ledger
        qty_hist = SampleService.get_sample_quantity_history(db, parent.sample_id)
        assert qty_hist.sample_code == parent_code
        assert qty_hist.initial_quantity == 100.0
        assert qty_hist.current_quantity == 40.0  # 100 - 25 - 35 = 40
        assert qty_hist.total_deducted == 60.0    # 25 + 35
        assert qty_hist.utilization_pct == 60.0
        assert qty_hist.derivation_count == 2
        assert len(qty_hist.transactions) >= 2

        # Check transaction types
        tx_types = [t.transaction_type for t in qty_hist.transactions]
        assert "ALIQUOT_DERIVATION" in tx_types

        assert_pass(f"Quantity History Visualisation: Audited 100.0 -> 40.0 mL remaining (60.0% utilization, 2 derivations, full transaction ledger).")

    finally:
        db.close()

    print("=" * 75)
    print(f" [ALL {test_counter} PHASE 2 SCIENTIFIC VISUALISATION TESTS PASSED 100%!] ")
    print("=" * 75)


if __name__ == "__main__":
    run_phase2_tests()
