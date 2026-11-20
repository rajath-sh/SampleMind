"""
Comprehensive Verification Suite for Phase 1: Samples Correctness & Data-Integrity Hardening
=============================================================================================
Tests:
1. Derivation rejection on invalid parent statuses (QUARANTINED, DEPLETED, DISPOSED, MISSING).
2. Derivation rejection on unit mismatch (e.g., mg vs mL).
3. Derivation rejection on zero or negative transfer quantity.
4. Derivation rejection on stock overdraft (insufficient quantity).
5. Derivation rejection when child destination storage is inactive.
6. Atomic derivation success, parent stock reduction, and automatic DEPLETED transition on zero balance.
7. Lineage cycle prevention: self-derivation and multi-generational recursive DAG cycles.
8. Genuine multi-generational transitive ancestor and descendant counts via recursive CTEs.
9. Permitted status transitions finite-state machine enforcement and invariants.
10. Quality Control assays (SampleTest) eager loading in SampleDetailResponse.
"""

import sys
from pathlib import Path
import uuid
from datetime import datetime, timezone

# Add backend directory to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.common import (
    SessionLocal,
    Sample,
    SampleType,
    SampleRelationship,
    StorageLocation,
    SampleTest,
    SampleStatus,
    InsufficientQuantityException,
    LineageCycleException,
    ValidationException,
    DuplicateEntityException,
    EntityNotFoundException,
)
from app.modules.samples.service import SampleService
from app.modules.samples.schemas import (
    SampleCreateRequest,
    SampleUpdateRequest,
    SampleDerivationRequest,
)


def run_phase1_tests():
    db = SessionLocal()
    print("=" * 75)
    print(" EXECUTING RIGOROUS VERIFICATION SUITE: SAMPLES PHASE 1 CORRECTNESS")
    print("=" * 75)

    types = SampleService.list_sample_types(db)
    assert len(types) >= 2, "Need at least 2 sample types for derivation testing"
    type_a = types[0]
    type_b = types[1]

    # Retrieve an active storage location
    active_loc = db.query(StorageLocation).filter(StorageLocation.is_active == True).first()
    assert active_loc is not None, "Need at least 1 active storage location"

    # Create a temporary inactive storage location for negative testing
    inactive_loc_code = f"LOC-INACT-{uuid.uuid4().hex[:4].upper()}"
    inactive_loc = StorageLocation(
        location_code=inactive_loc_code,
        facility="Offsite Archive Vault",
        room="Decommissioned Hall B",
        unit_type="freezer",
        unit_label="Decommissioned Sub-unit",
        slot="0",
        is_active=False,
    )
    db.add(inactive_loc)
    db.commit()
    db.refresh(inactive_loc)

    test_counter = 0

    def assert_pass(msg):
        nonlocal test_counter
        test_counter += 1
        print(f"[PASS {test_counter:02d}] {msg}")

    try:
        # -------------------------------------------------------------------------
        # TEST 1: Derivation Rejection on Invalid Parent Statuses
        # -------------------------------------------------------------------------
        invalid_statuses = [
            SampleStatus.QUARANTINED.value,
            SampleStatus.DEPLETED.value,
            SampleStatus.DISPOSED.value,
            SampleStatus.MISSING.value,
        ]

        for inv_status in invalid_statuses:
            sample_code = f"SMP-INV-{uuid.uuid4().hex[:6].upper()}"
            s = Sample(
                sample_code=sample_code,
                sample_name=f"Specimen in {inv_status}",
                sample_type_id=type_a.sample_type_id,
                quantity_value=20.0,
                quantity_unit="mg",
                sample_status=inv_status,
                registered_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(s)
            db.commit()
            db.refresh(s)

            try:
                SampleService.derive_child_sample(
                    db,
                    s.sample_id,
                    SampleDerivationRequest(
                        child_sample_code=f"SMP-DER-{uuid.uuid4().hex[:6].upper()}",
                        child_sample_name="Invalid Attempt Child",
                        child_sample_type_id=type_b.sample_type_id,
                        quantity_transferred=5.0,
                        quantity_unit="mg",
                        transformation_type="Aliquot",
                    ),
                    actor_id=1,
                )
                assert False, f"Expected ValidationException when deriving from status {inv_status}"
            except ValidationException as e:
                assert e.detail["code"] == "INVALID_PARENT_STATUS"

        assert_pass("Rejection of derivation from QUARANTINED, DEPLETED, DISPOSED, MISSING parent specimens.")

        # -------------------------------------------------------------------------
        # TEST 2: Derivation Rejection on Unit Mismatch
        # -------------------------------------------------------------------------
        primary_sample = Sample(
            sample_code=f"SMP-UNIT-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Unit Validation Sample",
            sample_type_id=type_a.sample_type_id,
            quantity_value=50.0,
            quantity_unit="mg",
            sample_status=SampleStatus.IN_STORAGE.value,
            current_storage_location_id=active_loc.storage_location_id,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(primary_sample)
        db.commit()
        db.refresh(primary_sample)

        try:
            SampleService.derive_child_sample(
                db,
                primary_sample.sample_id,
                SampleDerivationRequest(
                    child_sample_code=f"SMP-DER-{uuid.uuid4().hex[:6].upper()}",
                    child_sample_name="Unit Mismatched Aliquot",
                    child_sample_type_id=type_b.sample_type_id,
                    quantity_transferred=5.0,
                    quantity_unit="mL",  # Parent is mg!
                    transformation_type="Dilution",
                ),
                actor_id=1,
            )
            assert False, "Expected ValidationException for unit mismatch (mg vs mL)"
        except ValidationException as e:
            assert e.detail["code"] == "UNIT_MISMATCH"
            assert "Quantity unit mismatch" in e.detail["message"]

        assert_pass("Strict rejection of unit mismatch between parent stock ('mg') and derivation request ('mL').")

        # -------------------------------------------------------------------------
        # TEST 3: Derivation Rejection on Zero or Negative Transfer Quantity
        # -------------------------------------------------------------------------
        for invalid_qty in [0.0, -5.0]:
            try:
                req = SampleDerivationRequest.model_construct(
                    child_sample_code=f"SMP-DER-{uuid.uuid4().hex[:6].upper()}",
                    child_sample_name="Invalid Quantity Aliquot",
                    child_sample_type_id=type_b.sample_type_id,
                    quantity_transferred=invalid_qty,
                    quantity_unit="mg",
                    transformation_type="Aliquot",
                )
                SampleService.derive_child_sample(
                    db,
                    primary_sample.sample_id,
                    req,
                    actor_id=1,
                )
                assert False, f"Expected ValidationException for quantity {invalid_qty}"
            except ValidationException as e:
                assert e.detail["code"] == "INVALID_QUANTITY"

        assert_pass("Rejection of zero or negative transfer quantities (qty <= 0) at service layer.")

        # -------------------------------------------------------------------------
        # TEST 4: Derivation Rejection on Stock Overdraft
        # -------------------------------------------------------------------------
        try:
            SampleService.derive_child_sample(
                db,
                primary_sample.sample_id,
                SampleDerivationRequest(
                    child_sample_code=f"SMP-DER-{uuid.uuid4().hex[:6].upper()}",
                    child_sample_name="Overdraft Child",
                    child_sample_type_id=type_b.sample_type_id,
                    quantity_transferred=999.0,  # Available is 50.0 mg
                    quantity_unit="mg",
                    transformation_type="Aliquot",
                ),
                actor_id=1,
            )
            assert False, "Expected InsufficientQuantityException"
        except InsufficientQuantityException as e:
            assert e.detail["code"] == "INSUFFICIENT_QUANTITY"

        assert_pass("Rejection of derivation overdraft where requested transfer > available parent stock.")

        # -------------------------------------------------------------------------
        # TEST 5: Derivation Rejection on Inactive Child Storage Location
        # -------------------------------------------------------------------------
        try:
            SampleService.derive_child_sample(
                db,
                primary_sample.sample_id,
                SampleDerivationRequest(
                    child_sample_code=f"SMP-DER-{uuid.uuid4().hex[:6].upper()}",
                    child_sample_name="Inactive Storage Aliquot",
                    child_sample_type_id=type_b.sample_type_id,
                    quantity_transferred=5.0,
                    quantity_unit="mg",
                    transformation_type="Aliquot",
                    child_storage_location_id=inactive_loc.storage_location_id,
                ),
                actor_id=1,
            )
            assert False, "Expected ValidationException for inactive storage location"
        except ValidationException as e:
            assert e.detail["code"] == "INACTIVE_STORAGE_LOCATION"

        assert_pass("Rejection of child aliquot placement into inactive/decommissioned storage coordinate.")

        # -------------------------------------------------------------------------
        # TEST 6: Atomic Derivation Success & Full Depletion Trigger
        # -------------------------------------------------------------------------
        # Derivation step A: transfer 30.0 mg from 50.0 mg
        child_code_1 = f"SMP-CHI1-{uuid.uuid4().hex[:6].upper()}"
        res1 = SampleService.derive_child_sample(
            db,
            primary_sample.sample_id,
            SampleDerivationRequest(
                child_sample_code=child_code_1,
                child_sample_name="First Valid Aliquot",
                child_sample_type_id=type_b.sample_type_id,
                quantity_transferred=30.0,
                quantity_unit="mg",
                transformation_type="Sub-sampling",
                child_storage_location_id=active_loc.storage_location_id,
                notes="Cryo-split test",
            ),
            actor_id=1,
        )
        assert res1.parent_remaining_quantity == 20.0
        assert res1.parent_status == "IN_STORAGE"
        assert res1.child_sample_code == child_code_1

        # Check DB reflects exactly 20.0 mg
        db.refresh(primary_sample)
        assert float(primary_sample.quantity_value) == 20.0

        # Derivation step B: transfer remaining 20.0 mg (full stock depletion)
        child_code_2 = f"SMP-CHI2-{uuid.uuid4().hex[:6].upper()}"
        res2 = SampleService.derive_child_sample(
            db,
            primary_sample.sample_id,
            SampleDerivationRequest(
                child_sample_code=child_code_2,
                child_sample_name="Second Valid Aliquot (Exhaustion)",
                child_sample_type_id=type_b.sample_type_id,
                quantity_transferred=20.0,
                quantity_unit="mg",
                transformation_type="Exhaustion Aliquot",
            ),
            actor_id=1,
        )
        assert res2.parent_remaining_quantity == 0.0
        assert res2.parent_status == "DEPLETED"

        db.refresh(primary_sample)
        assert float(primary_sample.quantity_value) == 0.0
        assert primary_sample.sample_status == "DEPLETED"

        assert_pass("Atomic derivation execution: parent stock reduced 50.0 -> 20.0 -> 0.0 mg and DEPLETED status auto-triggered.")

        # -------------------------------------------------------------------------
        # TEST 7: Lineage Cycle Prevention (Self-Reference & Recursive DAG Cycle)
        # -------------------------------------------------------------------------
        # 7A: Self reference
        try:
            SampleService._check_lineage_cycle(db, primary_sample.sample_id, primary_sample.sample_id)
            assert False, "Expected LineageCycleException on self-reference"
        except LineageCycleException:
            pass

        # 7B: Recursive indirect cycle:
        # Setup: G (Grandparent) -> P (Parent) -> C (Child)
        g = Sample(
            sample_code=f"SMP-G-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Grandparent Specimen",
            sample_type_id=type_a.sample_type_id,
            quantity_value=100.0,
            quantity_unit="g",
            sample_status="IN_STORAGE",
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        p = Sample(
            sample_code=f"SMP-P-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Parent Specimen",
            sample_type_id=type_a.sample_type_id,
            quantity_value=40.0,
            quantity_unit="g",
            sample_status="IN_STORAGE",
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        c = Sample(
            sample_code=f"SMP-C-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Child Specimen",
            sample_type_id=type_a.sample_type_id,
            quantity_value=10.0,
            quantity_unit="g",
            sample_status="IN_STORAGE",
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add_all([g, p, c])
        db.commit()

        # Link G -> P
        rel1 = SampleRelationship(
            parent_sample_id=g.sample_id,
            child_sample_id=p.sample_id,
            transformation_type="Aliquot",
            transformed_at=datetime.now(timezone.utc),
        )
        # Link P -> C
        rel2 = SampleRelationship(
            parent_sample_id=p.sample_id,
            child_sample_id=c.sample_id,
            transformation_type="Extraction",
            transformed_at=datetime.now(timezone.utc),
        )
        db.add_all([rel1, rel2])
        db.commit()

        # Attempt to make C parent of G (would create cycle: G -> P -> C -> G)
        try:
            SampleService._check_lineage_cycle(db, parent_id=c.sample_id, child_id=g.sample_id)
            assert False, "Expected LineageCycleException on indirect recursive cycle"
        except LineageCycleException as e:
            assert e.detail["code"] == "LINEAGE_CYCLE_VIOLATION"

        assert_pass("Defensive cycle prevention: detected and rejected self-reference and indirect 3-generation cycle.")

        # -------------------------------------------------------------------------
        # TEST 8: Genuine Transitive Ancestor and Descendant Counts
        # -------------------------------------------------------------------------
        # Based on G -> P -> C:
        # G: 0 ancestors, 2 descendants (P, C)
        # P: 1 ancestor (G), 1 descendant (C)
        # C: 2 ancestors (G, P), 0 descendants
        d_g = SampleService.get_sample_by_id(db, g.sample_id)
        d_p = SampleService.get_sample_by_id(db, p.sample_id)
        d_c = SampleService.get_sample_by_id(db, c.sample_id)

        assert d_g.ancestor_count == 0, f"Expected 0, got {d_g.ancestor_count}"
        assert d_g.descendant_count == 2, f"Expected 2 (P, C), got {d_g.descendant_count}"

        assert d_p.ancestor_count == 1, f"Expected 1 (G), got {d_p.ancestor_count}"
        assert d_p.descendant_count == 1, f"Expected 1 (C), got {d_p.descendant_count}"

        assert d_c.ancestor_count == 2, f"Expected 2 (G, P), got {d_c.ancestor_count}"
        assert d_c.descendant_count == 0, f"Expected 0, got {d_c.descendant_count}"

        # Add 4th generation: C -> D
        d_specimen = Sample(
            sample_code=f"SMP-D-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Great-grandchild Specimen",
            sample_type_id=type_a.sample_type_id,
            quantity_value=2.0,
            quantity_unit="g",
            sample_status="IN_STORAGE",
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(d_specimen)
        db.commit()

        rel3 = SampleRelationship(
            parent_sample_id=c.sample_id,
            child_sample_id=d_specimen.sample_id,
            transformation_type="Sub-aliquot",
            transformed_at=datetime.now(timezone.utc),
        )
        db.add(rel3)
        db.commit()

        d_g_after = SampleService.get_sample_by_id(db, g.sample_id)
        d_d_after = SampleService.get_sample_by_id(db, d_specimen.sample_id)

        assert d_g_after.descendant_count == 3, f"Expected 3 (P, C, D), got {d_g_after.descendant_count}"
        assert d_d_after.ancestor_count == 3, f"Expected 3 (G, P, C), got {d_d_after.ancestor_count}"

        assert_pass(f"Multi-generational recursive CTE counts verified: 4-generation tree accurately computes 3 ancestors and 3 descendants.")

        # -------------------------------------------------------------------------
        # TEST 9: Permitted Status Transitions (Finite-State Machine) & Invariants
        # -------------------------------------------------------------------------
        # 9A: Legal transition: REGISTERED -> IN_STORAGE
        reg_sample = Sample(
            sample_code=f"SMP-FSM-{uuid.uuid4().hex[:6].upper()}",
            sample_name="FSM Specimen",
            sample_type_id=type_a.sample_type_id,
            quantity_value=10.0,
            quantity_unit="mg",
            sample_status=SampleStatus.REGISTERED.value,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(reg_sample)
        db.commit()
        db.refresh(reg_sample)

        up1 = SampleService.update_sample(
            db,
            reg_sample.sample_id,
            SampleUpdateRequest(
                sample_status=SampleStatus.IN_STORAGE.value,
                current_storage_location_id=active_loc.storage_location_id,
            ),
            actor_id=1,
        )
        assert up1.sample_status == SampleStatus.IN_STORAGE.value

        # 9B: Illegal transition: DISPOSED is terminal
        disp_sample = Sample(
            sample_code=f"SMP-DISP-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Disposed Specimen",
            sample_type_id=type_a.sample_type_id,
            quantity_value=0.0,
            quantity_unit="mg",
            sample_status=SampleStatus.DISPOSED.value,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(disp_sample)
        db.commit()

        try:
            SampleService.update_sample(
                db,
                disp_sample.sample_id,
                SampleUpdateRequest(sample_status=SampleStatus.IN_STORAGE.value),
                actor_id=1,
            )
            assert False, "Expected ValidationException: DISPOSED cannot transition"
        except ValidationException as e:
            assert e.detail["code"] == "ILLEGAL_STATUS_TRANSITION"

        # 9C: Invariant: Transition to DEPLETED requires 0 quantity
        in_store = Sample(
            sample_code=f"SMP-DEP-INV-{uuid.uuid4().hex[:6].upper()}",
            sample_name="In Storage with Stock",
            sample_type_id=type_a.sample_type_id,
            quantity_value=15.0,
            quantity_unit="mg",
            sample_status=SampleStatus.IN_STORAGE.value,
            current_storage_location_id=active_loc.storage_location_id,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(in_store)
        db.commit()

        try:
            SampleService.update_sample(
                db,
                in_store.sample_id,
                SampleUpdateRequest(sample_status=SampleStatus.DEPLETED.value),  # quantity remains 15.0
                actor_id=1,
            )
            assert False, "Expected ValidationException: cannot mark DEPLETED with positive quantity"
        except ValidationException as e:
            assert e.detail["code"] == "DEPLETED_WITH_POSITIVE_QUANTITY"

        # 9D: Invariant: Transition to IN_STORAGE requires a storage coordinate
        try:
            SampleService.update_sample(
                db,
                reg_sample.sample_id,
                SampleUpdateRequest(
                    sample_status=SampleStatus.IN_STORAGE.value,
                    current_storage_location_id=None,
                ),
                actor_id=1,
            )
            # reg_sample already had active_loc assigned in 9A, let's test a sample without location
        except Exception:
            pass

        unallocated = Sample(
            sample_code=f"SMP-NOLOC-{uuid.uuid4().hex[:6].upper()}",
            sample_name="No Loc Sample",
            sample_type_id=type_a.sample_type_id,
            quantity_value=5.0,
            quantity_unit="mg",
            sample_status=SampleStatus.REGISTERED.value,
            current_storage_location_id=None,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(unallocated)
        db.commit()

        try:
            SampleService.update_sample(
                db,
                unallocated.sample_id,
                SampleUpdateRequest(sample_status=SampleStatus.IN_STORAGE.value),
                actor_id=1,
            )
            assert False, "Expected ValidationException: IN_STORAGE without storage coordinate"
        except ValidationException as e:
            assert e.detail["code"] == "MISSING_STORAGE_LOCATION"

        # 9E: Rejection of inactive location during relocation update
        try:
            SampleService.update_sample(
                db,
                reg_sample.sample_id,
                SampleUpdateRequest(current_storage_location_id=inactive_loc.storage_location_id),
                actor_id=1,
            )
            assert False, "Expected ValidationException for inactive location in update"
        except ValidationException as e:
            assert e.detail["code"] == "INACTIVE_STORAGE_LOCATION"

        assert_pass("Finite-state machine rules verified: DISPOSED terminal, DEPLETED 0-qty invariant, and active storage requirement.")

        # -------------------------------------------------------------------------
        # TEST 10: Quality Control Assays Eager Loading in SampleDetailResponse
        # -------------------------------------------------------------------------
        qc_sample = Sample(
            sample_code=f"SMP-QC-{uuid.uuid4().hex[:6].upper()}",
            sample_name="QC Test Specimen",
            sample_type_id=type_a.sample_type_id,
            quantity_value=12.5,
            quantity_unit="mg",
            sample_status="IN_STORAGE",
            current_storage_location_id=active_loc.storage_location_id,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(qc_sample)
        db.commit()
        db.refresh(qc_sample)

        # Attach 2 SampleTest records
        qc1 = SampleTest(
            sample_id=qc_sample.sample_id,
            test_type="DNA_PURITY_NANODROP",
            test_status="completed",
            result_value=1.85,
            result_unit="A260/A280",
            result_interpretation="Optimal DNA purity",
            performed_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        qc2 = SampleTest(
            sample_id=qc_sample.sample_id,
            test_type="AGAROSE_GEL_ELECTROPHORESIS",
            test_status="completed",
            result_value=45.2,
            result_unit="ng/uL",
            result_interpretation="Intact high-molecular-weight band",
            performed_at=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
        )
        db.add_all([qc1, qc2])
        db.commit()

        detail_qc = SampleService.get_sample_by_id(db, qc_sample.sample_id)
        assert len(detail_qc.qc_tests) == 2, f"Expected 2 QC assays, got {len(detail_qc.qc_tests)}"
        assert detail_qc.qc_tests[0].test_type in ["DNA_PURITY_NANODROP", "AGAROSE_GEL_ELECTROPHORESIS"]
        assert detail_qc.qc_tests[0].result_value is not None

        assert_pass(f"QC assay history eager loading verified: {len(detail_qc.qc_tests)} tests loaded with values and interpretations.")

    finally:
        # Clean up temporary inactive storage location
        try:
            db.delete(inactive_loc)
            db.commit()
        except Exception:
            pass
        db.close()

    print("=" * 75)
    print(f" [ALL {test_counter} PHASE 1 CORRECTNESS & DATA INTEGRITY TESTS PASSED 100%!] ")
    print("=" * 75)


if __name__ == "__main__":
    run_phase1_tests()
