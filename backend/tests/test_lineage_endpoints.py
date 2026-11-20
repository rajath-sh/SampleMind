"""
Comprehensive Rigorous Test Suite for Module 4: Lineage & DAG Explorer APIs (Step 4C)
======================================================================================
Tests all endpoints, query parameters, permissions, cycle prevention via API (409),
self-lineage rejection (400), recursive CTE ancestors/descendants, and DAG graph assembly.
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
    print(" Executing Rigorous Test Suite for Module 4: Lineage & DAG APIs")
    print("=" * 65)

    headers = get_admin_headers()

    # 1. Unauthenticated request rejected
    res_unauth = client.get("/api/v1/lineage/1")
    assert res_unauth.status_code == 401, f"Expected 401, got {res_unauth.status_code}"
    print("[PASS] Test 01: Unauthenticated request to /lineage rejected (401).")

    # 2. Register 3 specimens to establish multi-level derivation DAG: P1 -> P2 -> P3
    c1 = f"SMP-DAG1-{uuid.uuid4().hex[:4].upper()}"
    c2 = f"SMP-DAG2-{uuid.uuid4().hex[:4].upper()}"
    c3 = f"SMP-DAG3-{uuid.uuid4().hex[:4].upper()}"

    s1 = client.post("/api/v1/samples", headers=headers, json={
        "sample_code": c1,
        "sample_name": "Root Fossil Skull P1",
        "sample_type_id": 1,
        "quantity_value": 80.0,
        "quantity_unit": "mg",
        "sample_status": "REGISTERED"
    }).json()["data"]["sample_id"]

    s2 = client.post("/api/v1/samples", headers=headers, json={
        "sample_code": c2,
        "sample_name": "Bone Powder Aliquot P2",
        "sample_type_id": 1,
        "quantity_value": 40.0,
        "quantity_unit": "mg",
        "sample_status": "REGISTERED"
    }).json()["data"]["sample_id"]

    s3 = client.post("/api/v1/samples", headers=headers, json={
        "sample_code": c3,
        "sample_name": "Purified DNA Extract P3",
        "sample_type_id": 1,
        "quantity_value": 15.0,
        "quantity_unit": "uL",
        "sample_status": "REGISTERED"
    }).json()["data"]["sample_id"]

    print(f"[PASS] Test 02: Provisioned sample triad P1 ({c1}), P2 ({c2}), P3 ({c3}).")

    # 3. Self-referential lineage rejected via API
    res_self = client.post("/api/v1/lineage/relationships", headers=headers, json={
        "parent_sample_id": s1,
        "child_sample_id": s1,
        "transformation_type": "Self Derivation"
    })
    assert res_self.status_code == 400, f"Expected 400, got {res_self.status_code}"
    print("[PASS] Test 03: Self-lineage (P1 -> P1) rejected with 400 Bad Request.")

    # 4. Create legitimate lineage edge P1 -> P2
    res_rel1 = client.post("/api/v1/lineage/relationships", headers=headers, json={
        "parent_sample_id": s1,
        "child_sample_id": s2,
        "transformation_type": "Pulverization",
        "quantity_transferred": 40.0,
        "quantity_unit": "mg",
        "notes": "Cryogenic pulverization of cranial bone"
    })
    assert res_rel1.status_code == 201, f"Expected 201, got {res_rel1.status_code}: {res_rel1.text}"
    rel1_data = res_rel1.json()["data"]
    assert rel1_data["parent_sample_id"] == s1
    assert rel1_data["child_sample_id"] == s2
    print(f"[PASS] Test 04: Created derivation link P1 -> P2 via API (Status: 201).")

    # 5. Direct cycle rejection: P2 -> P1 must return 409
    res_cycle_direct = client.post("/api/v1/lineage/relationships", headers=headers, json={
        "parent_sample_id": s2,
        "child_sample_id": s1,
        "transformation_type": "Illegal Loop"
    })
    assert res_cycle_direct.status_code == 409, f"Expected 409, got {res_cycle_direct.status_code}"
    assert "Cycle" in res_cycle_direct.json().get("message", "")
    print("[PASS] Test 05: Direct cycle (P2 -> P1) rejected with 409 Conflict.")

    # 6. Create legitimate lineage edge P2 -> P3
    res_rel2 = client.post("/api/v1/lineage/relationships", headers=headers, json={
        "parent_sample_id": s2,
        "child_sample_id": s3,
        "transformation_type": "DNA Extraction",
        "quantity_transferred": 15.0,
        "quantity_unit": "uL",
        "notes": "Silica column DNA extraction"
    })
    assert res_rel2.status_code == 201
    print(f"[PASS] Test 06: Created derivation link P2 -> P3 via API (Status: 201).")

    # 7. Multi-hop cycle rejection: P3 -> P1 must return 409
    res_cycle_multi = client.post("/api/v1/lineage/relationships", headers=headers, json={
        "parent_sample_id": s3,
        "child_sample_id": s1,
        "transformation_type": "Multi Hop Loop"
    })
    assert res_cycle_multi.status_code == 409, f"Expected 409, got {res_cycle_multi.status_code}"
    print("[PASS] Test 07: Multi-hop cycle (P3 -> P1) rejected with 409 Conflict.")

    # 8. Recursive CTE ancestors endpoint from P3
    res_anc = client.get(f"/api/v1/lineage/{s3}/ancestors", headers=headers)
    assert res_anc.status_code == 200
    ancestors = res_anc.json()["data"]
    assert len(ancestors) == 2  # P2 and P1
    anc_ids = {a["sample_id"] for a in ancestors}
    assert s2 in anc_ids
    assert s1 in anc_ids
    print(f"[PASS] Test 08: GET /lineage/{s3}/ancestors returned {len(ancestors)} upstream nodes (P2, P1).")

    # 9. Recursive CTE descendants endpoint from P1
    res_desc = client.get(f"/api/v1/lineage/{s1}/descendants", headers=headers)
    assert res_desc.status_code == 200
    descendants = res_desc.json()["data"]
    assert len(descendants) == 2  # P2 and P3
    desc_ids = {d["sample_id"] for d in descendants}
    assert s2 in desc_ids
    assert s3 in desc_ids
    print(f"[PASS] Test 09: GET /lineage/{s1}/descendants returned {len(descendants)} downstream nodes (P2, P3).")

    # 10. Full DAG graph visualization payload
    res_graph = client.get(f"/api/v1/lineage/{s2}?direction=all", headers=headers)
    assert res_graph.status_code == 200
    graph = res_graph.json()["data"]
    assert graph["focus_sample_id"] == s2
    assert graph["total_nodes"] == 3
    assert graph["total_edges"] == 2
    assert len(graph["nodes"]) == 3
    assert len(graph["edges"]) == 2
    print(f"[PASS] Test 10: GET /lineage/{s2} graph payload verified: 3 nodes, 2 edges.")

    # 11. Non-existent sample ID returns 404
    res_404 = client.get("/api/v1/lineage/999999", headers=headers)
    assert res_404.status_code == 404
    print("[PASS] Test 11: Non-existent specimen returned 404 Not Found.")

    print("=" * 65)
    print(" [ALL 11 MODULE 4 LINEAGE API TESTS PASSED 100%!] ")
    print("=" * 65)


if __name__ == "__main__":
    run_all_tests()
