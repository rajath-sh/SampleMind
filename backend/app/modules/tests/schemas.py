"""
SampleMind Tests Module - Schemas & DTOs
========================================
Strict isolation: imports only from app.common.
Defines schemas for scheduling, executing, and recording analytical assay outcomes.
"""

from __future__ import annotations
from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field


# ==============================================================================
# Assay Request & Mutation Schemas
# ==============================================================================

class TestCreateRequest(BaseModel):
    """Payload to schedule or record a new analytical laboratory assay."""
    sample_id: int = Field(..., description="Target biological specimen ID")
    test_type: str = Field(..., min_length=2, max_length=100, description="e.g. Qubit Fluorometry, qPCR Ancient DNA, Bioanalyzer")
    test_status: str = Field(default="requested", description="requested, in_progress, completed, cancelled")
    requested_at: Optional[datetime] = None
    performed_at: Optional[datetime] = None
    performed_by: Optional[int] = None
    observation: Optional[str] = Field(None, description="Analytical protocol notes and qualitative observations")
    result_value: Optional[float] = Field(None, description="Quantitative assay reading (e.g. concentration, ratio, DIN)")
    result_unit: Optional[str] = Field(None, max_length=24, description="Measurement unit (e.g. ng/uL, bp, DIN, copies/uL)")
    result_interpretation: Optional[str] = Field(None, max_length=80, description="PASS, FAIL, OPTIMAL, BORDERLINE, CONTAMINATED")
    quantity_consumed: Optional[float] = Field(None, ge=0.0, description="Physical specimen quantity consumed during assay execution")
    auto_quarantine_on_failure: bool = Field(True, description="Whether a FAIL/CONTAMINATED result automatically triggers specimen quarantine")


class TestUpdateRequest(BaseModel):
    """Payload to update an assay's execution status, outcome metric, and interpretation."""
    test_status: Optional[str] = Field(None, description="requested, in_progress, completed, cancelled")
    performed_at: Optional[datetime] = None
    performed_by: Optional[int] = None
    observation: Optional[str] = None
    result_value: Optional[float] = None
    result_unit: Optional[str] = None
    result_interpretation: Optional[str] = None
    quantity_consumed: Optional[float] = Field(None, ge=0.0, description="Physical specimen quantity consumed during assay execution")
    auto_quarantine_on_failure: bool = Field(True, description="Whether a FAIL/CONTAMINATED result automatically triggers specimen quarantine")
    cancellation_reason: Optional[str] = Field(None, description="Required justification when cancelling an assay")


# ==============================================================================
# Assay Presentation Schemas
# ==============================================================================

class TestListItem(BaseModel):
    """Compact representation of an analytical test in query listings."""
    sample_test_id: int
    sample_id: int
    sample_code: str
    sample_name: str
    sample_type_code: str
    sample_status: Optional[str] = None
    test_type: str
    test_status: str
    result_value: Optional[float] = None
    result_unit: Optional[str] = None
    result_interpretation: Optional[str] = None
    performed_by_name: Optional[str] = None
    requested_at: Optional[datetime] = None
    performed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class TestDetailResponse(BaseModel):
    """Comprehensive dossier of an analytical assay and its specimen context."""
    sample_test_id: int
    sample_id: int
    sample_code: str
    sample_name: str
    sample_type_code: str
    sample_type_name: str
    sample_status: str
    sample_storage_location: Optional[str] = None
    test_type: str
    test_status: str
    requested_at: Optional[datetime] = None
    performed_at: Optional[datetime] = None
    performed_by: Optional[int] = None
    performed_by_name: Optional[str] = None
    observation: Optional[str] = None
    result_value: Optional[float] = None
    result_unit: Optional[str] = None
    result_interpretation: Optional[str] = None
    quantity_consumed: Optional[float] = None
    sample_remaining_quantity: Optional[float] = None
    sample_quarantined_by_test: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


# ==============================================================================
# Phase 2: Scientific Acceptance Criteria & QC Decision Engine Schemas
# ==============================================================================

class QCEvaluationRequest(BaseModel):
    """Payload to evaluate a laboratory assay reading against scientific QC acceptance standards."""
    test_type: str = Field(..., description="e.g. Qubit 4 Fluorometer, TapeStation 4200, qPCR 16S screen")
    result_value: float = Field(..., description="Numerical analytical measurement")
    result_unit: Optional[str] = Field(None, description="e.g. ng/uL, DIN, copies/uL, bp")


class QCEvaluationResponse(BaseModel):
    """Result of automated scientific QC acceptance threshold evaluation."""
    test_type: str
    result_value: float
    result_unit: Optional[str] = None
    recommended_interpretation: str = Field(..., description="OPTIMAL, PASS, BORDERLINE, FAIL, CONTAMINATED")
    compliance_level: str = Field(..., description="ACCEPTABLE, CONDITIONAL, REJECTED")
    confidence_score: float = Field(..., description="Confidence percentage 0.0 to 100.0")
    parameter_name: str = Field(..., description="e.g. dsDNA Yield, Genomic Integrity (DIN), Microbial Bio-burden")
    reference_standard: str = Field(..., description="e.g. ISO 17025 / Illumina TruSeq Standard Protocol")
    threshold_criteria: str = Field(..., description="Codified scientific threshold rationale")
    laboratory_guidance: str = Field(..., description="Actionable operational instruction for laboratory personnel")


# ==============================================================================
# Phase 2: Multi-Assay Specimen Clearance & Certificate of Analysis (CoA)
# ==============================================================================

class EvaluatedAssaySummary(BaseModel):
    """Summary of an individual assay outcome in a multi-assay clearance panel."""
    sample_test_id: int
    test_type: str
    test_status: str
    result_value: Optional[float] = None
    result_unit: Optional[str] = None
    result_interpretation: Optional[str] = None
    performed_at: Optional[datetime] = None
    performed_by_name: Optional[str] = None
    tolerance_status: str = Field(..., description="PASS, FAIL, BORDERLINE, PENDING")


class SpecimenClearanceDossier(BaseModel):
    """Formal Certificate of Analysis and multi-assay release clearance for experimental use."""
    sample_id: int
    sample_code: str
    sample_name: str
    sample_type_name: str
    sample_status: str
    storage_location: Optional[str] = None
    clearance_status: str = Field(..., description="RELEASED_FOR_STUDY, CONDITIONAL_APPROVAL, REJECTED_QC_HOLD, TESTING_PENDING, INSUFFICIENT_TESTS")
    clearance_decision: str
    can_release: bool
    total_tests_conducted: int
    passed_tests_count: int
    failed_tests_count: int
    borderline_tests_count: int
    pending_tests_count: int
    evaluated_assays: list[EvaluatedAssaySummary]
    certificate_id: str
    certified_at: datetime
    quality_specifications_met: bool


# ==============================================================================
# Phase 2: Statistical Quality Control & Instrument Drift Monitoring
# ==============================================================================

class InstrumentQCReport(BaseModel):
    """Statistical quality control analysis and calibration drift report per assay instrument."""
    test_type: str
    measurement_unit: Optional[str] = None
    run_count: int
    mean_value: float
    std_deviation: float
    coeff_of_variation_pct: float
    min_value: float
    max_value: float
    latest_reading: Optional[float] = None
    latest_z_score: Optional[float] = None
    warning_count_2sigma: int
    action_count_3sigma: int
    control_status: str = Field(..., description="STABLE, MARGINAL, DRIFT_DETECTED, INSUFFICIENT_DATA")
    recommended_action: str


# ==============================================================================
# Phase 2: High-Throughput Batch Assay Scheduling
# ==============================================================================

class BatchTestCreateRequest(BaseModel):
    """Payload to schedule an identical assay protocol across a batch of biological specimens."""
    sample_ids: list[int] = Field(..., min_length=1, max_length=96, description="Target biological specimen IDs (1 to 96)")
    test_type: str = Field(..., min_length=2, max_length=100)
    batch_run_identifier: Optional[str] = Field(None, description="e.g. BATCH-2026-10-OCTA-01")
    quantity_consumed_per_sample: Optional[float] = Field(0.0, ge=0.0)
    result_unit: Optional[str] = None
    observation: Optional[str] = None
    requested_at: Optional[datetime] = None


class BatchSkippedItem(BaseModel):
    sample_id: int
    sample_code: str
    reason: str
    error_code: str


class BatchTestCreateResponse(BaseModel):
    """Summary of batch analytical assay creation."""
    batch_run_identifier: str
    scheduled_count: int
    skipped_count: int
    created_tests: list[TestListItem]
    skipped_samples: list[BatchSkippedItem]


# ==============================================================================
# Phase 3: Analytical Laboratory Quality & Operational Intelligence Schemas
# ==============================================================================

class TestTypeBreakdownItem(BaseModel):
    test_type: str
    count: int
    optimal_count: int
    pass_count: int
    borderline_count: int
    fail_count: int


class QCAlertItem(BaseModel):
    sample_test_id: int
    sample_id: int
    sample_code: str
    test_type: str
    result_value: Optional[float] = None
    result_unit: Optional[str] = None
    result_interpretation: str
    performed_at: Optional[datetime] = None


class TestQualityMetricsResponse(BaseModel):
    """Aggregate operational metrics and quality KPIs for laboratory analytical testing."""
    total_tests: int
    completed_tests: int
    in_progress_tests: int
    requested_tests: int
    cancelled_tests: int
    pass_rate_pct: float
    contamination_rate_pct: float
    quarantined_samples_count: int
    avg_turnaround_hours: Optional[float] = None
    test_type_breakdown: list[TestTypeBreakdownItem]
    recent_qc_alerts: list[QCAlertItem]


