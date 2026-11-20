-- ==============================================================================
-- 04_indexes_rbac.sql: Performance Indexes and Role-Based Access Control (RBAC)
-- Project: AI-Assisted Biological Sample Testing, Lineage & Experiment Management
-- System: SampleMind | Target DBMS: PostgreSQL 15 / 16
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. Performance Indexes for Query Acceleration & Foreign Key Verification
-- ------------------------------------------------------------------------------

-- Indexes on Lineage Graph Edges for B-Tree Join acceleration
CREATE INDEX IF NOT EXISTS idx_lineage_parent ON "SampleRelationship"(parent_sample_id);
CREATE INDEX IF NOT EXISTS idx_lineage_child ON "SampleRelationship"(child_sample_id);
CREATE INDEX IF NOT EXISTS idx_lineage_transformed_at ON "SampleRelationship"(transformed_at DESC);

-- Composite & Filtering Indexes on Samples
CREATE INDEX IF NOT EXISTS idx_sample_type_status ON "Sample"(sample_type_id, sample_status);
CREATE INDEX IF NOT EXISTS idx_sample_current_storage ON "Sample"(current_storage_location_id);
CREATE INDEX IF NOT EXISTS idx_sample_registered_at ON "Sample"(registered_at DESC);

-- Storage Lookups
CREATE INDEX IF NOT EXISTS idx_storage_facility_room ON "StorageLocation"(facility, room);
CREATE INDEX IF NOT EXISTS idx_storage_unit_label ON "StorageLocation"(unit_type, unit_label);

-- Test & Incident Chronology
CREATE INDEX IF NOT EXISTS idx_sampletest_sample_date ON "SampleTest"(sample_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_status_severity ON "Incident"(status, severity, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_sample ON "Incident"(sample_id);
CREATE INDEX IF NOT EXISTS idx_incident_storage ON "Incident"(storage_location_id);

-- Experiment Junctions & Results
CREATE INDEX IF NOT EXISTS idx_expsample_sample_exp ON "ExperimentSample"(sample_id, experiment_id);
CREATE INDEX IF NOT EXISTS idx_expresult_exp_id ON "ExperimentResult"(experiment_id);

-- GIN Index on AI Analysis JSONB Factors
CREATE INDEX IF NOT EXISTS idx_aianalysis_sample_analyzed ON "AIAnalysis"(sample_id, analysed_at DESC);
CREATE INDEX IF NOT EXISTS idx_aianalysis_factors_gin ON "AIAnalysis" USING GIN (important_factors);

-- ------------------------------------------------------------------------------
-- 2. Role-Based Access Control (RBAC) Setup
-- ------------------------------------------------------------------------------

-- Conditional creation of application roles
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_samplemind_admin') THEN
        CREATE ROLE role_samplemind_admin;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_samplemind_researcher') THEN
        CREATE ROLE role_samplemind_researcher;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_samplemind_technician') THEN
        CREATE ROLE role_samplemind_technician;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_samplemind_reviewer') THEN
        CREATE ROLE role_samplemind_reviewer;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'role_samplemind_viewer') THEN
        CREATE ROLE role_samplemind_viewer;
    END IF;
END $$;

-- 1. Admin: Full schema privileges
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO role_samplemind_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO role_samplemind_admin;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO role_samplemind_admin;

-- 2. Researcher: CRUD on research data (Samples, Lineage, Tests, Experiments, Results, AI)
GRANT SELECT ON ALL TABLES IN SCHEMA public TO role_samplemind_researcher;
GRANT INSERT, UPDATE ON "Sample", "SampleRelationship", "SampleTest", "Experiment", "ExperimentSample", "ExperimentEquipment", "ExperimentResult", "AIAnalysis" TO role_samplemind_researcher;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO role_samplemind_researcher;

-- 3. Technician: Storage, Test execution, Incidents reporting, and Sample status updates
GRANT SELECT ON ALL TABLES IN SCHEMA public TO role_samplemind_technician;
GRANT INSERT, UPDATE ON "Sample", "SampleRelationship", "SampleStorageHistory", "SampleTest", "StorageLocation", "Incident" TO role_samplemind_technician;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO role_samplemind_technician;

-- 4. Reviewer: AI Analysis evaluation and Incident review
GRANT SELECT ON ALL TABLES IN SCHEMA public TO role_samplemind_reviewer;
GRANT UPDATE (review_feedback, review_notes, reviewed_by, reviewed_at) ON "AIAnalysis" TO role_samplemind_reviewer;
GRANT UPDATE (status, resolution_notes, closed_at) ON "Incident" TO role_samplemind_reviewer;

-- 5. Viewer: Read-only access to non-sensitive records and views
GRANT SELECT ON ALL TABLES IN SCHEMA public TO role_samplemind_viewer;

COMMIT;
