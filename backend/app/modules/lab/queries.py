"""Academic query catalog conforming to Elmasri & Navathe (Fundamentals of Database Systems)."""
from sqlalchemy import text
from sqlalchemy.orm import Session

# Structure: (title, concept, flow, needs_sample, sql, category, elmasri_ref, explanation)
QUERIES = {
    # -------------------------------------------------------------
    # CATEGORY 1: COMPLEX MULTI-TABLE JOINS & SET DIFFERENCE
    # -------------------------------------------------------------
    "inventory": (
        "Inventory Volume by Specimen Type",
        "LEFT JOIN · GROUP BY · Aggregate COUNT",
        "SampleType → Sample → Inventory Totals",
        False,
        '''SELECT t.type_code, t.type_name, COUNT(s.sample_id) AS sample_count
FROM "SampleType" AS t
LEFT JOIN "Sample" AS s ON s.sample_type_id = t.sample_type_id
GROUP BY t.sample_type_id, t.type_code, t.type_name
ORDER BY sample_count DESC, t.type_code''',
        "Multi-Table Joins & Sets",
        "Elmasri §5.1.5: Outer Joins & Grouping",
        "Performs a Left Outer Join between Specimen Type and Specimen. Preserves types with zero current stock so laboratory inventory planners can spot depleted categories."
    ),
    "storage_orphan": (
        "Unassigned Storage Slots (Anti-Join)",
        "LEFT JOIN with NULL Check · Anti-Join",
        "StorageLocation → Sample (IS NULL) → Idle Capacity",
        False,
        '''SELECT l.location_code, l.unit_type, l.temperature_min_c, l.temperature_max_c
FROM "StorageLocation" AS l
LEFT JOIN "Sample" AS s ON s.current_storage_location_id = l.storage_location_id
WHERE s.sample_id IS NULL AND l.is_active = TRUE
ORDER BY l.location_code''',
        "Multi-Table Joins & Sets",
        "Elmasri §5.1.5: Anti-Join Pattern",
        "Lists active locations with no assigned sample rows. This does not measure physical capacity."
    ),
    "three_way_join": (
        "Four-Table Custody and Assay Join",
        "Multi-Table INNER JOIN",
        "Sample → SampleType → StorageLocation → SampleTest",
        False,
        '''SELECT s.sample_code, s.sample_name, t.type_name, l.location_code, l.unit_type,
       q.test_type, q.test_status, q.result_interpretation
FROM "Sample" AS s
JOIN "SampleType" AS t ON s.sample_type_id = t.sample_type_id
JOIN "StorageLocation" AS l ON s.current_storage_location_id = l.storage_location_id
JOIN "SampleTest" AS q ON q.sample_id = s.sample_id
WHERE q.test_status = 'completed'
ORDER BY s.sample_code, q.sample_test_id DESC''',
        "Multi-Table Joins & Sets",
        "Elmasri §4.3: Multiple Table Relational Joins",
        "Integrates four distinct normalized relations (Sample, Type, Location, Assay) in a single projection, giving evaluators full traceability."
    ),

    # -------------------------------------------------------------
    # CATEGORY 2: AGGREGATE FUNCTIONS WITH GROUP BY & HAVING
    # -------------------------------------------------------------
    "storage": (
        "Active Storage Occupancy Counts",
        "Multi-Column GROUP BY · Conditional Exclusion",
        "StorageLocation → Sample → Slot Counts",
        False,
        '''SELECT l.location_code, l.unit_type, COUNT(s.sample_id) AS stored_samples
FROM "StorageLocation" AS l
LEFT JOIN "Sample" AS s ON s.current_storage_location_id = l.storage_location_id
    AND s.sample_status NOT IN ('DISPOSED', 'MISSING', 'DEPLETED')
WHERE l.is_active = TRUE
GROUP BY l.storage_location_id, l.location_code, l.unit_type
ORDER BY stored_samples DESC, l.location_code''',
        "Aggregation & GROUP BY",
        "Elmasri §5.1.6 & §5.1.7: Multi-column Grouping",
        "Aggregates stored active specimens across cryogenic units, filtering out depleted or missing inventory rows."
    ),
    "group_by_having": (
        "Type and Unit Groups with at Least Three Specimens",
        "GROUP BY with HAVING Filter · AVG, MIN, MAX",
        "SampleType → Sample → Grouped Metrics",
        False,
        '''SELECT t.type_code, t.type_name, s.quantity_unit, COUNT(s.sample_id) AS specimen_count,
       ROUND(AVG(s.quantity_value), 2) AS avg_quantity,
       MIN(s.quantity_value) AS min_quantity,
       MAX(s.quantity_value) AS max_quantity
FROM "SampleType" AS t
JOIN "Sample" AS s ON s.sample_type_id = t.sample_type_id
GROUP BY t.sample_type_id, t.type_code, t.type_name, s.quantity_unit
HAVING COUNT(s.sample_id) >= 3
ORDER BY specimen_count DESC''',
        "Aggregation & GROUP BY",
        "Elmasri §5.1.7: The HAVING Clause",
        "Demonstrates filtering aggregated partitions with HAVING COUNT >= 3 alongside statistical aggregations (AVG, MIN, MAX)."
    ),
    "conditional_aggregation": (
        "Assay QC Pass/Fail Summary (Pivot Matrix)",
        "Conditional Aggregation · SUM(CASE WHEN)",
        "SampleTest → Categorical Outcomes → KPI Matrix",
        False,
        '''SELECT test_type,
       COUNT(*) AS total_assays,
       SUM(CASE WHEN LOWER(TRIM(result_interpretation)) = 'pass' THEN 1 ELSE 0 END) AS passed_count,
       SUM(CASE WHEN LOWER(TRIM(result_interpretation)) = 'fail' THEN 1 ELSE 0 END) AS failed_count,
       ROUND(100.0 * SUM(CASE WHEN LOWER(TRIM(result_interpretation)) = 'pass' THEN 1 ELSE 0 END) / COUNT(*), 1) AS pass_percentage
FROM "SampleTest"
WHERE test_status = 'completed'
GROUP BY test_type
ORDER BY total_assays DESC''',
        "Aggregation & GROUP BY",
        "Elmasri §5.1.6: Categorical Aggregate Expressions",
        "Uses SQL CASE conditional expressions within SUM() to compute quality control pass rates and failure rates grouped by assay protocol."
    ),

    # -------------------------------------------------------------
    # CATEGORY 3: NESTED & CORRELATED SUBQUERIES
    # -------------------------------------------------------------
    "correlated_greater_than_avg": (
        "Specimens Above Type Average (Correlated Subquery)",
        "Correlated Subquery · Outer-Inner Value Comparison",
        "Sample s1 ↔ Sample s2 (Same Type) → Outlier Volume",
        False,
        '''SELECT s1.sample_code, s1.sample_name, s1.sample_type_id, s1.quantity_value, s1.quantity_unit
FROM "Sample" AS s1
WHERE s1.quantity_value > (
    SELECT AVG(s2.quantity_value)
    FROM "Sample" AS s2
    WHERE s2.sample_type_id = s1.sample_type_id
      AND s2.quantity_unit = s1.quantity_unit
      AND s2.quantity_value IS NOT NULL
)
ORDER BY s1.sample_type_id, s1.quantity_value DESC''',
        "Nested & Correlated Subqueries",
        "Elmasri §5.1.3: Correlated Subqueries",
        "The classic Elmasri correlated subquery (equivalent to 'employees earning more than department average'). Retrieves specimens with quantity greater than the average of their own specimen type and recorded unit."
    ),
    "nested_in_not_in": (
        "Unassayed Specimen Inventory (Nested NOT IN)",
        "Nested Subquery · Set Membership (NOT IN)",
        "Sample NOT IN (SampleTest IDs) → Pending Pipeline",
        False,
        '''SELECT s.sample_id, s.sample_code, s.sample_name, s.sample_status, s.registered_at
FROM "Sample" AS s
WHERE s.sample_id NOT IN (
    SELECT DISTINCT t.sample_id
    FROM "SampleTest" AS t
    WHERE t.sample_id IS NOT NULL
)
ORDER BY s.sample_id ASC''',
        "Nested & Correlated Subqueries",
        "Elmasri §5.1.2: Nested Queries with NOT IN",
        "Uses a nested subquery to find biological specimens that have never undergone any assay in the SampleTest table."
    ),
    "correlated_exists": (
        "Storage Locations with Critical Incidents (EXISTS)",
        "Correlated Subquery · Existential Quantification",
        "StorageLocation ↔ Incident (Open/Critical)",
        False,
        '''SELECT l.location_code, l.unit_type, l.temperature_min_c, l.temperature_max_c
FROM "StorageLocation" AS l
WHERE EXISTS (
    SELECT 1
    FROM "Incident" AS i
    WHERE i.storage_location_id = l.storage_location_id
      AND i.status IN ('open', 'investigating')
      AND i.severity IN ('high', 'critical')
)
ORDER BY l.location_code''',
        "Nested & Correlated Subqueries",
        "Elmasri §5.1.3: The EXISTS Operator",
        "Uses correlated EXISTS to identify storage facilities that currently have open critical incidents requiring urgent containment."
    ),
    "not_nested_in_not": (
        "Specimens with a Recorded Pass and No Incidents",
        "Nested Negation · Correlated NOT EXISTS with Sub-Incident",
        "Sample ↔ SampleTest (Pass) AND NOT EXISTS (Incident)",
        False,
        '''SELECT s.sample_code, s.sample_name, s.sample_status
FROM "Sample" AS s
WHERE EXISTS (
    SELECT 1 FROM "SampleTest" AS t
    WHERE t.sample_id = s.sample_id
      AND t.test_status = 'completed'
      AND LOWER(TRIM(t.result_interpretation)) = 'pass'
)
AND NOT EXISTS (
    SELECT 1 FROM "Incident" AS i
    WHERE i.sample_id = s.sample_id
)
ORDER BY s.sample_code''',
        "Nested & Correlated Subqueries",
        "Elmasri §5.1.3: Correlated Double Negation",
        "Checks for at least one completed passing assay and no incident linked to the specimen."
    ),

    # -------------------------------------------------------------
    # CATEGORY 4: RELATIONAL DIVISION & BOUND PARAMETERS
    # -------------------------------------------------------------
    "division": (
        "Specimens Passing Every Required Assay",
        "Relational Division · Double NOT EXISTS (∀)",
        "Required Assay Types ÷ Passing Assays → Universal Coverage",
        True,
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
        "Relational Division & Calculus",
        "Elmasri §5.1.8: Relational Division via Double NOT EXISTS",
        "The universally quantified 'FOR ALL' division query. Returns specimens that have successfully passed every single assay protocol associated with the reference sample."
    ),
    "assays": (
        "Specimen Assay Protocol Matrix",
        "Selection · Projection · Bound Parameter Binding",
        "Sample Code → SampleTest → Filtered Assays",
        True,
        '''SELECT s.sample_code, t.test_type, t.test_status, t.result_value, t.result_unit, t.result_interpretation
FROM "SampleTest" AS t
JOIN "Sample" AS s ON s.sample_id = t.sample_id
WHERE UPPER(s.sample_code) = :sample_code
ORDER BY t.requested_at DESC, t.sample_test_id DESC''',
        "Relational Division & Calculus",
        "Elmasri §4.3: Attribute Projection with Bound Parameters",
        "Selects and projects laboratory test history for a specific specimen parameter."
    ),

    # -------------------------------------------------------------
    # CATEGORY 5: ADVANCED SQL (CTEs, RECURSION & WINDOW FUNCTIONS)
    # -------------------------------------------------------------
    "ancestry": (
        "Recursive Specimen Lineage Ancestor Trace",
        "Recursive CTE · Hierarchical Graph Traversal",
        "Specimen → Parent Edges → Transitive Closure",
        True,
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
        "Advanced SQL: CTE & Window",
        "Elmasri §5.1.9: Recursive Queries & Transitive Closure",
        "Traverses transitive ancestry closures using WITH RECURSIVE and UNION across the directed graph in SampleRelationship."
    ),
    "window_ranking": (
        "Specimen Quantity Ranking by Location and Unit",
        "Window Function · DENSE_RANK() OVER (PARTITION BY)",
        "Sample → StorageLocation → Ranked Positions",
        False,
        '''SELECT s.sample_code, s.sample_name, l.location_code, s.quantity_value, s.quantity_unit,
       DENSE_RANK() OVER (
           PARTITION BY s.current_storage_location_id, s.quantity_unit
           ORDER BY s.quantity_value DESC
       ) AS rank_in_unit
FROM "Sample" AS s
JOIN "StorageLocation" AS l ON s.current_storage_location_id = l.storage_location_id
WHERE s.quantity_value IS NOT NULL AND s.sample_status = 'IN_STORAGE'
ORDER BY l.location_code, rank_in_unit ASC''',
        "Advanced SQL: CTE & Window",
        "Elmasri §5.1.10: SQL Window Functions",
        "Uses DENSE_RANK() OVER (PARTITION BY) to rank available biological specimens by recorded quantity among stored specimens at the same location and in the same unit."
    ),
    "exceptions": (
        "Open Storage Safety Incident Queue",
        "Multi-Table Selection · Temporal ORDER BY",
        "Incident → Specimen / Location → Active Queue",
        False,
        '''SELECT i.incident_code, i.severity, i.status, s.sample_code, l.location_code
FROM "Incident" AS i
LEFT JOIN "Sample" AS s ON s.sample_id = i.sample_id
LEFT JOIN "StorageLocation" AS l ON l.storage_location_id = i.storage_location_id
WHERE i.status IN ('open', 'investigating') AND i.storage_location_id IS NOT NULL
ORDER BY i.occurred_at DESC, i.incident_id DESC''',
        "Advanced SQL: CTE & Window",
        "Elmasri §4.6: Multi-Attribute Sorting and Null Handling",
        "Filters and sorts active multi-entity incidents across specimen and storage locations chronologically."
    ),
}


def add(key, title, concept, flow, category, sql, explanation):
    QUERIES[key] = (title, concept, flow, False, sql, category, "", explanation)


add("ancient_age", "Ancient specimens with recorded ages", "IS NOT NULL · BETWEEN · ORDER BY",
    "AncientSpecimen → Recorded ages", "Selection and sorting",
    """SELECT sample_id, estimated_age_years, dating_method
FROM "AncientSpecimen"
WHERE estimated_age_years IS NOT NULL AND estimated_age_years BETWEEN 100 AND 10000
ORDER BY estimated_age_years DESC, sample_id""",
    "Lists recorded estimates between 100 and 10,000 years, oldest first. Missing estimates are excluded.")

add("above_test_mean", "Experiments with above-average usage counts", "Noncorrelated scalar subquery · AVG",
    "ExperimentSample → Usage counts → Experiment", "Nested subqueries",
    """SELECT e.experiment_code, u.usage_count
FROM "Experiment" e
JOIN (SELECT experiment_id, COUNT(*) AS usage_count FROM "ExperimentSample" GROUP BY experiment_id) u
  ON e.experiment_id = u.experiment_id
WHERE u.usage_count > (
    SELECT AVG(g.usage_count) FROM (
        SELECT COUNT(*) AS usage_count FROM "ExperimentSample" GROUP BY experiment_id
    ) g
)
ORDER BY u.usage_count DESC, e.experiment_code""",
    "Compares each experiment with recorded usage against the mean for experiments with usage. Multiple roles count as separate usage records.")

add("stored_tested_in", "Stored specimens with completed assays", "IN · Nested subquery",
    "SampleTest → Matching Sample rows", "Nested subqueries",
    """SELECT s.sample_code, s.sample_status FROM "Sample" s
WHERE s.sample_status = 'IN_STORAGE'
  AND s.sample_id IN (SELECT t.sample_id FROM "SampleTest" t WHERE t.test_status = 'completed')
ORDER BY s.sample_code""",
    "Finds stored specimens with at least one completed assay. Multiple matching assays still produce one specimen row.")

add("all_completed", "Specimens whose recorded assays are all complete", "EXISTS · NOT EXISTS · Universal condition",
    "Sample → SampleTest → Fully completed records", "Universal conditions",
    """SELECT s.sample_code FROM "Sample" s
WHERE EXISTS (SELECT 1 FROM "SampleTest" t WHERE t.sample_id = s.sample_id)
AND NOT EXISTS (
    SELECT 1 FROM "SampleTest" t WHERE t.sample_id = s.sample_id AND t.test_status <> 'completed'
)
ORDER BY s.sample_code""",
    "Returns specimens with at least one assay and no assay in a status other than completed. Completion does not imply a passing result.")

add("all_usage_assayed", "Experiments with a completed assay for every used specimen", "Double NOT EXISTS · Relational division",
    "Experiment → ExperimentSample → SampleTest", "Universal conditions",
    """SELECT e.experiment_code FROM "Experiment" e
WHERE EXISTS (SELECT 1 FROM "ExperimentSample" u WHERE u.experiment_id = e.experiment_id)
AND NOT EXISTS (
    SELECT 1 FROM "ExperimentSample" u WHERE u.experiment_id = e.experiment_id
    AND NOT EXISTS (
        SELECT 1 FROM "SampleTest" t WHERE t.sample_id = u.sample_id AND t.test_status = 'completed'
    )
)
ORDER BY e.experiment_code""",
    "Checks whether every specimen listed for an experiment has some completed assay. It does not establish when the assay occurred relative to the experiment.")

add("lineage_union", "Specimens involved in lineage", "UNION · Duplicate elimination",
    "Parent IDs ∪ Child IDs", "Set operations",
    """SELECT parent_sample_id AS sample_id FROM "SampleRelationship"
UNION SELECT child_sample_id FROM "SampleRelationship"
ORDER BY sample_id""",
    "Lists each specimen that occurs in either lineage role once.")

add("test_usage_intersect", "Specimens both assayed and used in experiments", "INTERSECT",
    "SampleTest ∩ ExperimentSample", "Set operations",
    """SELECT sample_id FROM "SampleTest"
INTERSECT SELECT sample_id FROM "ExperimentSample"
ORDER BY sample_id""",
    "Finds specimen IDs in both tables, regardless of how many assays or usage roles they have.")

add("unused_except", "Specimens never linked to an experiment", "EXCEPT · Set difference",
    "Sample − ExperimentSample", "Set operations",
    """SELECT sample_id FROM "Sample"
EXCEPT SELECT sample_id FROM "ExperimentSample"
ORDER BY sample_id""",
    "Subtracts specimen IDs with any usage record from the full specimen inventory.")

add("assay_rollup_cte", "Assay workload per specimen", "WITH · Preaggregation · LEFT JOIN",
    "SampleTest → Counts → Sample", "Advanced SQL",
    """WITH counts AS (
    SELECT sample_id, COUNT(*) AS assay_count FROM "SampleTest" GROUP BY sample_id
)
SELECT s.sample_code, COALESCE(c.assay_count, 0) AS assay_count
FROM "Sample" s LEFT JOIN counts c ON c.sample_id = s.sample_id
ORDER BY assay_count DESC, s.sample_code""",
    "Builds a reusable count per specimen before joining back to inventory. COALESCE shows zero for specimens with no assay rows.")

GROUPS = {
    "Selection and sorting": ("assays", "exceptions", "ancient_age"),
    "Joins": ("inventory", "storage_orphan", "three_way_join"),
    "Aggregation and HAVING": ("storage", "group_by_having", "conditional_aggregation"),
    "Nested subqueries": ("nested_in_not_in", "stored_tested_in", "above_test_mean"),
    "Correlated subqueries": ("correlated_greater_than_avg", "correlated_exists", "not_nested_in_not"),
    "Universal conditions": ("division", "all_completed", "all_usage_assayed"),
    "Set operations": ("lineage_union", "test_usage_intersect", "unused_except"),
    "Advanced SQL": ("ancestry", "window_ranking", "assay_rollup_cte"),
}
QUERIES = {
    key: (*QUERIES[key][:5], category, "", QUERIES[key][7])
    for category, keys in GROUPS.items() for key in keys
}


def run_sql(db: Session, key: str, sample_code: str) -> dict:
    item = QUERIES[key]
    sql = item[4]
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
        "category": item[5],
        "elmasri_reference": item[6],
        "explanation": item[7],
    }
