"""
Rigorous Automated Endpoint & Service Test Suite for Overview Tab Enhancement (Phase 1)
Validates all Phase 1 backend capabilities:
1. Operational KPI Command Centre endpoint (/overview-kpis)
2. Interactive Laboratory Workflow Pulse (/workflow-pulse)
3. Data Quality & Integrity Observatory scan (/integrity-scan) with audit persistence
4. Safe Operational Database Status (/operational-status)
5. Interactive Database Educational Insights (/database-insight/{metric_key}) with valid and invalid inputs
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app
from app.common import SessionLocal, AuditLog

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
    db = SessionLocal()
    print("=" * 70)
    print(" Executing Rigorous Test Suite for Overview Tab Enhancement (Phase 1)")
    print("=" * 70)

    try:
        # ======================================================================
        # Test 1: Unauthenticated requests rejected with 401
        # ======================================================================
        res1 = client.get("/api/v1/analytics/overview-kpis")
        assert res1.status_code == 401, f"Expected 401, got {res1.status_code}"

        res2 = client.get("/api/v1/analytics/workflow-pulse")
        assert res2.status_code == 401, f"Expected 401, got {res2.status_code}"

        res3 = client.post("/api/v1/analytics/integrity-scan")
        assert res3.status_code == 401, f"Expected 401, got {res3.status_code}"

        res4 = client.get("/api/v1/analytics/operational-status")
        assert res4.status_code == 401, f"Expected 401, got {res4.status_code}"

        res5 = client.get("/api/v1/analytics/database-insight/active_samples")
        assert res5.status_code == 401, f"Expected 401, got {res5.status_code}"
        print("[PASS] Test 01: All 5 endpoints strictly reject unauthenticated requests with 401.")

        headers, admin_id = get_auth_headers()

        # ======================================================================
        # Test 2: Overview Operational KPIs (/overview-kpis)
        # ======================================================================
        res = client.get("/api/v1/analytics/overview-kpis", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        kpis = res.json()["data"]

        assert kpis["total_samples"] >= 0
        assert kpis["active_samples"] >= 0
        assert kpis["active_samples"] <= kpis["total_samples"]
        assert 0.0 <= kpis["storage_occupancy_percent"] <= 100.0
        assert 0.0 <= kpis["qc_pass_rate_percent"] <= 100.0
        assert kpis["total_results"] == kpis["locked_results"] + kpis["draft_results"]
        assert kpis["calculation_period"] == "All Recorded Operational Data"
        assert "last_refreshed_at" in kpis
        print(f"[PASS] Test 02: /overview-kpis verified (Samples: {kpis['total_samples']}, Occupancy: {kpis['storage_occupancy_percent']}%, QC Pass: {kpis['qc_pass_rate_percent']}%, Locked Results: {kpis['locked_results']}/{kpis['total_results']}).")

        # ======================================================================
        # Test 3: Workflow Pulse (/workflow-pulse)
        # ======================================================================
        res = client.get("/api/v1/analytics/workflow-pulse", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        pulse = res.json()["data"]

        stages = pulse["stages"]
        assert len(stages) == 4
        stage_keys = [s["stage_key"] for s in stages]
        assert stage_keys == ["specimens", "tests", "experiments", "results"]

        for s in stages:
            assert s["count"] >= 0
            assert len(s["description"]) > 10
            assert s["unit_label"] in ["Specimens", "Assays", "Cohorts", "Results"]
            if s["conversion_rate_percent"] is not None:
                assert s["conversion_rate_percent"] >= 0.0
        print(f"[PASS] Test 03: /workflow-pulse verified with 4 operational stages: {stage_keys}.")

        # ======================================================================
        # Test 4: Data Quality & Integrity Observatory Scan (/integrity-scan)
        # ======================================================================
        prior_scan_count = db.query(AuditLog).filter(AuditLog.action == "DATA_INTEGRITY_SCAN").count()

        res = client.post("/api/v1/analytics/integrity-scan", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        scan = res.json()["data"]

        assert "scan_id" in scan
        assert scan["total_checks_performed"] == 8
        assert scan["overall_integrity_status"] in ["OPTIMAL", "ATTENTION_REQUIRED", "DEVIANT"]
        assert len(scan["category_scores"]) == 4

        expected_cats = [
            "Referential Integrity",
            "Biological Consistency",
            "Safety & Compliance",
            "Data Completeness"
        ]
        actual_cats = [c["category"] for c in scan["category_scores"]]
        assert set(actual_cats) == set(expected_cats)

        for finding in scan["findings"]:
            assert finding["rule_id"].startswith("CHK_")
            assert finding["severity"] in ["ERROR", "WARNING", "INFO"]
            assert len(finding["root_cause_explanation"]) > 15
            assert len(finding["suggested_remedy"]) > 15
            assert finding["action_route"] in ["samples", "incidents", "equipment", "experiments", "tests", "results", "ancient", "storage"]

        # Verify audit persistence
        new_scan_count = db.query(AuditLog).filter(AuditLog.action == "DATA_INTEGRITY_SCAN").count()
        assert new_scan_count == prior_scan_count + 1
        print(f"[PASS] Test 04: /integrity-scan executed 8 checks (Status: {scan['overall_integrity_status']}, Audit logged, Findings: {len(scan['findings'])}).")

        # ======================================================================
        # Test 5: Operational Database Telemetry (/operational-status)
        # ======================================================================
        res = client.get("/api/v1/analytics/operational-status", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        op = res.json()["data"]

        assert op["api_status"] == "OPERATIONAL"
        assert "SQLite" in op["database_engine"] or "PostgreSQL" in op["database_engine"]
        assert op["database_mode"] in ["SQLite", "PostgreSQL"]
        assert op["total_relations"] >= 15
        assert op["relations_verified"] is True
        assert op["ping_latency_ms"] > 0
        assert op["uptime_seconds"] >= 0
        print(f"[PASS] Test 05: /operational-status verified (Engine: {op['database_engine']}, Relations: {op['total_relations']}, Latency: {op['ping_latency_ms']}ms).")

        # ======================================================================
        # Test 6: DBMS Insight Educational Queries with Different Inputs
        # ======================================================================
        test_metric_keys = [
            "active_samples",
            "storage_occupancy",
            "assay_qc_rate",
            "workflow_conversion",
            "quarantine_compliance",
            "peer_locking_integrity"
        ]

        for m_key in test_metric_keys:
            res = client.get(f"/api/v1/analytics/database-insight/{m_key}", headers=headers)
            assert res.status_code == 200, f"Expected 200 for key '{m_key}', got {res.status_code}: {res.text}"
            insight = res.json()["data"]
            assert insight["metric_key"] == m_key
            assert "SELECT" in insight["sql_query"]
            assert len(insight["relational_concept"]) > 10
            assert len(insight["query_plan_summary"]) > 10
            assert "example_output" in insight
            assert isinstance(insight["example_output"], dict)

        print(f"[PASS] Test 06: /database-insight/{{metric_key}} verified for all {len(test_metric_keys)} DBMS educational keys.")

        # ======================================================================
        # Test 7: Invalid Metric Key returns 404 (Boundary / Error condition)
        # ======================================================================
        res_invalid = client.get("/api/v1/analytics/database-insight/unknown_key_xyz123", headers=headers)
        assert res_invalid.status_code == 404, f"Expected 404 for invalid key, got {res_invalid.status_code}"
        print("[PASS] Test 07: /database-insight with invalid key correctly returned 404 EntityNotFoundException.")

        # ======================================================================
        # Test 8: Non-Admin Researcher Role Access Check
        # ======================================================================
        res_headers, _ = get_auth_headers(email="siddhanth.kj@rvce.edu.in", password="password123")
        res_kpis = client.get("/api/v1/analytics/overview-kpis", headers=res_headers)
        assert res_kpis.status_code == 200, f"Expected 200 for researcher role, got {res_kpis.status_code}"

        res_pulse = client.get("/api/v1/analytics/workflow-pulse", headers=res_headers)
        assert res_pulse.status_code == 200, f"Expected 200 for researcher role, got {res_pulse.status_code}"

        res_scan = client.post("/api/v1/analytics/integrity-scan", headers=res_headers)
        assert res_scan.status_code == 200, f"Expected 200 for researcher scan, got {res_scan.status_code}"
        print("[PASS] Test 08: Researcher role successfully accessed Overview endpoints and triggered integrity scan.")

        print("=" * 70)
        print(" ALL 8 RIGOROUS TESTS FOR OVERVIEW ENHANCEMENT PHASE 1 PASSED!")
        print("=" * 70)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
