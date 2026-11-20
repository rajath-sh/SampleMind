"""
Verification Suite for Phase 3: Operational Intelligence
=========================================================
Tests:
1. Sample Quality & Integrity metrics calculation across database specimens.
2. Low-volume inventory filtering in list_samples.
3. Rule-based Data Integrity Alerts scanner detecting relational invariant violations.
4. Sample Readiness Assessment evaluating 5 laboratory dimensions (status, stock, storage, lineage, QC).
"""

import sys
from pathlib import Path
import uuid
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.common import SessionLocal, Sample, StorageLocation, SampleStatus, SampleTest
from app.modules.samples.service import SampleService


def run_phase3_tests():
    db = SessionLocal()
    print("=" * 75)
    print(" EXECUTING VERIFICATION SUITE: SAMPLES PHASE 3 OPERATIONAL INTELLIGENCE")
    print("=" * 75)

    test_counter = 0

    def assert_pass(msg):
        nonlocal test_counter
        test_counter += 1
        print(f"[PASS {test_counter:02d}] {msg}")

    types = SampleService.list_sample_types(db)
    sample_type = types[0]

    active_locs = db.query(StorageLocation).filter(StorageLocation.is_active == True).limit(2).all()
    assert len(active_locs) >= 1, "Need at least 1 active storage location"
    loc1 = active_locs[0]

    try:
        # ---------------------------------------------------------
        # TEST 1: Baseline Quality & Integrity Metrics
        # ---------------------------------------------------------
        initial_metrics = SampleService.get_quality_metrics(db=db, low_volume_threshold=10.0)
        assert initial_metrics.total_samples >= 0
        assert initial_metrics.low_volume_threshold == 10.0
        assert hasattr(initial_metrics, "available_samples")
        assert hasattr(initial_metrics, "quarantined_samples")
        assert hasattr(initial_metrics, "missing_samples")
        assert hasattr(initial_metrics, "depleted_samples")
        assert_pass(f"Initial metrics query: total={initial_metrics.total_samples}, available={initial_metrics.available_samples}")

        # ---------------------------------------------------------
        # TEST 2: Create Known Invariant Test Specimens
        # ---------------------------------------------------------
        uid = uuid.uuid4().hex[:6].upper()

        # Healthy high-volume specimen
        s_healthy = Sample(
            sample_code=f"SMP-P3-HLT-{uid}",
            sample_name="Healthy High-Volume Blood Specimen",
            sample_type_id=sample_type.sample_type_id,
            quantity_value=50.0,
            quantity_unit="mL",
            sample_status=SampleStatus.IN_STORAGE.value,
            current_storage_location_id=loc1.storage_location_id,
            source_description="Clinical trial donor sample cohort A",
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(s_healthy)

        # Low-volume specimen
        s_low = Sample(
            sample_code=f"SMP-P3-LOW-{uid}",
            sample_name="Low-Volume Ancient Amber Resin",
            sample_type_id=sample_type.sample_type_id,
            quantity_value=4.5,
            quantity_unit="mg",
            sample_status=SampleStatus.IN_STORAGE.value,
            current_storage_location_id=loc1.storage_location_id,
            source_description="Baltic coast excavation layer 4",
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(s_low)

        # Quarantined specimen
        s_quar = Sample(
            sample_code=f"SMP-P3-QAR-{uid}",
            sample_name="Quarantined Fungal Culture",
            sample_type_id=sample_type.sample_type_id,
            quantity_value=20.0,
            quantity_unit="mL",
            sample_status=SampleStatus.QUARANTINED.value,
            current_storage_location_id=loc1.storage_location_id,
            source_description="Suspected biological contaminant",
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(s_quar)

        # Missing specimen
        s_mis = Sample(
            sample_code=f"SMP-P3-MIS-{uid}",
            sample_name="Unaccounted Specimen Aliquot",
            sample_type_id=sample_type.sample_type_id,
            quantity_value=15.0,
            quantity_unit="mL",
            sample_status=SampleStatus.MISSING.value,
            current_storage_location_id=None,
            source_description="Lost during transport",
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(s_mis)

        # Depleted specimen
        s_dep = Sample(
            sample_code=f"SMP-P3-DEP-{uid}",
            sample_name="Exhausted Tissue Extract",
            sample_type_id=sample_type.sample_type_id,
            quantity_value=0.0,
            quantity_unit="mg",
            sample_status=SampleStatus.DEPLETED.value,
            current_storage_location_id=loc1.storage_location_id,
            source_description="Fully consumed in PCR amplification",
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(s_dep)

        db.commit()
        db.refresh(s_healthy)
        db.refresh(s_low)
        db.refresh(s_quar)
        db.refresh(s_mis)
        db.refresh(s_dep)

        # Add QC test to healthy specimen
        qc_pass = SampleTest(
            sample_id=s_healthy.sample_id,
            test_type="Spectrophotometric Purity A260/A280",
            test_status="completed",
            result_interpretation="Pass",
            observation="Ratio 1.84 within optimal DNA purity range.",
            result_value=1.84,
            result_unit="ratio",
            created_at=datetime.now(timezone.utc),
        )
        db.add(qc_pass)
        db.commit()

        # ---------------------------------------------------------
        # TEST 3: Verify Updated Metrics Increments
        # ---------------------------------------------------------
        updated_metrics = SampleService.get_quality_metrics(db=db, low_volume_threshold=10.0)
        assert updated_metrics.total_samples == initial_metrics.total_samples + 5
        assert updated_metrics.quarantined_samples >= initial_metrics.quarantined_samples + 1
        assert updated_metrics.missing_samples >= initial_metrics.missing_samples + 1
        assert updated_metrics.depleted_samples >= initial_metrics.depleted_samples + 1
        assert updated_metrics.low_volume_samples >= initial_metrics.low_volume_samples + 1
        assert_pass("Quality metrics updated accurately (+5 samples: +1 quar, +1 mis, +1 dep, +1 low-vol).")

        # ---------------------------------------------------------
        # TEST 4: Verify low_volume_only Filter in list_samples
        # ---------------------------------------------------------
        low_items, low_total = SampleService.list_samples(
            db=db,
            search=f"SMP-P3-LOW-{uid}",
            low_volume_only=True,
            low_volume_threshold=10.0
        )
        assert low_total >= 1
        assert any(item.sample_code == s_low.sample_code for item in low_items)

        # Ensure high-volume specimen is NOT returned when low_volume_only is active
        high_items, high_total = SampleService.list_samples(
            db=db,
            search=f"SMP-P3-HLT-{uid}",
            low_volume_only=True,
            low_volume_threshold=10.0
        )
        assert high_total == 0
        assert_pass("low_volume_only filter correctly isolates low-stock specimens (<= 10.0 units).")

        # ---------------------------------------------------------
        # TEST 5: Verify Rule-Based Data Integrity Alerts
        # ---------------------------------------------------------
        # Introduce specific invariant violations for testing
        # 1. Stored specimen without storage location
        s_no_loc = Sample(
            sample_code=f"SMP-P3-ANOM1-{uid}",
            sample_name="Anomaly 1: IN_STORAGE but missing location",
            sample_type_id=sample_type.sample_type_id,
            quantity_value=25.0,
            quantity_unit="mL",
            sample_status=SampleStatus.IN_STORAGE.value,
            current_storage_location_id=None,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(s_no_loc)

        # 2. Marked DEPLETED but has positive remaining quantity
        s_dep_pos = Sample(
            sample_code=f"SMP-P3-ANOM2-{uid}",
            sample_name="Anomaly 2: DEPLETED with positive quantity",
            sample_type_id=sample_type.sample_type_id,
            quantity_value=30.0,
            quantity_unit="mg",
            sample_status=SampleStatus.DEPLETED.value,
            current_storage_location_id=loc1.storage_location_id,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(s_dep_pos)

        # 3. Marked active but zero quantity
        s_active_zero = Sample(
            sample_code=f"SMP-P3-ANOM3-{uid}",
            sample_name="Anomaly 3: IN_STORAGE with 0 quantity",
            sample_type_id=sample_type.sample_type_id,
            quantity_value=0.0,
            quantity_unit="mL",
            sample_status=SampleStatus.IN_STORAGE.value,
            current_storage_location_id=loc1.storage_location_id,
            registered_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(s_active_zero)

        db.commit()

        alerts_report = SampleService.get_integrity_alerts(db=db)
        assert alerts_report.total_alerts >= 3
        rule_codes = {a.rule_code for a in alerts_report.alerts}
        assert "IN_STORAGE_MISSING_LOCATION" in rule_codes
        assert "DEPLETED_WITH_POSITIVE_QTY" in rule_codes
        assert "ZERO_QTY_IN_ACTIVE_STATUS" in rule_codes

        # Check alert details
        no_loc_alert = next(a for a in alerts_report.alerts if a.rule_code == "IN_STORAGE_MISSING_LOCATION" and a.sample_id == s_no_loc.sample_id)
        assert no_loc_alert.severity == "CRITICAL"
        assert "IN_STORAGE" in no_loc_alert.description

        dep_alert = next(a for a in alerts_report.alerts if a.rule_code == "DEPLETED_WITH_POSITIVE_QTY" and a.sample_id == s_dep_pos.sample_id)
        assert dep_alert.severity == "WARNING"
        assert "30.0" in dep_alert.description
        assert_pass(f"Integrity alerts scanner detected all 3 invariant anomalies (total alerts: {alerts_report.total_alerts}).")

        # ---------------------------------------------------------
        # TEST 6: Sample Readiness Assessment - Healthy Specimen
        # ---------------------------------------------------------
        readiness_hlt = SampleService.get_sample_readiness(db=db, sample_id=s_healthy.sample_id)
        assert readiness_hlt.overall_status == "READY", f"Expected READY, got {readiness_hlt.overall_status}"
        assert readiness_hlt.readiness_score >= 80, f"Expected score >= 80, got {readiness_hlt.readiness_score}"
        assert len(readiness_hlt.checks) == 5
        assert all(c.passed for c in readiness_hlt.checks)
        assert_pass(f"Healthy specimen readiness: {readiness_hlt.overall_status} (Score: {readiness_hlt.readiness_score}%).")

        # ---------------------------------------------------------
        # TEST 7: Sample Readiness Assessment - Low-Volume Specimen
        # ---------------------------------------------------------
        readiness_low = SampleService.get_sample_readiness(db=db, sample_id=s_low.sample_id)
        assert readiness_low.overall_status in ("READY", "NEEDS_REVIEW")
        stock_check = next(c for c in readiness_low.checks if c.check_id == "stock_sufficiency")
        assert stock_check.severity == "WARNING"
        assert "Low remaining stock" in stock_check.message
        assert_pass(f"Low-volume specimen readiness flagged warning on stock sufficiency (Score: {readiness_low.readiness_score}%).")

        # ---------------------------------------------------------
        # TEST 8: Sample Readiness Assessment - Quarantined Specimen
        # ---------------------------------------------------------
        readiness_quar = SampleService.get_sample_readiness(db=db, sample_id=s_quar.sample_id)
        assert readiness_quar.overall_status == "UNAVAILABLE"
        status_check = next(c for c in readiness_quar.checks if c.check_id == "status_check")
        assert not status_check.passed
        assert status_check.severity == "CRITICAL"
        assert any("QUARANTINED" in r for r in readiness_quar.recommendations)
        assert_pass("Quarantined specimen correctly classified as UNAVAILABLE with critical lifecycle restriction.")

        # ---------------------------------------------------------
        # TEST 9: Sample Readiness Assessment - Failed QC Specimen
        # ---------------------------------------------------------
        # Add failed QC test to low volume specimen to verify QC impact
        qc_fail = SampleTest(
            sample_id=s_low.sample_id,
            test_type="Bacterial Contamination Screening",
            test_status="completed",
            result_interpretation="Fail - High Microbial Load",
            observation="Colony forming units exceed bio-safety limit.",
            created_at=datetime.now(timezone.utc),
        )
        db.add(qc_fail)
        db.commit()

        readiness_failed_qc = SampleService.get_sample_readiness(db=db, sample_id=s_low.sample_id)
        assert readiness_failed_qc.overall_status == "UNAVAILABLE"
        qc_check = next(c for c in readiness_failed_qc.checks if c.check_id == "qc_evidence")
        assert not qc_check.passed
        assert qc_check.severity == "CRITICAL"
        assert_pass("Failed QC assay correctly triggers critical failure and UNAVAILABLE classification.")

        # ---------------------------------------------------------
        # CLEANUP
        # ---------------------------------------------------------
        db.query(SampleTest).filter(SampleTest.sample_id.in_([s_healthy.sample_id, s_low.sample_id])).delete(synchronize_session=False)
        db.query(Sample).filter(Sample.sample_id.in_([
            s_healthy.sample_id, s_low.sample_id, s_quar.sample_id, s_mis.sample_id,
            s_dep.sample_id, s_no_loc.sample_id, s_dep_pos.sample_id, s_active_zero.sample_id
        ])).delete(synchronize_session=False)
        db.commit()
        assert_pass("All Phase 3 test entities cleaned up successfully.")

        print("=" * 75)
        print(" ALL PHASE 3 VERIFICATION TESTS PASSED SUCCESSFULLY! (100% CORRECT)")
        print("=" * 75)

    finally:
        db.close()


if __name__ == "__main__":
    run_phase3_tests()
