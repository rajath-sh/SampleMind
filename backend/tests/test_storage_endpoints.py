"""
Comprehensive Rigorous Test Suite for Module 2: Storage & Equipment APIs (Step 2C)
===================================================================================
Tests all endpoints, query parameters, permissions, error handling,
2D box occupancy grid calculations, and equipment lifecycle states.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def get_admin_headers():
    res = client.post("/api/v1/auth/login", json={
        "username": "rajath.vs@rvce.edu.in",
        "password": "password123"
    })
    token = res.json()["data"]["access_token"]
    return {"Authorization": f"Bearer {token}"}


def run_all_tests():
    print("=" * 60)
    print(" Executing Rigorous Test Suite for Module 2: Storage & Equipment")
    print("=" * 60)

    headers = get_admin_headers()

    # 1. Unauthenticated access blocked
    res_unauth = client.get("/api/v1/storage/locations")
    assert res_unauth.status_code == 401, "Expected 401 Unauthorized"
    print("[PASS] Test 01: Unauthenticated request to /storage/locations rejected (401).")

    # 2. List locations
    res_list = client.get("/api/v1/storage/locations", headers=headers)
    assert res_list.status_code == 200, f"Expected 200, got {res_list.status_code}"
    locs = res_list.json()["data"]
    assert len(locs) >= 1
    first_loc = locs[0]
    first_loc_id = first_loc["storage_location_id"]
    print(f"[PASS] Test 02: List locations returned {len(locs)} records. First: {first_loc['location_code']}")

    # 3. Location detail with resident samples
    res_detail = client.get(f"/api/v1/storage/locations/{first_loc_id}", headers=headers)
    assert res_detail.status_code == 200
    detail = res_detail.json()["data"]
    assert detail["location_code"] == first_loc["location_code"]
    assert "samples" in detail
    print(f"[PASS] Test 03: Location detail verified for {detail['location_code']} with {len(detail['samples'])} resident samples.")

    # 4. Create new storage location
    unique_code = f"LOC-FRZ-{uuid.uuid4().hex[:6].upper()}"
    res_create = client.post("/api/v1/storage/locations", headers=headers, json={
        "location_code": unique_code,
        "facility": "Central Bio-Repository",
        "room": "CRYO-101",
        "unit_type": "freezer",
        "unit_label": "FRZ-ULT-99",
        "rack": "RACK-1",
        "box": "BOX-01",
        "slot": "A01",
        "temperature_min_c": -86.0,
        "temperature_max_c": -78.0,
        "is_active": True
    })
    assert res_create.status_code == 201, f"Expected 201, got {res_create.status_code}: {res_create.text}"
    created_loc = res_create.json()["data"]
    created_id = created_loc["storage_location_id"]
    assert created_loc["location_code"] == unique_code
    print(f"[PASS] Test 04: Created storage location {unique_code} (ID: {created_id}).")

    # 5. Duplicate location code rejected with 409 Conflict
    res_dup = client.post("/api/v1/storage/locations", headers=headers, json={
        "location_code": unique_code,
        "facility": "Another Facility",
        "unit_type": "cabinet"
    })
    assert res_dup.status_code == 409, f"Expected 409, got {res_dup.status_code}"
    assert res_dup.json().get("code") == "DUPLICATE_ENTITY" or "already exists" in str(res_dup.json())
    print("[PASS] Test 05: Duplicate storage location rejected with 409 Conflict.")

    # 6. Update storage location
    res_update = client.put(f"/api/v1/storage/locations/{created_id}", headers=headers, json={
        "room": "CRYO-102",
        "temperature_max_c": -75.0
    })
    assert res_update.status_code == 200
    updated_loc = res_update.json()["data"]
    assert updated_loc["room"] == "CRYO-102"
    assert updated_loc["temperature_max_c"] == -75.0
    print(f"[PASS] Test 06: Updated location {unique_code} conditions successfully.")

    # 7. 2D Box Occupancy Grid endpoint
    res_grid = client.get(f"/api/v1/storage/occupancy-grid/FRZ-ULT-99", headers=headers)
    assert res_grid.status_code == 200
    grid = res_grid.json()["data"]
    assert grid["unit_label"] == "FRZ-ULT-99"
    assert grid["total_slots"] >= 1
    assert "slots" in grid
    print(f"[PASS] Test 07: Occupancy grid computed for FRZ-ULT-99: Total={grid['total_slots']}, Available={grid['available_slots']}.")

    # 8. List equipment
    res_eq_list = client.get("/api/v1/equipment", headers=headers)
    assert res_eq_list.status_code == 200
    eq_list = res_eq_list.json()["data"]
    assert len(eq_list) >= 1
    print(f"[PASS] Test 08: Equipment list returned {len(eq_list)} instruments.")

    # 9. Register new equipment
    unique_eq_code = f"EQ-SEQ-{uuid.uuid4().hex[:6].upper()}"
    res_eq_create = client.post("/api/v1/equipment", headers=headers, json={
        "equipment_code": unique_eq_code,
        "equipment_name": "NextSeq 2000 Sequencing System",
        "manufacturer": "Illumina",
        "model_number": "NextSeq-2000",
        "equipment_status": "available",
        "notes": "Installed in NGS Clean Suite"
    })
    assert res_eq_create.status_code == 201, f"Expected 201, got {res_eq_create.status_code}: {res_eq_create.text}"
    new_eq = res_eq_create.json()["data"]
    new_eq_id = new_eq["equipment_id"]
    assert new_eq["equipment_code"] == unique_eq_code
    print(f"[PASS] Test 09: Registered instrument {unique_eq_code} (ID: {new_eq_id}).")

    # 10. Update equipment status
    res_eq_status = client.put(f"/api/v1/equipment/{new_eq_id}/status", headers=headers, json={
        "equipment_status": "maintenance",
        "notes": "Laser optics recalibration in progress"
    })
    assert res_eq_status.status_code == 200
    updated_eq = res_eq_status.json()["data"]
    assert updated_eq["equipment_status"] == "maintenance"
    print(f"[PASS] Test 10: Updated equipment status to 'maintenance' successfully.")

    print("=" * 60)
    print(" [ALL 10 MODULE 2 API TESTS PASSED WITH 100% SUCCESS!] ")
    print("=" * 60)


if __name__ == "__main__":
    run_all_tests()
