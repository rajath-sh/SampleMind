from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.common import (
    AppUser, AuditLog, Base, Sample, SampleQuantityTransaction, SampleRelationship,
    SampleTest, SampleType, StorageLocation, get_db, get_password_hash, settings,
)
from app.main import app

API = "/api/v1"


@pytest.fixture
def lab(tmp_path, monkeypatch):
    engine = create_engine(f"sqlite:///{tmp_path / 'lab.db'}")
    Session = sessionmaker(bind=engine)
    Base.metadata.create_all(engine)
    password = "Local-test-password"
    with Session.begin() as db:
        db.add_all([
            AppUser(display_name=role, email=f"{role.lower()}@test.invalid", role=role, password_hash=get_password_hash(password))
            for role in ("ADMIN", "VIEWER")
        ])
        sample_type = SampleType(type_code="DNA", type_name="DNA")
        storage = StorageLocation(location_code="FREEZER-A1", facility="Laboratory", unit_type="freezer",
                                  temperature_min_c=-85, temperature_max_c=-75)
        db.add_all([sample_type, storage])
        db.flush()
        parent = Sample(sample_code="PARENT", sample_name="Parent stock", sample_type_id=sample_type.sample_type_id,
                        quantity_value=10, quantity_unit="mg", sample_status="IN_STORAGE",
                        current_storage_location_id=storage.storage_location_id)
        child = Sample(sample_code="REFERENCE", sample_name="Reference", sample_type_id=sample_type.sample_type_id,
                       quantity_value=4, quantity_unit="mg", sample_status="REGISTERED")
        db.add_all([parent, child])
        db.flush()
        db.add_all([
            SampleTest(sample_id=child.sample_id, test_type="Concentration", test_status="completed", result_interpretation="Pass"),
            SampleTest(sample_id=child.sample_id, test_type="Purity", test_status="completed", result_interpretation="Pass"),
            SampleTest(sample_id=parent.sample_id, test_type="Concentration", test_status="completed", result_interpretation="Pass"),
            AuditLog(action="SAMPLE_REGISTERED", entity_type="Sample", entity_id=parent.sample_id, details={"sample_code": "PARENT"}),
        ])

    def test_session():
        with Session() as db:
            yield db

    monkeypatch.setattr(settings, "DOCUMENT_DB_PATH", str(tmp_path / "evidence.json"))
    monkeypatch.setitem(app.dependency_overrides, get_db, test_session)
    with TestClient(app) as client:
        def login(role):
            response = client.post(f"{API}/auth/login", json={"username": f"{role}@test.invalid", "password": password})
            assert response.status_code == 200, response.text
            return {"Authorization": "Bearer " + response.json()["data"]["access_token"]}

        yield client, login("admin"), login("viewer"), Session
    engine.dispose()


def test_bound_sql_division_and_plan(lab):
    client, headers, _, _ = lab
    result = client.get(f"{API}/lab/sql/division", params={"sample_code": "reference"}, headers=headers)
    assert result.status_code == 200
    assert result.json()["rows"] == [{"sample_code": "REFERENCE", "sample_name": "Reference"}]
    assert "NOT EXISTS" in result.json()["statement"] and result.json()["plan"]
    result = client.get(f"{API}/lab/sql/assays", params={"sample_code": "' OR 1=1 --"}, headers=headers)
    assert result.json()["rows"] == []
    assert client.get(f"{API}/lab/queries").status_code == 401


def test_document_replay_filters_and_reading_retry(lab):
    client, admin, viewer, _ = lab
    params = {"sample_id": 1, "entity": "Sample", "action": "SAMPLE_REGISTERED"}
    first = client.get(f"{API}/lab/custody", params=params, headers=admin).json()
    replay = client.get(f"{API}/lab/custody", params=params, headers=admin).json()
    assert first["projected"] == 1
    assert replay["projected"] == 0 and replay["documents"] == first["documents"]
    assert replay["documents"][0]["sample_ids"] == [1]

    reading = {"reading_id": str(uuid4()), "location_id": 1, "temperature_c": -62, "instrument": "Test probe"}
    assert client.post(f"{API}/lab/readings", json=reading, headers=viewer).status_code == 403
    first_reading = client.post(f"{API}/lab/readings", json=reading, headers=admin)
    assert first_reading.status_code == 200, first_reading.text
    assert first_reading.json()["state"] == "above"
    assert first_reading.json()["specimens"] == [{"id": 1, "code": "PARENT"}]
    assert client.post(f"{API}/lab/readings", json=reading, headers=admin).json() == first_reading.json()
    changed = {**reading, "temperature_c": -80}
    assert client.post(f"{API}/lab/readings", json=changed, headers=admin).status_code == 409
    result = client.get(f"{API}/lab/readings", params={"location_id": 1, "excursions": True}, headers=viewer).json()
    assert result["match_count"] == 1 and result["excursion_count"] == 1


def test_concurrent_derivations_cannot_overspend_parent(lab):
    client, headers, _, Session = lab
    start = Barrier(2)

    def derive(suffix):
        start.wait(timeout=5)
        return client.post(f"{API}/samples/1/derive", headers=headers, json={
            "child_sample_code": f"CHILD-{suffix}", "child_sample_name": f"Aliquot {suffix}",
            "child_sample_type_id": 1, "quantity_transferred": 7,
            "quantity_unit": "mg", "transformation_type": "Aliquot",
        })

    with ThreadPoolExecutor(max_workers=2) as pool:
        responses = list(pool.map(derive, [1, 2]))
    assert sorted(response.status_code for response in responses) == [201, 409], [r.text for r in responses]
    with Session() as db:
        assert float(db.get(Sample, 1).quantity_value) == 3.0
        assert db.query(SampleRelationship).count() == 1
        debit = db.query(SampleQuantityTransaction).filter_by(sample_id=1).one()
        assert float(debit.quantity_delta) == -7.0
        assert db.query(AuditLog).filter_by(action="SAMPLE_DERIVED").count() == 1


def test_handling_assessment_and_audited_review(lab):
    client, headers, viewer, Session = lab
    assert client.post(f"{API}/ai/predict/1", headers=viewer).status_code == 403
    with Session.begin() as db:
        specimen = db.get(Sample, 1)
        specimen.sample_status = "QUARANTINED"
        db.add(SampleTest(sample_id=1, test_type="Confirmatory test", test_status="completed",
                          result_interpretation="Fail", performed_at=datetime.now(timezone.utc)))
    assessment = client.post(f"{API}/ai/predict/1", headers=headers)
    assert assessment.status_code == 201, assessment.text
    data = assessment.json()["data"]
    assert data["predicted_risk"] == "HIGH"
    assert data["confidence"] is None and data["class_probabilities"] == {}
    assert "fail" in data["input_snapshot"]["recorded_assay_outcomes"]
    review_url = f"{API}/ai/review/{data['ai_analysis_id']}"
    assert client.post(review_url, headers=headers, json={"review_feedback": "agree", "review_notes": "   "}).status_code == 422
    result = client.post(review_url, headers=headers, json={"review_feedback": "agree", "review_notes": "Confirmed quarantine."})
    assert result.status_code == 200
    with Session() as db:
        assert db.query(AuditLog).filter_by(action="AI_REVIEW").one().details["review_notes"] == "Confirmed quarantine."




def test_cohort_explains_latest_result_and_previews_without_writes(lab):
    client, _, viewer, Session = lab
    with Session.begin() as db:
        db.add(SampleTest(
            sample_id=1, test_type="Concentration", test_status="completed",
            result_interpretation="Fail", performed_at=datetime(2030, 1, 1, tzinfo=timezone.utc),
        ))
    url = f"{API}/lab/cohort"
    params = {"reference_code": "reference", "focus_id": 1}
    actual = client.get(url, params=params, headers=viewer)
    assert actual.status_code == 200, actual.text
    actual = actual.json()
    by_assay = {check["test_type"]: check for check in actual["focused"]["checks"]}
    assert by_assay["Concentration"]["verdict"] == "fail"
    assert by_assay["Concentration"]["sample_test_id"] is not None
    assert by_assay["Purity"]["verdict"] == "missing"
    assert by_assay["Purity"]["sample_test_id"] is None
    assert actual["eligible_count"] == 0

    one = client.get(url, params={**params, "assume_pass": "Purity"}, headers=viewer).json()
    assert one["focused"]["preview_passed"] == 1
    assert not one["focused"]["preview_eligible"]
    both = client.get(url, params={**params, "assume_pass": ["Concentration", "Purity"]}, headers=viewer).json()
    assert both["results"] == actual["results"]
    assert both["focused"]["checks"] == actual["focused"]["checks"]
    assert both["focused"]["preview_eligible"]
    unavailable = client.get(url, params={**params, "focus_id": 2, "assume_pass": "Purity"}, headers=viewer).json()
    assert not unavailable["focused"]["preview_eligible"]
    assert client.get(url, params={**params, "assume_pass": "Wrong type"}, headers=viewer).status_code == 400
    assert client.get(url, params=params).status_code == 401
    with Session() as db:
        assert db.query(SampleTest).count() == 4
        assert db.query(AuditLog).count() == 1


def test_cohort_keeps_pending_evidence_and_handles_empty_reference(lab):
    client, admin, _, Session = lab
    with Session.begin() as db:
        db.add(SampleTest(sample_id=1, test_type="Purity", test_status="requested"))
        db.add(Sample(sample_code="EMPTY", sample_name="No assays", sample_type_id=1,
                      quantity_value=1, quantity_unit="mg", sample_status="REGISTERED"))

    url = f"{API}/lab/cohort"
    result = client.get(url, params={"reference_code": "REFERENCE", "focus_id": 1}, headers=admin).json()
    assert result["focused"]["checks"][1]["verdict"] == "pending"
    result = client.get(url, params={"reference_code": "EMPTY"}, headers=admin).json()
    assert result["required_assays"] == result["results"] == []
    assert client.get(url, params={"reference_code": "UNREGISTERED"}, headers=admin).status_code == 404


def test_sql_console_commits_rolls_back_and_enforces_roles(lab):
    client, admin, viewer, Session = lab
    endpoint = f"{API}/sql-console"
    assert client.post(endpoint, headers=viewer, json={"sql": "SELECT 1;"}).status_code == 403
    assert client.post(endpoint, headers=admin, json={"sql": 'PRAGMA table_info("Sample");'}).status_code == 200
    assert client.post(endpoint, headers=admin, json={"sql": "PRAGMA foreign_keys=OFF;"}).status_code == 400
    response = client.post(endpoint, headers=admin, json={
        "sql": """UPDATE "Sample" SET notes = 'console verification' WHERE sample_id=1; SELECT notes FROM "Sample" WHERE sample_id=1;"""
    })
    assert response.status_code == 200, response.text
    assert response.json()["committed"]
    with Session() as db:
        assert db.get(Sample, 1).notes == "console verification"
    response = client.post(endpoint, headers=admin, json={
        "sql": """UPDATE "Sample" SET notes='cancelled' WHERE sample_id=1; ROLLBACK;"""
    })
    assert response.status_code == 200 and not response.json()["committed"]
    response = client.post(endpoint, headers=admin, json={
        "sql": """UPDATE "Sample" SET notes='cancelled' WHERE sample_id=1; SELECT * FROM NoSuchTable;"""
    })
    assert response.status_code == 400
    with Session() as db:
        assert db.get(Sample, 1).notes == "console verification"
    assert client.post(endpoint, headers=admin, json={"sql": "ATTACH DATABASE ':memory:' AS extra;"}).status_code == 400


def test_report_download_payload_and_verification(lab):
    client, admin, _, _ = lab
    result = client.post(f"{API}/summary-reports", headers=admin)
    assert result.status_code == 200, result.text
    report = result.json()
    sections = {section["table"]: section for section in report["sections"]}
    assert sections["Sample"]["count"] == 2
    assert len(sections) == 11
    assert client.post(f"{API}/summary-reports/verify", headers=admin, json=report).json()["valid"]
    report["text"] += " changed"
    assert not client.post(f"{API}/summary-reports/verify", headers=admin, json=report).json()["valid"]

def test_incident_assignment_acceptance_and_private_messages(lab):
    from app.common import Incident
    client, admin, viewer, Session = lab
    with Session.begin() as db:
        worker = AppUser(display_name="Worker", email="worker@test.invalid", role="TECHNICIAN",
                         password_hash=get_password_hash("Local-test-password"))
        db.add(worker)
        db.flush()
        worker_id = worker.user_id
        db.add(Incident(incident_code="DESK-1", sample_id=1, incident_type="handling_issue",
                        severity="low", description="Check specimen label", reported_by=1,
                        occurred_at=datetime.now(timezone.utc)))
    login = client.post(f"{API}/auth/login", json={"username": "worker@test.invalid", "password": "Local-test-password"})
    staff = {"Authorization": "Bearer " + login.json()["data"]["access_token"]}
    base = f"{API}/incident-desk/1"
    assert client.get(base + "/messages", headers=staff).status_code == 403
    assert client.post(base + "/assign", headers=viewer, json={"worker_id": worker_id}).status_code == 403
    assert client.post(base + "/assign", headers=admin, json={"worker_id": worker_id}).status_code == 200
    assert client.post(base + "/respond", headers=staff, json={"accept": True}).status_code == 200
    assert client.post(base + "/respond", headers=staff, json={"accept": True}).status_code == 409
    assert client.post(base + "/messages", headers=staff, json={"text": "I am checking the label."}).status_code == 200
    assert client.get(base + "/messages", headers=admin).json()[0]["text"] == "I am checking the label."
    assert client.get(base + "/messages", headers=viewer).status_code == 403
    with Session() as db:
        assert db.get(Incident, 1).status == "investigating"
        assert db.query(AuditLog).filter_by(action="INCIDENT_ACCEPTED").count() == 1
