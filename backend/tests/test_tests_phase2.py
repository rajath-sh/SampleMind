"""
Comprehensive Rigorous Verification Suite for Tests Module: Phase 2 Scientifically Useful Features
===================================================================================================
Tests all 4 Phase 2 capabilities:
1. Automated Scientific QC Acceptance Criteria & Threshold Decision Engine.
2. Multi-Assay Specimen Clearance & Certificate of Analysis (CoA) Generation.
3. Statistical Quality Control & Instrument Calibration Drift Analytics (Levey-Jennings / %CV).
4. High-Throughput Batch Assay Scheduling with specimen health validation.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from datetime import datetime, timezone, timedelta
from app.common import (
    SessionLocal,
    Sample,
    SampleTest,
    SampleType,
    StorageLocation,
    SampleQuantityTransaction,
    AuditLog,
    SampleStatus,
    TestStatus,
)
from app.modules.tests.service import TestService
from app.modules.tests.schemas import (
    TestCreateRequest,
    TestUpdateRequest,
    BatchTestCreateRequest,
)


def run_phase2_tests():
    db = SessionLocal()
    print("=" * 75)
    print(" EXECUTING RIGOROUS VERIFICATION SUITE: TESTS PHASE 2 SCIENTIFIC FEATURES")
    print("=" * 75)

    created_samples: list[Sample] = []
    created_tests: list[SampleTest] = []

    def make_sample(status=SampleStatus.IN_STORAGE.value, qty=50.0, unit="mg"):
        st = db.query(SampleType).first()
        loc = db.query(StorageLocation).filter(StorageLocation.is_active == True).first()
        code = f"SMP-P2-{uuid.uuid4().hex[:6].upper()}"
        s = Sample(
            sample_code=code,
            sample_name=f"Phase 2 Specimen {code}",
            sample_type_id=st.sample_type_id if st else 1,
            quantity_value=qty,
            quantity_unit=unit,
            sample_status=status,
            current_storage_location_id=loc.storage_location_id if loc else 1,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(s)
        db.commit()
        db.refresh(s)
        created_samples.append(s)
        return s

    try:
        # =========================================================================
        # [TEST 01] QC Acceptance Evaluation: Fluorometric dsDNA Concentration
        # =========================================================================
        # 1. High yield >= 15.0 ng/uL -> OPTIMAL
        res_opt = TestService.evaluate_qc_thresholds(
            test_type="Qubit 4 Fluorometer dsDNA High Sensitivity",
            result_value=24.8,
            result_unit="ng/uL"
        )
        assert res_opt.recommended_interpretation == "OPTIMAL"
        assert res_opt.compliance_level == "ACCEPTABLE"
        assert res_opt.confidence_score >= 95.0
        assert "Illumina NovaSeq" in res_opt.reference_standard

        # 2. Standard yield 5.0 - 15.0 ng/uL -> PASS
        res_pass = TestService.evaluate_qc_thresholds(
            test_type="Qubit 4 Fluorometer dsDNA",
            result_value=8.4,
            result_unit="ng/uL"
        )
        assert res_pass.recommended_interpretation == "PASS"
        assert res_pass.compliance_level == "ACCEPTABLE"

        # 3. Marginal yield 1.5 - 5.0 ng/uL -> BORDERLINE
        res_bord = TestService.evaluate_qc_thresholds(
            test_type="Qubit Fluorometer",
            result_value=2.3,
            result_unit="ng/uL"
        )
        assert res_bord.recommended_interpretation == "BORDERLINE"
        assert res_bord.compliance_level == "CONDITIONAL"

        # 4. Deficient yield < 1.5 ng/uL -> FAIL
        res_fail = TestService.evaluate_qc_thresholds(
            test_type="Qubit Fluorometer",
            result_value=0.5,
            result_unit="ng/uL"
        )
        assert res_fail.recommended_interpretation == "FAIL"
        assert res_fail.compliance_level == "REJECTED"

        print("[PASS 01] Automated scientific QC acceptance evaluation verified for Fluorometric Concentration.")

        # =========================================================================
        # [TEST 02] QC Acceptance Evaluation: DNA Integrity Number & Microbial Screen
        # =========================================================================
        # 1. TapeStation DIN >= 7.0 -> OPTIMAL
        res_din_opt = TestService.evaluate_qc_thresholds(
            test_type="TapeStation 4200 Genomic DNA DIN Integrity Score",
            result_value=8.6,
            result_unit="DIN"
        )
        assert res_din_opt.recommended_interpretation == "OPTIMAL"
        assert res_din_opt.compliance_level == "ACCEPTABLE"

        # 2. Severe shearing DIN < 2.5 -> FAIL
        res_din_fail = TestService.evaluate_qc_thresholds(
            test_type="TapeStation DIN",
            result_value=1.9,
            result_unit="DIN"
        )
        assert res_din_fail.recommended_interpretation == "FAIL"
        assert res_din_fail.compliance_level == "REJECTED"

        # 3. Microbial 16S screen < 50 -> OPTIMAL
        res_16s_clean = TestService.evaluate_qc_thresholds(
            test_type="qPCR Ancient DNA 16S Environmental Bacterial Screen",
            result_value=18.0,
            result_unit="copies/uL"
        )
        assert res_16s_clean.recommended_interpretation == "OPTIMAL"
        assert res_16s_clean.compliance_level == "ACCEPTABLE"

        # 4. Microbial 16S screen >= 500 -> CONTAMINATED
        res_16s_contam = TestService.evaluate_qc_thresholds(
            test_type="qPCR Ancient DNA 16S Bacterial Screen",
            result_value=840.0,
            result_unit="copies/uL"
        )
        assert res_16s_contam.recommended_interpretation == "CONTAMINATED"
        assert res_16s_contam.compliance_level == "REJECTED"

        print("[PASS 02] Automated scientific QC acceptance evaluation verified for DIN & Bacterial Screen.")

        # =========================================================================
        # [TEST 03] Multi-Assay Clearance & CoA: Specimen Certified for Study Release
        # =========================================================================
        s_clean = make_sample(qty=60.0)

        # Assay 1: Yield (PASS)
        t1 = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_clean.sample_id,
                test_type="Qubit 4 Fluorometer dsDNA High Sensitivity",
                test_status="completed",
                result_value=22.4,
                result_unit="ng/uL",
                result_interpretation="OPTIMAL",
                observation="Standard curve verified. High quality yield."
            ),
            actor_id=1
        )
        created_tests.append(t1)

        # Assay 2: Integrity (PASS)
        t2 = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_clean.sample_id,
                test_type="TapeStation 4200 DIN Integrity Score",
                test_status="completed",
                result_value=7.8,
                result_unit="DIN",
                result_interpretation="OPTIMAL",
                observation="High molecular weight band intact."
            ),
            actor_id=1
        )
        created_tests.append(t2)

        # Assay 3: Sterility (PASS)
        t3 = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_clean.sample_id,
                test_type="qPCR Ancient DNA 16S Environmental Bacterial Screen",
                test_status="completed",
                result_value=24.0,
                result_unit="copies/uL",
                result_interpretation="OPTIMAL",
                observation="Negligible background noise."
            ),
            actor_id=1
        )
        created_tests.append(t3)

        dossier_clean = TestService.get_specimen_clearance(db=db, sample_id=s_clean.sample_id)
        assert dossier_clean.clearance_status == "RELEASED_FOR_STUDY"
        assert dossier_clean.can_release is True
        assert dossier_clean.total_tests_conducted == 3
        assert dossier_clean.passed_tests_count == 3
        assert dossier_clean.failed_tests_count == 0
        assert dossier_clean.quality_specifications_met is True
        assert dossier_clean.certificate_id.startswith(f"COA-{s_clean.sample_code}-")

        print("[PASS 03] Multi-assay Certificate of Analysis (CoA) verified for study release approval.")

        # =========================================================================
        # [TEST 04] Multi-Assay Clearance & CoA: QC Hold on Contaminated / Failed Assay
        # =========================================================================
        s_failed = make_sample(qty=40.0)

        # Assay 1: Passed concentration
        TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_failed.sample_id,
                test_type="Qubit 4 Fluorometer dsDNA",
                test_status="completed",
                result_value=19.2,
                result_unit="ng/uL",
                result_interpretation="PASS"
            ),
            actor_id=1
        )

        # Assay 2: Contaminated QC screen -> Triggers QC failure
        TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_failed.sample_id,
                test_type="qPCR Ancient DNA 16S Bacterial Screen",
                test_status="completed",
                result_value=1250.0,
                result_unit="copies/uL",
                result_interpretation="CONTAMINATED"
            ),
            actor_id=1
        )

        dossier_failed = TestService.get_specimen_clearance(db=db, sample_id=s_failed.sample_id)
        assert dossier_failed.clearance_status in ("REJECTED_QC_HOLD", "QC_HOLD_QUARANTINED")
        assert dossier_failed.can_release is False
        assert dossier_failed.failed_tests_count >= 1
        assert dossier_failed.quality_specifications_met is False

        print("[PASS 04] Multi-assay clearance correctly imposes QC hold on contaminated specimen.")

        # =========================================================================
        # [TEST 05] Statistical QC & Instrument Calibration Drift Monitoring
        # =========================================================================
        # Schedule and complete 5 runs with stable readings
        inst_test_name = "Levey-Jennings Precision Verification Qubit HS"
        s_drift = make_sample(qty=100.0)

        past_req = datetime.now(timezone.utc) - timedelta(minutes=20)
        past_perf = datetime.now(timezone.utc) - timedelta(minutes=10)
        for reading in [20.1, 20.4, 19.8, 20.2, 20.0]:
            TestService.create_test(
                db=db,
                req=TestCreateRequest(
                    sample_id=s_drift.sample_id,
                    test_type=inst_test_name,
                    test_status="completed",
                    result_value=reading,
                    result_unit="ng/uL",
                    result_interpretation="PASS",
                    requested_at=past_req,
                    performed_at=past_perf
                ),
                actor_id=1
            )

        drift_reports = TestService.get_instrument_drift_analytics(db=db)
        target_report = next((r for r in drift_reports if r.test_type == inst_test_name), None)
        assert target_report is not None
        assert target_report.run_count >= 5
        assert 19.5 <= target_report.mean_value <= 20.5
        assert target_report.coeff_of_variation_pct < 5.0  # Highly stable %CV
        assert target_report.control_status == "STABLE"

        print("[PASS 05] Statistical quality control analytics (%CV, mean, std dev, Levey-Jennings) verified.")

        # =========================================================================
        # [TEST 06] High-Throughput Batch Assay Scheduling
        # =========================================================================
        s_b1 = make_sample(qty=25.0)
        s_b2 = make_sample(qty=30.0)
        s_b3 = make_sample(qty=15.0)

        # Batch schedule 3 specimens simultaneously
        batch_req = BatchTestCreateRequest(
            sample_ids=[s_b1.sample_id, s_b2.sample_id, s_b3.sample_id],
            test_type="Agilent Bioanalyzer 2100 DNA 1000 Fragment Sizing",
            batch_run_identifier="BATCH-RUN-OCTA-96-01",
            quantity_consumed_per_sample=2.0,
            result_unit="bp",
            observation="Batch library verification run on 16-capillary array."
        )

        batch_res = TestService.create_batch_tests(db=db, req=batch_req, actor_id=1)
        assert batch_res.scheduled_count == 3
        assert batch_res.skipped_count == 0
        assert len(batch_res.created_tests) == 3
        assert batch_res.batch_run_identifier == "BATCH-RUN-OCTA-96-01"

        # Verify stock deducted across all 3 specimens (25->23, 30->28, 15->13)
        db.refresh(s_b1)
        db.refresh(s_b2)
        db.refresh(s_b3)
        assert float(s_b1.quantity_value) == 23.0
        assert float(s_b2.quantity_value) == 28.0
        assert float(s_b3.quantity_value) == 13.0

        print("[PASS 06] High-throughput batch assay scheduling with atomic stock deduction verified.")

        # =========================================================================
        # [TEST 07] Batch Assay Scheduling with Mixed Inactive & Overdraft Samples
        # =========================================================================
        s_disposed = make_sample(status=SampleStatus.DISPOSED.value, qty=0.0)
        s_limited = make_sample(status=SampleStatus.IN_STORAGE.value, qty=1.0)
        s_valid = make_sample(status=SampleStatus.IN_STORAGE.value, qty=50.0)

        mixed_batch = BatchTestCreateRequest(
            sample_ids=[s_disposed.sample_id, s_limited.sample_id, s_valid.sample_id],
            test_type="Qubit Fluorometer Batch Assay #2",
            quantity_consumed_per_sample=5.0
        )

        mixed_res = TestService.create_batch_tests(db=db, req=mixed_batch, actor_id=1)
        assert mixed_res.scheduled_count == 1  # Only s_valid succeeds
        assert mixed_res.skipped_count == 2    # s_disposed (invalid status) and s_limited (overdraft)

        skipped_codes = [s.error_code for s in mixed_res.skipped_samples]
        assert "INVALID_SAMPLE_STATUS" in skipped_codes
        assert "STOCK_OVERDRAFT" in skipped_codes

        print("[PASS 07] Batch assay scheduling robustly isolates specimen failures without aborting valid items.")

        print("=" * 75)
        print(" [ALL 7 PHASE 2 SCIENTIFIC FEATURE TESTS PASSED 100%!] ")
        print("=" * 75)

    finally:
        # Cleanup
        for s in created_samples:
            db.query(SampleTest).filter(SampleTest.sample_id == s.sample_id).delete()
            db.query(SampleQuantityTransaction).filter(SampleQuantityTransaction.sample_id == s.sample_id).delete()
            db.query(AuditLog).filter(AuditLog.entity_id == s.sample_id, AuditLog.entity_type == "Sample").delete()
            db.query(Sample).filter(Sample.sample_id == s.sample_id).delete()
        db.commit()
        db.close()


if __name__ == "__main__":
    run_phase2_tests()
