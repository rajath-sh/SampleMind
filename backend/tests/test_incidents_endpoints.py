"""
Rigorous Automated Endpoint Test Suite for Module 8: Laboratory Incidents & Blast Radius Tracing (Step 8C)
Validates all REST APIs under /api/v1/incidents using TestClient with realistic inputs and assert outputs.
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from datetime import datetime, timezone
from fastapi.testclient import TestClient
from app.main import app
from app.common import (
    SessionLocal,
    Sample,
    SampleType,
    SampleRelationship,
    Experiment,
    ExperimentSample,
    ExperimentResult,
)

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
    print(" Executing Rigorous Test Suite for Module 8: Incidents APIs")
    print("=" * 65)

    try:
        # -------------------------------------------------------------
        # Test 1: Unauthenticated request rejected with 401
        # -------------------------------------------------------------
        res = client.get("/api/v1/incidents")
        assert res.status_code == 401, f"Expected 401, got {res.status_code}"
        print("[PASS] Test 01: Unauthenticated request to /incidents rejected (401).")

        headers, admin_id = get_admin_headers()
        s_type = db.query(SampleType).first()
        assert s_type is not None

        # Helper: Create base sample
        base_sample = Sample(
            sample_code=f"S-EP-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Paleolithic Equus Dental Enamel",
            sample_type_id=s_type.sample_type_id,
            quantity_value=120.0,
            quantity_unit="mg",
            sample_status="IN_STORAGE",
            created_by=admin_id,
        )
        db.add(base_sample)
        db.commit()
        db.refresh(base_sample)

        # -------------------------------------------------------------
        # Test 2: Create new incident (201 Created)
        # -------------------------------------------------------------
        inc_code = f"INC-{uuid.uuid4().hex[:6].upper()}"
        payload = {
            "incident_code": inc_code,
            "sample_id": base_sample.sample_id,
            "incident_type": "temperature_excursion",
            "severity": "medium",
            "description": "Cryogenic storage alarm sounded: chamber warmed from -80C to -62C over 45 minutes.",
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "assigned_to": admin_id,
        }
        res = client.post("/api/v1/incidents", json=payload, headers=headers)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.text}"
        inc_data = res.json()["data"]
        incident_id = inc_data["incident_id"]
        assert inc_data["incident_code"] == inc_code
        assert inc_data["status"] == "open"
        assert inc_data["severity"] == "medium"
        print(f"[PASS] Test 02: Created incident {inc_code} (ID: {incident_id}).")

        # -------------------------------------------------------------
        # Test 3: Duplicate incident code rejected (409 Conflict)
        # -------------------------------------------------------------
        res = client.post("/api/v1/incidents", json=payload, headers=headers)
        assert res.status_code == 409, f"Expected 409 Conflict, got {res.status_code}"
        print("[PASS] Test 03: Duplicate incident code rejected with 409 Conflict.")

        # -------------------------------------------------------------
        # Test 4: Non-existent sample ID rejected (404 Not Found)
        # -------------------------------------------------------------
        bad_payload = dict(payload, incident_code=f"INC-{uuid.uuid4().hex[:6].upper()}", sample_id=999999)
        res = client.post("/api/v1/incidents", json=bad_payload, headers=headers)
        assert res.status_code == 404, f"Expected 404 Not Found, got {res.status_code}"
        print("[PASS] Test 04: Non-existent sample correctly returned 404 Not Found.")

        # -------------------------------------------------------------
        # Test 5: Critical incident triggers automated sample quarantine
        # -------------------------------------------------------------
        target_sample = Sample(
            sample_code=f"S-EP-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Extracted Genomic DNA Vials",
            sample_type_id=s_type.sample_type_id,
            quantity_value=50.0,
            quantity_unit="µL",
            sample_status="IN_STORAGE",
            created_by=admin_id,
        )
        db.add(target_sample)
        db.commit()
        db.refresh(target_sample)

        crit_code = f"INC-{uuid.uuid4().hex[:6].upper()}"
        crit_payload = {
            "incident_code": crit_code,
            "sample_id": target_sample.sample_id,
            "incident_type": "contamination",
            "severity": "critical",
            "description": "Sterility breached: positive bacterial colony growth in negative control blank.",
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "assigned_to": admin_id,
        }
        res = client.post("/api/v1/incidents", json=crit_payload, headers=headers)
        assert res.status_code == 201, f"Expected 201, got {res.status_code}"
        # Verify sample status updated to QUARANTINED in database
        db.refresh(target_sample)
        assert target_sample.sample_status == "QUARANTINED", f"Expected QUARANTINED, got {target_sample.sample_status}"
        print(f"[PASS] Test 05: Critical incident automatically updated specimen {target_sample.sample_code} to QUARANTINED.")

        # -------------------------------------------------------------
        # Test 6: Retrieve detailed incident dossier
        # -------------------------------------------------------------
        res = client.get(f"/api/v1/incidents/{incident_id}", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        dossier = res.json()["data"]
        assert dossier["incident_code"] == inc_code
        assert dossier["sample_code"] == base_sample.sample_code
        assert dossier["reported_by_name"] is not None
        print(f"[PASS] Test 06: Retrieved incident dossier: {dossier['incident_code']} ({dossier['incident_type']}).")

        # -------------------------------------------------------------
        # Test 7: Update incident investigation & CAPA notes
        # -------------------------------------------------------------
        update_payload = {
            "status": "investigating",
            "resolution_notes": "Liquid nitrogen backup system engaged. Temperature stabilized to -80C.",
        }
        res = client.put(f"/api/v1/incidents/{incident_id}", json=update_payload, headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        updated_data = res.json()["data"]
        assert updated_data["status"] == "investigating"
        assert "Liquid nitrogen" in updated_data["resolution_notes"]
        print("[PASS] Test 07: Updated incident status to 'investigating' with notes.")

        # -------------------------------------------------------------
        # Test 8: Paginated and filtered incident query
        # -------------------------------------------------------------
        res = client.get("/api/v1/incidents?severity=critical&page=1&page_size=10", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}"
        page_data = res.json()
        assert page_data["total"] >= 1
        assert any(i["incident_code"] == crit_code for i in page_data["items"])
        print(f"[PASS] Test 08: Filtered query returned {page_data['total']} critical incident(s).")

        # -------------------------------------------------------------
        # Test 9: Signature Blast Radius Tracing Query
        # Build 2-hop DAG: Ancestor -> Aliquot Child -> Purified Grandchild
        # Child is used in an Experiment which has an Experimental Result
        # -------------------------------------------------------------
        ancestor = Sample(
            sample_code=f"S-DAG-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Ancestral Mammuthus Femur",
            sample_type_id=s_type.sample_type_id,
            quantity_value=300.0,
            quantity_unit="mg",
            sample_status="IN_STORAGE",
            created_by=admin_id,
        )
        child = Sample(
            sample_code=f"S-DAG-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Aliquot Sample Fragment",
            sample_type_id=s_type.sample_type_id,
            quantity_value=50.0,
            quantity_unit="mg",
            sample_status="IN_USE",
            created_by=admin_id,
        )
        grandchild = Sample(
            sample_code=f"S-DAG-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Purified Lysate Extract",
            sample_type_id=s_type.sample_type_id,
            quantity_value=20.0,
            quantity_unit="µL",
            sample_status="IN_STORAGE",
            created_by=admin_id,
        )
        db.add_all([ancestor, child, grandchild])
        db.commit()
        db.refresh(ancestor)
        db.refresh(child)
        db.refresh(grandchild)

        # Lineage
        rel1 = SampleRelationship(parent_sample_id=ancestor.sample_id, child_sample_id=child.sample_id, transformation_type="Aliquoting")
        rel2 = SampleRelationship(parent_sample_id=child.sample_id, child_sample_id=grandchild.sample_id, transformation_type="Extraction")
        db.add_all([rel1, rel2])

        # Experiment using Child
        exp = Experiment(
            experiment_code=f"EXP-DAG-{uuid.uuid4().hex[:6].upper()}",
            experiment_name="Paleogenomic Sequencing Pipeline",
            created_by=admin_id,
            status="active",
        )
        db.add(exp)
        db.flush()

        exp_sample = ExperimentSample(experiment_id=exp.experiment_id, sample_id=child.sample_id, usage_role="input")
        db.add(exp_sample)

        # Result under Experiment
        res_exp = ExperimentResult(
            experiment_id=exp.experiment_id,
            result_code=f"RES-DAG-{uuid.uuid4().hex[:6].upper()}",
            result_title="Mitochondrial Genome Coverage",
            result_value=45.6,
            result_unit="x",
            interpretation="PASS",
        )
        db.add(res_exp)
        db.commit()

        # Record Incident on Ancestor
        dag_inc_code = f"INC-DAG-{uuid.uuid4().hex[:6].upper()}"
        res = client.post("/api/v1/incidents", json={
            "incident_code": dag_inc_code,
            "sample_id": ancestor.sample_id,
            "incident_type": "contamination",
            "severity": "critical",
            "description": "Cross-contamination confirmed during initial bone marrow coring.",
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "assigned_to": admin_id,
            "quarantine_descendants": True,
        }, headers=headers)
        assert res.status_code == 201
        dag_inc_id = res.json()["data"]["incident_id"]

        # Call Blast Radius Endpoint!
        res = client.get(f"/api/v1/incidents/{dag_inc_id}/downstream-impact", headers=headers)
        assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.text}"
        blast = res.json()["data"]

        assert blast["root_sample_id"] == ancestor.sample_id
        assert blast["root_sample_code"] == ancestor.sample_code
        assert blast["total_samples_at_risk"] == 2, f"Expected 2 samples at risk, got {blast['total_samples_at_risk']}"
        assert blast["max_generation_depth"] == 2, f"Expected max depth 2, got {blast['max_generation_depth']}"
        assert blast["total_experiments_compromised"] >= 1, "Expected affected experiments"
        assert blast["total_results_tainted"] >= 1, "Expected tainted results"

        # Verify downstream sample items
        downstream_codes = [s["sample_code"] for s in blast["downstream_samples"]]
        assert child.sample_code in downstream_codes
        assert grandchild.sample_code in downstream_codes

        print(f"[PASS] Test 09: Blast radius query verified: {blast['total_samples_at_risk']} specimens at risk, {blast['total_experiments_compromised']} experiments compromised, {blast['total_results_tainted']} results tainted.")

        # -------------------------------------------------------------
        # Test 10: Blast radius on incident with no sample returns clean zeros
        # -------------------------------------------------------------
        no_sample_inc_code = f"INC-NOSAMPLE-{uuid.uuid4().hex[:6].upper()}"
        res = client.post("/api/v1/incidents", json={
            "incident_code": no_sample_inc_code,
            "incident_type": "equipment_failure",
            "severity": "low",
            "description": "Centrifuge rotor balance sensor calibration warning.",
            "occurred_at": datetime.now(timezone.utc).isoformat(),
            "assigned_to": admin_id,
        }, headers=headers)
        assert res.status_code == 201
        no_sample_id = res.json()["data"]["incident_id"]

        res = client.get(f"/api/v1/incidents/{no_sample_id}/downstream-impact", headers=headers)
        assert res.status_code == 200
        blast_empty = res.json()["data"]
        assert blast_empty["total_samples_at_risk"] == 0
        assert blast_empty["total_experiments_compromised"] == 0
        assert blast_empty["total_results_tainted"] == 0
        print("[PASS] Test 10: Blast radius for facility/equipment incident returned clean zero metrics.")

        print("=" * 65)
        print(" [ALL 10 MODULE 8 INCIDENTS API TESTS PASSED 100%!]")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
