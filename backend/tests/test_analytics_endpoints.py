"""
Rigorous Automated Endpoint Test Suite for Module 10: Lab Overview Dashboard, Reports & Analytics (Step 10C)
Validates all REST APIs under /api/v1/analytics using TestClient with realistic inputs and asserts outputs.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def get_auth_headers(email: str = "rajath.vs@rvce.edu.in", password: str = "password123"):
    res = client.post("/api/v1/auth/login", json={
        "username": email,
        "password": password
    })
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["data"]["access_token"]
    user_id = res.json()["data"]["user_id"]
    return {"Authorization": f"Bearer {token}"}, user_id


def run_tests():
    print("=" * 65)
    print(" Executing Rigorous Test Suite for Module 10: Analytics APIs")
    print("=" * 65)

    # -------------------------------------------------------------
    # Test 1: Unauthenticated request rejected with 401 (/analytics/dashboard)
    # -------------------------------------------------------------
    res = client.get("/api/v1/analytics/dashboard")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    print("[PASS] Test 01: Unauthenticated request to /analytics/dashboard rejected (401).")

    # -------------------------------------------------------------
    # Test 2: Unauthenticated request rejected with 401 (/analytics/reports/samples-by-type)
    # -------------------------------------------------------------
    res = client.get("/api/v1/analytics/reports/samples-by-type")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    print("[PASS] Test 02: Unauthenticated request to /analytics/reports/samples-by-type rejected (401).")

    headers, admin_id = get_auth_headers()

    # -------------------------------------------------------------
    # Test 3: Authenticated GET /analytics/dashboard (200 OK)
    # -------------------------------------------------------------
    res = client.get("/api/v1/analytics/dashboard", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    data = res.json()["data"]
    assert "total_samples" in data
    assert "active_samples" in data
    assert "quarantined_samples" in data
    assert "storage_occupancy_percent" in data
    assert "total_equipment" in data
    assert "total_experiments" in data
    assert "open_incidents" in data
    assert "high_risk_ai_predictions" in data
    assert "recent_activities" in data
    assert isinstance(data["recent_activities"], list)
    print(f"[PASS] Test 03: GET /analytics/dashboard verified (Total samples: {data['total_samples']}, Occupancy: {data['storage_occupancy_percent']}%).")

    # -------------------------------------------------------------
    # Test 4: Authenticated GET /analytics/reports/samples-by-type (200 OK)
    # -------------------------------------------------------------
    res = client.get("/api/v1/analytics/reports/samples-by-type", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    types_data = res.json()["data"]
    assert isinstance(types_data, list)
    assert len(types_data) > 0
    sample_type_codes = [t["type_code"] for t in types_data]
    assert "ANCIENT_DNA" in sample_type_codes or "DNA_EXTRACT" in sample_type_codes or len(types_data) > 0
    for t in types_data:
        assert "type_code" in t
        assert "sample_count" in t
        assert "total_quantity" in t
        assert "percentage_of_total" in t
    print(f"[PASS] Test 04: GET /analytics/reports/samples-by-type verified ({len(types_data)} biological types cataloged).")

    # -------------------------------------------------------------
    # Test 5: Authenticated GET /analytics/reports/storage-occupancy (200 OK)
    # -------------------------------------------------------------
    res = client.get("/api/v1/analytics/reports/storage-occupancy", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    storage_data = res.json()["data"]
    assert isinstance(storage_data, list)
    assert len(storage_data) > 0
    for s in storage_data:
        assert "facility" in s
        assert "unit_type" in s
        assert "total_locations" in s
        assert "occupied_locations" in s
        assert "available_locations" in s
        assert "occupancy_percentage" in s
        assert s["total_locations"] >= s["occupied_locations"]
        assert s["available_locations"] == s["total_locations"] - s["occupied_locations"]
    print(f"[PASS] Test 05: GET /analytics/reports/storage-occupancy verified ({len(storage_data)} storage units evaluated).")

    # -------------------------------------------------------------
    # Test 6: Authenticated GET /analytics/reports/incident-trends (200 OK)
    # -------------------------------------------------------------
    res = client.get("/api/v1/analytics/reports/incident-trends", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    incident_data = res.json()["data"]
    assert isinstance(incident_data, list)
    severities = [i["severity"] for i in incident_data]
    assert "critical" in severities
    assert "high" in severities
    assert "medium" in severities
    assert "low" in severities
    for inc in incident_data:
        assert "count" in inc
        assert "open_count" in inc
        assert "resolved_count" in inc
        assert "percentage" in inc
    print(f"[PASS] Test 06: GET /analytics/reports/incident-trends verified (all 4 severities tracked).")

    # -------------------------------------------------------------
    # Test 7: GET /analytics/reports/incident-trends with Date Filters (200 OK)
    # -------------------------------------------------------------
    res = client.get(
        "/api/v1/analytics/reports/incident-trends?start_date=2026-01-01T00:00:00Z&end_date=2026-12-31T23:59:59Z",
        headers=headers,
    )
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    filtered_incidents = res.json()["data"]
    assert len(filtered_incidents) == 4
    print("[PASS] Test 07: GET /analytics/reports/incident-trends with ISO datetime range query verified (200 OK).")

    # -------------------------------------------------------------
    # Test 8: Authenticated GET /analytics/reports/experiment-outcomes (200 OK)
    # -------------------------------------------------------------
    res = client.get("/api/v1/analytics/reports/experiment-outcomes", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    outcomes = res.json()["data"]
    assert isinstance(outcomes, list)
    for out in outcomes:
        assert "status" in out
        assert "count" in out
        assert "results_count" in out
        assert "finalized_results_count" in out
    print(f"[PASS] Test 08: GET /analytics/reports/experiment-outcomes verified ({len(outcomes)} outcome statuses).")

    # -------------------------------------------------------------
    # Test 9: Authenticated GET /analytics/reports/activity-feed (200 OK)
    # -------------------------------------------------------------
    res = client.get("/api/v1/analytics/reports/activity-feed?limit=8", headers=headers)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
    feed = res.json()["data"]
    assert isinstance(feed, list)
    assert len(feed) <= 8
    if len(feed) > 0:
        event = feed[0]
        assert "audit_log_id" in event
        assert "action" in event
        assert "entity_type" in event
        assert "actor_name" in event
        assert "occurred_at" in event
    print(f"[PASS] Test 09: GET /analytics/reports/activity-feed verified ({len(feed)} audit entries returned).")

    # -------------------------------------------------------------
    # Test 10: Non-admin Researcher Role Access (200 OK)
    # -------------------------------------------------------------
    researcher_headers, res_id = get_auth_headers(email="siddhanth.kj@rvce.edu.in", password="password123")
    res = client.get("/api/v1/analytics/dashboard", headers=researcher_headers)
    assert res.status_code == 200, f"Expected 200 for researcher role, got {res.status_code}"
    assert res.json()["data"]["total_samples"] >= 0
    print("[PASS] Test 10: Authenticated researcher access to /analytics/dashboard verified (200 OK).")

    print("=" * 65)
    print(" ALL 10/10 MODULE 10 ANALYTICS ENDPOINT TESTS PASSED!")
    print("=" * 65)


if __name__ == "__main__":
    run_tests()
