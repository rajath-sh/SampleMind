"""
Unit & Service Tests for Module 9: AI Risk Advisory Subsystem (Step 9A)
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from app.common import (
    SessionLocal,
    EntityNotFoundException,
    Sample,
    SampleType,
    StorageLocation,
    Incident,
    AppUser,
    AuditLog,
)
from app.modules.ai_analysis.service import AIAnalysisService
from app.modules.ai_analysis.schemas import AIReviewRequest


def run_tests():
    db = SessionLocal()
    print("=" * 65)
    print(" Executing Step 9A Service Tests for Module 9: AI Risk Advisory")
    print("=" * 65)

    try:
        user = db.query(AppUser).first()
        s_type = db.query(SampleType).first()
        loc = db.query(StorageLocation).first()
        assert user is not None and s_type is not None

        # -------------------------------------------------------------
        # Test 1: Active Model Metadata Inspection
        # -------------------------------------------------------------
        model_info = AIAnalysisService.get_active_model_info(db)
        assert model_info.model_name == "Specimen Handling Rules"
        assert model_info.is_active is True
        assert model_info.metrics == {"method": "deterministic_rules"}
        print(f"[PASS] Test 01: Active handling method verified ({model_info.model_name} {model_info.model_version}).")

        # -------------------------------------------------------------
        # Test 2: AI Risk Prediction on Stable Pristine Specimen
        # -------------------------------------------------------------
        stable_sample = Sample(
            sample_code=f"S-AI-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Ultra-Pure Cryopreserved Plasmid",
            sample_type_id=s_type.sample_type_id,
            quantity_value=250.0,
            quantity_unit="µL",
            sample_status="IN_STORAGE",
            current_storage_location_id=loc.storage_location_id if loc else None,
            created_by=user.user_id,
        )
        db.add(stable_sample)
        db.commit()
        db.refresh(stable_sample)

        res_stable = AIAnalysisService.predict_sample_risk(db, stable_sample.sample_id, actor_id=user.user_id)
        assert res_stable.sample_id == stable_sample.sample_id
        assert res_stable.predicted_risk in ("LOW", "MEDIUM", "HIGH")
        assert res_stable.confidence is None and res_stable.class_probabilities == {}
        assert len(res_stable.important_factors) >= 1
        print(f"[PASS] Test 02: Inferred risk for {stable_sample.sample_code}: {res_stable.predicted_risk}.")

        # -------------------------------------------------------------
        # Test 3: AI Risk Prediction on Severely Compromised Specimen
        # -------------------------------------------------------------
        hazard_sample = Sample(
            sample_code=f"S-AI-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Compromised Viral Culture",
            sample_type_id=s_type.sample_type_id,
            quantity_value=2.0,  # Critical depletion
            quantity_unit="µL",
            sample_status="QUARANTINED",  # Active quarantine
            created_by=user.user_id,
        )
        db.add(hazard_sample)
        db.commit()
        db.refresh(hazard_sample)

        # Log a critical incident on this sample
        crit_inc = Incident(
            incident_code=f"INC-AI-{uuid.uuid4().hex[:6].upper()}",
            sample_id=hazard_sample.sample_id,
            incident_type="contamination",
            severity="critical",
            description="Active spore breach in culture vial.",
            occurred_at=hazard_sample.registered_at,
            reported_by=user.user_id,
        )
        db.add(crit_inc)
        db.commit()

        res_hazard = AIAnalysisService.predict_sample_risk(db, hazard_sample.sample_id, actor_id=user.user_id)
        assert res_hazard.predicted_risk == "HIGH", f"Expected HIGH risk for quarantined sample, got {res_hazard.predicted_risk}"
        assert res_hazard.confidence is None
        # Verify quarantine/critical factor is present in top factors
        factor_names = [f.factor for f in res_hazard.important_factors]
        assert "Specimen status" in factor_names
        print("[PASS] Test 03: Quarantined specimen classified as HIGH priority.")

        # -------------------------------------------------------------
        # Test 4: Non-existent sample ID returns EntityNotFoundException
        # -------------------------------------------------------------
        bad_sample_raised = False
        try:
            AIAnalysisService.predict_sample_risk(db, 999999, actor_id=user.user_id)
        except EntityNotFoundException:
            bad_sample_raised = True
        assert bad_sample_raised, "Expected EntityNotFoundException on invalid sample"
        print("[PASS] Test 04: Non-existent sample ID correctly rejected.")

        # -------------------------------------------------------------
        # Test 5: Human-in-the-Loop Review Confirmation
        # -------------------------------------------------------------
        review_req = AIReviewRequest(
            review_feedback="agree",
            review_notes="Cross-checked fluorometric readings and thermal log. AI advisory assessment confirmed."
        )
        reviewed_res = AIAnalysisService.review_analysis(
            db,
            res_hazard.ai_analysis_id,
            review_req,
            reviewer_id=user.user_id
        )
        assert reviewed_res.reviewed_by == user.user_id
        assert reviewed_res.review_feedback == "agree"
        assert "Cross-checked" in reviewed_res.review_notes
        assert reviewed_res.reviewed_at is not None
        print("[PASS] Test 05: Human-in-the-loop review confirmation persisted with audit trail.")

        # -------------------------------------------------------------
        # Test 6: Human-in-the-Loop Review Override (Disagree)
        # -------------------------------------------------------------
        override_req = AIReviewRequest(
            review_feedback="disagree",
            review_notes="Electrophoretic bioanalyzer gel shows intact high-molecular-weight band. Override to monitoring."
        )
        override_res = AIAnalysisService.review_analysis(
            db,
            res_stable.ai_analysis_id,
            override_req,
            reviewer_id=user.user_id
        )
        assert override_res.review_feedback == "disagree"
        print("[PASS] Test 06: Human-in-the-loop researcher override persisted successfully.")

        # -------------------------------------------------------------
        # Test 7: Historical Analyses Query for Sample
        # -------------------------------------------------------------
        history = AIAnalysisService.get_sample_analyses(db, hazard_sample.sample_id)
        assert len(history) >= 1
        assert history[0].ai_analysis_id == res_hazard.ai_analysis_id
        print(f"[PASS] Test 07: Retrieved {len(history)} historical risk evaluation(s) for sample.")

        # -------------------------------------------------------------
        # Test 8: Aggregate Risk Distribution Summary
        # -------------------------------------------------------------
        distribution = AIAnalysisService.get_risk_distribution(db)
        assert distribution.total_samples >= 2
        assert distribution.assessed_samples >= 2
        assert distribution.counts["HIGH"] >= 1
        print(f"[PASS] Test 08: Global risk distribution: LOW={distribution.counts['LOW']}, MED={distribution.counts['MEDIUM']}, HIGH={distribution.counts['HIGH']} (Total evaluated: {distribution.assessed_samples}).")

        # -------------------------------------------------------------
        # Test 9: Audit Log Persistence
        # -------------------------------------------------------------
        audit_predict = db.query(AuditLog).filter(
            AuditLog.entity_type == "AIAnalysis",
            AuditLog.action == "AI_PREDICT"
        ).first()
        audit_review = db.query(AuditLog).filter(
            AuditLog.entity_type == "AIAnalysis",
            AuditLog.action == "AI_REVIEW"
        ).first()
        assert audit_predict is not None, "Expected AI_PREDICT in AuditLog"
        assert audit_review is not None, "Expected AI_REVIEW in AuditLog"
        print("[PASS] Test 09: Verified AI_PREDICT and AI_REVIEW compliance audit records.")

        print("=" * 65)
        print(" [ALL 9 STEP 9A SERVICE TESTS PASSED 100%!]")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
