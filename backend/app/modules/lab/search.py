from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from app.common import Experiment, Incident, Sample, StorageLocation, get_current_user, get_db


router = APIRouter(prefix="/api/v1", tags=["Workspace search"], dependencies=[Depends(get_current_user)])


@router.get("/search")
def search_workspace(q: Annotated[str, Query(min_length=2, max_length=80)], db: Session = Depends(get_db)):
    search = q.strip().lower()
    if len(search) < 2:
        return []
    literal = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    contains = f"%{literal}%"
    sources = (
        ("samples", Sample.sample_id, Sample.sample_code, Sample.sample_name),
        ("experiments", Experiment.experiment_id, Experiment.experiment_code, Experiment.experiment_name),
        ("incidents", Incident.incident_id, Incident.incident_code, Incident.description),
        ("storage", StorageLocation.storage_location_id, StorageLocation.location_code, StorageLocation.facility),
    )
    matches = []
    for section, identity, code, title in sources:
        exact_code = func.lower(code) == search
        rows = db.query(identity, code, title).filter(or_(
            func.lower(code).like(contains, escape="\\"),
            func.lower(title).like(contains, escape="\\"),
        )).order_by(case((exact_code, 0), else_=1), code, identity).limit(8)
        for record_id, record_code, name in rows:
            matches.append({
                "section": section, "id": record_id, "code": record_code,
                "title": (name or "")[:180], "exact": record_code.lower() == search,
            })
    return sorted(matches, key=lambda match: not match["exact"])

