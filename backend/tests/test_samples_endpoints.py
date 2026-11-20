"""
Comprehensive Rigorous Test Suite for Module 3: Sample Registry, Depletion & Derivation APIs (Step 3C)
=======================================================================================================
Tests all endpoints, query parameters, permissions, error handling,
atomic parent stock deduction, full depletion triggers, and physical relocation history.
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
    print("=" * 65)
    print(" Executing Rigorous Test Suite for Module 3: Samples & Derivation")
    print("=" * 65)

    headers = get_admin_headers()

    # 1. Unauthenticated request rejected
    res_unauth = client.get("/api/v1/samples")
    assert res_unauth.status_code == 401, f"Expected 401, got {res_unauth.status_code}"
    print("[PASS] Test 01: Unauthenticated request to /samples rejected (401).")

    # 2. List controlled vocabulary sample types
    res_types = client.get("/api/v1/samples/types", headers=headers)
    assert res_types.status_code == 200, f"Expected 200, got {res_types.status_code}"
    types_data = res_types.json()["data"]
    assert len(types_data) >= 1
    sample_type_id = types_data[0]["sample_type_id"]
    type_code = types_data[0]["type_code"]
    print(f"[PASS] Test 02: Sample types retrieved ({len(types_data)} types, e.g. {type_code}, ID: {sample_type_id}).")

    # 3. Paginated catalog search
    res_list = client.get("/api/v1/samples?page=1&page_size=10", headers=headers)
    assert res_list.status_code == 200, f"Expected 200, got {res_list.status_code}"
    page_data = res_list.json()
    assert "items" in page_data
    assert "total" in page_data
    assert page_data["page"] == 1
    print(f"[PASS] Test 03: Paginated list returned {len(page_data['items'])} items (Total: {page_data['total']}).")

    # 4. Register new primary specimen
    unique_code = f"SMP-{uuid.uuid4().hex[:6].upper()}"
    res_create = client.post("/api/v1/samples", headers=headers, json={
        "sample_code": unique_code,
        "sample_name": "Neolithic Femur Fragment #4",
        "sample_type_id": sample_type_id,
        "quantity_value": 50.0,
        "quantity_unit": "mg",
        "sample_status": "IN_STORAGE",
        "source_description": "Harappa Trench 4B stratum 12",
        "current_storage_location_id": 1,
        "notes": "Primary fossil specimen preserved in cryo"
    })
    assert res_create.status_code == 201, f"Expected 201, got {res_create.status_code}: {res_create.text}"
    created_sample = res_create.json()["data"]
    sample_id = created_sample["sample_id"]
    assert created_sample["sample_code"] == unique_code
    assert float(created_sample["quantity_value"]) == 50.0
    print(f"[PASS] Test 04: Registered primary specimen {unique_code} (ID: {sample_id}, Qty: 50.0 mg).")

    # 5. Duplicate sample code rejection
    res_dup = client.post("/api/v1/samples", headers=headers, json={
        "sample_code": unique_code,
        "sample_name": "Duplicate Specimen",
        "sample_type_id": sample_type_id,
        "quantity_value": 10.0,
        "quantity_unit": "mg"
    })
    assert res_dup.status_code == 409, f"Expected 409, got {res_dup.status_code}"
    print("[PASS] Test 05: Duplicate specimen code rejected with 409 Conflict.")

    # 6. Retrieve specimen detail dossier
    res_detail = client.get(f"/api/v1/samples/{sample_id}", headers=headers)
    assert res_detail.status_code == 200
    detail = res_detail.json()["data"]
    assert detail["sample_code"] == unique_code
    assert "Harappa" in detail["source_description"]
    assert "parents" in detail
    assert "children" in detail
    print(f"[PASS] Test 06: Retrieved specimen dossier for {unique_code} with location '{detail['current_storage_location_code']}'.")

    # 7. Update specimen metadata & relocate
    res_update = client.put(f"/api/v1/samples/{sample_id}", headers=headers, json={
        "current_storage_location_id": 2,
        "notes": "Relocated to Shelf B for homogenization",
        "movement_reason": "Relocated for homogenization prep"
    })
    assert res_update.status_code == 200
    updated_data = res_update.json()["data"]
    assert updated_data["current_storage_location_id"] == 2
    assert "Relocated" in updated_data["notes"]
    print(f"[PASS] Test 07: Updated specimen location to ID 2 with audit notes.")

    # 8. Retrieve storage history
    res_hist = client.get(f"/api/v1/samples/{sample_id}/storage-history", headers=headers)
    assert res_hist.status_code == 200
    history = res_hist.json()["data"]
    assert len(history) >= 1
    print(f"[PASS] Test 08: Chronological storage history verified ({len(history)} entries recorded).")

    # 9. Atomic derivation: Insufficient parent quantity rejection
    child_code_fail = f"SMP-{uuid.uuid4().hex[:6].upper()}"
    res_fail_derive = client.post(f"/api/v1/samples/{sample_id}/derive", headers=headers, json={
        "child_sample_code": child_code_fail,
        "child_sample_name": "Excess Aliquot",
        "child_sample_type_id": sample_type_id,
        "quantity_transferred": 100.0,
        "quantity_unit": "mg",
        "transformation_type": "DNA Extraction"
    })
    assert res_fail_derive.status_code == 409, f"Expected 409, got {res_fail_derive.status_code}"
    assert "Insufficient" in res_fail_derive.json().get("message", "")
    print(f"[PASS] Test 09: Insufficient parent quantity transfer rejected with 409 Conflict.")

    # 10. Atomic derivation success & partial stock deduction
    child_code_1 = f"SMP-{uuid.uuid4().hex[:6].upper()}"
    res_derive = client.post(f"/api/v1/samples/{sample_id}/derive", headers=headers, json={
        "child_sample_code": child_code_1,
        "child_sample_name": "DNA Extract Aliquot 1",
        "child_sample_type_id": sample_type_id,
        "quantity_transferred": 20.0,
        "quantity_unit": "mg",
        "transformation_type": "DNA Extraction",
        "child_storage_location_id": 1,
        "notes": "Aliquot derived for high-throughput sequencing"
    })
    assert res_derive.status_code == 201, f"Expected 201, got {res_derive.status_code}: {res_derive.text}"
    derive_data = res_derive.json()["data"]
    assert derive_data["child_sample_code"] == child_code_1
    assert float(derive_data["parent_remaining_quantity"]) == 30.0
    print(f"[PASS] Test 10: Derived aliquot {child_code_1}. Parent stock atomically reduced: 50.0 -> 30.0 mg.")

    # 11. Atomic derivation to full depletion
    child_code_2 = f"SMP-{uuid.uuid4().hex[:6].upper()}"
    res_deplete = client.post(f"/api/v1/samples/{sample_id}/derive", headers=headers, json={
        "child_sample_code": child_code_2,
        "child_sample_name": "Final Remnant Extract",
        "child_sample_type_id": sample_type_id,
        "quantity_transferred": 30.0,
        "quantity_unit": "mg",
        "transformation_type": "Pulverization"
    })
    assert res_deplete.status_code == 201
    deplete_data = res_deplete.json()["data"]
    assert float(deplete_data["parent_remaining_quantity"]) == 0.0
    assert deplete_data["parent_status"] == "DEPLETED"
    print(f"[PASS] Test 11: Depleted parent specimen {unique_code}. Status transitioned to 'DEPLETED' (0.0 mg left).")

    print("=" * 65)
    print(" [ALL 11 MODULE 3 API TESTS PASSED WITH 100% SUCCESS!] ")
    print("=" * 65)


if __name__ == "__main__":
    run_all_tests()
