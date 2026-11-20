"""
Rigorous Automated Endpoint Test Suite for Module 9: AI Risk Advisory Subsystem (Step 9C)
Validates all REST APIs under /api/v1/ai using TestClient with realistic inputs and assert outputs.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.common import SessionLocal, Sample, SampleType, StorageLocation

client = TestClient(app)


def get_admin_headers():
    res = client.post("/api/v1/auth/login", json={
        "username": "rajath.vs@rvce.edu.in",
        "password": "password123"
    })
    assert res.status_code == 200, f"Login failed: {res.text}"
    token = res.json()["data"]["access_token"]
    user_id = res.json()["data"]["user_id"]
    return {"Authorization": f"Bearer {token}"}, user_id


def run_tests():
    db = SessionLocal()
    print("=" * 65)
    print(" Executing Rigorous Test Suite for Module 9: AI Risk APIs")
    print("=" * 65)

    try:
        # -------------------------------------------------------------
        # Test 1: Unauthenticated request rejected with 401
        # -------------------------------------------------------------
        res = client.get("/api/v1/ai/models")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("[PASS] Test 01: Unauthenticated request to /ai/models rejected (401).")

        headers, admin_id = get_admin_headers()
        s_type = db.query(SampleType).first()
        loc = db.query(StorageLocation).first()
        assert s_type is not None

        # -------------------------------------------------------------
        # Test 2: Get active handling method metadata (200 OK)
        # -------------------------------------------------------------
        res = client.get("/api/v1/ai/models", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        model_data = res.json()["data"]
        assert model_data["model_name"] == "Specimen Handling Rules"
        assert model_data["is_active"] is True
        assert model_data["metrics"] == {"method": "deterministic_rules"}
        print(f"[PASS] Test 02: Active handling method retrieved: {model_data['model_name']} {model_data['model_version']}.")

        # Helper: Create test sample
        test_sample = Sample(
            sample_code=f"S-RF-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Holocene Peat Bog Core Specimen",
            sample_type_id=s_type.sample_type_id,
            quantity_value=150.0,
            quantity_unit="mg",
            sample_status="IN_STORAGE",
            current_storage_location_id=loc.storage_location_id if loc else None,
            created_by=admin_id,
        )
        db.add(test_sample)
        db.commit()
        db.refresh(test_sample)
        sample_id = test_sample.sample_id

        # -------------------------------------------------------------
        # Test 3: Run handling rules (201 Created)
        # -------------------------------------------------------------
        res = client.post(f"/api/v1/ai/predict/{sample_id}", headers=headers)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        pred_data = res.json()["data"]
        analysis_id = pred_data["ai_analysis_id"]
        assert pred_data["sample_id"] == sample_id
        assert pred_data["predicted_risk"] in ("LOW", "MEDIUM", "HIGH")
        assert pred_data["confidence"] is None and pred_data["class_probabilities"] == {}
        assert len(pred_data["important_factors"]) >= 1
        print(f"[PASS] Test 03: Assessment persisted with priority {pred_data['predicted_risk']}.")

        # -------------------------------------------------------------
        # Test 4: Prediction on non-existent sample returns 404
        # -------------------------------------------------------------
        res = client.post("/api/v1/ai/predict/999999", headers=headers)
        assert res.status_code == 404, f"Expected 404, got {res.status_code}"
        print("[PASS] Test 04: Prediction on non-existent sample correctly returned 404 Not Found.")

        # -------------------------------------------------------------
        # Test 5: Retrieve historical analyses for sample
        # -------------------------------------------------------------
        res = client.get(f"/api/v1/ai/analyses/{sample_id}", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        analyses = res.json()["data"]
        assert len(analyses) >= 1
        assert analyses[0]["ai_analysis_id"] == analysis_id
        print(f"[PASS] Test 05: Retrieved {len(analyses)} risk evaluation(s) for sample {sample_id}.")

        # -------------------------------------------------------------
        # Test 6: Human-in-the-Loop Review Confirmation (agree)
        # -------------------------------------------------------------
        review_payload = {
            "review_feedback": "agree",
            "review_notes": "Independent spectrophotometric absorbance (A260/A280) matches low degradation risk.",
        }
        res = client.post(f"/api/v1/ai/review/{analysis_id}", json=review_payload, headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        reviewed_data = res.json()["data"]
        assert reviewed_data["reviewed_by"] == admin_id
        assert reviewed_data["review_feedback"] == "agree"
        assert "absorbance" in reviewed_data["review_notes"]
        print(f"[PASS] Test 06: Human-in-the-loop review agreement logged for analysis #{analysis_id}.")

        # -------------------------------------------------------------
        # Test 7: Human-in-the-Loop Review Override (disagree)
        # -------------------------------------------------------------
        override_payload = {
            "review_feedback": "disagree",
            "review_notes": "Observed particulate sediment on vial wall suggests borderline contamination.",
        }
        res = client.post(f"/api/v1/ai/review/{analysis_id}", json=override_payload, headers=headers)
        assert res.status_code == 200
        override_data = res.json()["data"]
        assert override_data["review_feedback"] == "disagree"
        assert "sediment" in override_data["review_notes"]
        print("[PASS] Test 07: Human-in-the-loop review override (disagree) successfully updated.")

        # -------------------------------------------------------------
        # Test 8: Review non-existent analysis ID returns 404
        # -------------------------------------------------------------
        res = client.post("/api/v1/ai/review/999999", json=review_payload, headers=headers)
        assert res.status_code == 404
        print("[PASS] Test 08: Review on invalid analysis ID returned 404 Not Found.")

        # -------------------------------------------------------------
        # Test 9: Global risk distribution endpoint
        # -------------------------------------------------------------
        res = client.get("/api/v1/ai/risk-distribution", headers=headers)
        assert res.status_code == 200
        dist = res.json()["data"]
        assert dist["total_samples"] >= 1
        assert dist["assessed_samples"] >= 1
        assert "LOW" in dist["counts"]
        assert "HIGH" in dist["counts"]
        print(f"[PASS] Test 09: Global risk distribution returned {dist['assessed_samples']} assessed specimens.")

        print("=" * 65)
        print(" [ALL 9 MODULE 9 AI RISK API TESTS PASSED 100%!]")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
