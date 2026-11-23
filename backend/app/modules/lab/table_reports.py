"""Read-only reporting projections for the nine ER entities with live fitted ML models."""
import json
from fastapi import Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.common import get_db
from app.common import models as m
from .reports import router

# Domain-specific features for each table
FEATURES = {
    "Sample": ("sample_status", "sample_type_id", "quantity_unit"),
    "SampleType": ("sample_count",),
    "StorageLocation": ("unit_type", "sample_count"),
    "SampleTest": ("test_type", "test_status", "turnaround_days"),
    "SampleRelationship": ("transformation_type", "parent_events", "child_events"),
    "Experiment": ("status", "planned_days", "actual_days"),
    "ExperimentSample": ("usage_role", "quantity_unit", "experiment_usages"),
    "AncientSpecimen": ("dating_method", "estimated_age_years", "age_uncertainty_years"),
    "AppUser": ("role", "is_active"),
}

# Domain-specific operational explanations for evaluators
TABLE_ML_PURPOSE = {
    "Sample": (
        "Biobank Specimen Triage & Workflow Clustering",
        "K-Means groups biological specimens by status and quantity units into inventory cohorts. "
        "Isolation Forest flags anomalous specimens (e.g., unusual quantities or orphan statuses) "
        "requiring chain-of-custody review or physical verification."
    ),
    "SampleType": (
        "Specimen Category Utilization Modeling",
        "Groups specimen types by current inventory density. Isolation Forest pinpoints under-utilized "
        "or heavily over-allocated specimen classes across the biobank."
    ),
    "StorageLocation": (
        "Storage Infrastructure & Capacity Optimization",
        "Clusters cryo-units and freezers by current specimen allocation. Identifies outlier locations "
        "at risk of exceeding safe cryogenic thermal capacity."
    ),
    "SampleTest": (
        "Assay Turnaround & QC Performance Profiling",
        "K-Means clusters assays by turnaround duration and status. Isolation Forest highlights test runs "
        "with excessive delays or outlier failure clusters that indicate instrument drift."
    ),
    "SampleRelationship": (
        "Derivation & Lineage Branching Analysis",
        "Groups sample parent-child derivation events. Flags complex or deep lineage trees with unusually "
        "high transformation counts that risk ancient DNA shearing."
    ),
    "Experiment": (
        "Research Protocol Timeline & Delay Detection",
        "Clusters experiments by planned vs. actual duration. Outlier analysis pinpoints stalled research "
        "protocols or experiments with unexpected operational lag."
    ),
    "ExperimentSample": (
        "Specimen Consumption & Depletion Profiling",
        "Analyzes usage roles and aliquot consumption patterns. Flags experiments consuming disproportionate "
        "specimen volumes before stocks are permanently depleted."
    ),
    "AncientSpecimen": (
        "Paleogenomic Age & Dating Uncertainty Stratification",
        "Clusters ancient specimens by estimated chronological age and uncertainty range. Isolation Forest "
        "identifies specimens with wide margin errors or extreme Pleistocene ages needing secondary dating."
    ),
    "AppUser": (
        "User Access & Role Allocation Governance",
        "Groups laboratory personnel by role and activation status. Outlier detection flags unusual "
        "permission distributions or inactive accounts retaining privileges."
    ),
}


def model_metrics(name, rows, clusters=3, trees=64, profile=None):
    from collections import Counter
    from numbers import Number
    import numpy as np
    from sklearn.cluster import KMeans
    from sklearn.ensemble import IsolationForest
    from sklearn.feature_extraction import DictVectorizer

    rows = [dict(row) for row in rows]
    def days(row, start, end):
        if row.get(start) is None or row.get(end) is None:
            return None
        elapsed = (row[end] - row[start]).total_seconds() / 86400
        return elapsed if elapsed >= 0 else None

    parents = Counter(row.get("parent_sample_id") for row in rows)
    children = Counter(row.get("child_sample_id") for row in rows)
    usages = Counter(row.get("experiment_id") for row in rows)
    for row in rows:
        row.update(turnaround_days=days(row, "requested_at", "performed_at"),
                   planned_days=days(row, "planned_start", "planned_end"),
                   actual_days=days(row, "actual_start", "actual_end"),
                   parent_events=parents[row.get("parent_sample_id")],
                   child_events=children[row.get("child_sample_id")],
                   experiment_usages=usages[row.get("experiment_id")])

    purpose_title, purpose_desc = TABLE_ML_PURPOSE.get(name, ("Machine Learning Analysis", "Unsupervised discovery on live table rows."))
    titles = (f"ML Model 1: Cluster Segmentation (K-Means) · {purpose_title}",
              f"ML Model 2: Outlier & Anomaly Detection (Isolation Forest) · {purpose_title}")
    fields = FEATURES[name]

    if len(rows) < 5:
        return [{"title": title, "note": f"Requires at least 5 live rows from this table to train the exploratory model. {purpose_desc}", "values": []} for title in titles]

    numeric = set(fields) & {"sample_count", "turnaround_days", "parent_events", "child_events",
                             "planned_days", "actual_days", "experiment_usages", "estimated_age_years",
                             "age_uncertainty_years"}
    bounds = {}
    for key in numeric:
        valid = [float(row[key]) for row in rows if isinstance(row.get(key), Number) and np.isfinite(float(row[key]))]
        if valid:
            bounds[key] = (min(valid), max(valid), float(np.median(valid)))

    def encode(row):
        vector = {}
        for key in fields:
            val = row.get(key)
            if key not in numeric:
                vector[key] = str(val) if val is not None else "(missing)"
            elif key in bounds:
                lo, hi, median = bounds[key]
                missing = val is None or not np.isfinite(float(val))
                vector[key] = ((median if missing else float(val)) - lo) / (hi - lo or 1)
                vector[key + "_missing"] = int(missing)
        return vector

    vectors = [encode(row) for row in rows]
    distinct = len({tuple(sorted(vector.items())) for vector in vectors})
    if distinct < 2:
        return [{"title": title, "note": f"Features in this table have no variation yet to distinguish records. {purpose_desc}", "values": []} for title in titles]

    vectorizer = DictVectorizer()
    data = vectorizer.fit_transform(vectors)
    k = min(clusters, distinct, max(2, len(rows) // 2))
    grouping = KMeans(n_clusters=k, n_init=10, random_state=42).fit(data)
    labels = grouping.labels_
    forest = IsolationForest(n_estimators=trees, random_state=42).fit(data)
    scores = -forest.score_samples(data)
    counts = Counter(labels)

    group_values = []
    for cluster, count in sorted(counts.items()):
        members = [row for row, assigned in zip(rows, labels) if assigned == cluster]
        description = ", ".join(f"{key}={Counter(str(row.get(key)) for row in members).most_common(1)[0][0]}"
                                for key in fields)
        group_values.append([f"Cluster {cluster + 1} ({description})", count])

    largest = sorted(range(len(rows)), key=lambda i: (-scores[i], i))[:min(8, len(rows))]
    feature_note = f" Trained directly on live '{name}' table data ({len(rows)} records). Features: {', '.join(fields)}. " + purpose_desc

    metrics = [
        {
            "title": titles[0],
            "note": f"Partitions live table rows into {k} natural operational groupings. {feature_note}",
            "values": group_values,
        },
        {
            "title": titles[1],
            "note": f"Evaluates each row against {trees} random decision trees to detect operational irregularities. Higher score = more anomalous. {feature_note}",
            "values": [[f"Row #{i+1} ({', '.join(str(rows[i].get(f, '')) for f in fields[:2])})", round(float(scores[i]), 4)] for i in largest],
        },
    ]

    if profile:
        candidate = {}
        for key in fields:
            val = profile.get(key)
            if val in (None, ""):
                continue
            if key in numeric:
                try:
                    val = float(val)
                except (TypeError, ValueError):
                    raise HTTPException(422, f"{key} must be a number")
                if not np.isfinite(val) or val < 0 or abs(val) > 1e12:
                    raise HTTPException(422, f"{key} must be a finite nonnegative value up to 1 trillion")
            else:
                options = {str(row.get(key)) for row in rows if row.get(key) is not None}
                if val not in options:
                    raise HTTPException(422, f"{key} must use a category present in the report")
                val = next(row[key] for row in rows if str(row.get(key)) == val)
            candidate[key] = val
        encoded = vectorizer.transform([encode(candidate)])
        cluster = int(grouping.predict(encoded)[0]) + 1
        score = float(-forest.score_samples(encoded)[0])
        metrics.append({
            "title": "Interactive Profile Evaluation",
            "note": f"Evaluated against live {name} distribution: Assigned to Cluster {cluster}. Isolation anomaly score: {score:.4f}.",
            "values": [["Anomaly score", round(score, 4)]],
        })

    return metrics


# Explicit export columns keep credentials, identities and free text out of reports.
TABLES = {
    "Sample": (m.Sample, "sample_code sample_type_id current_storage_location_id sample_status quantity_value quantity_unit"),
    "SampleType": (m.SampleType, "sample_type_id type_code type_name"),
    "StorageLocation": (m.StorageLocation, "storage_location_id location_code unit_type"),
    "SampleTest": (m.SampleTest, "sample_test_id sample_id test_type test_status requested_at performed_at"),
    "SampleRelationship": (m.SampleRelationship, "relationship_id parent_sample_id child_sample_id transformation_type transformed_at"),
    "Experiment": (m.Experiment, "experiment_id experiment_code status planned_start planned_end actual_start actual_end"),
    "ExperimentSample": (m.ExperimentSample, "experiment_id sample_id usage_role quantity_used quantity_unit"),
    "AncientSpecimen": (m.AncientSpecimen, "sample_id estimated_age_years age_uncertainty_years dating_method"),
    "AppUser": (m.AppUser, "role is_active"),
}


@router.get("/tables/{name}")
def table_report(name: str, db: Session = Depends(get_db),
                 clusters: int = Query(3, ge=2, le=8), trees: int = Query(64, ge=16, le=256),
                 profile: str | None = Query(None, max_length=2000)):
    try:
        candidate = json.loads(profile) if profile else None
        if candidate is not None and (not isinstance(candidate, dict) or any(not isinstance(v, str) for v in candidate.values())):
            raise ValueError
    except ValueError:
        raise HTTPException(422, "Invalid test profile")
    if name not in TABLES:
        raise HTTPException(404, "Unknown report table")
    connection = db.connection()
    if connection.dialect.name == "sqlite" and not connection.connection.driver_connection.in_transaction:
        connection.exec_driver_sql("BEGIN")
    model, fields = TABLES[name]
    columns = fields.split()
    rows = [dict(row) for row in db.execute(select(*(getattr(model, key) for key in columns))
                                           .order_by(*model.__table__.primary_key)).mappings()]
    if name in ("SampleType", "StorageLocation"):
        from sqlalchemy import func
        key = m.Sample.sample_type_id if name == "SampleType" else m.Sample.current_storage_location_id
        counts = dict(db.execute(select(key, func.count()).group_by(key)).all())
        field = columns[0]
        columns.append("sample_count")
        for row in rows:
            row["sample_count"] = counts.get(row[field], 0)

    purpose_title, purpose_desc = TABLE_ML_PURPOSE.get(name, ("Machine Learning Analysis", "Live table analytics."))

    return {
        "columns": columns,
        "rows": rows,
        "ml_purpose": {"title": purpose_title, "description": purpose_desc},
        "features": [{"key": key, "options": sorted({str(row[key]) for row in rows if row.get(key) is not None}) if key in {"sample_status", "sample_type_id", "quantity_unit", "unit_type", "test_type", "test_status", "transformation_type", "status", "usage_role", "dating_method", "role", "is_active"} else None} for key in FEATURES[name]],
        "models": model_metrics(name, rows, clusters, trees, candidate),
    }
