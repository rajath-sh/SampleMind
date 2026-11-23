from datetime import datetime, timezone
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query as Param
from pydantic import BaseModel, Field, StringConstraints
from sqlalchemy import func, text
from sqlalchemy.orm import Session
from tinydb import Query
from tinydb.table import Document

from app.common import (
    AppUser, AuditLog, EntityNotFoundException, Sample, SampleMindException,
    StorageLocation, get_current_user, get_db, require_roles,
)
from .cohort import review_cohort
from .documents import document_store
from .queries import QUERIES, run_sql


router = APIRouter(prefix="/api/v1/lab", tags=["DBMS Lab"], dependencies=[Depends(get_current_user)])
TRACE_TYPES = ("Sample", "SampleRelationship", "SampleTest", "Incident", "AIAnalysis")
SAFE_FIELDS = {
    "sample_id", "sample_code", "parent_sample_id", "parent_sample_code",
    "child_sample_id", "child_sample_code", "transformation_type",
    "test_type", "test_status", "status", "severity", "priority", "review_feedback",
    "storage_location_id", "previous_storage_location_id", "new_storage_location_id",
}


def timestamp(value: datetime) -> str:
    return value.replace(tzinfo=value.tzinfo or timezone.utc).astimezone(timezone.utc).isoformat()


@router.get("/cohort")
def cohort_review(
    reference_code: str = Param("S003", min_length=1, max_length=40),
    focus_id: int | None = Param(None, gt=0),
    assume_pass: list[Annotated[str, StringConstraints(min_length=1, max_length=100)]] = Param(default=[], max_length=40),
    db: Session = Depends(get_db),
):
    return review_cohort(db, reference_code, focus_id, assume_pass)


@router.get("/queries")
def query_catalog():
    return [
        {
            "key": key,
            "title": item[0],
            "concept": item[1],
            "flow": item[2],
            "needs_sample": item[3],
            "category": item[5],
            "elmasri_reference": item[6],
            "explanation": item[7],
        }
        for key, item in QUERIES.items()
    ]


@router.get("/sql/{key}")
def sql_query(key: str, sample_code: str = Param("S003", max_length=40), db: Session = Depends(get_db)):
    if key not in QUERIES:
        raise EntityNotFoundException("Query", key)
    return run_sql(db, key, sample_code)


@router.get("/custody")
def custody_documents(
    sample_id: int | None = Param(None, gt=0),
    sample_code: str | None = Param(None, max_length=40),
    entity: Literal["Sample", "SampleRelationship", "SampleTest", "Incident", "AIAnalysis"] | None = None,
    action: str | None = Param(None, max_length=80),
    db: Session = Depends(get_db),
):
    if sample_code and sample_code.strip():
        code = sample_code.strip().upper()
        sample_id = db.query(Sample.sample_id).filter(func.upper(Sample.sample_code) == code).scalar() or 0

    # Replay committed SQL audit rows using their IDs as document keys. Full replay
    # works at class-project scale and does not skip IDs from late SQL commits.
    with document_store() as store:
        events = store.table("custody_events")
        projected_ids = {doc.doc_id for doc in events.all()}
        pending = []
        for row in db.query(AuditLog).filter(AuditLog.entity_type.in_(TRACE_TYPES)).yield_per(250):
            if row.audit_log_id in projected_ids:
                continue
            details = row.details if isinstance(row.details, dict) else {}
            payload = {key: value for key, value in details.items() if key in SAFE_FIELDS}
            references = [payload.get(key) for key in ("sample_id", "parent_sample_id", "child_sample_id")]
            if row.entity_type == "Sample":
                references.append(row.entity_id)
            ids = sorted({value for value in references if isinstance(value, int)})
            pending.append(Document({
                "audit_id": row.audit_log_id,
                "occurred_at": timestamp(row.occurred_at),
                "action": row.action,
                "subject": {"type": row.entity_type, "id": row.entity_id},
                "sample_ids": ids,
                "evidence": payload,
            }, doc_id=row.audit_log_id))
        if pending:
            events.insert_multiple(pending)

        event = Query()
        query = event.audit_id.exists()
        statement = ["Query().audit_id.exists()"]
        if sample_id is not None:
            query &= event.sample_ids.any([sample_id])
            statement.append("Query().sample_ids.any([sample_id])")
        if entity is not None:
            query &= event.subject.type == entity
            statement.append("(Query().subject.type == entity)")
        if action:
            query &= event.action == action
            statement.append("(Query().action == action)")
        matches = sorted(events.search(query), key=lambda doc: (doc["occurred_at"], doc["audit_id"]), reverse=True)
        actions = sorted({doc["action"] for doc in events.all()})
        return {
            "documents": matches[:100], "match_count": len(matches), "projected": len(pending),
            "actions": actions, "statement": "custody_events.search(" + " & ".join(statement) + ")",
            "parameters": {"sample_id": sample_id, "entity": entity, "action": action},
        }


class ReadingInput(BaseModel):
    reading_id: UUID
    location_id: Annotated[int, Field(gt=0)]
    temperature_c: Annotated[float, Field(ge=-273.15, le=150, allow_inf_nan=False)]
    instrument: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=80)]
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


@router.post("/readings")
def record_reading(
    reading: ReadingInput,
    db: Session = Depends(get_db),
    user: AppUser = Depends(require_roles(("ADMIN", "RESEARCHER", "TECHNICIAN"))),
):
    request = reading.model_dump(mode="json")
    with document_store() as store:
        collection = store.table("temperature_readings")
        existing = collection.get(Query().reading_id == request["reading_id"])
        if existing is not None:
            if any(existing[key] != value for key, value in request.items()) or existing["operator_id"] != user.user_id:
                raise SampleMindException(409, "This reading ID belongs to a different submission.", "READING_ID_CONFLICT")
            return existing

        location = db.get(StorageLocation, reading.location_id)
        if not location or not location.is_active:
            raise EntityNotFoundException("Active storage location", reading.location_id)
        minimum = float(location.temperature_min_c) if location.temperature_min_c is not None else None
        maximum = float(location.temperature_max_c) if location.temperature_max_c is not None else None
        if minimum is not None and reading.temperature_c < minimum:
            state = "below"
        elif maximum is not None and reading.temperature_c > maximum:
            state = "above"
        elif minimum is None or maximum is None:
            state = "unconfigured"
        else:
            state = "within"
        specimens = db.query(Sample.sample_id, Sample.sample_code).filter(
            Sample.current_storage_location_id == reading.location_id,
            Sample.sample_status.notin_(("DISPOSED", "MISSING", "DEPLETED")),
        ).order_by(Sample.sample_code).all()
        document = {
            **request,
            "recorded_at": timestamp(datetime.now(timezone.utc)),
            "operator_id": user.user_id,
            "location_code": location.location_code,
            "limits": {"min": minimum, "max": maximum},
            "state": state,
            "specimens": [{"id": sample_id, "code": code} for sample_id, code in specimens],
        }
        collection.insert(document)
        return document


@router.get("/readings")
def read_temperature(
    location_id: int | None = Param(None, gt=0),
    excursions: bool = False,
):
    reading = Query()
    predicate = reading.recorded_at.exists()
    statement = ["Query().recorded_at.exists()"]
    if location_id is not None:
        predicate &= reading.location_id == location_id
        statement.append("(Query().location_id == location_id)")
    if excursions:
        predicate &= reading.state.one_of(["above", "below"])
        statement.append('Query().state.one_of(["above", "below"])')
    with document_store() as store:
        matches = store.table("temperature_readings").search(predicate)
    matches.sort(key=lambda doc: (doc["recorded_at"], doc["reading_id"]), reverse=True)
    return {
        "documents": matches[:100],
        "match_count": len(matches),
        "excursion_count": sum(doc["state"] in ("above", "below") for doc in matches),
        "statement": "temperature_readings.search(" + " & ".join(statement) + ")",
        "parameters": {"location_id": location_id},
    }



@router.get("/status")
def database_status(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1")).scalar_one()
    with document_store() as store:
        store.tables()
    return {"sql": db.get_bind().dialect.name.upper(), "documents": "TinyDB", "status": "Ready"}
