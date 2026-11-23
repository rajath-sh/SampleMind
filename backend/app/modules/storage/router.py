"""
SampleMind Storage & Equipment Module - API Router
==================================================
Strict isolation: imports only from app.common and local storage schemas/service.
Exposes endpoints for physical location hierarchy, 2D box occupancy grids,
and laboratory equipment tracking.
"""

from __future__ import annotations
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
    StorageLocationCreate,
    StorageLocationUpdate,
    StorageLocationDetail,
    StorageLocationWithSamples,
    OccupancyGridResponse,
    EquipmentCreate,
    EquipmentUpdate,
    EquipmentStatusUpdate,
    EquipmentDetail,
)
from .service import StorageService, EquipmentService

storage_router = APIRouter(
    prefix="/api/v1/storage",
    tags=["Storage Infrastructure"]
)

equipment_router = APIRouter(
    prefix="/api/v1/equipment",
    tags=["Laboratory Equipment"]
)


# ==============================================================================
# Storage Location Endpoints
# ==============================================================================

@storage_router.get(
    "/locations",
    response_model=APIResponse[List[StorageLocationDetail]],
    summary="List all storage coordinates and containers",
)
def list_locations(
    unit_type: Optional[str] = Query(None, description="Filter by unit type (freezer, cabinet, bench, etc.)"),
    unit_label: Optional[str] = Query(None, description="Filter by unit label e.g. FRZ-ULT-01"),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Returns a catalog of storage locations with active specimen counts per coordinate.
    """
    locations = StorageService.list_locations(
        db=db,
        unit_type=unit_type,
        unit_label=unit_label,
        is_active=is_active
    )
    return APIResponse(
        message=f"Retrieved {len(locations)} storage locations.",
        data=locations
    )


@storage_router.get(
    "/locations/{location_id}",
    response_model=APIResponse[StorageLocationWithSamples],
    summary="Retrieve storage location profile and resident samples",
)
def get_location_detail(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Retrieves detailed environmental metadata for a storage coordinate
    along with all samples currently resident at this location.
    """
    detail = StorageService.get_location_with_samples(db=db, location_id=location_id)
    return APIResponse(
        message=f"Storage location '{detail.location_code}' retrieved successfully.",
        data=detail
    )


@storage_router.post(
    "/locations",
    response_model=APIResponse[StorageLocationDetail],
    status_code=status.HTTP_201_CREATED,
    summary="Register a new storage location (Admin / Lab Manager)",
)
def create_location(
    req: StorageLocationCreate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Creates a new physical storage coordinate or container with uniqueness validation.
    """
    new_loc = StorageService.create_location(db=db, req=req, actor_id=current_user.user_id)
    loc_detail = StorageService.get_location_by_id(db=db, location_id=new_loc.storage_location_id)
    return APIResponse(
        message=f"Storage location '{new_loc.location_code}' created successfully.",
        data=loc_detail
    )


@storage_router.put(
    "/locations/{location_id}",
    response_model=APIResponse[StorageLocationDetail],
    summary="Update storage location environmental thresholds (Admin / Lab Manager)",
)
def update_location(
    location_id: int,
    req: StorageLocationUpdate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Updates temperature limits, room location, or active status of a storage unit.
    """
    updated = StorageService.update_location(
        db=db,
        location_id=location_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Storage location '{updated.location_code}' updated successfully.",
        data=updated
    )


@storage_router.delete(
    "/locations/{location_id}",
    response_model=APIResponse[bool],
    summary="Delete a storage location (Admin / Lab Manager)",
)
def delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Deletes a physical storage coordinate."""
    success = StorageService.delete_location(
        db=db,
        location_id=location_id,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message="Storage location deleted successfully.",
        data=success
    )


@storage_router.get(
    "/occupancy-grid/{unit_label}",
    response_model=APIResponse[OccupancyGridResponse],
    summary="Get 2D cryogenic slot occupancy matrix for interactive visualization",
)
def get_occupancy_grid(
    unit_label: str,
    box: Optional[str] = Query(None, description="Optional box filter e.g. BOX-01"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Computes a 2D slot occupancy matrix (occupied vs available coordinates)
    for interactive laboratory freezer grid visualization.
    """
    grid = StorageService.get_box_occupancy_grid(db=db, unit_label=unit_label, box=box)
    return APIResponse(
        message=f"Occupancy grid for '{unit_label}' generated with {grid.occupancy_percentage}% utilization.",
        data=grid
    )


# ==============================================================================
# Laboratory Equipment Endpoints
# ==============================================================================

@equipment_router.get(
    "",
    response_model=APIResponse[List[EquipmentDetail]],
    summary="List laboratory instruments and calibration status",
)
def list_equipment(
    status: Optional[str] = Query(None, description="Filter by status (available, in_use, maintenance, retired)"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Returns an inventory of laboratory instruments with operational statuses and calibration due dates.
    """
    instruments = EquipmentService.list_equipment(db=db, status=status)
    results = [EquipmentDetail.from_orm(eq) for eq in instruments]
    return APIResponse(
        message=f"Retrieved {len(results)} laboratory instruments.",
        data=results
    )


@equipment_router.get(
    "/{equipment_id}",
    response_model=APIResponse[EquipmentDetail],
    summary="Retrieve laboratory equipment details",
)
def get_equipment_detail(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Retrieves full specifications, operational status, and calibration logs for an instrument.
    """
    eq = EquipmentService.get_equipment_by_id(db=db, equipment_id=equipment_id)
    return APIResponse(
        message=f"Equipment '{eq.equipment_name}' retrieved successfully.",
        data=EquipmentDetail.from_orm(eq)
    )


@equipment_router.post(
    "",
    response_model=APIResponse[EquipmentDetail],
    status_code=status.HTTP_201_CREATED,
    summary="Register a new laboratory instrument (Admin / Lab Manager)",
)
def register_equipment(
    req: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Registers a new analytical instrument in the laboratory equipment database.
    """
    new_eq = EquipmentService.register_equipment(db=db, req=req, actor_id=current_user.user_id)
    return APIResponse(
        message=f"Equipment '{new_eq.equipment_name}' registered successfully.",
        data=EquipmentDetail.from_orm(new_eq)
    )


@equipment_router.put(
    "/{equipment_id}",
    response_model=APIResponse[EquipmentDetail],
    summary="Update instrument specifications and metadata (Admin, Researcher)",
)
def update_equipment(
    equipment_id: int,
    req: EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Updates specifications and metadata of an analytical instrument."""
    updated = EquipmentService.update_equipment(
        db=db,
        equipment_id=equipment_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Equipment '{updated.equipment_name}' updated successfully.",
        data=EquipmentDetail.from_orm(updated)
    )


@equipment_router.delete(
    "/{equipment_id}",
    response_model=APIResponse[bool],
    summary="Delete a laboratory instrument (Admin / Lab Manager)",
)
def delete_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """Deletes an instrument from the laboratory equipment catalog."""
    success = EquipmentService.delete_equipment(
        db=db,
        equipment_id=equipment_id,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message="Equipment deleted successfully.",
        data=success
    )


@equipment_router.put(
    "/{equipment_id}/status",
    response_model=APIResponse[EquipmentDetail],
    summary="Update instrument operational and calibration status",
)
def update_equipment_status(
    equipment_id: int,
    req: EquipmentStatusUpdate,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Updates calibration timestamps or marks instrument under maintenance.
    """
    updated = EquipmentService.update_equipment_status(
        db=db,
        equipment_id=equipment_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Equipment '{updated.equipment_name}' status updated to '{updated.equipment_status}'.",
        data=EquipmentDetail.from_orm(updated)
    )
