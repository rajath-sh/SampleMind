"""
SampleMind Analytics & Dashboard API Router
Endpoints for high-level lab KPIs, distribution reports, operational summaries,
and Overview Command Centre enhancements (Workflow Pulse, Data Integrity Observatory,
Educational DBMS query insights, and Live Operational Telemetry).
Strictly isolated: Imports exclusively from app.common and local module.
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.common import (
    get_db,
    get_current_user,
    AppUser,
    APIResponse,
)
from .schemas import (
    DashboardMetricsResponse,
    SampleTypeDistribution,
    StorageOccupancyItem,
    IncidentTrendItem,
    ExperimentOutcomeReport,
    ActivityFeedItem,
    OverviewKpiResponse,
    WorkflowPulseResponse,
    IntegrityScanResponse,
    OperationalStatusResponse,
    DatabaseInsightResponse,
)
from .service import AnalyticsService

analytics_router = APIRouter(prefix="/api/v1/analytics", tags=["Lab Analytics & Dashboard"])


@analytics_router.get(
    "/dashboard",
    response_model=APIResponse[DashboardMetricsResponse],
    status_code=status.HTTP_200_OK,
    summary="Retrieve lab executive dashboard metrics",
    description="Returns aggregate counts, storage occupancy %, active experiments, open incidents, and recent audit records.",
)
def get_dashboard_metrics(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    metrics = AnalyticsService.get_dashboard_metrics(db)
    return APIResponse(
        success=True,
        message="Laboratory dashboard metrics retrieved successfully.",
        data=metrics,
    )


@analytics_router.get(
    "/overview-kpis",
    response_model=APIResponse[OverviewKpiResponse],
    status_code=status.HTTP_200_OK,
    summary="Retrieve refined laboratory operations KPIs for Overview Command Centre",
    description="Calculates live operational telemetry across specimens, storage, experiments, assays, incidents, and locked/draft results.",
)
def get_overview_kpis(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    kpis = AnalyticsService.get_overview_kpis(db)
    return APIResponse(
        success=True,
        message="Overview operational KPIs retrieved successfully.",
        data=kpis,
    )


@analytics_router.get(
    "/workflow-pulse",
    response_model=APIResponse[WorkflowPulseResponse],
    status_code=status.HTTP_200_OK,
    summary="Retrieve aggregate laboratory workflow progression pulse",
    description="Calculates stage counts and conversion rates across Registered Specimens -> Analytical Assays -> Research Cohorts -> Verified Results.",
)
def get_workflow_pulse(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    pulse = AnalyticsService.get_workflow_pulse(db)
    return APIResponse(
        success=True,
        message="Workflow pulse progression data assembled successfully.",
        data=pulse,
    )


@analytics_router.post(
    "/integrity-scan",
    response_model=APIResponse[IntegrityScanResponse],
    status_code=status.HTTP_200_OK,
    summary="Execute comprehensive laboratory data quality & relational integrity scan",
    description="Performs 8 non-destructive DBMS and business-rule validation checks, returning structured categorized findings and logging an audit event.",
)
def run_integrity_scan(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    scan_result = AnalyticsService.run_integrity_scan(db, actor_id=current_user.user_id)
    return APIResponse(
        success=True,
        message=f"Integrity scan completed with status '{scan_result.overall_integrity_status}'.",
        data=scan_result,
    )


@analytics_router.get(
    "/operational-status",
    response_model=APIResponse[OperationalStatusResponse],
    status_code=status.HTTP_200_OK,
    summary="Retrieve verified live database engine and API telemetry",
    description="Safely introspects database connectivity, active dialect/engine, relation count, ping latency, and process uptime without leaking credentials.",
)
def get_operational_status(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    status_info = AnalyticsService.get_operational_status(db)
    return APIResponse(
        success=True,
        message="Operational database telemetry retrieved successfully.",
        data=status_info,
    )


@analytics_router.get(
    "/database-insight/{metric_key}",
    response_model=APIResponse[DatabaseInsightResponse],
    status_code=status.HTTP_200_OK,
    summary="Retrieve educational DBMS query and relational concept explanation",
    description="Returns verified SQL queries, query execution plans, relational algebra rationales, and join explanations for student DBMS evaluation.",
)
def get_database_insight(
    metric_key: str,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    insight = AnalyticsService.get_database_insight(metric_key, db)
    return APIResponse(
        success=True,
        message=f"Database insight for '{metric_key}' retrieved.",
        data=insight,
    )


@analytics_router.get(
    "/reports/samples-by-type",
    response_model=APIResponse[List[SampleTypeDistribution]],
    status_code=status.HTTP_200_OK,
    summary="Distribution of samples grouped by biological classification",
)
def get_samples_by_type_report(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    data = AnalyticsService.get_samples_by_type(db)
    return APIResponse(
        success=True,
        message=f"Retrieved distribution for {len(data)} sample types.",
        data=data,
    )


@analytics_router.get(
    "/reports/storage-occupancy",
    response_model=APIResponse[List[StorageOccupancyItem]],
    status_code=status.HTTP_200_OK,
    summary="Storage utilization percentage across facilities and unit types",
)
def get_storage_occupancy_report(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    data = AnalyticsService.get_storage_occupancy_report(db)
    return APIResponse(
        success=True,
        message=f"Retrieved occupancy for {len(data)} storage unit groups.",
        data=data,
    )


@analytics_router.get(
    "/reports/incident-trends",
    response_model=APIResponse[List[IncidentTrendItem]],
    status_code=status.HTTP_200_OK,
    summary="Incident distribution by severity and resolution status",
)
def get_incident_trends_report(
    start_date: Optional[datetime] = Query(None, description="Start date filter for incident records"),
    end_date: Optional[datetime] = Query(None, description="End date filter for incident records"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    data = AnalyticsService.get_incident_trends(db, start_date=start_date, end_date=end_date)
    return APIResponse(
        success=True,
        message="Incident severity trends retrieved successfully.",
        data=data,
    )


@analytics_router.get(
    "/reports/experiment-outcomes",
    response_model=APIResponse[List[ExperimentOutcomeReport]],
    status_code=status.HTTP_200_OK,
    summary="Experiment execution breakdown with total and finalized result counts",
)
def get_experiment_outcomes_report(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    data = AnalyticsService.get_experiment_outcomes(db)
    return APIResponse(
        success=True,
        message=f"Retrieved outcomes for {len(data)} experiment statuses.",
        data=data,
    )


@analytics_router.get(
    "/reports/activity-feed",
    response_model=APIResponse[List[ActivityFeedItem]],
    status_code=status.HTTP_200_OK,
    summary="Recent audit log activity timeline",
)
def get_activity_feed_report(
    limit: int = Query(50, ge=1, le=200, description="Maximum number of audit events to return"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    data = AnalyticsService.get_activity_feed(db, limit=limit)
    return APIResponse(
        success=True,
        message=f"Retrieved {len(data)} recent audit activities.",
        data=data,
    )
