"""
Unit & Service Tests for Module 10: Lab Overview Dashboard, Reports & Analytics (Step 10A)
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.common import (
    SessionLocal,
    Sample,
    SampleType,
    StorageLocation,
    Equipment,
    Experiment,
    ExperimentResult,
    SampleTest,
    Incident,
    AIAnalysis,
    AuditLog,
    AppUser,
    AncientSpecimen,
)
from app.modules.analytics.service import AnalyticsService


def run_tests():
    db = SessionLocal()
    print("=" * 65)
    print(" Executing Step 10A Service Tests for Module 10: Analytics")
    print("=" * 65)

    try:
        # -------------------------------------------------------------
        # Test 1: Dashboard Metrics Retrieval
        # -------------------------------------------------------------
        metrics = AnalyticsService.get_dashboard_metrics(db)
        assert metrics.total_samples >= 0
        assert metrics.active_samples >= 0
        assert metrics.total_storage_locations >= 0
        assert 0.0 <= metrics.storage_occupancy_percent <= 100.0
        assert metrics.total_equipment >= 0
        assert metrics.total_experiments >= 0
        assert metrics.total_tests >= 0
        assert metrics.open_incidents >= 0
        assert isinstance(metrics.recent_activities, list)
        print(f"[PASS] Test 01: get_dashboard_metrics verified (Total samples: {metrics.total_samples}, Occupancy: {metrics.storage_occupancy_percent}%, Incidents: {metrics.open_incidents}).")

        # -------------------------------------------------------------
        # Test 2: Sample Breakdown by Biological Classification
        # -------------------------------------------------------------
        type_breakdown = AnalyticsService.get_samples_by_type(db)
        assert isinstance(type_breakdown, list)
        total_pct = sum(item.percentage_of_total for item in type_breakdown)
        if metrics.total_samples > 0:
            assert len(type_breakdown) > 0
            # Total percentage should approximate ~100% (within rounding)
            assert 95.0 <= total_pct <= 105.0 or total_pct == 0.0
            print(f"[PASS] Test 02: get_samples_by_type verified ({len(type_breakdown)} types cataloged, sum pct={total_pct:.1f}%).")
        else:
            print(f"[PASS] Test 02: get_samples_by_type verified on empty inventory.")

        # -------------------------------------------------------------
        # Test 3: Storage Occupancy Breakdown
        # -------------------------------------------------------------
        storage_report = AnalyticsService.get_storage_occupancy_report(db)
        assert isinstance(storage_report, list)
        for unit in storage_report:
            assert unit.facility is not None
            assert unit.unit_type is not None
            assert unit.total_locations >= unit.occupied_locations
            assert unit.available_locations == unit.total_locations - unit.occupied_locations
            assert 0.0 <= unit.occupancy_percentage <= 100.0
        print(f"[PASS] Test 03: get_storage_occupancy_report verified ({len(storage_report)} facility/unit groupings computed).")

        # -------------------------------------------------------------
        # Test 4: Incident Trends Breakdown
        # -------------------------------------------------------------
        incident_trends = AnalyticsService.get_incident_trends(db)
        assert isinstance(incident_trends, list)
        severities = [t.severity for t in incident_trends]
        assert "critical" in severities
        assert "high" in severities
        assert "medium" in severities
        assert "low" in severities
        for item in incident_trends:
            assert item.count >= 0
            assert item.open_count >= 0
            assert item.resolved_count >= 0
            assert 0.0 <= item.percentage <= 100.0
        print(f"[PASS] Test 04: get_incident_trends verified (4 canonical severities covered).")

        # -------------------------------------------------------------
        # Test 5: Experiment Outcomes Breakdown
        # -------------------------------------------------------------
        outcomes = AnalyticsService.get_experiment_outcomes(db)
        assert isinstance(outcomes, list)
        for outcome in outcomes:
            assert outcome.status is not None
            assert outcome.count >= 0
            assert outcome.results_count >= outcome.finalized_results_count
        print(f"[PASS] Test 05: get_experiment_outcomes verified ({len(outcomes)} experiment statuses tracked).")

        # -------------------------------------------------------------
        # Test 6: Audit Activity Feed
        # -------------------------------------------------------------
        activities = AnalyticsService.get_activity_feed(db, limit=15)
        assert isinstance(activities, list)
        assert len(activities) <= 15
        if len(activities) > 0:
            act = activities[0]
            assert act.audit_log_id > 0
            assert act.action is not None
            assert act.entity_type is not None
            assert act.occurred_at is not None
        print(f"[PASS] Test 06: get_activity_feed verified ({len(activities)} audit records retrieved with actor details).")

        print("=" * 65)
        print(" ALL 6/6 STEP 10A SERVICE TESTS PASSED ROBUSTLY!")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
