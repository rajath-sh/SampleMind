-- ==============================================================================
-- 01_schema.sql: Core Physical Relational Schema
-- Project: AI-Assisted Biological Sample Testing, Lineage & Experiment Management
-- System: SampleMind | Target DBMS: PostgreSQL 15 / 16
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. AppUser: System Users and Role-Based Access Control
-- ------------------------------------------------------------------------------
CREATE TABLE "AppUser" (
    user_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_name    VARCHAR(120) NOT NULL,
    email           VARCHAR(254) NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    role            VARCHAR(30) NOT NULL CHECK (role IN ('ADMIN', 'RESEARCHER', 'TECHNICIAN', 'REVIEWER', 'VIEWER')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 2. SampleType: Controlled Vocabulary of Biological Material Types
-- ------------------------------------------------------------------------------
CREATE TABLE "SampleType" (
    sample_type_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    type_code       VARCHAR(40) NOT NULL UNIQUE,
    type_name       VARCHAR(100) NOT NULL UNIQUE,
    description     TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 3. StorageLocation: Physical Storage Units and Hierarchy
-- ------------------------------------------------------------------------------
CREATE TABLE "StorageLocation" (
    storage_location_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    location_code       VARCHAR(80) NOT NULL UNIQUE,
    facility            VARCHAR(100) NOT NULL,
    room                VARCHAR(80),
    unit_type           VARCHAR(40) NOT NULL CHECK (unit_type IN ('freezer', 'cabinet', 'shelf', 'liquid_nitrogen', 'bench')),
    unit_label          VARCHAR(80),
    rack                VARCHAR(40),
    box                 VARCHAR(40),
    slot                VARCHAR(40),
    temperature_min_c   NUMERIC(5,2),
    temperature_max_c   NUMERIC(5,2),
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_temp_range CHECK (temperature_min_c IS NULL OR temperature_max_c IS NULL OR temperature_min_c <= temperature_max_c)
);

-- ------------------------------------------------------------------------------
-- 4. Sample: Authoritative Central Biological Specimen Registry
-- ------------------------------------------------------------------------------
CREATE TABLE "Sample" (
    sample_id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sample_code                 VARCHAR(40) NOT NULL UNIQUE,
    sample_name                 VARCHAR(160) NOT NULL,
    sample_type_id              BIGINT NOT NULL REFERENCES "SampleType"(sample_type_id) ON DELETE RESTRICT,
    source_description          TEXT,
    collected_at                TIMESTAMPTZ,
    registered_at               TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quantity_value              NUMERIC(14,4) NOT NULL CHECK (quantity_value >= 0),
    quantity_unit               VARCHAR(24) NOT NULL CHECK (quantity_unit IN ('mg', 'g', 'uL', 'mL', 'pieces', 'tubes')),
    sample_status               VARCHAR(24) NOT NULL CHECK (sample_status IN (
                                    'REGISTERED', 'IN_STORAGE', 'IN_USE', 'DEPLETED', 'QUARANTINED', 'DISPOSED', 'MISSING'
                                )),
    current_storage_location_id BIGINT REFERENCES "StorageLocation"(storage_location_id) ON DELETE SET NULL,
    created_by                  BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    notes                       TEXT,
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 5. SampleRelationship: Parent-Child Transformations (Lineage Directed Graph)
-- ------------------------------------------------------------------------------
CREATE TABLE "SampleRelationship" (
    relationship_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    parent_sample_id        BIGINT NOT NULL REFERENCES "Sample"(sample_id) ON DELETE RESTRICT,
    child_sample_id         BIGINT NOT NULL REFERENCES "Sample"(sample_id) ON DELETE RESTRICT,
    transformation_type     VARCHAR(80) NOT NULL CHECK (transformation_type IN (
                                'Extraction', 'Pulverization', 'Aliquoting', 'PCR_Amplification', 'Purification', 'Chemical_Synthesis'
                            )),
    transformed_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    quantity_transferred    NUMERIC(14,4) CHECK (quantity_transferred >= 0),
    quantity_unit           VARCHAR(24),
    recorded_by             BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    notes                   TEXT,
    CONSTRAINT chk_no_self_lineage CHECK (parent_sample_id <> child_sample_id),
    CONSTRAINT uq_parent_child_transformation UNIQUE (parent_sample_id, child_sample_id, transformation_type, transformed_at)
);

-- ------------------------------------------------------------------------------
-- 6. SampleStorageHistory: Movement and Relocation Audit History
-- ------------------------------------------------------------------------------
CREATE TABLE "SampleStorageHistory" (
    storage_history_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sample_id           BIGINT NOT NULL REFERENCES "Sample"(sample_id) ON DELETE CASCADE,
    storage_location_id BIGINT REFERENCES "StorageLocation"(storage_location_id) ON DELETE SET NULL,
    moved_at            TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    moved_by            BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    reason              TEXT
);

-- ------------------------------------------------------------------------------
-- SampleQuantityTransaction: Inventory changes and balances
-- ------------------------------------------------------------------------------
CREATE TABLE "SampleQuantityTransaction" (
    transaction_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sample_id            BIGINT NOT NULL REFERENCES "Sample"(sample_id) ON DELETE CASCADE,
    transaction_type     VARCHAR(50) NOT NULL,
    quantity_delta       NUMERIC(14,4) NOT NULL,
    balance_after        NUMERIC(14,4) NOT NULL,
    quantity_unit        VARCHAR(24) NOT NULL,
    reference_sample_id  BIGINT REFERENCES "Sample"(sample_id) ON DELETE SET NULL,
    reference_type       VARCHAR(50),
    notes                TEXT,
    performed_by         BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 7. SampleTest: Diagnostic Assays and Quality Tests
-- ------------------------------------------------------------------------------
CREATE TABLE "SampleTest" (
    sample_test_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sample_id               BIGINT NOT NULL REFERENCES "Sample"(sample_id) ON DELETE RESTRICT,
    test_type               VARCHAR(100) NOT NULL,
    requested_at            TIMESTAMPTZ,
    performed_at            TIMESTAMPTZ,
    performed_by            BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    test_status             VARCHAR(24) NOT NULL CHECK (test_status IN ('requested', 'in_progress', 'completed', 'cancelled')),
    observation             TEXT,
    result_value            NUMERIC(16,6),
    result_unit             VARCHAR(24),
    result_interpretation   VARCHAR(80) CHECK (result_interpretation IN ('Pass', 'Marginal', 'Fail', 'Inconclusive')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_test_dates CHECK (performed_at IS NULL OR requested_at IS NULL OR performed_at >= requested_at)
);

-- ------------------------------------------------------------------------------
-- 8. ArchaeologicalSite: Prehistoric Excavation Sites & Context
-- ------------------------------------------------------------------------------
CREATE TABLE "ArchaeologicalSite" (
    archaeological_site_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    site_code               VARCHAR(60) NOT NULL UNIQUE,
    site_name               VARCHAR(160) NOT NULL,
    region                  VARCHAR(120),
    country                 VARCHAR(100),
    context_notes           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------------------------
-- 9. AncientSpecimen: 1:1 Specialization Subtype of Sample for Ancient Material
-- ------------------------------------------------------------------------------
CREATE TABLE "AncientSpecimen" (
    sample_id               BIGINT PRIMARY KEY REFERENCES "Sample"(sample_id) ON DELETE CASCADE,
    archaeological_site_id  BIGINT REFERENCES "ArchaeologicalSite"(archaeological_site_id) ON DELETE SET NULL,
    estimated_age_years     INTEGER CHECK (estimated_age_years >= 0),
    age_uncertainty_years   INTEGER CHECK (age_uncertainty_years >= 0),
    dating_method           VARCHAR(100) CHECK (dating_method IN (
                                'AMS_Radiocarbon_14C', 'Thermoluminescence', 'Stratigraphic_Correlation', 'Dendrochronology', 'Bio-chronology'
                            )),
    excavation_layer        VARCHAR(100),
    depth_cm                NUMERIC(8,2) CHECK (depth_cm >= 0),
    preservation_state      VARCHAR(40) CHECK (preservation_state IN ('Pristine', 'Moderate', 'Poor', 'Severely_Degraded')),
    context_reference       VARCHAR(120)
);

-- ------------------------------------------------------------------------------
-- 10. Equipment: Laboratory Instruments and Calibration Readiness
-- ------------------------------------------------------------------------------
CREATE TABLE "Equipment" (
    equipment_id        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    equipment_code      VARCHAR(50) NOT NULL UNIQUE,
    equipment_name      VARCHAR(140) NOT NULL,
    manufacturer        VARCHAR(120),
    model_number        VARCHAR(100),
    equipment_status    VARCHAR(24) NOT NULL DEFAULT 'available' CHECK (equipment_status IN (
                            'available', 'in_use', 'maintenance', 'retired'
                        )),
    last_calibrated_at  TIMESTAMPTZ,
    calibration_due_at  TIMESTAMPTZ,
    notes               TEXT,
    CONSTRAINT chk_equip_calib_chronology CHECK (calibration_due_at IS NULL OR last_calibrated_at IS NULL OR calibration_due_at >= last_calibrated_at)
);

-- ------------------------------------------------------------------------------
-- 11. Experiment: Research Protocols, Projects, and Workflows
-- ------------------------------------------------------------------------------
CREATE TABLE "Experiment" (
    experiment_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    experiment_code     VARCHAR(40) NOT NULL UNIQUE,
    experiment_name     VARCHAR(180) NOT NULL,
    objective           TEXT,
    protocol_reference  VARCHAR(200),
    created_by          BIGINT NOT NULL REFERENCES "AppUser"(user_id) ON DELETE RESTRICT,
    lead_researcher_id  BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    planned_start       TIMESTAMPTZ,
    planned_end         TIMESTAMPTZ,
    actual_start        TIMESTAMPTZ,
    actual_end          TIMESTAMPTZ,
    status              VARCHAR(24) NOT NULL DEFAULT 'planned' CHECK (status IN (
                            'planned', 'active', 'completed', 'cancelled', 'on_hold'
                        )),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_exp_planned_dates CHECK (planned_end IS NULL OR planned_start IS NULL OR planned_end >= planned_start),
    CONSTRAINT chk_exp_actual_dates CHECK (actual_end IS NULL OR actual_start IS NULL OR actual_end >= actual_start)
);

-- ------------------------------------------------------------------------------
-- 12. ExperimentSample: Junction Table (M:N between Experiment and Sample)
-- ------------------------------------------------------------------------------
CREATE TABLE "ExperimentSample" (
    experiment_id   BIGINT NOT NULL REFERENCES "Experiment"(experiment_id) ON DELETE CASCADE,
    sample_id       BIGINT NOT NULL REFERENCES "Sample"(sample_id) ON DELETE RESTRICT,
    usage_role      VARCHAR(60) NOT NULL DEFAULT 'input' CHECK (usage_role IN ('input', 'control', 'reference', 'output')),
    quantity_used   NUMERIC(14,4) CHECK (quantity_used >= 0),
    quantity_unit   VARCHAR(24),
    added_at        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    notes           TEXT,
    PRIMARY KEY (experiment_id, sample_id, usage_role)
);

-- ------------------------------------------------------------------------------
-- 13. ExperimentEquipment: Junction Table (M:N between Experiment and Equipment)
-- ------------------------------------------------------------------------------
CREATE TABLE "ExperimentEquipment" (
    experiment_equipment_id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    experiment_id           BIGINT NOT NULL REFERENCES "Experiment"(experiment_id) ON DELETE CASCADE,
    equipment_id            BIGINT NOT NULL REFERENCES "Equipment"(equipment_id) ON DELETE RESTRICT,
    usage_start             TIMESTAMPTZ,
    usage_end               TIMESTAMPTZ,
    usage_notes             TEXT,
    CONSTRAINT chk_equip_usage_chronology CHECK (usage_end IS NULL OR usage_start IS NULL OR usage_end >= usage_start)
);

-- ------------------------------------------------------------------------------
-- 14. ExperimentResult: Results and Observations Yielded by Experiments
-- ------------------------------------------------------------------------------
CREATE TABLE "ExperimentResult" (
    experiment_result_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    experiment_id           BIGINT NOT NULL REFERENCES "Experiment"(experiment_id) ON DELETE CASCADE,
    result_code             VARCHAR(50) NOT NULL UNIQUE,
    result_title            VARCHAR(180) NOT NULL,
    observation             TEXT,
    result_value            NUMERIC(16,6),
    result_unit             VARCHAR(24),
    interpretation          TEXT,
    recorded_by             BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    recorded_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_final                BOOLEAN NOT NULL DEFAULT FALSE
);

-- ------------------------------------------------------------------------------
-- 15. RestrictedMaterial: Biohazard and Regulatory Access Governance
-- ------------------------------------------------------------------------------
CREATE TABLE "RestrictedMaterial" (
    restricted_material_id  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sample_id               BIGINT NOT NULL REFERENCES "Sample"(sample_id) ON DELETE RESTRICT,
    restriction_type        VARCHAR(80) NOT NULL CHECK (restriction_type IN (
                                'BSL_2_Biohazard', 'BSL_3_Biohazard', 'Heritage_Protected_Specimen', 'CITES_Restricted', 'Toxic_Substance'
                            )),
    risk_level              VARCHAR(20) NOT NULL CHECK (risk_level IN ('low', 'medium', 'high')),
    access_level            VARCHAR(30) NOT NULL CHECK (access_level IN ('standard', 'restricted', 'supervisor_only')),
    classification_basis    TEXT,
    valid_from              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    valid_until             TIMESTAMPTZ,
    status                  VARCHAR(24) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reviewed', 'expired')),
    reviewed_by             BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    CONSTRAINT chk_restr_dates CHECK (valid_until IS NULL OR valid_until >= valid_from)
);

-- ------------------------------------------------------------------------------
-- 16. Incident: Contamination, Failure, Missing Sample, or Equipment Events
-- ------------------------------------------------------------------------------
CREATE TABLE "Incident" (
    incident_id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    incident_code       VARCHAR(50) NOT NULL UNIQUE,
    sample_id           BIGINT REFERENCES "Sample"(sample_id) ON DELETE RESTRICT,
    storage_location_id BIGINT REFERENCES "StorageLocation"(storage_location_id) ON DELETE SET NULL,
    incident_type       VARCHAR(60) NOT NULL CHECK (incident_type IN (
                            'contamination', 'temperature_excursion', 'missing_sample', 'handling_issue', 'equipment_failure', 'other'
                        )),
    severity            VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    description         TEXT NOT NULL,
    occurred_at         TIMESTAMPTZ NOT NULL,
    reported_at         TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reported_by         BIGINT NOT NULL REFERENCES "AppUser"(user_id) ON DELETE RESTRICT,
    assigned_to         BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    status              VARCHAR(24) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'mitigated', 'closed')),
    resolution_notes    TEXT,
    closed_at           TIMESTAMPTZ,
    CONSTRAINT chk_sample_or_location CHECK (sample_id IS NOT NULL OR storage_location_id IS NOT NULL),
    CONSTRAINT chk_incident_dates CHECK (closed_at IS NULL OR closed_at >= occurred_at)
);

-- ------------------------------------------------------------------------------
-- ModelRegistry: Assessment methods and version metadata
-- ------------------------------------------------------------------------------
CREATE TABLE "ModelRegistry" (
    model_registry_id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    model_name              VARCHAR(100) NOT NULL,
    model_version           VARCHAR(60) NOT NULL UNIQUE,
    artifact_uri            VARCHAR(255) NOT NULL,
    trained_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    training_data_version   VARCHAR(60) NOT NULL,
    feature_schema_version  VARCHAR(60) NOT NULL,
    metrics                 JSONB,
    is_active               BOOLEAN NOT NULL DEFAULT FALSE
);

-- ------------------------------------------------------------------------------
-- AIAnalysis: Auditable Specimen Handling Assessments
-- ------------------------------------------------------------------------------
CREATE TABLE "AIAnalysis" (
    ai_analysis_id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sample_id               BIGINT NOT NULL REFERENCES "Sample"(sample_id) ON DELETE RESTRICT,
    predicted_risk          VARCHAR(20) NOT NULL CHECK (predicted_risk IN ('low', 'medium', 'high')),
    confidence              NUMERIC(6,5) NOT NULL CHECK (confidence BETWEEN 0.00000 AND 1.00000),
    class_probabilities     JSONB,
    important_factors       JSONB NOT NULL,
    model_registry_id       BIGINT NOT NULL REFERENCES "ModelRegistry"(model_registry_id) ON DELETE RESTRICT,
    analysed_at             TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by             BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    reviewed_at             TIMESTAMPTZ,
    review_feedback         VARCHAR(24) CHECK (review_feedback IN ('agree', 'disagree', 'needs_review')),
    review_notes            TEXT,
    input_snapshot          JSONB
);

-- ------------------------------------------------------------------------------
-- 18. AuditLog: Append-Only Immutable System Audit Trail (Recommended Support Table)
-- ------------------------------------------------------------------------------
CREATE TABLE "AuditLog" (
    audit_log_id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_user_id   BIGINT REFERENCES "AppUser"(user_id) ON DELETE SET NULL,
    action          VARCHAR(80) NOT NULL,
    entity_type     VARCHAR(60) NOT NULL,
    entity_id       BIGINT,
    occurred_at     TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    request_id      VARCHAR(64),
    details         JSONB
);

COMMIT;
