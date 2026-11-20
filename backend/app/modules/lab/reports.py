"""Downloadable database summaries with a local tamper-evident receipt chain."""
import hashlib
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.common import (
    Sample, SampleType, StorageLocation, SampleRelationship, SampleTest,
    Experiment, ExperimentResult, Equipment, Incident, AncientSpecimen,
    ArchaeologicalSite, AppUser, get_current_user, get_db,
)
from .documents import document_store

router = APIRouter(prefix="/api/v1/summary-reports", tags=["Summary reports"],
                   dependencies=[Depends(get_current_user)])
TABLES = (
    (Sample, "Specimens", "sample_status"),
    (SampleType, "Specimen types", None),
    (StorageLocation, "Storage locations", None),
    (SampleRelationship, "Lineage relationships", None),
    (SampleTest, "Assays", "test_status"),
    (Experiment, "Experiments", "status"),
    (ExperimentResult, "Results", None),
    (Equipment, "Equipment", "equipment_status"),
    (Incident, "Incidents", "status"),
    (AncientSpecimen, "Ancient specimens", None),
    (ArchaeologicalSite, "Archaeological sites", None),
)


def digest(content: str, previous: str) -> str:
    return hashlib.sha256((previous + "\n" + content).encode("utf-8")).hexdigest()


@router.post("")
def generate_report(db: Session = Depends(get_db), user: AppUser = Depends(get_current_user)):
    connection = db.connection()
    if connection.dialect.name == "sqlite" and not connection.connection.driver_connection.in_transaction:
        connection.exec_driver_sql("BEGIN")
    sections = []
    for model, label, status in TABLES:
        count = db.query(func.count()).select_from(model).scalar()
        groups = {}
        if status:
            column = getattr(model, status)
            groups = {str(key): total for key, total in db.query(column, func.count()).group_by(column)}
        sections.append({"table": model.__tablename__, "label": label, "count": count, "groups": groups})
    created = datetime.now(timezone.utc).isoformat()
    lines = ["SampleMind database summary", f"Generated {created}", ""]
    for section in sections:
        lines.append(f"{section['label']} — {section['count']} records")
        lines.extend(f"  {status}: {count}" for status, count in section["groups"].items())
        lines.append("")
    lines.append("Record counts describe this database snapshot. ML training data is synthetic.")
    content = "\n".join(lines)
    with document_store() as store:
        receipts = store.table("report_receipts")
        entries = receipts.all()
        previous = entries[-1]["sha256"] if entries else "0" * 64
        sha = digest(content, previous)
        identifier = receipts.insert({
            "created_at": created, "created_by": user.user_id,
            "sha256": sha, "previous_sha256": previous,
        })
    return {"report_id": identifier, "created_at": created, "text": content,
            "sections": sections, "sha256": sha, "previous_sha256": previous,
            "verification": "Local SHA-256 receipt chain"}


class VerifyReport(BaseModel):
    report_id: int = Field(gt=0)
    text: str = Field(max_length=200000)
    previous_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


@router.post("/verify")
def verify_report(payload: VerifyReport):
    with document_store() as store:
        receipt = store.table("report_receipts").get(doc_id=payload.report_id)
        valid = bool(receipt and receipt["previous_sha256"] == payload.previous_sha256
                     and receipt["sha256"] == digest(payload.text, payload.previous_sha256))
    return {"valid": valid}
