-- ==============================================================================
-- 02_views.sql: Database Analytical & Reporting Views
-- Project: AI-Assisted Biological Sample Testing, Lineage & Experiment Management
-- System: SampleMind | Target DBMS: PostgreSQL 15 / 16
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- View 1: v_sample_overview
-- Unified overview of sample identity, controlled type, current status, and location
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_sample_overview AS
SELECT 
    s.sample_id,
    s.sample_code,
    s.sample_name,
    st.type_code,
    st.type_name AS sample_type,
    s.quantity_value,
    s.quantity_unit,
    s.sample_status,
    sl.location_code AS current_location_code,
    sl.facility AS current_facility,
    sl.room AS current_room,
    sl.unit_type AS storage_unit_type,
    sl.unit_label AS storage_unit_label,
    sl.rack,
    sl.box,
    sl.slot,
    u.display_name AS registered_by_user,
    s.registered_at,
    s.updated_at
FROM "Sample" s
JOIN "SampleType" st ON s.sample_type_id = st.sample_type_id
LEFT JOIN "StorageLocation" sl ON s.current_storage_location_id = sl.storage_location_id
LEFT JOIN "AppUser" u ON s.created_by = u.user_id;

-- ------------------------------------------------------------------------------
-- View 2: v_experiment_summary
-- Summarizes experiment status, lead scientist, number of participating samples and results
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_experiment_summary AS
SELECT 
    e.experiment_id,
    e.experiment_code,
    e.experiment_name,
    e.status AS experiment_status,
    lead.display_name AS lead_researcher,
    e.planned_start,
    e.actual_start,
    e.actual_end,
    COUNT(DISTINCT es.sample_id) AS participating_sample_count,
    COUNT(DISTINCT ee.equipment_id) AS equipment_utilized_count,
    COUNT(DISTINCT er.experiment_result_id) AS recorded_result_count
FROM "Experiment" e
LEFT JOIN "AppUser" lead ON e.lead_researcher_id = lead.user_id
LEFT JOIN "ExperimentSample" es ON e.experiment_id = es.experiment_id
LEFT JOIN "ExperimentEquipment" ee ON e.experiment_id = ee.experiment_id
LEFT JOIN "ExperimentResult" er ON e.experiment_id = er.experiment_id
GROUP BY 
    e.experiment_id, e.experiment_code, e.experiment_name, e.status,
    lead.display_name, e.planned_start, e.actual_start, e.actual_end;

-- ------------------------------------------------------------------------------
-- View 3: v_open_incidents
-- Active or investigating incidents with affected sample or storage location context
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_open_incidents AS
SELECT 
    i.incident_id,
    i.incident_code,
    i.incident_type,
    i.severity,
    i.status AS incident_status,
    i.occurred_at,
    i.reported_at,
    rep.display_name AS reported_by_user,
    assignee.display_name AS assigned_to_user,
    s.sample_code AS affected_sample_code,
    s.sample_name AS affected_sample_name,
    sl.location_code AS affected_location_code,
    sl.facility AS affected_facility,
    i.description,
    i.resolution_notes
FROM "Incident" i
JOIN "AppUser" rep ON i.reported_by = rep.user_id
LEFT JOIN "AppUser" assignee ON i.assigned_to = assignee.user_id
LEFT JOIN "Sample" s ON i.sample_id = s.sample_id
LEFT JOIN "StorageLocation" sl ON i.storage_location_id = sl.storage_location_id
WHERE i.status IN ('open', 'investigating');

-- ------------------------------------------------------------------------------
-- View 4: v_latest_sample_risk
-- Latest AI-predicted risk per sample using PostgreSQL DISTINCT ON
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_latest_sample_risk AS
SELECT DISTINCT ON (s.sample_id)
    s.sample_id,
    s.sample_code,
    s.sample_name,
    s.sample_status,
    ai.ai_analysis_id,
    ai.predicted_risk,
    ai.confidence,
    method.model_name,
    method.model_version,
    ai.important_factors,
    ai.analysed_at,
    ai.review_feedback,
    reviewer.display_name AS reviewed_by_user,
    ai.reviewed_at
FROM "Sample" s
LEFT JOIN "AIAnalysis" ai ON s.sample_id = ai.sample_id
LEFT JOIN "ModelRegistry" method ON ai.model_registry_id = method.model_registry_id
LEFT JOIN "AppUser" reviewer ON ai.reviewed_by = reviewer.user_id
ORDER BY s.sample_id, ai.analysed_at DESC NULLS LAST;

-- ------------------------------------------------------------------------------
-- View 5: v_ancient_specimen_catalog
-- Enriched catalog for archaeological specimens combining sample, ancient, and site metadata
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_ancient_specimen_catalog AS
SELECT 
    s.sample_id,
    s.sample_code,
    s.sample_name,
    st.type_name AS sample_type,
    anc.estimated_age_years,
    anc.age_uncertainty_years,
    anc.dating_method,
    anc.excavation_layer,
    anc.depth_cm,
    anc.preservation_state,
    anc.context_reference,
    site.site_code AS archaeological_site_code,
    site.site_name AS archaeological_site_name,
    site.region AS site_region,
    site.country AS site_country,
    s.sample_status,
    s.quantity_value,
    s.quantity_unit
FROM "AncientSpecimen" anc
JOIN "Sample" s ON anc.sample_id = s.sample_id
JOIN "SampleType" st ON s.sample_type_id = st.sample_type_id
LEFT JOIN "ArchaeologicalSite" site ON anc.archaeological_site_id = site.archaeological_site_id;

-- ------------------------------------------------------------------------------
-- View 6: vw_ai_sample_features
-- Structured feature extraction view feeding the Scikit-Learn Random Forest Pipeline
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_ai_sample_features AS
SELECT 
    s.sample_id,
    s.sample_code,
    st.type_code AS sample_type_code,
    COALESCE(anc.estimated_age_years, 0) AS estimated_age_years,
    COALESCE(anc.preservation_state, 'Unknown') AS preservation_state,
    COALESCE(sl.temperature_min_c, 4.00) AS storage_temp_min_c,
    ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s.registered_at)) / 86400.0, 1) AS storage_duration_days,
    COUNT(DISTINCT t.sample_test_id) AS total_tests_conducted,
    COUNT(DISTINCT t.sample_test_id) FILTER (WHERE t.result_interpretation = 'Pass') AS passed_tests_count,
    COUNT(DISTINCT t.sample_test_id) FILTER (WHERE t.result_interpretation = 'Fail') AS failed_tests_count,
    COUNT(DISTINCT i.incident_id) AS total_incidents_logged,
    COUNT(DISTINCT i.incident_id) FILTER (WHERE i.severity = 'critical') AS critical_incidents_logged,
    COALESCE(rm.risk_level, 'none') AS restricted_risk_level
FROM "Sample" s
JOIN "SampleType" st ON s.sample_type_id = st.sample_type_id
LEFT JOIN "AncientSpecimen" anc ON s.sample_id = anc.sample_id
LEFT JOIN "StorageLocation" sl ON s.current_storage_location_id = sl.storage_location_id
LEFT JOIN "SampleTest" t ON s.sample_id = t.sample_id
LEFT JOIN "Incident" i ON s.sample_id = i.sample_id
LEFT JOIN "RestrictedMaterial" rm ON s.sample_id = rm.sample_id AND rm.status = 'active'
GROUP BY 
    s.sample_id, s.sample_code, st.type_code, anc.estimated_age_years,
    anc.preservation_state, sl.temperature_min_c, s.registered_at, rm.risk_level;

COMMIT;
