"""
Unit & Service Tests for Module 8: Laboratory Incidents & Blast Radius Tracing (Step 8A)
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from datetime import datetime, timezone
from app.common import (
    SessionLocal,
    DuplicateEntityException,
    EntityNotFoundException,
    Sample,
    SampleType,
    SampleRelationship,
    Experiment,
    ExperimentSample,
    ExperimentResult,
    AppUser,
    AuditLog,
)
from app.modules.incidents.service import IncidentService
from app.modules.incidents.schemas import (
    IncidentCreateRequest,
    IncidentUpdateRequest,
)


def run_tests():
    db = SessionLocal()
    print("=" * 65)
    print(" Executing Step 8A Service Tests for Module 8: Incidents & Blast Radius")
    print("=" * 65)

    try:
        user = db.query(AppUser).first()
        s_type = db.query(SampleType).first()
        assert user is not None and s_type is not None

        # Helper: Create base sample
        sample_a = Sample(
            sample_code=f"S-INC-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Mastodon Cortical Bone Core",
            sample_type_id=s_type.sample_type_id,
            quantity_value=80.0,
            quantity_unit="mg",
            sample_status="IN_STORAGE",
            created_by=user.user_id,
        )
        db.add(sample_a)
        db.commit()
        db.refresh(sample_a)

        # -------------------------------------------------------------
        # Test 1: Create standard low-severity incident
        # -------------------------------------------------------------
        inc_code_1 = f"INC-{uuid.uuid4().hex[:6].upper()}"
        req_1 = IncidentCreateRequest(
            incident_code=inc_code_1,
            sample_id=sample_a.sample_id,
            incident_type="handling_issue",
            severity="low",
            description="Minor seal looseness detected during routine inspection.",
            occurred_at=datetime.now(timezone.utc),
            assigned_to=user.user_id,
        )
        created_1 = IncidentService.create_incident(db, req_1, reporter_id=user.user_id)
        assert created_1.incident_code == inc_code_1
        assert created_1.status == "open"
        assert created_1.severity == "low"
        # Low severity does NOT trigger quarantine
        db.refresh(sample_a)
        assert sample_a.sample_status == "IN_STORAGE"
        print(f"[PASS] Test 01: Created low-severity incident {inc_code_1} (sample status preserved).")

        # -------------------------------------------------------------
        # Test 2: Duplicate incident code rejected
        # -------------------------------------------------------------
        dup_raised = False
        try:
            IncidentService.create_incident(db, req_1, reporter_id=user.user_id)
        except DuplicateEntityException:
            dup_raised = True
        assert dup_raised, "Expected DuplicateEntityException on duplicate code"
        print("[PASS] Test 02: Duplicate incident code rejected with DuplicateEntityException.")

        # -------------------------------------------------------------
        # Test 3: Non-existent sample ID rejected
        # -------------------------------------------------------------
        bad_sample_raised = False
        try:
            IncidentService.create_incident(
                db,
                IncidentCreateRequest(
                    incident_code=f"INC-{uuid.uuid4().hex[:6].upper()}",
                    sample_id=999999,
                    incident_type="contamination",
                    severity="high",
                    description="Non-existent sample test description",
                    occurred_at=datetime.now(timezone.utc),
                ),
                reporter_id=user.user_id
            )
        except EntityNotFoundException:
            bad_sample_raised = True
        assert bad_sample_raised, "Expected EntityNotFoundException on invalid sample"
        print("[PASS] Test 03: Non-existent sample rejected with EntityNotFoundException.")

        # -------------------------------------------------------------
        # Test 4: Automated Critical Sample Quarantine Trigger
        # -------------------------------------------------------------
        sample_b = Sample(
            sample_code=f"S-INC-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Ancient Mycobacterial Isolate",
            sample_type_id=s_type.sample_type_id,
            quantity_value=25.0,
            quantity_unit="µL",
            sample_status="IN_STORAGE",
            created_by=user.user_id,
        )
        db.add(sample_b)
        db.commit()
        db.refresh(sample_b)

        inc_code_crit = f"INC-{uuid.uuid4().hex[:6].upper()}"
        req_crit = IncidentCreateRequest(
            incident_code=inc_code_crit,
            sample_id=sample_b.sample_id,
            incident_type="contamination",
            severity="critical",
            description="Severe fungal spore breach observed on cryo-vial cap threads.",
            occurred_at=datetime.now(timezone.utc),
            assigned_to=user.user_id,
        )
        created_crit = IncidentService.create_incident(db, req_crit, reporter_id=user.user_id)
        assert created_crit.severity == "critical"
        # Sample MUST now be automatically QUARANTINED!
        db.refresh(sample_b)
        assert sample_b.sample_status == "QUARANTINED", f"Expected QUARANTINED, got {sample_b.sample_status}"

        # Verify audit log recorded
        audit = db.query(AuditLog).filter(
            AuditLog.entity_type == "Sample",
            AuditLog.entity_id == sample_b.sample_id,
            AuditLog.action == "AUTOMATED_QUARANTINE"
        ).first()
        assert audit is not None, "Expected AUTOMATED_QUARANTINE audit log entry"
        print(f"[PASS] Test 04: Critical incident triggered automated QUARANTINED status for {sample_b.sample_code}.")

        # -------------------------------------------------------------
        # Test 5: Retrieve Incident Detail Dossier
        # -------------------------------------------------------------
        detail = IncidentService.get_incident_detail(db, created_crit.incident_id)
        assert detail.incident_code == inc_code_crit
        assert detail.sample_code == sample_b.sample_code
        assert detail.reported_by_name is not None
        print(f"[PASS] Test 05: Retrieved incident dossier: {detail.incident_code} (Status: {detail.status}).")

        # -------------------------------------------------------------
        # Test 6: Update Incident (CAPA & Closure)
        # -------------------------------------------------------------
        updated = IncidentService.update_incident(
            db,
            created_crit.incident_id,
            IncidentUpdateRequest(
                status="closed",
                resolution_notes="Disinfected container, isolated affected rack, confirmed no aerosol leakage."
            ),
            actor_id=user.user_id
        )
        assert updated.status == "closed"
        assert updated.closed_at is not None
        assert "Disinfected" in updated.resolution_notes
        print("[PASS] Test 06: Updated incident status to 'closed' with CAPA notes.")

        # -------------------------------------------------------------
        # Test 7: Signature Downstream Blast Radius Calculation
        # Build DAG: Parent -> Child 1 -> Grandchild 1
        # Link Child 1 to Experiment -> Link Experiment to Result
        # -------------------------------------------------------------
        # 1. Root Parent
        parent_spec = Sample(
            sample_code=f"S-BLAST-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Parent Holocene Bone Sample",
            sample_type_id=s_type.sample_type_id,
            quantity_value=500.0,
            quantity_unit="mg",
            sample_status="IN_STORAGE",
            created_by=user.user_id,
        )
        # 2. Child 1 (Derived from Parent via Aliquoting)
        child_spec = Sample(
            sample_code=f"S-BLAST-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Child Aliquot Subsample",
            sample_type_id=s_type.sample_type_id,
            quantity_value=100.0,
            quantity_unit="mg",
            sample_status="IN_USE",
            created_by=user.user_id,
        )
        # 3. Grandchild 1 (Derived from Child 1 via DNA Extraction)
        grandchild_spec = Sample(
            sample_code=f"S-BLAST-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Grandchild Purified aDNA Extract",
            sample_type_id=s_type.sample_type_id,
            quantity_value=30.0,
            quantity_unit="µL",
            sample_status="IN_STORAGE",
            created_by=user.user_id,
        )
        db.add_all([parent_spec, child_spec, grandchild_spec])
        db.commit()
        db.refresh(parent_spec)
        db.refresh(child_spec)
        db.refresh(grandchild_spec)

        # Lineage Relationships
        rel1 = SampleRelationship(
            parent_sample_id=parent_spec.sample_id,
            child_sample_id=child_spec.sample_id,
            transformation_type="Aliquoting",
            quantity_transferred=100.0,
            quantity_unit="mg",
        )
        rel2 = SampleRelationship(
            parent_sample_id=child_spec.sample_id,
            child_sample_id=grandchild_spec.sample_id,
            transformation_type="Extraction",
            quantity_transferred=20.0,
            quantity_unit="mg",
        )
        db.add_all([rel1, rel2])

        # Link Child to Experiment
        blast_exp = Experiment(
            experiment_code=f"EXP-BLAST-{uuid.uuid4().hex[:6].upper()}",
            experiment_name="High-Throughput aDNA Amplification",
            created_by=user.user_id,
            status="active",
        )
        db.add(blast_exp)
        db.flush()

        exp_sample = ExperimentSample(
            experiment_id=blast_exp.experiment_id,
            sample_id=child_spec.sample_id,
            usage_role="input",
        )
        db.add(exp_sample)

        # Record Result under Experiment
        blast_res = ExperimentResult(
            experiment_id=blast_exp.experiment_id,
            result_code=f"RES-BLAST-{uuid.uuid4().hex[:6].upper()}",
            result_title="Mitochondrial HVR-1 Fragment Yield",
            result_value=12.4,
            result_unit="ng/uL",
            interpretation="PASS",
        )
        db.add(blast_res)
        db.commit()

        # Record Incident on Root Parent Specimen
        inc_blast_code = f"INC-BLAST-{uuid.uuid4().hex[:6].upper()}"
        inc_blast = IncidentService.create_incident(
            db,
            IncidentCreateRequest(
                incident_code=inc_blast_code,
                sample_id=parent_spec.sample_id,
                incident_type="contamination",
                severity="critical",
                description="Cross-contamination detected in parent stock container during drill extraction.",
                occurred_at=datetime.now(timezone.utc),
                assigned_to=user.user_id,
                quarantine_descendants=True,  # Cascade quarantine!
            ),
            reporter_id=user.user_id
        )

        # Compute Downstream Blast Radius
        blast_report = IncidentService.get_downstream_blast_radius(db, inc_blast.incident_id)

        assert blast_report.root_sample_id == parent_spec.sample_id
        assert blast_report.total_samples_at_risk == 2, f"Expected 2 downstream samples, got {blast_report.total_samples_at_risk}"
        assert blast_report.max_generation_depth == 2, f"Expected max depth 2, got {blast_report.max_generation_depth}"
        assert len(blast_report.affected_experiments) >= 1, "Expected affected experiment"
        assert len(blast_report.affected_results) >= 1, "Expected tainted result"

        # Check cascading quarantine status
        db.refresh(child_spec)
        db.refresh(grandchild_spec)
        assert child_spec.sample_status == "QUARANTINED", "Expected child to be quarantined"
        assert grandchild_spec.sample_status == "QUARANTINED", "Expected grandchild to be quarantined"

        print(f"[PASS] Test 07: Blast radius traced: {blast_report.total_samples_at_risk} samples, {blast_report.total_experiments_compromised} experiments, {blast_report.total_results_tainted} results.")

        # -------------------------------------------------------------
        # Test 8: List incidents with filters
        # -------------------------------------------------------------
        inc_list, count = IncidentService.list_incidents(db, severity="critical")
        assert count >= 2
        print(f"[PASS] Test 08: Filtered critical incidents: retrieved {count} incident(s).")

        print("=" * 65)
        print(" [ALL 8 STEP 8A SERVICE TESTS PASSED 100%!]")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
