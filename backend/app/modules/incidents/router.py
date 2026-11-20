"""
FastAPI Route Handlers for Module 8: Laboratory Incidents & Blast Radius Tracing
Strict isolation: imports exclusively from app.common and local incidents schemas/service.
"""
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
    IncidentCreateRequest,
    IncidentUpdateRequest,
    IncidentListItem,
    IncidentDetailResponse,
    IncidentBlastRadiusResponse,
)
from .service import IncidentService

incidents_router = APIRouter(
    prefix="/api/v1/incidents",
    tags=["Laboratory Incidents & Blast Radius Tracing"]
)


@incidents_router.get(
    "",
    response_model=PaginatedResponse[IncidentListItem],
    summary="List laboratory incidents with multi-facet filters",
)
def list_incidents(
    severity: Optional[str] = Query(None, description="Filter by severity: low, medium, high, critical"),
    status: Optional[str] = Query(None, description="Filter by status: open, investigating, mitigated, closed"),
    sample_id: Optional[int] = Query(None, description="Filter by primary sample ID"),
    search: Optional[str] = Query(None, description="Search across incident code, description, or sample code"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    items, total = IncidentService.list_incidents(
        db,
        severity=severity,
        status=status,
        sample_id=sample_id,
        search=search,
        page=page,
        page_size=page_size,
    )
    total_pages = math.ceil(total / page_size) if total > 0 else 0
    return PaginatedResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@incidents_router.get(
    "/{incident_id}",
    response_model=APIResponse[IncidentDetailResponse],
    summary="Get detailed incident investigation dossier",
)
def get_incident(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    detail = IncidentService.get_incident_detail(db, incident_id)
    return APIResponse(
        success=True,
        message="Incident dossier retrieved successfully.",
        data=detail,
    )


@incidents_router.post(
    "",
    response_model=APIResponse[IncidentDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Record a laboratory incident (triggers automated quarantine for high/critical severities)",
)
def create_incident(
    payload: IncidentCreateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, UserRole.RESEARCHER.value, "LAB_MANAGER", "TECHNICIAN"])),
):
    created = IncidentService.create_incident(db, payload, reporter_id=current_user.user_id)
    return APIResponse(
        success=True,
        message=f"Incident '{created.incident_code}' logged successfully. Status: {created.status}.",
        data=created,
    )


@incidents_router.put(
    "/{incident_id}",
    response_model=APIResponse[IncidentDetailResponse],
    summary="Update incident investigation notes, CAPA resolution, or status",
)
def update_incident(
    incident_id: int,
    payload: IncidentUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, UserRole.RESEARCHER.value, "LAB_MANAGER"])),
):
    updated = IncidentService.update_incident(db, incident_id, payload, actor_id=current_user.user_id)
    return APIResponse(
        success=True,
        message=f"Incident '{updated.incident_code}' updated successfully.",
        data=updated,
    )


@incidents_router.get(
    "/{incident_id}/downstream-impact",
    response_model=APIResponse[IncidentBlastRadiusResponse],
    summary="Signature Blast Radius Query: Traverse DAG to trace downstream child samples, compromised experiments, and tainted results",
)
def get_downstream_impact(
    incident_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    blast_radius = IncidentService.get_downstream_blast_radius(db, incident_id)
    return APIResponse(
        success=True,
        message=f"Blast radius analysis complete: {blast_radius.total_samples_at_risk} sample(s), {blast_radius.total_experiments_compromised} experiment(s), {blast_radius.total_results_tainted} result(s) affected.",
        data=blast_radius,
    )
