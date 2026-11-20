"""
Verification Test for Module 3: Sample Registry & Derivation Service Layer (Step 3A)
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from app.common import SessionLocal, InsufficientQuantityException, DuplicateEntityException
from app.modules.samples.service import SampleService
from app.modules.samples.schemas import (
    SampleCreateRequest,
    SampleUpdateRequest,
    SampleDerivationRequest,
)

def run_tests():
    db = SessionLocal()
    print("=" * 60)
    print(" Testing Module 3 (Samples) Service Layer")
    print("=" * 60)

    # 1. Test listing sample types
    types = SampleService.list_sample_types(db)
    print(f"[1] Sample Types Count: {len(types)}")
    assert len(types) >= 3, "Expected at least 3 seeded sample types"
    first_type = types[0]
    print(f"    First type: {first_type.type_code} ({first_type.type_name})")

    # 2. Test registering a new primary sample
    unique_code = f"SMP-{uuid.uuid4().hex[:6].upper()}"
    new_sample = SampleService.create_sample(db, SampleCreateRequest(
        sample_code=unique_code,
        sample_name="Pleistocene Skeletal Fragment",
        sample_type_id=first_type.sample_type_id,
        quantity_value=25.0,
        quantity_unit="g",
        sample_status="IN_STORAGE",
        current_storage_location_id=1,
        source_description="Kurnool Caves excavation, Stratum IV"
    ), actor_id=1)
    print(f"[2] Registered Sample: ID {new_sample.sample_id} | Code: {new_sample.sample_code} | Qty: {new_sample.quantity_value} {new_sample.quantity_unit}")
    assert new_sample.sample_code == unique_code
    assert float(new_sample.quantity_value) == 25.0

    # 3. Test duplicate sample code rejection
    try:
        SampleService.create_sample(db, SampleCreateRequest(
            sample_code=unique_code,
            sample_name="Duplicate Attempt",
            sample_type_id=first_type.sample_type_id,
            quantity_value=5.0,
            quantity_unit="g"
        ), actor_id=1)
        assert False, "Expected DuplicateEntityException"
    except DuplicateEntityException as e:
        print(f"[3] Duplicate code rejection verified: {type(e).__name__}")

    # 4. Test retrieving sample detail
    detail = SampleService.get_sample_by_id(db, new_sample.sample_id)
    assert detail.sample_code == unique_code
    assert detail.sample_type_code == first_type.type_code
    print(f"[4] Retrieved Sample Detail: {detail.sample_code} | Status: {detail.sample_status} | Storage: {detail.current_storage_location_code}")

    # 5. Test listing samples with search & pagination
    items, total = SampleService.list_samples(db, search=unique_code, page=1, page_size=10)
    assert total >= 1
    assert items[0].sample_code == unique_code
    print(f"[5] Sample Catalog Search: Found {total} matching specimens.")

    # 6. Test updating sample & storage relocation
    updated = SampleService.update_sample(db, new_sample.sample_id, SampleUpdateRequest(
        sample_name="Pleistocene Skeletal Fragment (Cleaned)",
        current_storage_location_id=2,
        movement_reason="Transfer to dedicated bone storage freezer"
    ), actor_id=1)
    assert updated.sample_name == "Pleistocene Skeletal Fragment (Cleaned)"
    assert updated.current_storage_location_id == 2
    print(f"[6] Updated Sample & Relocated: Location ID -> {updated.current_storage_location_id}")

    # 7. Test atomic derivation (valid parent deduction)
    second_type = types[1]
    child_code = f"SMP-{uuid.uuid4().hex[:6].upper()}"
    derivation_res = SampleService.derive_child_sample(db, new_sample.sample_id, SampleDerivationRequest(
        child_sample_code=child_code,
        child_sample_name="Milled Bone Powder Aliquot",
        child_sample_type_id=second_type.sample_type_id,
        quantity_transferred=5.0,
        quantity_unit="g",
        transformation_type="Pulverization",
        child_storage_location_id=2,
        notes="Cryogenic milling at -196C"
    ), actor_id=1)
    print(f"[7] Atomic Derivation Success: Child {derivation_res.child_sample_code} created.")
    print(f"    Parent remaining quantity: {derivation_res.parent_remaining_quantity} g (Deducted 5.0 g from 25.0 g).")
    assert derivation_res.parent_remaining_quantity == 20.0
    assert derivation_res.child_sample_code == child_code

    # 8. Test insufficient quantity rejection
    try:
        SampleService.derive_child_sample(db, new_sample.sample_id, SampleDerivationRequest(
            child_sample_code=f"SMP-{uuid.uuid4().hex[:6].upper()}",
            child_sample_name="Excessive Extract",
            child_sample_type_id=second_type.sample_type_id,
            quantity_transferred=100.0,
            quantity_unit="g",
            transformation_type="Aliquot"
        ), actor_id=1)
        assert False, "Expected InsufficientQuantityException"
    except InsufficientQuantityException as e:
        print(f"[8] Insufficient quantity rejection verified: Available 20.0, Requested 100.0.")

    # 9. Test full stock depletion lifecycle
    depletion_res = SampleService.derive_child_sample(db, new_sample.sample_id, SampleDerivationRequest(
        child_sample_code=f"SMP-{uuid.uuid4().hex[:6].upper()}",
        child_sample_name="Final Bone Powder Batch",
        child_sample_type_id=second_type.sample_type_id,
        quantity_transferred=20.0,
        quantity_unit="g",
        transformation_type="Complete Pulverization"
    ), actor_id=1)
    print(f"[9] Parent Depletion Verified: Remaining {depletion_res.parent_remaining_quantity} g | Status: {depletion_res.parent_status}")
    assert depletion_res.parent_remaining_quantity == 0.0
    assert depletion_res.parent_status == "DEPLETED"

    # 10. Test storage history audit records
    history = SampleService.get_sample_storage_history(db, new_sample.sample_id)
    print(f"[10] Storage History Records: {len(history)} movements recorded.")
    assert len(history) >= 2, "Expected initial registration + relocation audit entries"

    db.close()
    print("=" * 60)
    print(" [ALL 10 SAMPLE SERVICE & ATOMIC DERIVATION TESTS PASSED 100%!] ")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
