"""
FastAPI Route Handlers for Module 7: Ancient Specimens & Archaeological Provenance
Strict isolation: imports exclusively from app.common and local ancient schemas/service.
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, status, Query
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
    SiteCreateRequest,
    SiteUpdateRequest,
    SiteDetailResponse,
    AncientSpecimenCreate,
    AncientSpecimenUpdate,
    AncientSpecimenListItem,
    AncientSpecimenDetail,
)
from .service import AncientService

ancient_router = APIRouter(
    prefix="/api/v1/ancient",
    tags=["Ancient Specimens & Archaeological Provenance"]
)


# -----------------------------------------------------------------------------
# Archaeological Sites Endpoints
# -----------------------------------------------------------------------------
@ancient_router.get(
    "/sites",
    response_model=APIResponse[List[SiteDetailResponse]],
    summary="List archaeological excavation sites",
)
def list_sites(
    country: Optional[str] = Query(None, description="Filter by country"),
    search: Optional[str] = Query(None, description="Search term across site code, name, and region"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    sites = AncientService.list_sites(db, country=country, search=search)
    return APIResponse(
        success=True,
        message=f"Retrieved {len(sites)} excavation sites.",
        data=sites,
    )


@ancient_router.get(
    "/sites/{site_id}",
    response_model=APIResponse[SiteDetailResponse],
    summary="Get excavation site detail",
)
def get_site(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    site = AncientService.get_site(db, site_id)
    return APIResponse(
        success=True,
        message="Excavation site retrieved successfully.",
        data=site,
    )


@ancient_router.post(
    "/sites",
    response_model=APIResponse[SiteDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Register a new archaeological excavation site",
)
def create_site(
    payload: SiteCreateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, UserRole.RESEARCHER.value, "LAB_MANAGER", "TECHNICIAN"])),
):
    created = AncientService.create_site(db, payload, actor_id=current_user.user_id)
    return APIResponse(
        success=True,
        message=f"Archaeological excavation site '{created.site_name}' registered successfully.",
        data=created,
    )


@ancient_router.put(
    "/sites/{site_id}",
    response_model=APIResponse[SiteDetailResponse],
    summary="Update excavation site details",
)
def update_site(
    site_id: int,
    payload: SiteUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, UserRole.RESEARCHER.value, "LAB_MANAGER"])),
):
    updated = AncientService.update_site(db, site_id, payload, actor_id=current_user.user_id)
    return APIResponse(
        success=True,
        message=f"Excavation site '{updated.site_name}' updated successfully.",
        data=updated,
    )


@ancient_router.delete(
    "/sites/{site_id}",
    response_model=APIResponse[bool],
    summary="Delete an archaeological excavation site (Admin, Researcher, Lab Manager)",
)
def delete_site(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, UserRole.RESEARCHER.value, "LAB_MANAGER"])),
):
    success = AncientService.delete_site(db, site_id, actor_id=current_user.user_id)
    return APIResponse(
        success=True,
        message="Archaeological excavation site deleted successfully.",
        data=success,
    )


# -----------------------------------------------------------------------------
# Ancient Specimens Endpoints
# -----------------------------------------------------------------------------
@ancient_router.get(
    "/specimens",
    response_model=APIResponse[List[AncientSpecimenListItem]],
    summary="List ancient archaeological specimens",
)
def list_ancient_specimens(
    site_id: Optional[int] = Query(None, description="Filter by excavation site ID"),
    dating_method: Optional[str] = Query(None, description="Filter by chronometric dating method"),
    min_age: Optional[int] = Query(None, description="Minimum estimated age in years BP"),
    max_age: Optional[int] = Query(None, description="Maximum estimated age in years BP"),
    search: Optional[str] = Query(None, description="Search across specimen code, name, site, or stratum"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    specimens = AncientService.list_ancient_specimens(
        db,
        site_id=site_id,
        dating_method=dating_method,
        min_age=min_age,
        max_age=max_age,
        search=search,
    )
    return APIResponse(
        success=True,
        message=f"Retrieved {len(specimens)} ancient specimens.",
        data=specimens,
    )


@ancient_router.get(
    "/specimens/{sample_id}",
    response_model=APIResponse[AncientSpecimenDetail],
    summary="Get ancient specimen provenance dossier",
)
def get_ancient_specimen(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    detail = AncientService.get_ancient_specimen(db, sample_id)
    return APIResponse(
        success=True,
        message="Ancient specimen dossier retrieved successfully.",
        data=detail,
    )


@ancient_router.post(
    "/specimens",
    response_model=APIResponse[AncientSpecimenDetail],
    status_code=status.HTTP_201_CREATED,
    summary="Attach ancient provenance profile to base sample",
)
def create_ancient_specimen(
    payload: AncientSpecimenCreate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, UserRole.RESEARCHER.value, "LAB_MANAGER", "TECHNICIAN"])),
):
    created = AncientService.create_ancient_specimen(db, payload, actor_id=current_user.user_id)
    return APIResponse(
        success=True,
        message=f"Ancient provenance profile attached to specimen '{created.sample_code}' successfully.",
        data=created,
    )


@ancient_router.put(
    "/specimens/{sample_id}",
    response_model=APIResponse[AncientSpecimenDetail],
    summary="Update ancient specimen provenance and chronometrics",
)
def update_ancient_specimen(
    sample_id: int,
    payload: AncientSpecimenUpdate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, UserRole.RESEARCHER.value, "LAB_MANAGER"])),
):
    updated = AncientService.update_ancient_specimen(db, sample_id, payload, actor_id=current_user.user_id)
    return APIResponse(
        success=True,
        message=f"Provenance profile for specimen '{updated.sample_code}' updated successfully.",
        data=updated,
    )


@ancient_router.delete(
    "/specimens/{sample_id}",
    response_model=APIResponse[bool],
    summary="Delete ancient specimen provenance profile (Admin, Researcher, Lab Manager)",
)
def delete_ancient_specimen(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, UserRole.RESEARCHER.value, "LAB_MANAGER"])),
):
    success = AncientService.delete_ancient_specimen(db, sample_id, actor_id=current_user.user_id)
    return APIResponse(
        success=True,
        message="Ancient specimen provenance profile deleted successfully.",
        data=success,
    )
