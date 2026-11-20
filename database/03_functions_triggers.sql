-- ==============================================================================
-- 03_functions_triggers.sql: PostgreSQL PL/pgSQL Functions, Triggers & Procedures
-- Project: AI-Assisted Biological Sample Testing, Lineage & Experiment Management
-- System: SampleMind | Target DBMS: PostgreSQL 15 / 16
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Trigger Function: Prevent Cycles in Sample Lineage Graph (DAG Enforcement)
-- Ensures that inserting parent_sample_id -> child_sample_id does not form a loop
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_prevent_lineage_cycle()
RETURNS TRIGGER AS $$
DECLARE
    v_cycle_detected BOOLEAN := FALSE;
BEGIN
    WITH RECURSIVE TraceDescendants AS (
        SELECT child_sample_id
        FROM "SampleRelationship"
        WHERE parent_sample_id = NEW.child_sample_id

        UNION ALL

        SELECT sr.child_sample_id
        FROM "SampleRelationship" sr
        JOIN TraceDescendants td ON sr.parent_sample_id = td.child_sample_id
    )
    SELECT EXISTS (
        SELECT 1 FROM TraceDescendants WHERE child_sample_id = NEW.parent_sample_id
    ) INTO v_cycle_detected;

    IF v_cycle_detected THEN
        RAISE EXCEPTION 'DAG Lineage Cycle Violation: Parent sample % is already a descendant of child sample %. Insertion rejected.',
            NEW.parent_sample_id, NEW.child_sample_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_check_lineage_cycle ON "SampleRelationship";
CREATE TRIGGER trg_check_lineage_cycle
BEFORE INSERT OR UPDATE ON "SampleRelationship"
FOR EACH ROW
EXECUTE FUNCTION fn_prevent_lineage_cycle();

-- ------------------------------------------------------------------------------
-- 2. Trigger Function: Auto-log Storage Relocation History
-- Appends a historical record into SampleStorageHistory when location changes
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_log_storage_history()
RETURNS TRIGGER AS $$
BEGIN
    IF (OLD.current_storage_location_id IS DISTINCT FROM NEW.current_storage_location_id) THEN
        INSERT INTO "SampleStorageHistory" (
            sample_id, storage_location_id, moved_at, moved_by, reason
        ) VALUES (
            NEW.sample_id, NEW.current_storage_location_id, CURRENT_TIMESTAMP, NEW.created_by, 'Relocation logged by system trigger'
        );
        NEW.updated_at := CURRENT_TIMESTAMP;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_log_storage_history ON "Sample";
CREATE TRIGGER trg_log_storage_history
BEFORE UPDATE OF current_storage_location_id ON "Sample"
FOR EACH ROW
EXECUTE FUNCTION fn_log_storage_history();

-- ------------------------------------------------------------------------------
-- 3. Trigger Function: Critical Incident Impact Propagation
-- Automatically flags downstream samples and results when a critical event occurs
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_propagate_critical_incident()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.severity = 'critical' AND NEW.sample_id IS NOT NULL THEN
        -- Mark the directly affected sample as QUARANTINED
        UPDATE "Sample"
        SET sample_status = 'QUARANTINED', updated_at = CURRENT_TIMESTAMP
        WHERE sample_id = NEW.sample_id AND sample_status NOT IN ('DISPOSED', 'DEPLETED');

        -- Trace all descendants recursively and flag their status
        WITH RECURSIVE Descendants AS (
            SELECT child_sample_id
            FROM "SampleRelationship"
            WHERE parent_sample_id = NEW.sample_id

            UNION ALL

            SELECT sr.child_sample_id
            FROM "SampleRelationship" sr
            JOIN Descendants d ON sr.parent_sample_id = d.child_sample_id
        )
        UPDATE "Sample"
        SET sample_status = 'QUARANTINED', updated_at = CURRENT_TIMESTAMP
        WHERE sample_id IN (SELECT child_sample_id FROM Descendants)
          AND sample_status IN ('REGISTERED', 'IN_STORAGE', 'IN_USE');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_critical_incident_propagation ON "Incident";
CREATE TRIGGER trg_critical_incident_propagation
AFTER INSERT ON "Incident"
FOR EACH ROW
EXECUTE FUNCTION fn_propagate_critical_incident();

-- ------------------------------------------------------------------------------
-- 4. Stored Procedure: Atomic Aliquot / Child Sample Derivation Transaction
-- Locks parent row, verifies available quantity, creates child sample, and deducts parent balance
-- ------------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_derive_child_sample(
    p_parent_sample_id      BIGINT,
    p_child_sample_code     VARCHAR(40),
    p_child_name            VARCHAR(160),
    p_child_type_id         BIGINT,
    p_parent_qty_consumed   NUMERIC(14,4),
    p_child_initial_qty     NUMERIC(14,4),
    p_child_unit            VARCHAR(24),
    p_storage_location_id   BIGINT,
    p_transformation_type   VARCHAR(80),
    p_operator_user_id      BIGINT,
    p_notes                 TEXT,
    INOUT p_new_child_id    BIGINT DEFAULT NULL
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_parent_remaining NUMERIC(14,4);
    v_parent_status    VARCHAR(24);
BEGIN
    -- Explicit row-level lock on parent to prevent concurrent race conditions
    SELECT quantity_value, sample_status
    INTO v_parent_remaining, v_parent_status
    FROM "Sample"
    WHERE sample_id = p_parent_sample_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Parent sample ID % does not exist.', p_parent_sample_id;
    END IF;

    IF v_parent_status NOT IN ('REGISTERED', 'IN_STORAGE', 'IN_USE') THEN
        RAISE EXCEPTION 'Parent sample % cannot be derived; current status is %.', p_parent_sample_id, v_parent_status;
    END IF;

    IF v_parent_remaining < p_parent_qty_consumed THEN
        RAISE EXCEPTION 'Insufficient stock in parent sample %: available=%, requested=%',
            p_parent_sample_id, v_parent_remaining, p_parent_qty_consumed;
    END IF;

    -- 1. Deduct consumed quantity from parent
    UPDATE "Sample"
    SET quantity_value = quantity_value - p_parent_qty_consumed,
        sample_status = CASE WHEN (quantity_value - p_parent_qty_consumed) <= 0.0 THEN 'DEPLETED' ELSE sample_status END,
        updated_at = CURRENT_TIMESTAMP
    WHERE sample_id = p_parent_sample_id;

    -- 2. Insert newly derived child sample
    INSERT INTO "Sample" (
        sample_code, sample_name, sample_type_id, source_description,
        registered_at, quantity_value, quantity_unit, sample_status,
        current_storage_location_id, created_by, notes, updated_at
    ) VALUES (
        p_child_sample_code, p_child_name, p_child_type_id,
        'Derived from parent sample ID ' || p_parent_sample_id,
        CURRENT_TIMESTAMP, p_child_initial_qty, p_child_unit, 'IN_STORAGE',
        p_storage_location_id, p_operator_user_id, p_notes, CURRENT_TIMESTAMP
    ) RETURNING sample_id INTO p_new_child_id;

    -- 3. Record lineage transformation edge
    INSERT INTO "SampleRelationship" (
        parent_sample_id, child_sample_id, transformation_type,
        transformed_at, quantity_transferred, quantity_unit, recorded_by, notes
    ) VALUES (
        p_parent_sample_id, p_new_child_id, p_transformation_type,
        CURRENT_TIMESTAMP, p_parent_qty_consumed, p_child_unit, p_operator_user_id, p_notes
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. Recursive Query Function: Ancestry Tracing with Loop Guard
-- Returns complete upward ancestral tree from child to root specimens
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_sample_ancestors(p_child_id BIGINT)
RETURNS TABLE (
    depth INT,
    ancestor_id BIGINT,
    ancestor_code VARCHAR(40),
    ancestor_name VARCHAR(160),
    transformation_type VARCHAR(80),
    id_path BIGINT[]
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE AncestorsCTE AS (
        SELECT 
            1 AS depth,
            sr.parent_sample_id AS ancestor_id,
            s.sample_code,
            s.sample_name,
            sr.transformation_type,
            ARRAY[sr.child_sample_id, sr.parent_sample_id] AS id_path
        FROM "SampleRelationship" sr
        JOIN "Sample" s ON sr.parent_sample_id = s.sample_id
        WHERE sr.child_sample_id = p_child_id

        UNION ALL

        SELECT 
            a.depth + 1,
            sr.parent_sample_id,
            s.sample_code,
            s.sample_name,
            sr.transformation_type,
            a.id_path || sr.parent_sample_id
        FROM "SampleRelationship" sr
        JOIN AncestorsCTE a ON sr.child_sample_id = a.ancestor_id
        JOIN "Sample" s ON sr.parent_sample_id = s.sample_id
        WHERE NOT (sr.parent_sample_id = ANY(a.id_path))
    )
    SELECT * FROM AncestorsCTE ORDER BY depth ASC;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 6. Recursive Query Function: Descendant Tracing with Loop Guard
-- Returns complete downward derivation tree from parent to all child sub-aliquots
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_get_sample_descendants(p_root_id BIGINT)
RETURNS TABLE (
    depth INT,
    descendant_id BIGINT,
    descendant_code VARCHAR(40),
    descendant_name VARCHAR(160),
    transformation_type VARCHAR(80),
    id_path BIGINT[]
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE DescendantsCTE AS (
        SELECT 
            1 AS depth,
            sr.child_sample_id AS descendant_id,
            s.sample_code,
            s.sample_name,
            sr.transformation_type,
            ARRAY[sr.parent_sample_id, sr.child_sample_id] AS id_path
        FROM "SampleRelationship" sr
        JOIN "Sample" s ON sr.child_sample_id = s.sample_id
        WHERE sr.parent_sample_id = p_root_id

        UNION ALL

        SELECT 
            d.depth + 1,
            sr.child_sample_id,
            s.sample_code,
            s.sample_name,
            sr.transformation_type,
            d.id_path || sr.child_sample_id
        FROM "SampleRelationship" sr
        JOIN DescendantsCTE d ON sr.parent_sample_id = d.descendant_id
        JOIN "Sample" s ON sr.child_sample_id = s.sample_id
        WHERE NOT (sr.child_sample_id = ANY(d.id_path))
    )
    SELECT * FROM DescendantsCTE ORDER BY depth ASC;
END;
$$ LANGUAGE plpgsql;

COMMIT;
