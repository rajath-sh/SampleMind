"""
Comprehensive Rigorous Test Suite for Module 5: Laboratory Quality & Testing APIs (Step 5C)
=============================================================================================
Tests all endpoints, query parameters, permissions, error handling, status transitions,
quantitative assay readings, and multi-facet filtering (status, outcome, keyword).
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app
from app.common import SessionLocal, Sample

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
    print(" Executing Rigorous Test Suite for Module 5: Laboratory Tests APIs")
    print("=" * 65)

    headers = get_admin_headers()

    # Ensure sample 1 is available in IN_STORAGE state
    db = SessionLocal()
    s1 = db.query(Sample).filter(Sample.sample_id == 1).first()
    if s1:
        s1.sample_status = "IN_STORAGE"
        db.commit()
    db.close()

    # 1. Unauthenticated request rejected
    res_unauth = client.get("/api/v1/tests")
    assert res_unauth.status_code == 401, f"Expected 401, got {res_unauth.status_code}"
    print("[PASS] Test 01: Unauthenticated request to /tests rejected (401).")

    # 2. Schedule new assay on existing sample (ID: 1)
    res_create = client.post("/api/v1/tests", headers=headers, json={
        "sample_id": 1,
        "test_type": "Qubit 4 Fluorometer dsDNA High Sensitivity",
        "test_status": "requested",
        "observation": "Scheduled pre-library preparation concentration check"
    })
    assert res_create.status_code == 201, f"Expected 201, got {res_create.status_code}: {res_create.text}"
    created_test = res_create.json()["data"]
    test_id = created_test["sample_test_id"]
    assert created_test["test_status"] == "requested"
    assert created_test["sample_id"] == 1
    print(f"[PASS] Test 02: Scheduled analytical assay (ID: {test_id}) on sample 1.")

    # 3. Invalid status rejected with 400 Bad Request
    res_invalid_status = client.post("/api/v1/tests", headers=headers, json={
        "sample_id": 1,
        "test_type": "Qubit Fluorometry",
        "test_status": "not_a_valid_status"
    })
    assert res_invalid_status.status_code == 400
    print("[PASS] Test 03: Invalid test status rejected with 400 Bad Request.")

    # 4. Non-existent sample rejected with 404 Not Found
    res_404_sample = client.post("/api/v1/tests", headers=headers, json={
        "sample_id": 999999,
        "test_type": "Bioanalyzer Fragment Sizing"
    })
    assert res_404_sample.status_code == 404
    print("[PASS] Test 04: Non-existent specimen rejected with 404 Not Found.")

    # 5. List analytical assays with pagination
    res_list = client.get("/api/v1/tests?page=1&page_size=10", headers=headers)
    assert res_list.status_code == 200
    page_data = res_list.json()
    assert "items" in page_data
    assert "total" in page_data
    assert page_data["page"] == 1
    print(f"[PASS] Test 05: Paginated list returned {len(page_data['items'])} items (Total: {page_data['total']}).")

    # 6. Retrieve comprehensive test detail
    res_detail = client.get(f"/api/v1/tests/{test_id}", headers=headers)
    assert res_detail.status_code == 200
    detail = res_detail.json()["data"]
    assert detail["sample_test_id"] == test_id
    assert detail["test_type"] == "Qubit 4 Fluorometer dsDNA High Sensitivity"
    print(f"[PASS] Test 06: Retrieved assay detail for test ID {test_id} (Specimen: {detail['sample_code']}).")

    # 7. Update assay progress to in_progress
    res_progress = client.put(f"/api/v1/tests/{test_id}", headers=headers, json={
        "test_status": "in_progress",
        "observation": "Sample incubation with Qubit HS reagent completed. Measuring fluorescence."
    })
    assert res_progress.status_code == 200
    updated_prog = res_progress.json()["data"]
    assert updated_prog["test_status"] == "in_progress"
    print(f"[PASS] Test 07: Updated assay to 'in_progress' with incubation notes.")

    # 8. Complete assay with quantitative measurement and OPTIMAL interpretation
    res_complete = client.put(f"/api/v1/tests/{test_id}", headers=headers, json={
        "test_status": "completed",
        "result_value": 24.8,
        "result_unit": "ng/uL",
        "result_interpretation": "OPTIMAL",
        "observation": "High yield dsDNA quantified. Standard curve R^2 = 0.9998."
    })
    assert res_complete.status_code == 200
    completed = res_complete.json()["data"]
    assert completed["test_status"] == "completed"
    assert completed["result_value"] == 24.8
    assert completed["result_unit"] == "ng/uL"
    assert completed["result_interpretation"] == "OPTIMAL"
    print(f"[PASS] Test 08: Completed assay with 24.8 ng/uL [OPTIMAL].")

    # 9. Schedule and record another assay with CONTAMINATED result
    res_create_qc = client.post("/api/v1/tests", headers=headers, json={
        "sample_id": 1,
        "test_type": "qPCR 16S Environmental Bacterial Screen",
        "test_status": "completed",
        "result_value": 850.0,
        "result_unit": "copies/uL",
        "result_interpretation": "CONTAMINATED",
        "observation": "Substantial modern bacterial DNA detected in ancient extract."
    })
    assert res_create_qc.status_code == 201
    print(f"[PASS] Test 09: Recorded QC assay with CONTAMINATED flag.")

    # 10. Filter by outcome interpretation
    res_filter_opt = client.get("/api/v1/tests?outcome=OPTIMAL", headers=headers)
    assert res_filter_opt.status_code == 200
    opt_items = res_filter_opt.json()["items"]
    assert all(i["result_interpretation"] == "OPTIMAL" for i in opt_items)
    print(f"[PASS] Test 10: Filtered by outcome 'OPTIMAL' ({len(opt_items)} matching assays).")

    # 11. Keyword search filter
    res_search = client.get("/api/v1/tests?search=Fluorometer", headers=headers)
    assert res_search.status_code == 200
    search_items = res_search.json()["items"]
    assert len(search_items) >= 1
    print(f"[PASS] Test 11: Keyword search for 'Fluorometer' returned {len(search_items)} matches.")

    print("=" * 65)
    print(" [ALL 11 MODULE 5 TEST API TESTS PASSED 100%!] ")
    print("=" * 65)


if __name__ == "__main__":
    run_all_tests()
