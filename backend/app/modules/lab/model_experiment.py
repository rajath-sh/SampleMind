"""Read-only research exercise using a locally trained synthetic-data model."""
import hashlib
import io
import json
from datetime import datetime, timezone
from functools import lru_cache

import joblib
import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.common import (
    EntityNotFoundException, Incident, RestrictedMaterial, Sample, SampleMindException,
    SampleStorageHistory, SampleTest, get_current_user, get_db,
)
from app.common.config import BASE_DIR

router = APIRouter(prefix="/api/v1/lab/model", tags=["Synthetic model experiment"],
                   dependencies=[Depends(get_current_user)])
ARTIFACTS = BASE_DIR / "ml" / "artifacts"
DATASET = ARTIFACTS / "synthetic_sample_risk_dataset.csv"


def manifest() -> dict:
    try:
        data = json.loads((ARTIFACTS / "model_manifest.json").read_text(encoding="utf-8"))
        if data["dataset_kind"] != "synthetic" or not (ARTIFACTS / "rf_sample_risk_model.joblib").is_file():
            raise ValueError("Missing local training provenance")
        return data
    except (OSError, ValueError, KeyError) as error:
        raise SampleMindException(503, "Run ml/train_model.py to prepare the synthetic model experiment.", "MODEL_UNAVAILABLE") from error


@lru_cache(maxsize=1)
def load_local_model(digest: str):
    try:
        model_bytes = (ARTIFACTS / "rf_sample_risk_model.joblib").read_bytes()
        if hashlib.sha256(model_bytes).hexdigest() != digest:
            raise ValueError("Local artifact and manifest do not match")
        return joblib.load(io.BytesIO(model_bytes))
    except (OSError, ValueError, ImportError) as error:
        raise SampleMindException(503, "The local model needs to be regenerated.", "MODEL_UNAVAILABLE") from error


@router.get("")
def model_info():
    data = manifest()
    return {
        "version": data["model_version"],
        "dataset_kind": data["dataset_kind"],
        "training_samples": data["training_samples"],
        "test_samples": data["test_samples"],
        "metrics": data["metrics"],
        "class_metrics": {label: data["metrics"]["classification_report"][label]
                          for label in data["target_classes"]},
        "target_classes": data["target_classes"],
        "seed": data["seed"],
    }


@router.get("/dataset")
def training_dataset():
    from fastapi.responses import FileResponse
    return FileResponse(DATASET, media_type="text/csv", filename=DATASET.name)


@router.get("/{sample_id}")
def experimental_inference(sample_id: int, db: Session = Depends(get_db)):
    sample = db.get(Sample, sample_id)
    if sample is None:
        raise EntityNotFoundException("Sample", sample_id)
    model = load_local_model(manifest()["artifact_sha256"])
    tests = db.query(SampleTest.result_interpretation).filter_by(sample_id=sample_id, test_status="completed").all()
    incidents = db.query(Incident.severity).filter_by(sample_id=sample_id).all()
    restrictions = db.query(RestrictedMaterial.risk_level).filter_by(sample_id=sample_id, status="active").all()
    restriction = max((risk for (risk,) in restrictions), key=lambda risk: {"high": 3, "medium": 2, "low": 1}.get(risk, 0), default="none")
    stored_since = db.query(SampleStorageHistory.moved_at).filter_by(
        sample_id=sample_id, storage_location_id=sample.current_storage_location_id,
    ).order_by(SampleStorageHistory.moved_at.desc()).first() if sample.current_storage_location_id else None
    storage_days = None
    if stored_since:
        started = stored_since[0]
        storage_days = max(0, (datetime.now(timezone.utc) - started.replace(tzinfo=started.tzinfo or timezone.utc)).total_seconds() / 86400)

    location = sample.storage_location
    ancient = sample.ancient_specimen
    state = ancient.preservation_state if ancient else None
    if state:
        state = state.strip().replace(" ", "_").title()

    features = {
        "sample_type_code": sample.sample_type.type_code,
        "estimated_age_years": ancient.estimated_age_years if ancient else 0,
        "preservation_state": state or "Unknown",
        "storage_temp_min_c": float(location.temperature_min_c) if location and location.temperature_min_c is not None else None,
        "storage_duration_days": storage_days,
        "total_tests_conducted": len(tests),
        "failed_tests_count": sum((outcome or "").strip().lower() == "fail" for (outcome,) in tests),
        "total_incidents_logged": len(incidents),
        "critical_incidents_logged": sum(severity == "critical" for (severity,) in incidents),
        "restricted_risk_level": restriction,
    }
    values = {key: np.nan if value is None else value for key, value in features.items()}
    data = pd.DataFrame([values])
    scores = model.predict_proba(data)[0]
    return {
        "sample_code": sample.sample_code,
        "classification": str(model.classes_[int(np.argmax(scores))]),
        "scores": {str(label): float(value) for label, value in zip(model.classes_, scores)},
        "features": features,
        "imputed_features": [key for key, value in features.items() if value is None],
    }

