"""
SampleMind Experiments Module - API Routers
===========================================
Strict isolation: imports only from app.common and local experiments schemas/service.
Exposes endpoints for research experiment lifecycle, cohort management,
instrument reservations, and result verification workflows.
"""

from __future__ import annotations
from typing import List, Optional
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
    ExperimentCreateRequest,
    ExperimentUpdateRequest,
    ExperimentSampleAttachRequest,
    ExperimentEquipmentAttachRequest,
    ResultCreateRequest,
    ResultVerifyRequest,
    ResultUpdateRequest,
    ExperimentListItem,
    ExperimentDetailResponse,
    ResultDetailResponse,
)
from .service import ExperimentService

experiments_router = APIRouter(
    prefix="/api/v1/experiments",
    tags=["Research Experiments & Cohorts"]
)

results_router = APIRouter(
    prefix="/api/v1/results",
    tags=["Experimental Results Registry"]
)


# ==============================================================================
# Experiment Endpoints
# ==============================================================================

@experiments_router.get(
    "",
    response_model=PaginatedResponse[ExperimentListItem],
    summary="Paginated catalog of research experiments with status & researcher filters",
)
def list_experiments(
    status: Optional[str] = Query(None, description="planned, active, completed, cancelled, on_hold"),
    lead_researcher_id: Optional[int] = Query(None, description="Filter by lead researcher ID"),
    search: Optional[str] = Query(None, description="Search by code, title, objective, or protocol reference"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Returns paginated list of research projects with cohort and result metrics."""
    items, total = ExperimentService.list_experiments(
        db=db,
        status=status,
        lead_researcher_id=lead_researcher_id,
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


@experiments_router.get(
    "/{experiment_id}",
    response_model=APIResponse[ExperimentDetailResponse],
    summary="Retrieve full research experiment dossier with cohort and equipment context",
)
def get_experiment_detail(
    experiment_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Retrieves complete experiment profile with linked specimens, instruments, and results."""
    detail = ExperimentService.get_experiment_by_id(db=db, experiment_id=experiment_id)
    return APIResponse(
        message=f"Experiment '{detail.experiment_code}' retrieved successfully.",
        data=detail
    )


@experiments_router.post(
    "",
    response_model=APIResponse[ExperimentDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create a new research experiment with cohorts and equipment reservations",
)
def create_experiment(
    req: ExperimentCreateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Registers a research experiment, connects initial specimens, and reserves equipment."""
    created = ExperimentService.create_experiment(
        db=db,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Experiment '{created.experiment_code}' initialized successfully.",
        data=created
    )


@experiments_router.put(
    "/{experiment_id}",
    response_model=APIResponse[ExperimentDetailResponse],
    summary="Update experiment protocol, timeline, or operational state",
)
def update_experiment(
    experiment_id: int,
    req: ExperimentUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Updates research experiment metadata, timeline milestones, or status."""
    updated = ExperimentService.update_experiment(
        db=db,
        experiment_id=experiment_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Experiment '{updated.experiment_code}' updated successfully.",
        data=updated
    )


@experiments_router.delete(
    "/{experiment_id}",
    response_model=APIResponse[bool],
    summary="Delete research experiment and linked cohorts/results (Admin, Researcher)",
)
def delete_experiment(
    experiment_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Deletes research experiment and all its cascaded links."""
    success = ExperimentService.delete_experiment(
        db=db,
        experiment_id=experiment_id,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message="Experiment deleted successfully.",
        data=success
    )


@experiments_router.post(
    "/{experiment_id}/samples",
    response_model=APIResponse[bool],
    summary="Attach an additional biological specimen to an experiment cohort",
)
def attach_sample_to_experiment(
    experiment_id: int,
    req: ExperimentSampleAttachRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Attaches a sample to the experiment cohort with usage role designation."""
    success = ExperimentService.attach_sample(
        db=db,
        experiment_id=experiment_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message="Specimen successfully attached to experiment cohort.",
        data=success
    )


@experiments_router.post(
    "/{experiment_id}/equipment",
    response_model=APIResponse[bool],
    summary="Allocate or attach equipment to an experiment",
)
def attach_equipment_to_experiment(
    experiment_id: int,
    req: ExperimentEquipmentAttachRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Allocates equipment to the experiment."""
    success = ExperimentService.attach_equipment(
        db=db,
        experiment_id=experiment_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message="Equipment successfully allocated to experiment.",
        data=success
    )


@experiments_router.get(
    "/{experiment_id}/results",
    response_model=APIResponse[List[ResultDetailResponse]],
    summary="List all scientific measurements and observations generated by an experiment",
)
def get_experiment_results(
    experiment_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Returns all scientific findings generated by this research project."""
    results, _ = ExperimentService.list_results(db=db, experiment_id=experiment_id, page=1, page_size=100)
    return APIResponse(
        message=f"Retrieved {len(results)} results for experiment #{experiment_id}.",
        data=results
    )


@experiments_router.post(
    "/{experiment_id}/results",
    response_model=APIResponse[ResultDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Record a new experimental measurement or observational result",
)
def create_experiment_result(
    experiment_id: int,
    req: ResultCreateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Records an empirical observation or quantitative metric yielded by the experiment."""
    res = ExperimentService.create_result(
        db=db,
        experiment_id=experiment_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Result '{res.result_code}' recorded successfully.",
        data=res
    )


# ==============================================================================
# Global Results Endpoints
# ==============================================================================

@results_router.get(
    "",
    response_model=PaginatedResponse[ResultDetailResponse],
    summary="Global registry of experimental results across all protocols",
)
def list_global_results(
    sample_id: Optional[int] = Query(None, description="Filter results linked to a sample"),
    experiment_id: Optional[int] = Query(None, description="Filter results by experiment ID"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """Global query of experimental measurements and verified scientific outcomes."""
    items, total = ExperimentService.list_results(
        db=db,
        sample_id=sample_id,
        experiment_id=experiment_id,
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


@results_router.put(
    "/{result_id}",
    response_model=APIResponse[ResultDetailResponse],
    summary="Update an experimental result (Admin, Researcher)",
)
def update_result(
    result_id: int,
    req: ResultUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Updates fields of an experimental result."""
    updated = ExperimentService.update_result(
        db=db,
        result_id=result_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Result '{updated.result_code}' updated successfully.",
        data=updated
    )


@results_router.put(
    "/{result_id}/verify",
    response_model=APIResponse[ResultDetailResponse],
    summary="Verify an experimental result (Admin, Researcher or Reviewer)",
)
def verify_result(
    result_id: int,
    req: ResultVerifyRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "RESEARCHER", "REVIEWER"])),
):
    """Sets result as final and locks it with verification notes."""
    verified = ExperimentService.verify_result(
        db=db,
        result_id=result_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Result '{verified.result_code}' status updated: Final={verified.is_final}.",
        data=verified
    )


@results_router.delete(
    "/{result_id}",
    response_model=APIResponse[bool],
    summary="Delete an experimental result (Admin, Researcher)",
)
def delete_result(
    result_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Deletes an experimental result."""
    success = ExperimentService.delete_result(
        db=db,
        result_id=result_id,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message="Result deleted successfully.",
        data=success
    )
