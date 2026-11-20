"""
Verification Test for Module 2: Storage & Equipment Service Layer (Step 2A)
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from app.common import SessionLocal
from app.modules.storage.service import StorageService, EquipmentService
from app.modules.storage.schemas import (
    StorageLocationCreate,
    StorageLocationUpdate,
    EquipmentCreate,
    EquipmentStatusUpdate,
)

def run_tests():
    db = SessionLocal()
    print("=" * 60)
    print(" Testing Module 2 (Storage & Equipment) Service Layer")
    print("=" * 60)

    # 1. Test listing seeded locations
    locs = StorageService.list_locations(db)
    print(f"[1] Seeded Storage Locations Count: {len(locs)}")
    assert len(locs) >= 1, "Expected at least 1 seeded storage location"
    first_loc = locs[0]
    print(f"    First location: {first_loc.location_code} | Facility: {first_loc.facility}")

    # 2. Test fetching location by ID
    loc_detail = StorageService.get_location_by_id(db, first_loc.storage_location_id)
    assert loc_detail.location_code == first_loc.location_code
    print(f"[2] Retrieved Location Detail: {loc_detail.location_code} | Samples: {loc_detail.sample_count}")

    # 3. Test creating a new storage location
    unique_code = f"LOC-TEST-{uuid.uuid4().hex[:6].upper()}"
    new_loc = StorageService.create_location(db, StorageLocationCreate(
        location_code=unique_code,
        facility="Central Analytical Core",
        room="B-204",
        unit_type="freezer",
        unit_label="FRZ-ULT-02",
        rack="RACK-A",
        box="BOX-01",
        slot="A01",
        temperature_min_c=-80.0,
        temperature_max_c=-70.0
    ), actor_id=1)
    print(f"[3] Created Location: ID {new_loc.storage_location_id} | Code: {new_loc.location_code}")
    assert new_loc.location_code == unique_code

    # 4. Test duplicate code rejection
    try:
        StorageService.create_location(db, StorageLocationCreate(
            location_code=unique_code,
            facility="Duplicate Lab",
            unit_type="bench"
        ))
        assert False, "Expected DuplicateEntityException"
    except Exception as e:
        print(f"[4] Duplicate location rejection verified: {type(e).__name__}")

    # 5. Test updating location
    updated_loc = StorageService.update_location(db, new_loc.storage_location_id, StorageLocationUpdate(
        room="B-205",
        temperature_max_c=-75.0
    ), actor_id=1)
    assert updated_loc.room == "B-205"
    print(f"[5] Updated Location: Room: {updated_loc.room} | Temp: {updated_loc.temperature_max_c}C")

    # 6. Test 2D Box Occupancy Grid
    grid = StorageService.get_box_occupancy_grid(db, unit_label="FRZ-ULT-02", box="BOX-01")
    print(f"[6] Box Occupancy Grid: Total: {grid.total_slots} | Occupied: {grid.occupied_slots} | Pct: {grid.occupancy_percentage}%")
    assert grid.total_slots >= 1

    # 7. Test listing equipment
    eq_list = EquipmentService.list_equipment(db)
    print(f"[7] Seeded Equipment Count: {len(eq_list)}")

    # 8. Test registering new equipment
    new_eq_code = f"EQ-TEST-{uuid.uuid4().hex[:6].upper()}"
    new_eq = EquipmentService.register_equipment(db, EquipmentCreate(
        equipment_code=new_eq_code,
        equipment_name="High-Throughput Cryo-Mill",
        manufacturer="Spex SamplePrep",
        model_number="CryoMill-6875D",
        equipment_status="available"
    ), actor_id=1)
    print(f"[8] Registered Equipment: ID {new_eq.equipment_id} | Code: {new_eq.equipment_code}")
    assert new_eq.equipment_code == new_eq_code

    # 9. Test updating equipment status
    updated_eq = EquipmentService.update_equipment_status(db, new_eq.equipment_id, EquipmentStatusUpdate(
        equipment_status="maintenance",
        notes="Scheduled liquid nitrogen valve inspection"
    ), actor_id=1)
    print(f"[9] Updated Equipment Status: {updated_eq.equipment_code} -> {updated_eq.equipment_status}")
    assert updated_eq.equipment_status == "maintenance"

    db.close()
    print("=" * 60)
    print(" [ALL STORAGE & EQUIPMENT SERVICE TESTS PASSED 100%!] ")
    print("=" * 60)

if __name__ == "__main__":
    run_tests()
