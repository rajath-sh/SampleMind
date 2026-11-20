"""
SampleMind Analytics & Dashboard Service
Implements statistical aggregations, KPI calculations, operational reports,
and Overview Command Centre enhancements (Workflow Pulse, Data Integrity Observatory,
Educational DBMS query insights, and Live Operational Telemetry).
Strictly isolated: Imports exclusively from app.common.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import time
import uuid
from sqlalchemy.orm import Session
from sqlalchemy import func, case, distinct, desc, select, text

from app.common import (
    settings,
    Base,
    Sample,
    SampleType,
    StorageLocation,
    Equipment,
    Experiment,
    ExperimentSample,
    ExperimentResult,
    SampleTest,
    Incident,
    AIAnalysis,
    AuditLog,
    AppUser,
    AncientSpecimen,
    EntityNotFoundException,
)
from .schemas import (
    DashboardMetricsResponse,
    SampleTypeDistribution,
    StorageOccupancyItem,
    IncidentTrendItem,
    ExperimentOutcomeReport,
    ActivityFeedItem,
    OverviewKpiResponse,
    WorkflowStageMetric,
    WorkflowPulseResponse,
    IntegrityFinding,
    IntegrityCategoryScore,
    IntegrityScanResponse,
    OperationalStatusResponse,
    DatabaseInsightResponse,
)

# Process start time for uptime tracking
_PROCESS_START_TIME = time.time()


class AnalyticsService:

    @staticmethod
    def get_dashboard_metrics(db: Session) -> DashboardMetricsResponse:
        """
        Computes high-level lab operational metrics and KPIs across all subsystems.
        """
        # 1. Sample counts
        total_samples = db.query(func.count(Sample.sample_id)).scalar() or 0
        active_samples = (
            db.query(func.count(Sample.sample_id))
            .filter(Sample.sample_status.in_(["REGISTERED", "IN_STORAGE", "IN_USE"]))
            .scalar()
            or 0
        )
        quarantined_samples = (
            db.query(func.count(Sample.sample_id))
            .filter(Sample.sample_status == "QUARANTINED")
            .scalar()
            or 0
        )
        depleted_samples = (
            db.query(func.count(Sample.sample_id))
            .filter(Sample.sample_status == "DEPLETED")
            .scalar()
            or 0
        )

        # 2. Storage locations and occupancy
        total_storage_locations = db.query(func.count(StorageLocation.storage_location_id)).scalar() or 0
        occupied_storage_locations = (
            db.query(func.count(distinct(Sample.current_storage_location_id)))
            .filter(Sample.current_storage_location_id.isnot(None))
            .scalar()
            or 0
        )
        storage_occupancy_percent = 0.0
        if total_storage_locations > 0:
            storage_occupancy_percent = round((occupied_storage_locations / total_storage_locations) * 100.0, 1)

        # 3. Equipment counts
        total_equipment = db.query(func.count(Equipment.equipment_id)).scalar() or 0
        equipment_in_use = (
            db.query(func.count(Equipment.equipment_id))
            .filter(Equipment.equipment_status == "in_use")
            .scalar()
            or 0
        )

        # 4. Experiment counts
        total_experiments = db.query(func.count(Experiment.experiment_id)).scalar() or 0
        active_experiments = (
            db.query(func.count(Experiment.experiment_id))
            .filter(Experiment.status == "active")
            .scalar()
            or 0
        )

        # 5. Assay test results
        total_tests = db.query(func.count(SampleTest.sample_test_id)).scalar() or 0
        tests_passed = (
            db.query(func.count(SampleTest.sample_test_id))
            .filter(
                func.lower(SampleTest.result_interpretation).like("%pass%")
            )
            .scalar()
            or 0
        )
        tests_failed = (
            db.query(func.count(SampleTest.sample_test_id))
            .filter(
                func.lower(SampleTest.result_interpretation).like("%fail%")
            )
            .scalar()
            or 0
        )

        # 6. Incidents
        open_incidents = (
            db.query(func.count(Incident.incident_id))
            .filter(Incident.status.in_(["open", "investigating"]))
            .scalar()
            or 0
        )
        critical_incidents = (
            db.query(func.count(Incident.incident_id))
            .filter(
                Incident.severity == "critical",
                Incident.status.in_(["open", "investigating"]),
            )
            .scalar()
            or 0
        )

        # 7. AI Risk predictions
        high_risk_ai_predictions = (
            db.query(func.count(AIAnalysis.ai_analysis_id))
            .filter(AIAnalysis.predicted_risk == "HIGH")
            .scalar()
            or 0
        )
        pending_ai_reviews = (
            db.query(func.count(AIAnalysis.ai_analysis_id))
            .filter(AIAnalysis.review_feedback.is_(None))
            .scalar()
            or 0
        )

        # 8. Ancient specimens
        ancient_specimens_count = db.query(func.count(AncientSpecimen.sample_id)).scalar() or 0

        # 9. Recent activities
        recent_logs = (
            db.query(
                AuditLog.audit_log_id,
                AuditLog.action,
                AuditLog.entity_type,
                AuditLog.entity_id,
                AuditLog.occurred_at,
                AuditLog.details,
                AppUser.display_name.label("actor_name"),
                AppUser.role.label("actor_role"),
            )
            .outerjoin(AppUser, AuditLog.actor_user_id == AppUser.user_id)
            .order_by(desc(AuditLog.occurred_at))
            .limit(10)
            .all()
        )

        activities = [
            ActivityFeedItem(
                audit_log_id=log.audit_log_id,
                actor_name=log.actor_name or "System",
                actor_role=log.actor_role,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                occurred_at=log.occurred_at,
                details=log.details,
            )
            for log in recent_logs
        ]

        return DashboardMetricsResponse(
            total_samples=total_samples,
            active_samples=active_samples,
            quarantined_samples=quarantined_samples,
            depleted_samples=depleted_samples,
            total_storage_locations=total_storage_locations,
            occupied_storage_locations=occupied_storage_locations,
            storage_occupancy_percent=storage_occupancy_percent,
            total_equipment=total_equipment,
            equipment_in_use=equipment_in_use,
            total_experiments=total_experiments,
            active_experiments=active_experiments,
            total_tests=total_tests,
            tests_passed=tests_passed,
            tests_failed=tests_failed,
            open_incidents=open_incidents,
            critical_incidents=critical_incidents,
            high_risk_ai_predictions=high_risk_ai_predictions,
            pending_ai_reviews=pending_ai_reviews,
            ancient_specimens_count=ancient_specimens_count,
            recent_activities=activities,
        )

    @staticmethod
    def get_overview_kpis(db: Session) -> OverviewKpiResponse:
        """
        Retrieves refined executive operational KPIs for the Command Centre ribbon.
        Includes verified/locked vs draft results aggregation without exposing raw data.
        """
        dash = AnalyticsService.get_dashboard_metrics(db)

        # Results aggregation
        total_results = db.query(func.count(ExperimentResult.experiment_result_id)).scalar() or 0
        locked_results = (
            db.query(func.count(ExperimentResult.experiment_result_id))
            .filter(ExperimentResult.is_final == True)
            .scalar()
            or 0
        )
        draft_results = max(0, total_results - locked_results)

        # QC pass rate
        qc_rate = 0.0
        if dash.total_tests > 0:
            qc_rate = round((dash.tests_passed / dash.total_tests) * 100.0, 1)

        return OverviewKpiResponse(
            total_samples=dash.total_samples,
            active_samples=dash.active_samples,
            quarantined_samples=dash.quarantined_samples,
            depleted_samples=dash.depleted_samples,
            total_storage_locations=dash.total_storage_locations,
            occupied_storage_locations=dash.occupied_storage_locations,
            storage_occupancy_percent=dash.storage_occupancy_percent,
            total_equipment=dash.total_equipment,
            equipment_in_use=dash.equipment_in_use,
            total_experiments=dash.total_experiments,
            active_experiments=dash.active_experiments,
            total_tests=dash.total_tests,
            tests_passed=dash.tests_passed,
            tests_failed=dash.tests_failed,
            qc_pass_rate_percent=qc_rate,
            open_incidents=dash.open_incidents,
            critical_incidents=dash.critical_incidents,
            high_risk_ai_predictions=dash.high_risk_ai_predictions,
            pending_ai_reviews=dash.pending_ai_reviews,
            ancient_specimens_count=dash.ancient_specimens_count,
            total_results=total_results,
            locked_results=locked_results,
            draft_results=draft_results,
            calculation_period="All Recorded Operational Data",
            last_refreshed_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def get_workflow_pulse(db: Session) -> WorkflowPulseResponse:
        """
        Constructs the aggregate operational progression across lab subsystems:
        Registered Specimens -> Analytical Tests -> Research Experiments -> Verified Results.
        """
        # Stage 1: Registered Specimens
        total_samples = db.query(func.count(Sample.sample_id)).scalar() or 0
        active_samples = (
            db.query(func.count(Sample.sample_id))
            .filter(Sample.sample_status.in_(["REGISTERED", "IN_STORAGE", "IN_USE"]))
            .scalar()
            or 0
        )

        # Stage 2: Analytical Tests
        total_tests = db.query(func.count(SampleTest.sample_test_id)).scalar() or 0
        tests_passed = (
            db.query(func.count(SampleTest.sample_test_id))
            .filter(func.lower(SampleTest.result_interpretation).like("%pass%"))
            .scalar()
            or 0
        )
        tests_failed = max(0, total_tests - tests_passed)

        # Stage 3: Research Cohorts
        total_experiments = db.query(func.count(Experiment.experiment_id)).scalar() or 0
        active_experiments = (
            db.query(func.count(Experiment.experiment_id))
            .filter(Experiment.status == "active")
            .scalar()
            or 0
        )

        # Stage 4: Verified Results
        total_results = db.query(func.count(ExperimentResult.experiment_result_id)).scalar() or 0
        locked_results = (
            db.query(func.count(ExperimentResult.experiment_result_id))
            .filter(ExperimentResult.is_final == True)
            .scalar()
            or 0
        )
        draft_results = max(0, total_results - locked_results)

        # Conversion calculations relative to preceding stage
        test_conv = round((total_tests / total_samples * 100.0), 1) if total_samples > 0 else 0.0
        exp_conv = round((active_experiments / total_experiments * 100.0), 1) if total_experiments > 0 else 0.0
        res_conv = round((locked_results / total_results * 100.0), 1) if total_results > 0 else 0.0

        stages = [
            WorkflowStageMetric(
                stage_key="specimens",
                stage_name="Registered Specimens",
                count=total_samples,
                unit_label="Specimens",
                description="Biological specimens accessioned and cataloged in repository.",
                conversion_rate_percent=100.0,
                dropoff_count=max(0, total_samples - active_samples),
                active_subcount=active_samples,
                subcount_label="Active In Stock",
            ),
            WorkflowStageMetric(
                stage_key="tests",
                stage_name="Analytical Assays",
                count=total_tests,
                unit_label="Assays",
                description="Fluorometric, electrophoretic, and qPCR QC assays performed.",
                conversion_rate_percent=test_conv,
                dropoff_count=tests_failed,
                active_subcount=tests_passed,
                subcount_label="Passed QC Criteria",
            ),
            WorkflowStageMetric(
                stage_key="experiments",
                stage_name="Research Cohorts",
                count=total_experiments,
                unit_label="Cohorts",
                description="Controlled experimental protocol runs with multi-specimen cohorts.",
                conversion_rate_percent=exp_conv,
                dropoff_count=max(0, total_experiments - active_experiments),
                active_subcount=active_experiments,
                subcount_label="Currently In Execution",
            ),
            WorkflowStageMetric(
                stage_key="results",
                stage_name="Verified Results",
                count=total_results,
                unit_label="Results",
                description="Quantitative determinations and conclusions finalized and locked.",
                conversion_rate_percent=res_conv,
                dropoff_count=draft_results,
                active_subcount=locked_results,
                subcount_label="Peer-Verified & Locked",
            ),
        ]

        summary = (
            f"Laboratory operational workflow tracking {total_samples} accessioned specimens across "
            f"{total_tests} assays, {total_experiments} experimental cohorts, and {total_results} scientific results "
            f"({locked_results} locked & verified)."
        )

        return WorkflowPulseResponse(
            stages=stages,
            pipeline_summary=summary,
            generated_at=datetime.now(timezone.utc),
        )

    @staticmethod
    def run_integrity_scan(db: Session, actor_id: Optional[int] = None) -> IntegrityScanResponse:
        """
        Executes 8 genuine data-quality and relational integrity checks against live DBMS tables.
        Non-destructive and read-only with respect to scientific findings.
        Persists scan summary into AuditLog.
        """
        scan_id = str(uuid.uuid4())
        scan_timestamp = datetime.now(timezone.utc)
        findings: List[IntegrityFinding] = []

        # ======================================================================
        # Check 1: CHK_STORAGE_ASSIGNMENT (Referential Integrity - ERROR)
        # In-storage samples missing physical storage location
        # ======================================================================
        unassigned_storage_samples = (
            db.query(Sample)
            .filter(
                Sample.sample_status == "IN_STORAGE",
                Sample.current_storage_location_id.is_(None),
            )
            .all()
        )
        for s in unassigned_storage_samples:
            findings.append(
                IntegrityFinding(
                    rule_id="CHK_STORAGE_ASSIGNMENT",
                    rule_name="Unassigned Physical Storage Location",
                    severity="ERROR",
                    category="Referential Integrity",
                    entity_type="Sample",
                    record_id=s.sample_id,
                    record_code=s.sample_code,
                    description=f"Specimen '{s.sample_code}' has status IN_STORAGE but current_storage_location_id is NULL.",
                    root_cause_explanation="Foreign key to StorageLocation was set to NULL or relocation transaction was interrupted.",
                    suggested_remedy="Assign specimen to an active storage slot via the Storage module relocation drawer.",
                    action_route="storage",
                )
            )

        # ======================================================================
        # Check 2: CHK_DEPLETION_CONSISTENCY (Biological Consistency - ERROR)
        # Quantity zero but not DEPLETED, or DEPLETED with quantity > 0
        # ======================================================================
        depletion_inconsistencies = (
            db.query(Sample)
            .filter(
                ((Sample.quantity_value <= 0) & (Sample.sample_status != "DEPLETED"))
                | ((Sample.quantity_value > 0) & (Sample.sample_status == "DEPLETED"))
            )
            .all()
        )
        for s in depletion_inconsistencies:
            if s.quantity_value <= 0:
                desc_text = f"Specimen '{s.sample_code}' has 0 stock remaining ({s.quantity_value} {s.quantity_unit}) but status is '{s.sample_status}' instead of DEPLETED."
                remedy = "Update sample status to DEPLETED to prevent unauthorized experimental allocation."
            else:
                desc_text = f"Specimen '{s.sample_code}' has remaining volume ({s.quantity_value} {s.quantity_unit}) but is erroneously marked DEPLETED."
                remedy = "Restore sample status to IN_STORAGE or IN_USE based on physical inventory."

            findings.append(
                IntegrityFinding(
                    rule_id="CHK_DEPLETION_CONSISTENCY",
                    rule_name="Inventory Stock Depletion Inconsistency",
                    severity="ERROR",
                    category="Biological Consistency",
                    entity_type="Sample",
                    record_id=s.sample_id,
                    record_code=s.sample_code,
                    description=desc_text,
                    root_cause_explanation="Atomic aliquot derivation or manual volume update did not harmonize quantity_value with sample_status.",
                    suggested_remedy=remedy,
                    action_route="samples",
                )
            )

        # ======================================================================
        # Check 3: CHK_SAFETY_QUARANTINE (Safety & Compliance - ERROR)
        # Open critical incidents where affected sample is not in QUARANTINED status
        # ======================================================================
        critical_unquarantined = (
            db.query(Incident, Sample)
            .join(Sample, Incident.sample_id == Sample.sample_id)
            .filter(
                Incident.severity == "critical",
                Incident.status.in_(["open", "investigating"]),
                Sample.sample_status != "QUARANTINED",
            )
            .all()
        )
        for inc, s in critical_unquarantined:
            findings.append(
                IntegrityFinding(
                    rule_id="CHK_SAFETY_QUARANTINE",
                    rule_name="Critical Incident Quarantine Non-Compliance",
                    severity="ERROR",
                    category="Safety & Compliance",
                    entity_type="Incident",
                    record_id=inc.incident_id,
                    record_code=inc.incident_code,
                    description=f"Critical incident '{inc.incident_code}' involves sample '{s.sample_code}' which remains in '{s.sample_status}' status.",
                    root_cause_explanation="Automated quarantine trigger failed or user overrode quarantine state while investigation remains open.",
                    suggested_remedy=f"Immediately quarantine specimen '{s.sample_code}' in the Incidents module to enforce BioTrace biosafety protocols.",
                    action_route="incidents",
                )
            )

        # ======================================================================
        # Check 4: CHK_EQUIPMENT_CALIBRATION (Safety & Compliance - WARNING)
        # Active instruments with overdue calibration
        # ======================================================================
        overdue_equipment = (
            db.query(Equipment)
            .filter(
                Equipment.calibration_due_at.isnot(None),
                Equipment.calibration_due_at < scan_timestamp,
                Equipment.equipment_status.in_(["available", "in_use"]),
            )
            .all()
        )
        for eq in overdue_equipment:
            findings.append(
                IntegrityFinding(
                    rule_id="CHK_EQUIPMENT_CALIBRATION",
                    rule_name="Instrument Calibration Overdue",
                    severity="WARNING",
                    category="Safety & Compliance",
                    entity_type="Equipment",
                    record_id=eq.equipment_id,
                    record_code=eq.equipment_code,
                    description=f"Instrument '{eq.equipment_name}' ({eq.equipment_code}) had calibration due on {eq.calibration_due_at.strftime('%Y-%m-%d')} but is marked '{eq.equipment_status}'.",
                    root_cause_explanation="Calibration cycle expired without updated technician calibration log entry.",
                    suggested_remedy="Transition instrument status to 'maintenance' and record recertification in Equipment Registry.",
                    action_route="equipment",
                )
            )

        # ======================================================================
        # Check 5: CHK_EXPERIMENT_SAMPLES (Referential Integrity - WARNING)
        # Active/Completed experiments with no assigned cohort specimens
        # ======================================================================
        subq_exp_samples = select(ExperimentSample.experiment_id).distinct()
        empty_cohort_experiments = (
            db.query(Experiment)
            .filter(
                Experiment.status.in_(["active", "completed"]),
                Experiment.experiment_id.notin_(subq_exp_samples),
            )
            .all()
        )
        for exp in empty_cohort_experiments:
            findings.append(
                IntegrityFinding(
                    rule_id="CHK_EXPERIMENT_SAMPLES",
                    rule_name="Experiment Lacks Specimen Cohort",
                    severity="WARNING",
                    category="Referential Integrity",
                    entity_type="Experiment",
                    record_id=exp.experiment_id,
                    record_code=exp.experiment_code,
                    description=f"Experiment '{exp.experiment_name}' ({exp.experiment_code}) is '{exp.status}' but has zero samples associated in ExperimentSample.",
                    root_cause_explanation="Protocol execution started without binding biological specimen input cohorts.",
                    suggested_remedy="Attach cohort specimens to the experiment via the Experiments workspace.",
                    action_route="experiments",
                )
            )

        # ======================================================================
        # Check 6: CHK_TEST_COMPLETION (Data Completeness - WARNING)
        # Completed tests with null result_value and null observation
        # ======================================================================
        unrecorded_tests = (
            db.query(SampleTest)
            .filter(
                SampleTest.test_status == "completed",
                SampleTest.result_value.is_(None),
                SampleTest.observation.is_(None),
            )
            .all()
        )
        for t in unrecorded_tests:
            findings.append(
                IntegrityFinding(
                    rule_id="CHK_TEST_COMPLETION",
                    rule_name="Completed Assay Missing Quantitative Data",
                    severity="WARNING",
                    category="Data Completeness",
                    entity_type="SampleTest",
                    record_id=t.sample_test_id,
                    record_code=f"TEST-{t.sample_test_id}",
                    description=f"Assay test #{t.sample_test_id} ({t.test_type}) is marked 'completed' without numerical result_value or observation.",
                    root_cause_explanation="Assay run completed in laboratory instrumentation but reading was not saved.",
                    suggested_remedy="Enter the quantitative reading or qualitative observation in the Tests module.",
                    action_route="tests",
                )
            )

        # ======================================================================
        # Check 7: CHK_RESULT_INTEGRITY (Referential Integrity - WARNING)
        # Finalized results without a recorded_by researcher
        # ======================================================================
        unattributed_locked_results = (
            db.query(ExperimentResult)
            .filter(
                ExperimentResult.is_final == True,
                ExperimentResult.recorded_by.is_(None),
            )
            .all()
        )
        for res in unattributed_locked_results:
            findings.append(
                IntegrityFinding(
                    rule_id="CHK_RESULT_INTEGRITY",
                    rule_name="Locked Result Missing User Attribution",
                    severity="WARNING",
                    category="Referential Integrity",
                    entity_type="ExperimentResult",
                    record_id=res.experiment_result_id,
                    record_code=res.result_code,
                    description=f"Result '{res.result_code}' ({res.result_title}) is locked as final but recorded_by user ID is NULL.",
                    root_cause_explanation="Batch data import or migration did not bind the verifying researcher user account.",
                    suggested_remedy="Audit researcher attribution in Results Registry.",
                    action_route="results",
                )
            )

        # ======================================================================
        # Check 8: CHK_ANCIENT_PROVENANCE (Data Completeness - INFO)
        # Ancient specimens with stratigraphic context but no site
        # ======================================================================
        unanchored_ancient = (
            db.query(AncientSpecimen, Sample)
            .join(Sample, AncientSpecimen.sample_id == Sample.sample_id)
            .filter(
                AncientSpecimen.archaeological_site_id.is_(None),
                (AncientSpecimen.excavation_layer.isnot(None) | AncientSpecimen.depth_cm.isnot(None)),
            )
            .all()
        )
        for anc, s in unanchored_ancient:
            findings.append(
                IntegrityFinding(
                    rule_id="CHK_ANCIENT_PROVENANCE",
                    rule_name="Ancient Specimen Missing Archaeological Site Link",
                    severity="INFO",
                    category="Data Completeness",
                    entity_type="AncientSpecimen",
                    record_id=anc.sample_id,
                    record_code=s.sample_code,
                    description=f"Ancient specimen '{s.sample_code}' specifies excavation stratum '{anc.excavation_layer}' but has no linked ArchaeologicalSite.",
                    root_cause_explanation="Specimen was registered prior to registering the excavation survey site.",
                    suggested_remedy="Link the specimen to its corresponding site in the Ancient Specimens module.",
                    action_route="ancient",
                )
            )

        # ======================================================================
        # Scoring & Aggregation
        # ======================================================================
        total_rules = 8
        errors = [f for f in findings if f.severity == "ERROR"]
        warnings = [f for f in findings if f.severity == "WARNING"]
        infos = [f for f in findings if f.severity == "INFO"]

        # Category breakdowns
        categories = [
            "Referential Integrity",
            "Biological Consistency",
            "Safety & Compliance",
            "Data Completeness",
        ]
        cat_scores: List[IntegrityCategoryScore] = []
        for cat in categories:
            cat_findings = [f for f in findings if f.category == cat]
            c_errors = len([f for f in cat_findings if f.severity == "ERROR"])
            c_warns = len([f for f in cat_findings if f.severity == "WARNING"])
            c_total = 2  # 2 checks per category
            c_passed = max(0, c_total - (1 if c_errors > 0 else 0) - (1 if c_warns > 0 else 0))
            score_pct = max(0.0, round(((c_total - c_errors * 0.6 - c_warns * 0.3) / c_total) * 100.0, 1))
            cat_scores.append(
                IntegrityCategoryScore(
                    category=cat,
                    total_checks=c_total,
                    passed=c_passed,
                    warnings=c_warns,
                    errors=c_errors,
                    compliance_score_percent=score_pct,
                )
            )

        if len(errors) > 0:
            status = "DEVIANT"
        elif len(warnings) > 0:
            status = "ATTENTION_REQUIRED"
        else:
            status = "OPTIMAL"

        passed_checks = max(0, total_rules - (1 if len(errors) > 0 else 0) - (1 if len(warnings) > 0 else 0))

        # Persist scan audit event
        try:
            audit = AuditLog(
                actor_user_id=actor_id,
                action="DATA_INTEGRITY_SCAN",
                entity_type="DatabaseIntegrity",
                entity_id=None,
                occurred_at=scan_timestamp,
                details={
                    "scan_id": scan_id,
                    "total_checks": total_rules,
                    "errors_found": len(errors),
                    "warnings_found": len(warnings),
                    "status": status,
                },
            )
            db.add(audit)
            db.commit()
        except Exception:
            db.rollback()

        return IntegrityScanResponse(
            scan_id=scan_id,
            scanned_at=scan_timestamp,
            total_checks_performed=total_rules,
            passed_checks=passed_checks,
            warning_checks=len(warnings),
            error_checks=len(errors),
            overall_integrity_status=status,
            category_scores=cat_scores,
            findings=findings,
        )

    @staticmethod
    def get_operational_status(db: Session) -> OperationalStatusResponse:
        """
        Gathers live database engine telemetry, safe ping latency, and model introspection.
        Does not expose connection strings, passwords, or raw system tokens.
        """
        # 1. Measure ping latency
        t0 = time.perf_counter()
        try:
            db.execute(text("SELECT 1"))
            latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            api_status = "OPERATIONAL"
        except Exception:
            latency_ms = 999.0
            api_status = "DEGRADED"

        # 2. Engine and dialect detection
        if settings.USE_SQLITE:
            db_engine = "SQLite (samplemind.db)"
            db_mode = "SQLite"
        else:
            db_engine = "PostgreSQL 16 (biotrace_prod)"
            db_mode = "PostgreSQL"

        # 3. Model relation verification
        total_relations = len(Base.metadata.tables)

        # 4. Last integrity scan timestamp
        last_scan_log = (
            db.query(AuditLog.occurred_at)
            .filter(AuditLog.action == "DATA_INTEGRITY_SCAN")
            .order_by(desc(AuditLog.occurred_at))
            .first()
        )
        last_scan_time = last_scan_log[0] if last_scan_log else None

        # 5. Uptime
        uptime = round(time.time() - _PROCESS_START_TIME, 1)

        return OperationalStatusResponse(
            api_status=api_status,
            database_engine=db_engine,
            database_mode=db_mode,
            total_relations=total_relations,
            relations_verified=total_relations >= 15,
            ping_latency_ms=latency_ms,
            last_scan_timestamp=last_scan_time,
            uptime_seconds=uptime,
            server_time=datetime.now(timezone.utc),
        )

    @staticmethod
    def get_database_insight(metric_key: str, db: Session) -> DatabaseInsightResponse:
        """
        Returns educational DBMS query explanations, relational algebra rationales,
        and join choices for the specified Overview metric.
        """
        catalog = {
            "active_samples": {
                "metric_title": "Active Specimen Inventory Count",
                "entity_name": "Biological Specimen",
                "target_table": "Sample",
                "sql_query": (
                    "SELECT COUNT(sample_id) AS active_samples\n"
                    "FROM Sample\n"
                    "WHERE sample_status IN ('REGISTERED', 'IN_STORAGE', 'IN_USE');"
                ),
                "query_plan_summary": "Single table scan with index lookup on chk_sample_status. Filtering out DEPLETED, QUARANTINED, and DISPOSED specimens.",
                "relational_concept": "Selection ($\sigma_{\\text{status} \\in S}$) followed by aggregate cardinality ($\gamma_{\\text{COUNT}}$).",
                "join_explanation": "No join is needed because sample_status is a direct attribute of the Sample relation.",
                "count_inflation_risk_explanation": "If joined to SampleRelationship or SampleStorageHistory without a DISTINCT clause, specimens with multiple transfers or child aliquots would produce duplicate rows, inflating active sample inventory.",
                "performance_notes": "Execution runs in $O(N)$ without index or $O(\\log N)$ with index on sample_status.",
                "example_output": {"active_samples": 42, "status_filter": ["REGISTERED", "IN_STORAGE", "IN_USE"]},
            },
            "storage_occupancy": {
                "metric_title": "Cryogenic Storage Occupancy Percentage",
                "entity_name": "Storage Location Slot",
                "target_table": "StorageLocation, Sample",
                "sql_query": (
                    "SELECT \n"
                    "    COUNT(storage_location_id) AS total_slots,\n"
                    "    COUNT(DISTINCT sample.current_storage_location_id) AS occupied_slots,\n"
                    "    ROUND(COUNT(DISTINCT sample.current_storage_location_id) * 100.0 / COUNT(storage_location_id), 1) AS occupancy_pct\n"
                    "FROM StorageLocation\n"
                    "LEFT JOIN Sample ON StorageLocation.storage_location_id = Sample.current_storage_location_id;"
                ),
                "query_plan_summary": "Left outer join preserving all storage slot entities, followed by conditional DISTINCT aggregation on foreign key current_storage_location_id.",
                "relational_concept": "Left Outer Join ($StorageLocation \\mathbin{⟕} Sample$) with Safe Denominator Division.",
                "join_explanation": "LEFT OUTER JOIN ensures that available, unoccupied slots are not dropped from the denominator count.",
                "count_inflation_risk_explanation": "An INNER JOIN would only count occupied slots, erroneously calculating 100% occupancy every time.",
                "performance_notes": "Uses foreign key current_storage_location_id index for rapid join resolution.",
                "example_output": {"total_slots": 70, "occupied_slots": 20, "occupancy_pct": 28.6},
            },
            "assay_qc_rate": {
                "metric_title": "Assay Quality Control (QC) Pass Rate",
                "entity_name": "Analytical Assay Test",
                "target_table": "SampleTest",
                "sql_query": (
                    "SELECT \n"
                    "    COUNT(sample_test_id) AS total_assays,\n"
                    "    COUNT(CASE WHEN LOWER(result_interpretation) LIKE '%pass%' THEN 1 END) AS passed_assays,\n"
                    "    ROUND(COUNT(CASE WHEN LOWER(result_interpretation) LIKE '%pass%' THEN 1 END) * 100.0 / NULLIF(COUNT(sample_test_id), 0), 1) AS pass_rate_pct\n"
                    "FROM SampleTest;"
                ),
                "query_plan_summary": "Conditional aggregation using CASE WHEN inside COUNT, utilizing NULLIF to guard against division-by-zero on empty test tables.",
                "relational_concept": "Conditional Scalar Aggregation with Zero-Division Guarding ($NULLIF$).",
                "join_explanation": "Evaluated directly on SampleTest; sample details are joined only when drilling down to individual test records.",
                "count_inflation_risk_explanation": "Joining SampleTest to SampleType before aggregation would multiply test rows if composite keys were mismatched.",
                "performance_notes": "Single-pass aggregation scan over SampleTest table.",
                "example_output": {"total_assays": 52, "passed_assays": 48, "pass_rate_pct": 92.3},
            },
            "workflow_conversion": {
                "metric_title": "Laboratory Pipeline Workflow Progression",
                "entity_name": "Multi-Entity Pipeline",
                "target_table": "Sample, SampleTest, Experiment, ExperimentResult",
                "sql_query": (
                    "SELECT \n"
                    "    (SELECT COUNT(sample_id) FROM Sample) AS specimens,\n"
                    "    (SELECT COUNT(sample_test_id) FROM SampleTest) AS assays,\n"
                    "    (SELECT COUNT(experiment_id) FROM Experiment) AS cohorts,\n"
                    "    (SELECT COUNT(experiment_result_id) FROM ExperimentResult WHERE is_final = TRUE) AS locked_results;"
                ),
                "query_plan_summary": "Independent scalar subqueries aggregated in a single record, avoiding catastrophic cross-product matrix multiplication.",
                "relational_concept": "Scalar Subquery Assembly vs Cartesian Product ($S \\times T \\times E \\times R$).",
                "join_explanation": "Independent scalar subqueries are strictly used. A naive join across all 4 tables would generate a combinatorial explosion ($N_1 \\times N_2 \\times N_3 \\times N_4$ rows).",
                "count_inflation_risk_explanation": "Joining unrelated entities without shared lineage causes Cartesian count multiplication that falsifies operational counts.",
                "performance_notes": "Each scalar subquery executes as an isolated index count in sub-millisecond time.",
                "example_output": {"specimens": 76, "assays": 52, "cohorts": 14, "locked_results": 18},
            },
            "quarantine_compliance": {
                "metric_title": "Safety Incident Quarantine Integrity Rule",
                "entity_name": "Safety Protocol",
                "target_table": "Incident, Sample",
                "sql_query": (
                    "SELECT inc.incident_code, s.sample_code, inc.severity, s.sample_status\n"
                    "FROM Incident inc\n"
                    "JOIN Sample s ON inc.sample_id = s.sample_id\n"
                    "WHERE inc.severity = 'critical'\n"
                    "  AND inc.status IN ('open', 'investigating')\n"
                    "  AND s.sample_status != 'QUARANTINED';"
                ),
                "query_plan_summary": "Inner join on foreign key sample_id with compound filter testing compliance with the biosafety quarantine business rule.",
                "relational_concept": "Cross-Entity Business Invariant Verification via Inner Join.",
                "join_explanation": "An INNER JOIN is mandatory because safety quarantine rules specifically apply to incidents that reference a physical specimen.",
                "count_inflation_risk_explanation": "If a sample has multiple open incidents, each distinct violation must be flagged to ensure complete investigation tracking.",
                "performance_notes": "Indexed lookup on sample_id and severity enum.",
                "example_output": {"violations_detected": 0, "status": "COMPLIANT"},
            },
            "peer_locking_integrity": {
                "metric_title": "Scientific Result Peer-Verification Locking Rule",
                "entity_name": "Scientific Audit Trail",
                "target_table": "ExperimentResult, AppUser",
                "sql_query": (
                    "SELECT res.result_code, res.is_final, res.recorded_by, u.display_name\n"
                    "FROM ExperimentResult res\n"
                    "LEFT JOIN AppUser u ON res.recorded_by = u.user_id\n"
                    "WHERE res.is_final = TRUE\n"
                    "  AND (res.recorded_by IS NULL OR u.user_id IS NULL);"
                ),
                "query_plan_summary": "Anti-join / Left Join with NULL check detecting orphan locked scientific results missing author verification.",
                "relational_concept": "Referential Integrity & Scientific Non-Repudiation.",
                "join_explanation": "LEFT JOIN ensures that results with invalid or deleted foreign keys are captured rather than hidden.",
                "count_inflation_risk_explanation": "Unique constraint on result_code ensures each scientific finding is uniquely identified.",
                "performance_notes": "Leverages primary key index on AppUser.user_id.",
                "example_output": {"violations_detected": 0, "status": "COMPLIANT"},
            },
        }

        entry = catalog.get(metric_key)
        if not entry:
            raise EntityNotFoundException(
                entity_name="DatabaseInsightMetric",
                entity_id=metric_key,
            )

        return DatabaseInsightResponse(
            metric_key=metric_key,
            metric_title=entry["metric_title"],
            entity_name=entry["entity_name"],
            target_table=entry["target_table"],
            sql_query=entry["sql_query"],
            query_plan_summary=entry["query_plan_summary"],
            relational_concept=entry["relational_concept"],
            join_explanation=entry.get("join_explanation"),
            count_inflation_risk_explanation=entry.get("count_inflation_risk_explanation"),
            performance_notes=entry["performance_notes"],
            example_output=entry["example_output"],
        )

    @staticmethod
    def get_samples_by_type(db: Session) -> List[SampleTypeDistribution]:
        """
        Aggregate count and total quantity breakdown grouped by sample type.
        """
        total_samples = db.query(func.count(Sample.sample_id)).scalar() or 0

        rows = (
            db.query(
                SampleType.sample_type_id,
                SampleType.type_code,
                SampleType.type_name,
                func.count(Sample.sample_id).label("sample_count"),
                func.coalesce(func.sum(Sample.quantity_value), 0.0).label("total_quantity"),
            )
            .outerjoin(Sample, SampleType.sample_type_id == Sample.sample_type_id)
            .group_by(SampleType.sample_type_id, SampleType.type_code, SampleType.type_name)
            .order_by(desc("sample_count"))
            .all()
        )

        results = []
        for r in rows:
            pct = 0.0
            if total_samples > 0:
                pct = round((r.sample_count / total_samples) * 100.0, 1)
            results.append(
                SampleTypeDistribution(
                    sample_type_id=r.sample_type_id,
                    type_code=r.type_code,
                    type_name=r.type_name,
                    sample_count=r.sample_count,
                    total_quantity=float(r.total_quantity),
                    percentage_of_total=pct,
                )
            )
        return results

    @staticmethod
    def get_storage_occupancy_report(db: Session) -> List[StorageOccupancyItem]:
        """
        Calculates occupancy percentage grouped by facility and storage unit type.
        """
        occupied_ids_select = (
            select(Sample.current_storage_location_id)
            .where(Sample.current_storage_location_id.isnot(None))
            .distinct()
        )

        rows = (
            db.query(
                StorageLocation.facility,
                StorageLocation.unit_type,
                func.count(StorageLocation.storage_location_id).label("total_locations"),
                func.count(
                    case(
                        (StorageLocation.storage_location_id.in_(occupied_ids_select), 1),
                        else_=None,
                    )
                ).label("occupied_locations"),
            )
            .group_by(StorageLocation.facility, StorageLocation.unit_type)
            .order_by(StorageLocation.facility, StorageLocation.unit_type)
            .all()
        )

        results = []
        for r in rows:
            avail = r.total_locations - r.occupied_locations
            pct = 0.0
            if r.total_locations > 0:
                pct = round((r.occupied_locations / r.total_locations) * 100.0, 1)
            results.append(
                StorageOccupancyItem(
                    facility=r.facility,
                    unit_type=r.unit_type,
                    total_locations=r.total_locations,
                    occupied_locations=r.occupied_locations,
                    available_locations=avail,
                    occupancy_percentage=pct,
                )
            )
        return results

    @staticmethod
    def get_incident_trends(
        db: Session,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> List[IncidentTrendItem]:
        """
        Aggregate incidents by severity and open/resolved resolution status.
        """
        query = db.query(
            Incident.severity,
            func.count(Incident.incident_id).label("total_count"),
            func.count(
                case(
                    (Incident.status.in_(["open", "investigating"]), 1),
                    else_=None,
                )
            ).label("open_count"),
            func.count(
                case(
                    (Incident.status == "resolved", 1),
                    else_=None,
                )
            ).label("resolved_count"),
        )

        if start_date:
            query = query.filter(Incident.occurred_at >= start_date)
        if end_date:
            query = query.filter(Incident.occurred_at <= end_date)

        rows = query.group_by(Incident.severity).all()

        total_incidents = sum(r.total_count for r in rows) if rows else 0

        # Define canonical severity order
        canonical_severities = ["critical", "high", "medium", "low"]
        row_dict = {r.severity.lower(): r for r in rows}

        results = []
        for sev in canonical_severities:
            r = row_dict.get(sev)
            if r:
                pct = round((r.total_count / total_incidents) * 100.0, 1) if total_incidents > 0 else 0.0
                results.append(
                    IncidentTrendItem(
                        severity=sev,
                        count=r.total_count,
                        open_count=r.open_count,
                        resolved_count=r.resolved_count,
                        percentage=pct,
                    )
                )
            else:
                results.append(
                    IncidentTrendItem(
                        severity=sev,
                        count=0,
                        open_count=0,
                        resolved_count=0,
                        percentage=0.0,
                    )
                )
        return results

    @staticmethod
    def get_experiment_outcomes(db: Session) -> List[ExperimentOutcomeReport]:
        """
        Summarizes experiments by execution status with total and finalized result counts.
        """
        rows = (
            db.query(
                Experiment.status,
                func.count(distinct(Experiment.experiment_id)).label("experiment_count"),
                func.count(ExperimentResult.experiment_result_id).label("results_count"),
                func.count(
                    case(
                        (ExperimentResult.is_final == True, 1),
                        else_=None,
                    )
                ).label("finalized_results_count"),
            )
            .outerjoin(ExperimentResult, Experiment.experiment_id == ExperimentResult.experiment_id)
            .group_by(Experiment.status)
            .order_by(Experiment.status)
            .all()
        )

        results = []
        for r in rows:
            results.append(
                ExperimentOutcomeReport(
                    status=r.status,
                    count=r.experiment_count,
                    results_count=r.results_count,
                    finalized_results_count=r.finalized_results_count,
                )
            )
        return results

    @staticmethod
    def get_activity_feed(db: Session, limit: int = 50) -> List[ActivityFeedItem]:
        """
        Returns recent audit activities with user attribution.
        """
        logs = (
            db.query(
                AuditLog.audit_log_id,
                AuditLog.action,
                AuditLog.entity_type,
                AuditLog.entity_id,
                AuditLog.occurred_at,
                AuditLog.details,
                AppUser.display_name.label("actor_name"),
                AppUser.role.label("actor_role"),
            )
            .outerjoin(AppUser, AuditLog.actor_user_id == AppUser.user_id)
            .order_by(desc(AuditLog.occurred_at))
            .limit(limit)
            .all()
        )

        return [
            ActivityFeedItem(
                audit_log_id=log.audit_log_id,
                actor_name=log.actor_name or "System",
                actor_role=log.actor_role,
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                occurred_at=log.occurred_at,
                details=log.details,
            )
            for log in logs
        ]
