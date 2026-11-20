"""
FastAPI Route Handlers for Module 9: Specimen Handling Advisory
Strict isolation: imports exclusively from app.common and local ai_analysis schemas/service.
"""
from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.common import (
    get_db,
    get_current_user,
    require_roles,
    UserRole,
    APIResponse,
    AppUser,
)
from .schemas import (
    ModelRegistryInfo,
    AIAnalysisResponse,
    AIReviewRequest,
    RiskDistributionResponse,
)
from .service import AIAnalysisService

ai_router = APIRouter(
    prefix="/api/v1/ai",
    tags=["Specimen Handling Advisory"]
)


@ai_router.get(
    "/models",
    response_model=APIResponse[ModelRegistryInfo],
    summary="Get the active handling rule version and provenance",
)
def get_active_model(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    model_info = AIAnalysisService.get_active_model_info(db)
    return APIResponse(
        success=True,
        message=f"Active model: {model_info.model_name} {model_info.model_version}.",
        data=model_info,
    )


@ai_router.get(
    "/analyses/{sample_id}",
    response_model=APIResponse[List[AIAnalysisResponse]],
    summary="Get historical and latest AI risk assessments for a biological specimen",
)
def get_sample_analyses(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    analyses = AIAnalysisService.get_sample_analyses(db, sample_id)
    return APIResponse(
        success=True,
        message=f"Retrieved {len(analyses)} risk assessment(s) for sample {sample_id}.",
        data=analyses,
    )


@ai_router.post(
    "/predict/{sample_id}",
    response_model=APIResponse[AIAnalysisResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Apply handling rules to recorded evidence",
)
def predict_sample_risk(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, UserRole.RESEARCHER.value, "LAB_MANAGER", "TECHNICIAN"])),
):
    prediction = AIAnalysisService.predict_sample_risk(db, sample_id, actor_id=current_user.user_id)
    return APIResponse(
        success=True,
        message=f"Handling assessment recorded: {prediction.predicted_risk}.",
        data=prediction,
    )


@ai_router.post(
    "/review/{analysis_id}",
    response_model=APIResponse[AIAnalysisResponse],
    summary="Human-in-the-loop review: Researcher confirms or overrides advisory prediction with rationale",
)
def review_analysis(
    analysis_id: int,
    payload: AIReviewRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, UserRole.RESEARCHER.value, "LAB_MANAGER", "REVIEWER"])),
):
    reviewed = AIAnalysisService.review_analysis(
        db,
        analysis_id,
        payload,
        reviewer_id=current_user.user_id
    )
    return APIResponse(
        success=True,
        message=f"Expert review logged: {reviewed.review_feedback.upper()} by {current_user.display_name}.",
        data=reviewed,
    )


@ai_router.get(
    "/risk-distribution",
    response_model=APIResponse[RiskDistributionResponse],
    summary="Aggregate risk level breakdown across all active samples",
)
def get_risk_distribution(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    distribution = AIAnalysisService.get_risk_distribution(db)
    return APIResponse(
        success=True,
        message="Laboratory risk distribution retrieved successfully.",
        data=distribution,
    )
