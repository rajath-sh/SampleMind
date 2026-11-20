-- ==============================================================================
-- 05_seed.sql: Clean Baseline Demonstration Dataset
-- Project: AI-Assisted Biological Sample Testing, Lineage & Experiment Management
-- Lineage Path: S001 (Bone) -> S002 (Powder) -> S003 (DNA Extract) -> EXP-001 -> RES-001
-- ==============================================================================

BEGIN;

-- 1. AppUser: System Roles (Passwords hashed with bcrypt: 'password123')
-- Bcrypt hash for 'password123': $2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW
INSERT INTO "AppUser" (display_name, email, password_hash, role, is_active) VALUES
('Dr. Rajath V Shanbhogue', 'rajath.vs@rvce.edu.in', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'ADMIN', TRUE),
('Siddhanth K Jain',        'siddhanth.kj@rvce.edu.in', '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'RESEARCHER', TRUE),
('Vishwas Y K',            'vishwas.yk@rvce.edu.in',   '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'TECHNICIAN', TRUE),
('Dr. Senior Reviewer',    'reviewer@rvce.edu.in',     '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'REVIEWER', TRUE),
('Auditor Inspector',      'auditor@rvce.edu.in',      '$2b$12$EixZaYVK1fsbw1ZfbX3OXePaWxn96p36WQoeG6Lruj3vjPGga31lW', 'VIEWER', TRUE);

-- 2. SampleType: Standardized Biological & Archaeological Categories
INSERT INTO "SampleType" (type_code, type_name, description, is_active) VALUES
('ARCH-BONE', 'Ancient Skeletal Bone',    'Archaeological fossilized skeletal bone matrix', TRUE),
('BONE-PWD',  'Pulverized Bone Powder',   'Cryogenically milled bone powder', TRUE),
('DNA-EXT',   'Purified DNA Extract',     'Purified double-stranded genomic DNA extract', TRUE),
('RNA-EXT',   'Purified RNA Extract',     'Total cellular or viral RNA extract', TRUE),
('TISSUE',    'Soft Biological Tissue',   'Mammalian or organismal soft tissue biopsy', TRUE),
('BLOOD-WHL', 'Whole Blood',              'Anticoagulated whole blood specimen', TRUE),
('MICROBIAL', 'Bacterial Culture Strain', 'Microbial strain isolate', TRUE);

-- 3. StorageLocation: Multi-Tier Storage Locations
INSERT INTO "StorageLocation" (location_code, facility, room, unit_type, unit_label, rack, box, slot, temperature_min_c, temperature_max_c, is_active) VALUES
('LOC-FRZ80-A1', 'Central Genomics Wing', 'Room-104', 'freezer', 'UltraLow-Freezer-80A', 'RACK-01', 'BOX-01', 'SLOT-A1', -85.00, -75.00, TRUE),
('LOC-FRZ20-B2', 'Clean Bone Processing Lab', 'Room-102', 'freezer', 'Freezer-Minus20B', 'RACK-02', 'BOX-04', 'SLOT-B2', -22.00, -18.00, TRUE),
('LOC-CAB04-C1', 'Ambient Specimen Room', 'Room-101', 'cabinet', 'Dry-Storage-Cab-04', 'SHELF-01', 'TRAY-01', 'SLOT-01', 18.00, 24.00, TRUE);

-- 4. ArchaeologicalSite: Provenance of Ancient Specimens
INSERT INTO "ArchaeologicalSite" (site_code, site_name, region, country, context_notes) VALUES
('SITE-RKG-01', 'Rakhigarhi Necropolis Mound 4', 'Hisar District, Haryana', 'India', 'Indus Valley Civilization Mature Harappan phase cemetery excavation');

-- 5. Equipment: Lab Instruments and Calibration Chronology
INSERT INTO "Equipment" (equipment_code, equipment_name, manufacturer, model_number, equipment_status, last_calibrated_at, calibration_due_at, notes) VALUES
('EQ-SEQ-001', 'Illumina NovaSeq 6000', 'Illumina Inc.', 'NovaSeq-6000', 'available', '2026-06-01 00:00:00+00', '2027-06-01 00:00:00+00', 'High-throughput sequencing platform in Clean Wing'),
('EQ-QUB-001', 'Qubit 4 Fluorometer', 'Thermo Fisher', 'Qubit-4', 'available', '2026-08-15 00:00:00+00', '2027-08-15 00:00:00+00', 'Fluorometric nucleic acid quantification');

-- 6. Sample: Root Bone (S001) -> Derived Powder (S002) -> Derived DNA Extract (S003)
INSERT INTO "Sample" (sample_code, sample_name, sample_type_id, source_description, collected_at, registered_at, quantity_value, quantity_unit, sample_status, current_storage_location_id, created_by, notes) VALUES
('S001', 'Ancient Petrous Bone RKG-H4', 1, 'Homo sapiens petrous temporal pyramid excavation', '2025-10-15 00:00:00+00', '2026-01-05 09:30:00+00', 1250.0000, 'mg', 'IN_STORAGE', 2, 1, 'Pristine ancient petrous pyramid'),
('S002', 'Petrous Bone Powder Aliquot', 2, 'Cryo-milled powder from S001', '2026-01-10 11:00:00+00', '2026-01-10 11:15:00+00', 250.0000, 'mg', 'IN_STORAGE', 2, 2, 'Milled in clean bench under liquid nitrogen cooling'),
('S003', 'Purified Ancient DNA Extract', 3, 'Silica column extract from S002', '2026-01-15 14:00:00+00', '2026-01-15 14:45:00+00', 50.0000, 'uL', 'IN_STORAGE', 1, 2, 'Ancient DNA extract prepared using Dabney protocol');

-- 7. AncientSpecimen: Subtype extension for S001
INSERT INTO "AncientSpecimen" (sample_id, archaeological_site_id, estimated_age_years, age_uncertainty_years, dating_method, excavation_layer, depth_cm, preservation_state, context_reference) VALUES
(1, 1, 4600, 60, 'AMS_Radiocarbon_14C', 'Stratum IIIb (Harappan Burial Grave 14)', 240.50, 'Moderate', 'Permit ASI/EXC/2025/RKG-44');

-- 8. SampleRelationship: Provenance Lineage Edges (S001 -> S002 -> S003)
INSERT INTO "SampleRelationship" (parent_sample_id, child_sample_id, transformation_type, transformed_at, quantity_transferred, quantity_unit, recorded_by, notes) VALUES
(1, 2, 'Pulverization', '2026-01-10 11:00:00+00', 250.0000, 'mg', 3, 'Pulverized 250mg of petrous bone into fine bone powder'),
(2, 3, 'Extraction',    '2026-01-15 14:00:00+00', 100.0000, 'mg', 2, 'Phenol-free silica extraction yielded 50uL aDNA extract');

-- 9. SampleTest: Quality Control Assays
INSERT INTO "SampleTest" (sample_id, test_type, requested_at, performed_at, performed_by, test_status, observation, result_value, result_unit, result_interpretation) VALUES
(3, 'Fluorometric dsDNA Concentration', '2026-01-16 09:00:00+00', '2026-01-16 10:15:00+00', 2, 'completed', 'Clean fluorometric read', 4.820000, 'ng/uL', 'Pass'),
(3, 'NanoDrop Purity A260/A280',        '2026-01-16 09:00:00+00', '2026-01-16 10:30:00+00', 2, 'completed', 'Typical ancient extract ratio', 1.840000, 'ratio', 'Pass');

-- 10. RestrictedMaterial: Biohazard and Cultural Sensitivity Classification
INSERT INTO "RestrictedMaterial" (sample_id, restriction_type, risk_level, access_level, classification_basis, status, reviewed_by) VALUES
(1, 'Heritage_Protected_Specimen', 'medium', 'restricted', 'National Archaeological Heritage Remains', 'active', 1);

-- 11. Experiment & Junctions: Using S003 in Paleogenomic Sequencing
INSERT INTO "Experiment" (experiment_code, experiment_name, objective, protocol_reference, created_by, lead_researcher_id, planned_start, planned_end, actual_start, actual_end, status) VALUES
('EXP-2026-001', 'Shotgun Paleogenomic WGS Run #1', 'High-throughput sequencing of ancient human genomic DNA', 'SOP-ADNA-WGS-2026', 1, 2, '2026-01-20 09:00:00+00', '2026-01-22 18:00:00+00', '2026-01-20 09:30:00+00', '2026-01-22 17:45:00+00', 'completed');

INSERT INTO "ExperimentSample" (experiment_id, sample_id, usage_role, quantity_used, quantity_unit, notes) VALUES
(1, 3, 'input', 20.0000, 'uL', '20uL aliquot used for library preparation');

INSERT INTO "ExperimentEquipment" (experiment_id, equipment_id, usage_start, usage_end, usage_notes) VALUES
(1, 1, '2026-01-20 10:00:00+00', '2026-01-22 16:00:00+00', 'NovaSeq paired-end 2x150bp run');

-- 12. ExperimentResult: Scientific Output Generated by Experiment
INSERT INTO "ExperimentResult" (experiment_id, result_code, result_title, observation, result_value, result_unit, interpretation, recorded_by, is_final) VALUES
(1, 'RES-EXP001-01', 'Endogenous DNA Genome Coverage', 'Authentic ancient human deamination pattern confirmed at 5-prime and 3-prime terminal ends', 2.840000, 'fold_coverage', 'Valid authentic ancient genome confirmed', 2, TRUE);

-- 13. Incident: Temperature Excursion Incident on Freezer Unit
INSERT INTO "Incident" (incident_code, storage_location_id, incident_type, severity, description, occurred_at, reported_by, status, resolution_notes) VALUES
('INC-2026-001', 2, 'temperature_excursion', 'low', 'Freezer temperature briefly rose to -15C during power switchover', '2026-01-18 03:00:00+00', 3, 'mitigated', 'Backup generator engaged; temperature restored within 25 minutes');

COMMIT;
