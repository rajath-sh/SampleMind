"""Why and why-not evidence for the lab's cohort rule."""
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

from app.common import EntityNotFoundException, ValidationException


# One statement supplies decisions and source evidence from the same SQL snapshot.
COHORT_SQL = text('''
WITH reference AS (
    SELECT sample_id, sample_code
    FROM "Sample"
    WHERE UPPER(sample_code) = UPPER(:reference_code)
    ORDER BY CASE WHEN sample_code = :reference_code THEN 0 ELSE 1 END, sample_id
    LIMIT 1
), required AS (
    SELECT DISTINCT t.test_type
    FROM "SampleTest" t JOIN reference r ON r.sample_id = t.sample_id
), ranked AS (
    SELECT t.sample_test_id, t.sample_id, t.test_type, t.test_status,
           t.result_interpretation,
           COALESCE(t.performed_at, t.requested_at, t.created_at) AS evidence_date,
           ROW_NUMBER() OVER (
               PARTITION BY t.sample_id, t.test_type
               ORDER BY CASE t.test_status
                   WHEN 'completed' THEN 0
                   WHEN 'in_progress' THEN 1
                   WHEN 'requested' THEN 1
                   ELSE 2 END,
                   COALESCE(t.performed_at, t.requested_at, t.created_at) DESC,
                   t.sample_test_id DESC
           ) AS evidence_rank
    FROM "SampleTest" t JOIN required r ON r.test_type = t.test_type
), evidence AS (
    SELECT s.sample_id, r.test_type, t.sample_test_id, t.test_status,
           t.result_interpretation, t.evidence_date,
           CASE
               WHEN t.sample_test_id IS NULL THEN 'missing'
               WHEN t.test_status IN ('in_progress', 'requested') THEN 'pending'
               WHEN t.test_status <> 'completed' THEN 'unconfirmed'
               WHEN LOWER(TRIM(t.result_interpretation)) = 'pass' THEN 'pass'
               WHEN LOWER(TRIM(t.result_interpretation)) = 'fail' THEN 'fail'
               ELSE 'unconfirmed'
           END AS verdict
    FROM "Sample" s CROSS JOIN required r
    LEFT JOIN ranked t ON t.sample_id = s.sample_id
                       AND t.test_type = r.test_type AND t.evidence_rank = 1
), coverage AS (
    SELECT sample_id, COUNT(*) AS required_count,
           SUM(CASE WHEN verdict = 'pass' THEN 1 ELSE 0 END) AS pass_count,
           SUM(CASE WHEN verdict = 'pass' OR test_type IN :assume_pass THEN 1 ELSE 0 END)
               AS preview_count
    FROM evidence
    GROUP BY sample_id
), inventory AS (
    SELECT s.sample_id, s.sample_code, s.sample_name, s.sample_status,
           s.quantity_value, s.quantity_unit, l.location_code,
           CASE WHEN l.is_active = TRUE THEN 1 ELSE 0 END AS active_storage,
           CASE WHEN s.sample_status = 'IN_STORAGE' AND s.quantity_value > 0
                     AND l.is_active = TRUE THEN 1 ELSE 0 END AS available
    FROM "Sample" s
    LEFT JOIN "StorageLocation" l ON l.storage_location_id = s.current_storage_location_id
)
SELECT r.sample_id AS reference_id, r.sample_code AS reference_code,
       s.sample_id, s.sample_code, s.sample_name, s.sample_status,
       s.quantity_value, s.quantity_unit, s.location_code, s.active_storage, s.available,
       COALESCE(c.required_count, 0) AS required_count,
       COALESCE(c.pass_count, 0) AS pass_count,
       COALESCE(c.preview_count, 0) AS preview_count,
       CASE WHEN s.available = 1 AND c.pass_count = c.required_count THEN 1 ELSE 0 END AS eligible,
       CASE WHEN s.available = 1 AND c.preview_count = c.required_count THEN 1 ELSE 0 END AS preview_eligible,
       e.test_type, e.sample_test_id, e.test_status,
       e.result_interpretation, e.evidence_date, e.verdict
FROM reference r CROSS JOIN inventory s
LEFT JOIN coverage c ON c.sample_id = s.sample_id
LEFT JOIN evidence e ON e.sample_id = s.sample_id
                    AND s.sample_id = COALESCE(:focus_id, r.sample_id)
ORDER BY s.sample_code, s.sample_id, e.test_type
''').bindparams(bindparam('assume_pass', expanding=True))


def review_cohort(
    db: Session, reference_code: str, focus_id: int | None, assume_pass: list[str]
) -> dict:
    rows = db.execute(COHORT_SQL, {
        "reference_code": reference_code.strip(), "focus_id": focus_id,
        "assume_pass": sorted(set(assume_pass)),
    }).mappings().all()
    if not rows:
        raise EntityNotFoundException("Reference specimen", reference_code)

    reference = rows[0]["reference_code"]
    focus_id = focus_id if focus_id is not None else rows[0]["reference_id"]
    results = {}
    checks = []
    focused = None
    for row in rows:
        sample_id = row["sample_id"]
        results[sample_id] = {
            "id": sample_id, "code": row["sample_code"], "name": row["sample_name"],
            "available": bool(row["available"]), "passed": row["pass_count"], "required": row["required_count"],
            "eligible": bool(row["eligible"]),
        }
        if sample_id == focus_id:
            focused = {
                "id": sample_id, "status": row["sample_status"],
                "quantity": row["quantity_value"], "unit": row["quantity_unit"],
                "location": row["location_code"], "active_storage": bool(row["active_storage"]),
                "preview_passed": row["preview_count"],
                "preview_eligible": bool(row["preview_eligible"]),
            }
            if row["test_type"] is not None:
                checks.append({key: row[key] for key in (
                    "test_type", "sample_test_id", "test_status", "result_interpretation",
                    "evidence_date", "verdict",
                )})

    if focused is None:
        raise EntityNotFoundException("Specimen", focus_id)
    if set(assume_pass).difference(check["test_type"] for check in checks):
        raise ValidationException("Each hypothetical assay must be required by the selected reference.", "UNKNOWN_REQUIRED_ASSAY")

    decisions = sorted(results.values(), key=lambda row: (
        not row["eligible"], not row["available"], row["required"] - row["passed"], row["code"]
    ))
    return {
        "reference": reference, "required_assays": [check["test_type"] for check in checks],
        "results": decisions if checks else [],
        "focused": {**focused, "checks": checks}, "assume_pass": assume_pass,
        "eligible_count": sum(row["eligible"] for row in decisions),
    }

