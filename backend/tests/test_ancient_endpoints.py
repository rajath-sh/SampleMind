"""
Rigorous Automated Endpoint Test Suite for Module 7: Ancient Specimens & Archaeological Provenance (Step 7C)
Validates all REST APIs under /api/v1/ancient using TestClient with realistic inputs and assert outputs.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from fastapi.testclient import TestClient
from app.main import app
from app.common import SessionLocal, AppUser, SampleType, Sample, create_access_token

client = TestClient(app)


def run_tests():
    db = SessionLocal()
    print("=" * 65)
    print(" Executing Rigorous Test Suite for Module 7: Ancient APIs")
    print("=" * 65)

    try:
        # -------------------------------------------------------------
        # Test 1: Unauthenticated request rejected with 401
        # -------------------------------------------------------------
        res = client.get("/api/v1/ancient/specimens")
        assert res.status_code == 401, f"Expected 401 Unauthorized, got {res.status_code}"
        print("[PASS] Test 01: Unauthenticated request to /ancient/specimens rejected (401).")

        # -------------------------------------------------------------
        # Authenticate Admin via Login Endpoint
        # -------------------------------------------------------------
        login_res = client.post("/api/v1/auth/login", json={
            "username": "rajath.vs@rvce.edu.in",
            "password": "password123"
        })
        assert login_res.status_code == 200, f"Login failed: {login_res.text}"
        login_data = login_res.json()["data"]
        token = login_data["access_token"]
        user_id = login_data["user_id"]
        headers = {"Authorization": f"Bearer {token}"}

        # -------------------------------------------------------------
        # Test 2: Create new excavation site (201 Created)
        # -------------------------------------------------------------
        site_code = f"SITE-{uuid.uuid4().hex[:6].upper()}"
        site_payload = {
            "site_code": site_code,
            "site_name": "Bhimbetka Rock Shelters Sector 3",
            "region": "Madhya Pradesh",
            "country": "India",
            "context_notes": "Acheulian to Mesolithic continuous stratigraphy with rock art evidence.",
        }
        res = client.post("/api/v1/ancient/sites", json=site_payload, headers=headers)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        site_data = res.json()["data"]
        site_id = site_data["archaeological_site_id"]
        assert site_data["site_code"] == site_code
        assert site_data["specimen_count"] == 0
        print(f"[PASS] Test 02: Created excavation site {site_code} (ID: {site_id}).")

        # -------------------------------------------------------------
        # Test 3: Duplicate site code returns 409 Conflict
        # -------------------------------------------------------------
        res = client.post("/api/v1/ancient/sites", json=site_payload, headers=headers)
        assert res.status_code == 409, f"Expected 409 Conflict, got {res.status_code}"
        print(f"[PASS] Test 03: Duplicate site code rejected with 409 Conflict.")

        # -------------------------------------------------------------
        # Test 4: Retrieve excavation site detail
        # -------------------------------------------------------------
        res = client.get(f"/api/v1/ancient/sites/{site_id}", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        retrieved = res.json()["data"]
        assert retrieved["site_name"] == "Bhimbetka Rock Shelters Sector 3"
        print(f"[PASS] Test 04: Retrieved site detail: {retrieved['site_name']} ({retrieved['country']}).")

        # -------------------------------------------------------------
        # Test 5: Update excavation site details
        # -------------------------------------------------------------
        update_payload = {
            "region": "Raisen District, MP",
            "context_notes": "Refined chronostratigraphic zone under shelter III F-24",
        }
        res = client.put(f"/api/v1/ancient/sites/{site_id}", json=update_payload, headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        updated_site = res.json()["data"]
        assert updated_site["region"] == "Raisen District, MP"
        print(f"[PASS] Test 05: Updated site region to '{updated_site['region']}'.")

        # -------------------------------------------------------------
        # Helper: Create base sample in DB
        # -------------------------------------------------------------
        s_type = db.query(SampleType).first()
        base_sample = Sample(
            sample_code=f"S-ANC-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Canis Lupus Molar Fragment",
            sample_type_id=s_type.sample_type_id,
            quantity_value=50.0,
            quantity_unit="mg",
            sample_status="REGISTERED",
            source_description="Trench III F-24, Stratum Vb",
            created_by=user_id,
        )
        db.add(base_sample)
        db.commit()
        db.refresh(base_sample)
        sample_id = base_sample.sample_id

        # -------------------------------------------------------------
        # Test 6: Attach ancient provenance profile (201 Created)
        # -------------------------------------------------------------
        spec_payload = {
            "sample_id": sample_id,
            "archaeological_site_id": site_id,
            "estimated_age_years": 38500,
            "age_uncertainty_years": 850,
            "dating_method": "14C Accelerator Mass Spectrometry",
            "excavation_layer": "Stratum Vb (Upper Paleolithic)",
            "depth_cm": 285.5,
            "preservation_state": "calcified",
            "context_reference": "Quadrant D2, Feature 11",
        }
        res = client.post("/api/v1/ancient/specimens", json=spec_payload, headers=headers)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        spec_data = res.json()["data"]
        assert spec_data["sample_id"] == sample_id
        assert spec_data["estimated_age_years"] == 38500
        assert spec_data["site_code"] == site_code
        print(f"[PASS] Test 06: Attached ancient provenance to specimen {spec_data['sample_code']} (38,500 BP).")

        # -------------------------------------------------------------
        # Test 7: Duplicate provenance on same sample rejected (409)
        # -------------------------------------------------------------
        res = client.post("/api/v1/ancient/specimens", json=spec_payload, headers=headers)
        assert res.status_code == 409, f"Expected 409 Conflict, got {res.status_code}"
        print("[PASS] Test 07: Duplicate ancient provenance rejected with 409 Conflict.")

        # -------------------------------------------------------------
        # Test 8: Non-existent sample ID returns 404 Not Found
        # -------------------------------------------------------------
        bad_spec_payload = dict(spec_payload, sample_id=999999)
        res = client.post("/api/v1/ancient/specimens", json=bad_spec_payload, headers=headers)
        assert res.status_code == 404, f"Expected 404 Not Found, got {res.status_code}"
        print("[PASS] Test 08: Non-existent sample correctly returned 404 Not Found.")

        # -------------------------------------------------------------
        # Test 9: Retrieve full ancient specimen dossier
        # -------------------------------------------------------------
        res = client.get(f"/api/v1/ancient/specimens/{sample_id}", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        dossier = res.json()["data"]
        assert dossier["sample_code"] == base_sample.sample_code
        assert dossier["dating_method"] == "14C Accelerator Mass Spectrometry"
        assert dossier["depth_cm"] == 285.5
        assert dossier["site_name"] == "Bhimbetka Rock Shelters Sector 3"
        print(f"[PASS] Test 09: Retrieved ancient dossier: {dossier['sample_code']} from {dossier['site_name']}.")

        # -------------------------------------------------------------
        # Test 10: Update ancient specimen chronometrics and depth
        # -------------------------------------------------------------
        update_spec_payload = {
            "estimated_age_years": 39200,
            "depth_cm": 292.0,
            "preservation_state": "desiccated bone matrix",
        }
        res = client.put(f"/api/v1/ancient/specimens/{sample_id}", json=update_spec_payload, headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        updated_dossier = res.json()["data"]
        assert updated_dossier["estimated_age_years"] == 39200
        assert updated_dossier["depth_cm"] == 292.0
        assert updated_dossier["preservation_state"] == "desiccated bone matrix"
        print(f"[PASS] Test 10: Updated chronometrics to 39,200 BP and depth to 292.0 cm.")

        # -------------------------------------------------------------
        # Test 11: Filtered query for ancient specimens
        # -------------------------------------------------------------
        res = client.get(
            f"/api/v1/ancient/specimens?site_id={site_id}&min_age=30000&dating_method=14C",
            headers=headers
        )
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        matched = res.json()["data"]
        assert len(matched) >= 1
        assert any(item["sample_id"] == sample_id for item in matched)
        print(f"[PASS] Test 11: Filtered query returned {len(matched)} specimen(s) matching age & site.")

        # -------------------------------------------------------------
        # Test 12: Verify site's dynamic specimen count incremented
        # -------------------------------------------------------------
        res = client.get(f"/api/v1/ancient/sites/{site_id}", headers=headers)
        assert res.status_code == 200
        site_refreshed = res.json()["data"]
        assert site_refreshed["specimen_count"] >= 1
        print(f"[PASS] Test 12: Site specimen_count dynamically reflects {site_refreshed['specimen_count']} attached specimen(s).")

        print("=" * 65)
        print(" [ALL 12 MODULE 7 ANCIENT API TESTS PASSED 100%!]")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
