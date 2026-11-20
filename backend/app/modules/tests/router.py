"""
SampleMind Tests Module - API Router
====================================
Strict isolation: imports only from app.common and local tests schemas/service.
Exposes endpoints for assay scheduling, outcome metrics recording,
and paginated filtering by specimen, status, or interpretation.
"""

from __future__ import annotations
from typing import Optional
import math
from fastapi import APIRouter, Depends, status, Query
from sqlalchemy.orm import Session

from app.common import (
    get_db,
    get_current_user,
    require_roles,
    UserRole,
    APIResponse,
    PaginatedResponse,
    AppUser,
)
from .schemas import (
    TestCreateRequest,
    TestUpdateRequest,
    TestListItem,
    TestDetailResponse,
    QCEvaluationRequest,
    QCEvaluationResponse,
    SpecimenClearanceDossier,
    InstrumentQCReport,
    BatchTestCreateRequest,
    BatchTestCreateResponse,
    TestQualityMetricsResponse,
)
from .service import TestService

router = APIRouter(
    prefix="/api/v1/tests",
    tags=["Laboratory Quality & Analytical Testing"]
)


@router.get(
    "",
    response_model=PaginatedResponse[TestListItem],
    summary="List analytical assays with status, specimen, and outcome filters",
)
def list_tests(
    sample_id: Optional[int] = Query(None, description="Filter assays performed on a specific specimen"),
    status: Optional[str] = Query(None, description="Filter by status: requested, in_progress, completed, cancelled"),
    outcome: Optional[str] = Query(None, description="Filter by outcome interpretation: PASS, FAIL, OPTIMAL, CONTAMINATED, etc."),
    search: Optional[str] = Query(None, description="Search test type, observation, or specimen code"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Returns a paginated list of laboratory assays matching multi-facet criteria.
    """
    items, total = TestService.list_tests(
        db=db,
        sample_id=sample_id,
        test_status=status,
        result_interpretation=outcome,
        search=search,
        page=page,
        page_size=page_size
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.post(
    "/evaluate-qc",
    response_model=APIResponse[QCEvaluationResponse],
    summary="Evaluate analytical assay outcome against scientific acceptance thresholds",
)
def evaluate_qc(
    req: QCEvaluationRequest,
    current_user: AppUser = Depends(get_current_user),
):
    """
    Phase 2 Feature: Automated Scientific Acceptance Criteria & QC Decision Engine.
    Evaluates numerical assay readings against ISO 17025 and NGS protocol standards.
    """
    eval_res = TestService.evaluate_qc_thresholds(
        test_type=req.test_type,
        result_value=req.result_value,
        result_unit=req.result_unit
    )
    return APIResponse(
        message=f"QC acceptance evaluated: {eval_res.recommended_interpretation} ({eval_res.compliance_level}).",
        data=eval_res
    )


@router.get(
    "/clearance/{sample_id}",
    response_model=APIResponse[SpecimenClearanceDossier],
    summary="Generate multi-assay Certificate of Analysis (CoA) and study release dossier",
)
def get_specimen_clearance(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Phase 2 Feature: Multi-Assay Specimen Clearance & Certificate of Analysis (CoA).
    Aggregates full quality battery to determine whether specimen is certified for downstream studies.
    """
    dossier = TestService.get_specimen_clearance(db=db, sample_id=sample_id)
    return APIResponse(
        message=f"Certificate of Analysis {dossier.certificate_id} generated for {dossier.sample_code}: Status={dossier.clearance_status}.",
        data=dossier
    )


@router.get(
    "/analytics/instrument-drift",
    response_model=APIResponse[list[InstrumentQCReport]],
    summary="Statistical quality control and instrument calibration drift analytics",
)
def get_instrument_drift(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Phase 2 Feature: Statistical Quality Control & Instrument Drift Monitoring.
    Computes Levey-Jennings statistics (Mean, Std Dev, %CV, 2-sigma warnings, 3-sigma alarms).
    """
    reports = TestService.get_instrument_drift_analytics(db=db)
    return APIResponse(
        message=f"Statistical QC analytics computed across {len(reports)} assay instrument protocol(s).",
        data=reports
    )


@router.post(
    "/batch",
    response_model=APIResponse[BatchTestCreateResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Schedule batch analytical assays across multiple specimens",
)
def create_batch_tests(
    req: BatchTestCreateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Phase 2 Feature: High-Throughput Batch Assay Scheduling.
    Schedules an identical analytical protocol across a cohort of biological specimens.
    """
    batch_res = TestService.create_batch_tests(
        db=db,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Batch [{batch_res.batch_run_identifier}] scheduled {batch_res.scheduled_count} assays ({batch_res.skipped_count} skipped).",
        data=batch_res
    )


@router.get(
    "/quality-metrics",
    response_model=APIResponse[TestQualityMetricsResponse],
    summary="Compute aggregate analytical testing performance KPIs and QC alerts",
)
def get_quality_metrics(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Phase 3 Feature: Analytical Laboratory Quality & Operational Intelligence.
    Returns pass rates, turnaround times, contamination alerts, and protocol breakdown.
    """
    metrics = TestService.get_quality_metrics(db=db)
    return APIResponse(
        message=f"Quality metrics computed across {metrics.total_tests} laboratory assays: Pass Rate={metrics.pass_rate_pct}%.",
        data=metrics
    )


@router.get(
    "/{test_id}",
    response_model=APIResponse[TestDetailResponse],
    summary="Retrieve comprehensive analytical assay dossier and observations",
)
def get_test_detail(
    test_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Retrieves full quantitative metrics, execution protocol, observation notes,
    and associated specimen details for a specific assay.
    """
    detail = TestService.get_test_by_id(db=db, test_id=test_id)
    return APIResponse(
        message=f"Assay #{test_id} ({detail.test_type}) retrieved successfully.",
        data=detail
    )


@router.post(
    "",
    response_model=APIResponse[TestDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Schedule or record a new analytical assay on a biological specimen",
)
def create_test(
    req: TestCreateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Schedules a new quality control or analytical assay.
    Validates specimen existence and updates status to IN_USE if assay is initiated.
    """
    created = TestService.create_test(
        db=db,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Assay '{created.test_type}' scheduled successfully for specimen '{created.sample_code}'.",
        data=created
    )


@router.put(
    "/{test_id}",
    response_model=APIResponse[TestDetailResponse],
    summary="Update assay execution progress, quantitative reading, or QC interpretation",
)
def update_test(
    test_id: int,
    req: TestUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Records analytical test completion, quantitative result values (concentration, ratio, DIN),
    qualitative observations, and pass/fail interpretations.
    """
    updated = TestService.update_test(
        db=db,
        test_id=test_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Assay #{test_id} updated successfully: Status={updated.test_status}.",
        data=updated
    )
