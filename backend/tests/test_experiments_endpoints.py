"""
Comprehensive Rigorous Test Suite for Module 6: Experiments & Results APIs (Step 6C)
=====================================================================================
Tests all endpoints, query parameters, permissions, error handling,
multi-sample cohort attachment, equipment reservations, result generation, and verification locking.
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
    print(" Executing Rigorous Test Suite for Module 6: Experiments APIs")
    print("=" * 65)

    headers = get_admin_headers()

    # 1. Unauthenticated request rejected
    res_unauth = client.get("/api/v1/experiments")
    assert res_unauth.status_code == 401, f"Expected 401, got {res_unauth.status_code}"
    print("[PASS] Test 01: Unauthenticated request to /experiments rejected (401).")

    # 2. Create new experiment with sample cohort & equipment
    exp_code = f"EXP-{uuid.uuid4().hex[:6].upper()}"
    res_create = client.post("/api/v1/experiments", headers=headers, json={
        "experiment_code": exp_code,
        "experiment_name": "Comparative Mitochondrial Paleogenomics",
        "objective": "Determine haplogroup distribution across Harappan stratigraphy",
        "protocol_reference": "MitoSeq-Prot-4.2",
        "status": "planned",
        "samples": [
            {
                "sample_id": 1,
                "usage_role": "input",
                "quantity_used": 12.0,
                "quantity_unit": "mg",
                "notes": "Target petrous bone aliquot"
            }
        ],
        "equipment_ids": [1]
    })
    assert res_create.status_code == 201, f"Expected 201, got {res_create.status_code}: {res_create.text}"
    exp_data = res_create.json()["data"]
    exp_id = exp_data["experiment_id"]
    assert exp_data["experiment_code"] == exp_code
    assert len(exp_data["samples"]) == 1
    assert len(exp_data["equipment"]) == 1
    print(f"[PASS] Test 02: Created experiment {exp_code} (ID: {exp_id}) with cohort & equipment.")

    # 3. Duplicate experiment code rejected with 409 Conflict
    res_dup = client.post("/api/v1/experiments", headers=headers, json={
        "experiment_code": exp_code,
        "experiment_name": "Duplicate Project"
    })
    assert res_dup.status_code == 409
    print("[PASS] Test 03: Duplicate experiment code rejected with 409 Conflict.")

    # 4. Retrieve experiment detail dossier
    res_detail = client.get(f"/api/v1/experiments/{exp_id}", headers=headers)
    assert res_detail.status_code == 200
    detail = res_detail.json()["data"]
    assert detail["experiment_code"] == exp_code
    assert detail["samples"][0]["sample_id"] == 1
    print(f"[PASS] Test 04: Retrieved experiment detail: {len(detail['samples'])} samples, {len(detail['equipment'])} instruments.")

    # 5. Update experiment status to active
    res_update = client.put(f"/api/v1/experiments/{exp_id}", headers=headers, json={
        "status": "active",
        "protocol_reference": "MitoSeq-Prot-4.3-revised"
    })
    assert res_update.status_code == 200
    updated_exp = res_update.json()["data"]
    assert updated_exp["status"] == "active"
    print(f"[PASS] Test 05: Updated experiment status to 'active'.")

    # 6. Attach another specimen to experiment cohort
    res_attach = client.post(f"/api/v1/experiments/{exp_id}/samples", headers=headers, json={
        "sample_id": 2,
        "usage_role": "control",
        "quantity_used": 5.0,
        "quantity_unit": "mg",
        "notes": "Non-template extraction control"
    })
    assert res_attach.status_code == 200
    assert res_attach.json()["data"] is True
    print("[PASS] Test 06: Attached control specimen to experiment cohort.")

    # 7. Record experimental result
    res_code = f"RES-{uuid.uuid4().hex[:6].upper()}"
    res_result_create = client.post(f"/api/v1/experiments/{exp_id}/results", headers=headers, json={
        "result_code": res_code,
        "result_title": "Mitochondrial Consensus Sequence & Haplogroup Assignment",
        "observation": "High coverage (84x) complete mitochondrial genome assembled",
        "result_value": 84.2,
        "result_unit": "x coverage",
        "interpretation": "Assigned to Macro-haplogroup M with 99.8% Phylotree confidence",
        "is_final": False
    })
    assert res_result_create.status_code == 201
    result_data = res_result_create.json()["data"]
    result_id = result_data["experiment_result_id"]
    assert result_data["result_code"] == res_code
    print(f"[PASS] Test 07: Recorded experimental result {res_code} (ID: {result_id}, 84.2x coverage).")

    # 8. Duplicate result code rejected with 409 Conflict
    res_dup_res = client.post(f"/api/v1/experiments/{exp_id}/results", headers=headers, json={
        "result_code": res_code,
        "result_title": "Duplicate Result Code"
    })
    assert res_dup_res.status_code == 409
    print("[PASS] Test 08: Duplicate result code rejected with 409 Conflict.")

    # 9. List experiment results for this specific project
    res_exp_results = client.get(f"/api/v1/experiments/{exp_id}/results", headers=headers)
    assert res_exp_results.status_code == 200
    exp_results = res_exp_results.json()["data"]
    assert len(exp_results) >= 1
    assert any(r["result_code"] == res_code for r in exp_results)
    print(f"[PASS] Test 09: GET /experiments/{exp_id}/results returned {len(exp_results)} results.")

    # 10. Formally verify and lock experimental result
    res_verify = client.put(f"/api/v1/results/{result_id}/verify", headers=headers, json={
        "is_final": True,
        "verification_notes": "Reviewed and approved by Principal Investigator"
    })
    assert res_verify.status_code == 200
    verified_data = res_verify.json()["data"]
    assert verified_data["is_final"] is True
    print(f"[PASS] Test 10: Verified and locked experimental result (is_final=True).")

    # 11. List global results registry
    res_global = client.get("/api/v1/results?page=1&page_size=10", headers=headers)
    assert res_global.status_code == 200
    global_results = res_global.json()
    assert "items" in global_results
    assert len(global_results["items"]) >= 1
    print(f"[PASS] Test 11: GET /results returned {len(global_results['items'])} global results.")

    # 12. List experiments with status filter
    res_filter_exp = client.get("/api/v1/experiments?status=active", headers=headers)
    assert res_filter_exp.status_code == 200
    active_exps = res_filter_exp.json()["items"]
    assert any(e["experiment_code"] == exp_code for e in active_exps)
    print(f"[PASS] Test 12: GET /experiments?status=active returned {len(active_exps)} projects.")

    print("=" * 65)
    print(" [ALL 12 MODULE 6 EXPERIMENTS API TESTS PASSED 100%!] ")
    print("=" * 65)


if __name__ == "__main__":
    run_all_tests()
