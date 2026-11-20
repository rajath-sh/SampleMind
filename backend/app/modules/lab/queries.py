"""A fixed query catalog. User input is passed as bound values."""
from sqlalchemy import text
from sqlalchemy.orm import Session


QUERIES = {
    "inventory": (
        "Inventory by specimen type", "JOIN · GROUP BY · COUNT", "SampleType → Sample → Inventory totals", False,
        '''SELECT t.type_code, t.type_name, COUNT(s.sample_id) AS sample_count
FROM "SampleType" AS t
LEFT JOIN "Sample" AS s ON s.sample_type_id = t.sample_type_id
GROUP BY t.sample_type_id, t.type_code, t.type_name
ORDER BY sample_count DESC, t.type_code''',
    ),
    "storage": (
        "Storage occupancy", "LEFT JOIN · zero-count groups", "StorageLocation → Sample → Slot counts", False,
        '''SELECT l.location_code, l.unit_type, COUNT(s.sample_id) AS stored_samples
FROM "StorageLocation" AS l
LEFT JOIN "Sample" AS s ON s.current_storage_location_id = l.storage_location_id
    AND s.sample_status NOT IN ('DISPOSED', 'MISSING', 'DEPLETED')
WHERE l.is_active = TRUE
GROUP BY l.storage_location_id, l.location_code, l.unit_type
ORDER BY stored_samples DESC, l.location_code''',
    ),
    "assays": (
        "Specimen assays", "Selection · projection · bound parameters", "Sample code → SampleTest → Selected columns", True,
        '''SELECT s.sample_code, t.test_type, t.test_status, t.result_value, t.result_unit, t.result_interpretation
FROM "SampleTest" AS t
JOIN "Sample" AS s ON s.sample_id = t.sample_id
WHERE UPPER(s.sample_code) = :sample_code
ORDER BY t.requested_at DESC, t.sample_test_id DESC''',
    ),
    "ancestry": (
        "Trace every ancestor", "Recursive CTE · UNION", "Specimen → Parent edges → Unique ancestors", True,
        '''WITH RECURSIVE ancestors(sample_id) AS (
    SELECT r.parent_sample_id
    FROM "SampleRelationship" AS r
    JOIN "Sample" AS focus ON focus.sample_id = r.child_sample_id
    WHERE UPPER(focus.sample_code) = :sample_code
    UNION
    SELECT r.parent_sample_id
    FROM "SampleRelationship" AS r
    JOIN ancestors AS a ON r.child_sample_id = a.sample_id
)
SELECT s.sample_code, s.sample_name, s.sample_status
FROM ancestors AS a JOIN "Sample" AS s ON s.sample_id = a.sample_id
ORDER BY s.sample_code''',
    ),
    "division": (
        "Specimens passing every required assay", "Relational division · double NOT EXISTS",
        "Required assay types ÷ passing assays by specimen → Complete coverage", True,
        '''WITH required AS (
    SELECT DISTINCT t.test_type
    FROM "SampleTest" AS t
    JOIN "Sample" AS s ON s.sample_id = t.sample_id
    WHERE UPPER(s.sample_code) = :sample_code
)
SELECT s.sample_code, s.sample_name
FROM "Sample" AS s
WHERE EXISTS (SELECT 1 FROM required)
AND NOT EXISTS (
    SELECT 1 FROM required AS r
    WHERE NOT EXISTS (
        SELECT 1 FROM "SampleTest" AS t
        WHERE t.sample_id = s.sample_id AND t.test_type = r.test_type
          AND t.test_status = 'completed'
          AND LOWER(TRIM(t.result_interpretation)) = 'pass'
    )
)
ORDER BY s.sample_code''',
    ),
    "exceptions": (
        "Open storage incidents", "Selection · join · ORDER BY", "Incident → Specimen / location → Open queue", False,
        '''SELECT i.incident_code, i.severity, i.status, s.sample_code, l.location_code
FROM "Incident" AS i
LEFT JOIN "Sample" AS s ON s.sample_id = i.sample_id
LEFT JOIN "StorageLocation" AS l ON l.storage_location_id = i.storage_location_id
WHERE i.status IN ('open', 'investigating') AND i.storage_location_id IS NOT NULL
ORDER BY i.occurred_at DESC, i.incident_id DESC''',
    ),
}


def run_sql(db: Session, key: str, sample_code: str) -> dict:
    _, _, _, _, sql = QUERIES[key]
    params = {"sample_code": sample_code.strip().upper(), "row_limit": 101}
    statement = sql + "\nLIMIT :row_limit"
    result = db.execute(text(statement), params)
    columns = list(result.keys())
    rows = [dict(row) for row in result.mappings()]
    sqlite = db.get_bind().dialect.name == "sqlite"
    explain = "EXPLAIN QUERY PLAN" if sqlite else "EXPLAIN"
    plan = [str(row[-1]) for row in db.execute(text(f"{explain} {statement}"), params)]
    return {
        "statement": statement,
        "parameters": params,
        "columns": columns,
        "rows": rows[:100],
        "truncated": len(rows) > 100,
        "plan": plan,
    }

