from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class StatusCount(BaseModel):
    status: str
    count: int


class SeverityCount(BaseModel):
    severity: str
    count: int


class ActivityFeedItem(BaseModel):
    audit_log_id: int
    actor_name: Optional[str] = "System"
    actor_role: Optional[str] = None
    action: str
    entity_type: str
    entity_id: Optional[int] = None
    occurred_at: datetime
    details: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class DashboardMetricsResponse(BaseModel):
    total_samples: int = Field(..., description="Total biological samples registered in database")
    active_samples: int = Field(..., description="Samples currently active (REGISTERED, IN_STORAGE, IN_USE)")
    quarantined_samples: int = Field(..., description="Samples currently under safety quarantine")
    depleted_samples: int = Field(..., description="Samples with zero remaining stock")
    total_storage_locations: int = Field(..., description="Total defined physical storage slots/locations")
    occupied_storage_locations: int = Field(..., description="Storage locations currently assigned to a sample")
    storage_occupancy_percent: float = Field(..., description="Percentage of storage capacity occupied")
    total_equipment: int = Field(..., description="Total analytical and storage instruments registered")
    equipment_in_use: int = Field(..., description="Instruments currently engaged in active runs")
    total_experiments: int = Field(..., description="Total research experiments on record")
    active_experiments: int = Field(..., description="Research experiments currently in active execution")
    total_tests: int = Field(..., description="Total laboratory assays performed")
    tests_passed: int = Field(..., description="Assays meeting QC threshold criteria")
    tests_failed: int = Field(..., description="Assays failing QC threshold criteria")
    open_incidents: int = Field(..., description="Unresolved laboratory incidents requiring attention")
    critical_incidents: int = Field(..., description="Open incidents classified at critical safety severity")
    high_risk_ai_predictions: int = Field(..., description="Specimens flagged with HIGH risk degradation by AI")
    pending_ai_reviews: int = Field(..., description="AI risk advisories awaiting human researcher sign-off")
    ancient_specimens_count: int = Field(..., description="Ancient archaeological specimens cataloged")
    recent_activities: List[ActivityFeedItem] = Field(default_factory=list, description="Latest 10 audit trail records")


class SampleTypeDistribution(BaseModel):
    sample_type_id: int
    type_code: str
    type_name: str
    sample_count: int
    total_quantity: float
    percentage_of_total: float


class StorageOccupancyItem(BaseModel):
    facility: str
    unit_type: str
    total_locations: int
    occupied_locations: int
    available_locations: int
    occupancy_percentage: float


class IncidentTrendItem(BaseModel):
    severity: str
    count: int
    open_count: int
    resolved_count: int
    percentage: float


class ExperimentOutcomeReport(BaseModel):
    status: str
    count: int
    results_count: int
    finalized_results_count: int


# ==============================================================================
# Overview Tab Enhancement Schemas
# ==============================================================================

class OverviewKpiResponse(BaseModel):
    total_samples: int = Field(..., description="Total biological samples registered in database")
    active_samples: int = Field(..., description="Samples currently active (REGISTERED, IN_STORAGE, IN_USE)")
    quarantined_samples: int = Field(..., description="Samples currently quarantined due to safety incidents")
    depleted_samples: int = Field(..., description="Samples with zero remaining stock")
    total_storage_locations: int = Field(..., description="Total storage slots across all units")
    occupied_storage_locations: int = Field(..., description="Slots currently containing a sample")
    storage_occupancy_percent: float = Field(..., description="Storage occupancy percentage")
    total_equipment: int = Field(..., description="Total laboratory equipment")
    equipment_in_use: int = Field(..., description="Equipment currently reserved/in use")
    total_experiments: int = Field(..., description="Total experiments")
    active_experiments: int = Field(..., description="Experiments currently active")
    total_tests: int = Field(..., description="Total analytical assays performed")
    tests_passed: int = Field(..., description="Assays meeting QC criteria")
    tests_failed: int = Field(..., description="Assays failing QC criteria")
    qc_pass_rate_percent: float = Field(..., description="Percentage of assays that passed QC")
    open_incidents: int = Field(..., description="Open or investigating incidents")
    critical_incidents: int = Field(..., description="Incidents flagged as critical severity")
    high_risk_ai_predictions: int = Field(..., description="Specimens flagged as HIGH degradation risk by AI")
    pending_ai_reviews: int = Field(..., description="AI assessments awaiting human review")
    ancient_specimens_count: int = Field(..., description="Ancient archaeological specimens")
    total_results: int = Field(..., description="Total experimental results recorded")
    locked_results: int = Field(..., description="Experimental results peer-reviewed and locked")
    draft_results: int = Field(..., description="Experimental results in draft state")
    calculation_period: str = Field(default="All Recorded Operational Data", description="Calculation timeframe")
    last_refreshed_at: datetime = Field(..., description="Timestamp of metrics generation")


class WorkflowStageMetric(BaseModel):
    stage_key: str = Field(..., description="Unique key for workflow stage (specimens, tests, experiments, results)")
    stage_name: str = Field(..., description="Human-readable stage title")
    count: int = Field(..., description="Total entity count at this stage")
    unit_label: str = Field(..., description="Unit noun (Specimens, Assays, Cohorts, Results)")
    description: str = Field(..., description="Operational explanation of this workflow step")
    conversion_rate_percent: Optional[float] = Field(None, description="Conversion percentage relative to entry stage")
    dropoff_count: Optional[int] = Field(None, description="Entities not progressing to subsequent stage")
    active_subcount: Optional[int] = Field(None, description="Active/Verified portion count")
    subcount_label: Optional[str] = Field(None, description="Label for active portion")


class WorkflowPulseResponse(BaseModel):
    stages: List[WorkflowStageMetric] = Field(..., description="Sequential stages of lab workflow pulse")
    pipeline_summary: str = Field(..., description="Executive summary of flow pipeline")
    generated_at: datetime = Field(..., description="Generation timestamp")


class IntegrityFinding(BaseModel):
    rule_id: str = Field(..., description="Canonical rule identifier")
    rule_name: str = Field(..., description="Descriptive rule title")
    severity: str = Field(..., description="Finding severity: ERROR, WARNING, or INFO")
    category: str = Field(..., description="Integrity category")
    entity_type: str = Field(..., description="Affected database entity table")
    record_id: Optional[int] = Field(None, description="ID of affected entity record")
    record_code: Optional[str] = Field(None, description="Human-readable business code (e.g. S001, EXP-002)")
    description: str = Field(..., description="Specific finding details")
    root_cause_explanation: str = Field(..., description="Why this inconsistency exists and relational impact")
    suggested_remedy: str = Field(..., description="Actionable recommendation to resolve the finding")
    action_route: str = Field(..., description="Target navigation route (samples, incidents, experiments, equipment)")


class IntegrityCategoryScore(BaseModel):
    category: str = Field(..., description="Category name")
    total_checks: int = Field(..., description="Number of checks evaluated in this category")
    passed: int = Field(..., description="Checks passing without findings")
    warnings: int = Field(..., description="Checks flagging warnings")
    errors: int = Field(..., description="Checks flagging critical constraint errors")
    compliance_score_percent: float = Field(..., description="Compliance percentage")


class IntegrityScanResponse(BaseModel):
    scan_id: str = Field(..., description="Unique UUID for this scan execution")
    scanned_at: datetime = Field(..., description="Timestamp of scan execution")
    total_checks_performed: int = Field(..., description="Total rule checks evaluated")
    passed_checks: int = Field(..., description="Total checks passing cleanly")
    warning_checks: int = Field(..., description="Total checks with warnings")
    error_checks: int = Field(..., description="Total checks with errors")
    overall_integrity_status: str = Field(..., description="OPTIMAL, ATTENTION_REQUIRED, or DEVIANT")
    category_scores: List[IntegrityCategoryScore] = Field(..., description="Breakdown by integrity dimension")
    findings: List[IntegrityFinding] = Field(..., description="Detailed actionable findings")


class OperationalStatusResponse(BaseModel):
    api_status: str = Field(default="OPERATIONAL", description="Backend API service status")
    database_engine: str = Field(..., description="Active database engine with dialect details")
    database_mode: str = Field(..., description="SQLite or PostgreSQL")
    total_relations: int = Field(..., description="Count of verified application tables")
    relations_verified: bool = Field(default=True, description="Whether core relations exist and are queryable")
    ping_latency_ms: float = Field(..., description="Database query ping latency in milliseconds")
    last_scan_timestamp: Optional[datetime] = Field(None, description="Timestamp of most recent integrity scan")
    uptime_seconds: float = Field(..., description="Process uptime in seconds")
    server_time: datetime = Field(..., description="Current UTC server time")


class DatabaseInsightResponse(BaseModel):
    metric_key: str = Field(..., description="Unique key for the inspected metric or rule")
    metric_title: str = Field(..., description="Human-readable title")
    entity_name: str = Field(..., description="Primary entity concept")
    target_table: str = Field(..., description="Underlying database table(s)")
    sql_query: str = Field(..., description="Actual SQL query executed by the backend")
    query_plan_summary: str = Field(..., description="Query execution and relational algebra summary")
    relational_concept: str = Field(..., description="DBMS concept demonstrated")
    join_explanation: Optional[str] = Field(None, description="Why specific joins are used or avoided")
    count_inflation_risk_explanation: Optional[str] = Field(None, description="How incorrect joins cause count inflation")
    performance_notes: str = Field(..., description="Index usage and aggregation performance notes")
    example_output: Dict[str, Any] = Field(..., description="Sample verified output payload")
