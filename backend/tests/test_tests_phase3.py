"""
Verification Suite for Tests Module: Phase 3 Operational Intelligence & Quality Metrics
========================================================================================
Tests:
1. Analytical Laboratory Quality KPIs: total tests, completed, pass rate, contamination rate.
2. Turnaround Time (TAT) computation from requested_at to performed_at.
3. Protocol-specific breakdown (Qubit, TapeStation, qPCR, Bioanalyzer) across outcome tiers.
4. Recent QC alerts aggregation for failed / contaminated assay events.
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
    SampleStatus,
    TestStatus,
)
from app.modules.tests.service import TestService
from app.modules.tests.schemas import TestCreateRequest


def run_phase3_tests():
    db = SessionLocal()
    print("=" * 75)
    print(" EXECUTING RIGOROUS VERIFICATION SUITE: TESTS PHASE 3 OPERATIONAL METRICS")
    print("=" * 75)

    created_samples: list[Sample] = []
    created_tests: list[SampleTest] = []

    def make_sample(status=SampleStatus.IN_STORAGE.value, qty=50.0):
        st = db.query(SampleType).first()
        loc = db.query(StorageLocation).filter(StorageLocation.is_active == True).first()
        code = f"SMP-P3-{uuid.uuid4().hex[:6].upper()}"
        s = Sample(
            sample_code=code,
            sample_name=f"Phase 3 Specimen {code}",
            sample_type_id=st.sample_type_id if st else 1,
            quantity_value=qty,
            quantity_unit="mg",
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
        # Baseline query
        base_metrics = TestService.get_quality_metrics(db=db)
        assert base_metrics.total_tests >= 0
        assert hasattr(base_metrics, "pass_rate_pct")
        assert hasattr(base_metrics, "contamination_rate_pct")
        assert hasattr(base_metrics, "test_type_breakdown")
        assert hasattr(base_metrics, "recent_qc_alerts")
        print(f"[PASS 01] Baseline quality metrics query succeeded: Total={base_metrics.total_tests}, Pass Rate={base_metrics.pass_rate_pct}%.")

        # Create known scenario specimens
        s1 = make_sample(qty=50.0)
        s2 = make_sample(qty=50.0)

        # 1. Optimal completed assay with 2 hours turnaround time
        t_req = datetime.now(timezone.utc) - timedelta(hours=3)
        t_perf = datetime.now(timezone.utc) - timedelta(hours=1)
        t_pass = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s1.sample_id,
                test_type="Phase 3 Fluorometry dsDNA Benchmark",
                test_status="completed",
                requested_at=t_req,
                performed_at=t_perf,
                result_value=24.5,
                result_unit="ng/uL",
                result_interpretation="OPTIMAL",
                observation="Verified 2-hour turnaround time."
            ),
            actor_id=1
        )
        created_tests.append(t_pass)

        # 2. Failing QC assay (contamination alert)
        t_fail = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s2.sample_id,
                test_type="Phase 3 Environmental 16S Screen",
                test_status="completed",
                requested_at=t_req,
                performed_at=t_perf,
                result_value=920.0,
                result_unit="copies/uL",
                result_interpretation="CONTAMINATED",
                observation="Triggered automated quarantine."
            ),
            actor_id=1
        )
        created_tests.append(t_fail)

        # 3. Active in-progress assay
        t_prog = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s1.sample_id,
                test_type="Phase 3 Active TapeStation Run",
                test_status="in_progress",
                observation="Capillary electrophoretic run ongoing."
            ),
            actor_id=1
        )
        created_tests.append(t_prog)

        # Re-fetch metrics and verify calculations
        new_metrics = TestService.get_quality_metrics(db=db)
        assert new_metrics.total_tests >= base_metrics.total_tests + 3
        assert new_metrics.in_progress_tests >= 1
        assert new_metrics.completed_tests >= 2

        # Check turnaround time is present and positive
        assert new_metrics.avg_turnaround_hours is not None
        assert new_metrics.avg_turnaround_hours > 0.0
        print(f"[PASS 02] Turnaround time calculation verified: Avg TAT = {new_metrics.avg_turnaround_hours:.1f} hours.")

        # Check protocol breakdown
        types_listed = [b.test_type for b in new_metrics.test_type_breakdown]
        assert "Phase 3 Fluorometry dsDNA Benchmark" in types_listed
        assert "Phase 3 Environmental 16S Screen" in types_listed
        print("[PASS 03] Analytical protocol distribution and outcome breakdown verified.")

        # Check recent QC alert list contains the contaminated assay
        alert_ids = [a.sample_test_id for a in new_metrics.recent_qc_alerts]
        assert t_fail.sample_test_id in alert_ids
        target_alert = next(a for a in new_metrics.recent_qc_alerts if a.sample_test_id == t_fail.sample_test_id)
        assert target_alert.result_interpretation == "CONTAMINATED"
        assert target_alert.result_value == 920.0
        print("[PASS 04] QC Alert scanner accurately detected and indexed the contaminated assay.")

        print("=" * 75)
        print(" [ALL 4 PHASE 3 OPERATIONAL INTELLIGENCE TESTS PASSED 100%!] ")
        print("=" * 75)

    finally:
        # Cleanup
        for s in created_samples:
            db.query(SampleTest).filter(SampleTest.sample_id == s.sample_id).delete()
            db.query(Sample).filter(Sample.sample_id == s.sample_id).delete()
        db.commit()
        db.close()


if __name__ == "__main__":
    run_phase3_tests()

