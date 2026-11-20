"""
Database Initialization Script
==============================
Initializes the database schema and seeds demonstration data.
Supports both SQLite (local zero-setup) and PostgreSQL (full RDBMS)
based on the `USE_SQLITE` flag in `backend/app/common/config.py` or `.env`.

Usage:
    python database/init_db.py
"""

import sys
from pathlib import Path

# Add backend directory to sys.path
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR / "backend"))

from app.common import (
    settings, engine, Base, SessionLocal,
    AppUser, SampleType, StorageLocation, ArchaeologicalSite, Equipment,
    Sample, AncientSpecimen, SampleRelationship, SampleTest, RestrictedMaterial,
    Experiment, ExperimentSample, ExperimentEquipment, ExperimentResult,
    Incident, AuditLog, SampleStorageHistory, SampleQuantityTransaction, get_password_hash
)
from datetime import datetime, timezone
from migrate_methods import normalize_assessment_methods



SQLITE_OBJECTS = (
    'CREATE INDEX IF NOT EXISTS idx_sample_type_status ON "Sample"(sample_type_id, sample_status)',
    'CREATE INDEX IF NOT EXISTS idx_sample_current_storage ON "Sample"(current_storage_location_id)',
    'CREATE INDEX IF NOT EXISTS idx_lineage_child ON "SampleRelationship"(child_sample_id)',
    'CREATE INDEX IF NOT EXISTS idx_sampletest_sample_type ON "SampleTest"(sample_id, test_type)',
    'CREATE INDEX IF NOT EXISTS idx_sample_code_upper ON "Sample"(UPPER(sample_code))',
    'CREATE INDEX IF NOT EXISTS idx_incident_status_severity ON "Incident"(status, severity, occurred_at)',
    """CREATE TRIGGER IF NOT EXISTS trg_lineage_no_cycle_insert
    BEFORE INSERT ON "SampleRelationship" FOR EACH ROW BEGIN
      SELECT RAISE(ABORT, 'LINEAGE_CYCLE') WHERE EXISTS (
        WITH RECURSIVE descendants(id) AS (
          VALUES (NEW.child_sample_id)
          UNION
          SELECT edge.child_sample_id FROM "SampleRelationship" AS edge
          JOIN descendants ON edge.parent_sample_id = descendants.id
        )
        SELECT 1 FROM descendants WHERE id = NEW.parent_sample_id
      );
    END""",
    """CREATE TRIGGER IF NOT EXISTS trg_lineage_no_cycle_update
    BEFORE UPDATE OF parent_sample_id, child_sample_id ON "SampleRelationship" FOR EACH ROW BEGIN
      SELECT RAISE(ABORT, 'LINEAGE_CYCLE') WHERE EXISTS (
        WITH RECURSIVE descendants(id) AS (
          VALUES (NEW.child_sample_id)
          UNION
          SELECT edge.child_sample_id FROM "SampleRelationship" AS edge
          JOIN descendants ON edge.parent_sample_id = descendants.id
          WHERE edge.relationship_id <> OLD.relationship_id
        )
        SELECT 1 FROM descendants WHERE id = NEW.parent_sample_id
      );
    END""",
)

def initialize_database():
    """Upgrade the schema in place, then initialize an empty database."""
    with engine.begin() as conn:
        if conn.dialect.name == "sqlite":
            conn.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            conn.exec_driver_sql("SELECT pg_advisory_xact_lock(482714)")
        normalize_assessment_methods(conn)
        Base.metadata.create_all(bind=conn)
        for statement in SQLITE_OBJECTS:
            if conn.dialect.name == "sqlite" or statement.startswith("CREATE INDEX"):
                conn.exec_driver_sql(statement)
    print("[+] Database schema ready.")

    db = SessionLocal()
    try:
        # Check if already seeded
        if db.query(AppUser).first():
            print("[i] Database already contains records. Skipping seed.")
            return

        print("[*] Seeding baseline demonstration records...")

        # 1. Users
        hashed_pwd = get_password_hash("password123")
        u1 = AppUser(display_name="Dr. Rajath V Shanbhogue", email="rajath.vs@rvce.edu.in", password_hash=hashed_pwd, role="ADMIN")
        u2 = AppUser(display_name="Siddhanth K Jain", email="siddhanth.kj@rvce.edu.in", password_hash=hashed_pwd, role="RESEARCHER")
        u3 = AppUser(display_name="Vishwas Y K", email="vishwas.yk@rvce.edu.in", password_hash=hashed_pwd, role="TECHNICIAN")
        u4 = AppUser(display_name="Dr. Senior Reviewer", email="reviewer@rvce.edu.in", password_hash=hashed_pwd, role="REVIEWER")
        u5 = AppUser(display_name="Auditor Inspector", email="auditor@rvce.edu.in", password_hash=hashed_pwd, role="VIEWER")
        db.add_all([u1, u2, u3, u4, u5])
        db.flush()

        # 2. Sample Types
        st1 = SampleType(type_code="ARCH-BONE", type_name="Ancient Skeletal Bone", description="Fossilized archaeological skeletal bone")
        st2 = SampleType(type_code="BONE-PWD", type_name="Pulverized Bone Powder", description="Cryogenically milled bone powder aliquot")
        st3 = SampleType(type_code="DNA-EXT", type_name="Purified DNA Extract", description="Purified double-stranded genomic DNA")
        st4 = SampleType(type_code="RNA-EXT", type_name="Purified RNA Extract", description="Total cellular or viral RNA extract")
        st5 = SampleType(type_code="TISSUE", type_name="Soft Biological Tissue", description="Mammalian tissue biopsy")
        st6 = SampleType(type_code="BLOOD-WHL", type_name="Whole Blood", description="Anticoagulated whole blood")
        st7 = SampleType(type_code="MICROBIAL", type_name="Bacterial Culture Strain", description="Microbial strain isolate")
        db.add_all([st1, st2, st3, st4, st5, st6, st7])
        db.flush()

        # 3. Storage Locations
        loc1 = StorageLocation(location_code="LOC-FRZ80-A1", facility="Central Genomics Wing", room="Room-104", unit_type="freezer", unit_label="UltraLow-Freezer-80A", rack="RACK-01", box="BOX-01", slot="SLOT-A1", temperature_min_c=-85.0, temperature_max_c=-75.0)
        loc2 = StorageLocation(location_code="LOC-FRZ20-B2", facility="Clean Bone Processing Lab", room="Room-102", unit_type="freezer", unit_label="Freezer-Minus20B", rack="RACK-02", box="BOX-04", slot="SLOT-B2", temperature_min_c=-22.0, temperature_max_c=-18.0)
        loc3 = StorageLocation(location_code="LOC-CAB04-C1", facility="Ambient Specimen Room", room="Room-101", unit_type="cabinet", unit_label="Dry-Storage-Cab-04", rack="SHELF-01", box="TRAY-01", slot="SLOT-01", temperature_min_c=18.0, temperature_max_c=24.0)
        db.add_all([loc1, loc2, loc3])
        db.flush()

        # 4. Archaeological Site
        site1 = ArchaeologicalSite(site_code="SITE-RKG-01", site_name="Rakhigarhi Necropolis Mound 4", region="Hisar District, Haryana", country="India", context_notes="Indus Valley Civilization Mature Harappan phase cemetery excavation")
        db.add(site1)
        db.flush()

        # 5. Equipment
        eq1 = Equipment(equipment_code="EQ-SEQ-001", equipment_name="Illumina NovaSeq 6000", manufacturer="Illumina Inc.", model_number="NovaSeq-6000", equipment_status="available", last_calibrated_at=datetime(2026, 6, 1, tzinfo=timezone.utc), calibration_due_at=datetime(2027, 6, 1, tzinfo=timezone.utc), notes="High-throughput sequencing platform in Clean Wing")
        eq2 = Equipment(equipment_code="EQ-QUB-001", equipment_name="Qubit 4 Fluorometer", manufacturer="Thermo Fisher", model_number="Qubit-4", equipment_status="available", last_calibrated_at=datetime(2026, 8, 15, tzinfo=timezone.utc), calibration_due_at=datetime(2027, 8, 15, tzinfo=timezone.utc), notes="Fluorometric nucleic acid quantification")
        db.add_all([eq1, eq2])
        db.flush()

        # 6. Samples: S001 -> S002 -> S003
        s1 = Sample(sample_code="S001", sample_name="Ancient Petrous Bone RKG-H4", sample_type_id=st1.sample_type_id, source_description="Homo sapiens petrous temporal pyramid excavation", collected_at=datetime(2025, 10, 15, tzinfo=timezone.utc), registered_at=datetime(2026, 1, 5, 9, 30, tzinfo=timezone.utc), quantity_value=1250.0, quantity_unit="mg", sample_status="IN_STORAGE", current_storage_location_id=loc2.storage_location_id, created_by=u1.user_id, notes="Pristine ancient petrous pyramid")
        s2 = Sample(sample_code="S002", sample_name="Petrous Bone Powder Aliquot", sample_type_id=st2.sample_type_id, source_description="Cryo-milled powder from S001", collected_at=datetime(2026, 1, 10, 11, 0, tzinfo=timezone.utc), registered_at=datetime(2026, 1, 10, 11, 15, tzinfo=timezone.utc), quantity_value=250.0, quantity_unit="mg", sample_status="IN_STORAGE", current_storage_location_id=loc2.storage_location_id, created_by=u2.user_id, notes="Milled in clean bench under liquid nitrogen cooling")
        s3 = Sample(sample_code="S003", sample_name="Purified Ancient DNA Extract", sample_type_id=st3.sample_type_id, source_description="Silica column extract from S002", collected_at=datetime(2026, 1, 15, 14, 0, tzinfo=timezone.utc), registered_at=datetime(2026, 1, 15, 14, 45, tzinfo=timezone.utc), quantity_value=50.0, quantity_unit="uL", sample_status="IN_STORAGE", current_storage_location_id=loc1.storage_location_id, created_by=u2.user_id, notes="Ancient DNA extract prepared using Dabney protocol")
        db.add_all([s1, s2, s3])
        db.flush()

        # 7. Ancient Specimen Subtype
        anc1 = AncientSpecimen(sample_id=s1.sample_id, archaeological_site_id=site1.archaeological_site_id, estimated_age_years=4600, age_uncertainty_years=60, dating_method="AMS_Radiocarbon_14C", excavation_layer="Stratum IIIb (Harappan Burial Grave 14)", depth_cm=240.5, preservation_state="Moderate", context_reference="Permit ASI/EXC/2025/RKG-44")
        db.add(anc1)

        # 8. Lineage Edges (S001 -> S002 -> S003)
        rel1 = SampleRelationship(parent_sample_id=s1.sample_id, child_sample_id=s2.sample_id, transformation_type="Pulverization", quantity_transferred=250.0, quantity_unit="mg", recorded_by=u3.user_id, notes="Pulverized 250mg of petrous bone into fine bone powder")
        rel2 = SampleRelationship(parent_sample_id=s2.sample_id, child_sample_id=s3.sample_id, transformation_type="Extraction", quantity_transferred=100.0, quantity_unit="mg", recorded_by=u2.user_id, notes="Phenol-free silica extraction yielded 50uL aDNA extract")
        db.add_all([rel1, rel2])

        # 9. Tests on S003
        t1 = SampleTest(sample_id=s3.sample_id, test_type="Fluorometric dsDNA Concentration", requested_at=datetime(2026, 1, 16, 9, 0, tzinfo=timezone.utc), performed_at=datetime(2026, 1, 16, 10, 15, tzinfo=timezone.utc), performed_by=u2.user_id, test_status="completed", observation="Clean fluorometric read", result_value=4.82, result_unit="ng/uL", result_interpretation="Pass")
        t2 = SampleTest(sample_id=s3.sample_id, test_type="NanoDrop Purity A260/A280", requested_at=datetime(2026, 1, 16, 9, 0, tzinfo=timezone.utc), performed_at=datetime(2026, 1, 16, 10, 30, tzinfo=timezone.utc), performed_by=u2.user_id, test_status="completed", observation="Typical ancient extract ratio", result_value=1.84, result_unit="ratio", result_interpretation="Pass")
        db.add_all([t1, t2])

        # 10. Restricted Material
        rm1 = RestrictedMaterial(sample_id=s1.sample_id, restriction_type="Heritage_Protected_Specimen", risk_level="medium", access_level="restricted", classification_basis="National Archaeological Heritage Remains", status="active", reviewed_by=u1.user_id)
        db.add(rm1)

        # 11. Experiment E101 using S003
        exp1 = Experiment(experiment_code="EXP-2026-001", experiment_name="Shotgun Paleogenomic WGS Run #1", objective="High-throughput sequencing of ancient human genomic DNA", protocol_reference="SOP-ADNA-WGS-2026", created_by=u1.user_id, lead_researcher_id=u2.user_id, planned_start=datetime(2026, 1, 20, 9, 0, tzinfo=timezone.utc), planned_end=datetime(2026, 1, 22, 18, 0, tzinfo=timezone.utc), actual_start=datetime(2026, 1, 20, 9, 30, tzinfo=timezone.utc), actual_end=datetime(2026, 1, 22, 17, 45, tzinfo=timezone.utc), status="completed")
        db.add(exp1)
        db.flush()

        es1 = ExperimentSample(experiment_id=exp1.experiment_id, sample_id=s3.sample_id, usage_role="input", quantity_used=20.0, quantity_unit="uL", notes="20uL aliquot used for library preparation")
        ee1 = ExperimentEquipment(experiment_id=exp1.experiment_id, equipment_id=eq1.equipment_id, usage_start=datetime(2026, 1, 20, 10, 0, tzinfo=timezone.utc), usage_end=datetime(2026, 1, 22, 16, 0, tzinfo=timezone.utc), usage_notes="NovaSeq paired-end 2x150bp run")
        res1 = ExperimentResult(experiment_id=exp1.experiment_id, result_code="RES-EXP001-01", result_title="Endogenous DNA Genome Coverage", observation="Authentic ancient human deamination pattern confirmed at 5-prime and 3-prime terminal ends", result_value=2.84, result_unit="fold_coverage", interpretation="Valid authentic ancient genome confirmed", recorded_by=u2.user_id, is_final=True)
        db.add_all([es1, ee1, res1])

        # 12. Incident
        inc1 = Incident(incident_code="INC-2026-001", storage_location_id=loc2.storage_location_id, incident_type="temperature_excursion", severity="low", description="Freezer temperature briefly rose to -15C during power switchover", occurred_at=datetime(2026, 1, 18, 3, 0, tzinfo=timezone.utc), reported_by=u3.user_id, status="mitigated", resolution_notes="Backup generator engaged; temperature restored within 25 minutes")
        db.add(inc1)

        for specimen in (s1, s2, s3):
            db.add(SampleStorageHistory(
                sample_id=specimen.sample_id, storage_location_id=specimen.current_storage_location_id,
                moved_at=specimen.registered_at, moved_by=specimen.created_by, reason="Demo inventory registration",
            ))
            db.add(SampleQuantityTransaction(
                sample_id=specimen.sample_id, transaction_type="INITIAL_REGISTRATION",
                quantity_delta=specimen.quantity_value, balance_after=specimen.quantity_value,
                quantity_unit=specimen.quantity_unit, performed_by=specimen.created_by,
                created_at=specimen.registered_at, notes="Opening balance for demo inventory",
            ))
            db.add(AuditLog(
                actor_user_id=specimen.created_by, entity_type="Sample", entity_id=specimen.sample_id,
                action="SAMPLE_REGISTERED", occurred_at=specimen.registered_at,
                details={"sample_code": specimen.sample_code, "storage_location_id": specimen.current_storage_location_id},
            ))
        db.flush()
        for relationship in (rel1, rel2):
            db.add(AuditLog(
                actor_user_id=relationship.recorded_by, entity_type="SampleRelationship",
                entity_id=relationship.relationship_id, action="CREATE_LINEAGE_EDGE",
                occurred_at=relationship.transformed_at, details={
                    "parent_sample_id": relationship.parent_sample_id, "child_sample_id": relationship.child_sample_id,
                    "transformation_type": relationship.transformation_type,
                },
            ))
        db.commit()
        print("[+] Seed data committed successfully.")
    except Exception as e:
        db.rollback()
        print(f"[!] Error seeding database: {e}")
        raise
    finally:
        db.close()


def main():
    print("=" * 60)
    print(" SampleMind Database Initialization Engine")
    print(f" Active Mode: {'SQLite (Zero-Setup)' if settings.USE_SQLITE else 'PostgreSQL (Production)'}")
    print("=" * 60)

    initialize_database()

    print("[OK] Database initialization complete and ready for use.")


if __name__ == "__main__":
    main()
