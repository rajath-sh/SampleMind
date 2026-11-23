"""
SampleMind Samples Module - API Router
======================================
Strict isolation: imports only from app.common and local samples schemas/service.
Exposes endpoints for specimen registration, paginated search,
atomic parent-child aliquot derivation, and storage movement audit tracking.
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
    SampleCreateRequest,
    SampleUpdateRequest,
    SampleDerivationRequest,
    SampleDerivationResponse,
    SampleListItem,
    SampleDetailResponse,
    StorageHistoryItem,
    SampleTypeResponse,
    SampleQuantityHistoryResponse,
    ChainOfCustodyResponse,
    SampleQualityMetricsResponse,
    SampleIntegrityAlertsResponse,
    SampleReadinessResponse,
    MaterialFlowResponse,
    CryoSpatialMapResponse,
)
from .service import SampleService

router = APIRouter(
    prefix="/api/v1/samples",
    tags=["Sample Management & Derivation"]
)


@router.get(
    "/types",
    response_model=APIResponse[List[SampleTypeResponse]],
    summary="List controlled vocabulary biological sample types",
)
def list_sample_types(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Returns approved sample type classifications (e.g., ARCH-BONE, BONE-PWD, DNA-EXT).
    """
    types = SampleService.list_sample_types(db=db)
    results = [SampleTypeResponse.from_orm(t) for t in types]
    return APIResponse(
        message=f"Retrieved {len(results)} sample types.",
        data=results
    )


@router.get(
    "",
    response_model=PaginatedResponse[SampleListItem],
    summary="Paginated catalog search across biological specimens",
)
def list_samples(
    search: Optional[str] = Query(None, description="Search term matching sample code, name, or provenance"),
    type_id: Optional[int] = Query(None, description="Filter by SampleType ID"),
    status: Optional[str] = Query(None, description="Filter by status (REGISTERED, IN_STORAGE, DEPLETED, etc.)"),
    low_volume_only: Optional[bool] = Query(False, description="Filter for low volume specimens (<= 10.0 units)"),
    sort_by: Optional[str] = Query("registered_at", description="Sort column (code, name, type, quantity, status, registered_at)"),
    sort_dir: Optional[str] = Query("desc", description="Sort direction (asc, desc)"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(20, ge=1, le=10000, description="Items per page"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Returns a paginated list of biological specimens matching filter criteria.
    """
    items, total = SampleService.list_samples(
        db=db,
        search=search,
        type_id=type_id,
        status=status,
        low_volume_only=low_volume_only,
        sort_by=sort_by,
        sort_dir=sort_dir,
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


@router.get(
    "/metrics/quality-summary",
    response_model=APIResponse[SampleQualityMetricsResponse],
    summary="Retrieve real-time database specimen quality and integrity counts",
)
def get_sample_quality_metrics(
    threshold: float = Query(10.0, ge=0.0, description="Low volume warning threshold"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Returns real-time operational inventory metrics calculated directly from database records:
    Total, Available, Low-Volume, Quarantined, Missing, and Depleted samples.
    """
    metrics = SampleService.get_quality_metrics(db=db, low_volume_threshold=threshold)
    return APIResponse(
        message="Specimen quality metrics retrieved successfully.",
        data=metrics
    )


@router.get(
    "/metrics/integrity-alerts",
    response_model=APIResponse[SampleIntegrityAlertsResponse],
    summary="Scan biological sample database for invariant violations and data anomalies",
)
def get_sample_integrity_alerts(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Scans relational database for critical data integrity anomalies:
    - 0 quantity in active storage
    - Depleted status with positive remaining quantity
    - Stored specimen without physical location coordinate
    - Storage assigned to inactive/decommissioned unit
    - Derivation transfer measurement unit mismatch
    """
    alerts = SampleService.get_integrity_alerts(db=db)
    return APIResponse(
        message=f"Integrity scan completed: {alerts.total_alerts} alert(s) detected.",
        data=alerts
    )


@router.get(
    "/visualisations/material-flow",
    response_model=APIResponse[MaterialFlowResponse],
    summary="Compute animated biological material derivation and transformation flow across repository",
)
def get_material_flow(
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Computes real relational material flow from Primary Accessions -> Biochemical Transformations -> Inventory Destinations.
    """
    flow = SampleService.get_material_flow(db=db)
    return APIResponse(
        message=f"Material transformation flow computed ({flow.total_transformations} derivations, {len(flow.nodes)} nodes).",
        data=flow
    )


@router.get(
    "/{sample_id}",
    response_model=APIResponse[SampleDetailResponse],
    summary="Retrieve comprehensive specimen dossier and direct lineage links",
)
def get_sample_detail(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Retrieves full specimen metadata, current storage coordinate, and direct parent/child derivation links.
    """
    detail = SampleService.get_sample_by_id(db=db, sample_id=sample_id)
    return APIResponse(
        message=f"Specimen '{detail.sample_code}' retrieved successfully.",
        data=detail
    )


@router.post(
    "",
    response_model=APIResponse[SampleDetailResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Register a new primary biological specimen (Researcher / Admin)",
)
def create_sample(
    req: SampleCreateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Registers a newly accessioned specimen. Validates code uniqueness and type validity.
    """
    new_sample = SampleService.create_sample(
        db=db,
        req=req,
        actor_id=current_user.user_id
    )
    detail = SampleService.get_sample_by_id(db=db, sample_id=new_sample.sample_id)
    return APIResponse(
        message=f"Specimen '{new_sample.sample_code}' registered successfully.",
        data=detail
    )


@router.put(
    "/{sample_id}",
    response_model=APIResponse[SampleDetailResponse],
    summary="Update specimen metadata or physical storage location",
)
def update_sample(
    sample_id: int,
    req: SampleUpdateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Modifies specimen details. If physical storage coordinate changes,
    an automated entry is written to SampleStorageHistory.
    """
    updated = SampleService.update_sample(
        db=db,
        sample_id=sample_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Specimen '{updated.sample_code}' updated successfully.",
        data=updated
    )


@router.post(
    "/{sample_id}/derive",
    response_model=APIResponse[SampleDerivationResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Atomically derive a child aliquot/extract and deduct parent stock",
)
def derive_child_sample(
    sample_id: int,
    req: SampleDerivationRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    **ATOMIC DERIVATION WORKFLOW:**
    - Validates available stock on parent specimen.
    - Rejects request if quantity transferred exceeds available quantity (HTTP 409).
    - Deducts quantity from parent specimen stock.
    - If parent quantity reaches zero, marks status as DEPLETED.
    - Provisions child specimen and records parent-child edge in SampleRelationship.
    - Commits transaction atomically.
    """
    res = SampleService.derive_child_sample(
        db=db,
        parent_sample_id=sample_id,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Successfully derived aliquot '{res.child_sample_code}' from '{res.parent_sample_code}'.",
        data=res
    )


@router.get(
    "/{sample_id}/storage-history",
    response_model=APIResponse[List[StorageHistoryItem]],
    summary="Retrieve chronological physical storage relocation audit history",
)
def get_sample_storage_history(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Returns an audit trail of every physical storage transfer for this specimen.
    """
    history = SampleService.get_sample_storage_history(db=db, sample_id=sample_id)
    return APIResponse(
        message=f"Retrieved {len(history)} storage movement records.",
        data=history
    )


@router.get(
    "/{sample_id}/quantity-history",
    response_model=APIResponse[SampleQuantityHistoryResponse],
    summary="Retrieve auditable quantity timeline, transaction ledger, and derivation balance",
)
def get_sample_quantity_history(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Returns complete auditable quantity history, original stock, current stock,
    and derivation transactions.
    """
    history = SampleService.get_sample_quantity_history(db=db, sample_id=sample_id)
    return APIResponse(
        message=f"Retrieved quantity history for specimen '{history.sample_code}' ({history.derivation_count} derivations).",
        data=history
    )


@router.get(
    "/{sample_id}/chain-of-custody",
    response_model=APIResponse[ChainOfCustodyResponse],
    summary="Retrieve chronological custody transfer timeline between physical storage locations",
)
def get_chain_of_custody(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Returns chronological chain-of-custody timeline with consecutive location pairs,
    responsible operators, reasons, and elapsed handoff durations.
    """
    custody = SampleService.get_chain_of_custody(db=db, sample_id=sample_id)
    return APIResponse(
        message=f"Retrieved chain of custody for specimen '{custody.sample_code}' ({custody.total_movements} movements).",
        data=custody
    )


@router.get(
    "/{sample_id}/readiness",
    response_model=APIResponse[SampleReadinessResponse],
    summary="Evaluate multi-parameter experimental readiness and protocol suitability",
)
def get_sample_readiness(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Assesses specimen suitability for planned experimental usage across 5 key dimensions:
    status, stock sufficiency, cold storage integrity, lineage provenance, and QC assay history.
    """
    readiness = SampleService.get_sample_readiness(db=db, sample_id=sample_id)
    return APIResponse(
        message=f"Specimen '{readiness.sample_code}' readiness assessment: {readiness.overall_status} ({readiness.readiness_score}%).",
        data=readiness
    )


@router.get(
    "/{sample_id}/cryo-spatial-map",
    response_model=APIResponse[CryoSpatialMapResponse],
    summary="Retrieve interactive 2D cryogenic freezer plate and rack coordinate matrix",
)
def get_sample_cryo_spatial_map(
    sample_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Generates 2D cryogenic 96-well / rack matrix around focal specimen with live sensor temperatures and neighbor occupancies.
    """
    spatial_map = SampleService.get_cryo_spatial_map(db=db, sample_id=sample_id)
    return APIResponse(
        message=f"Retrieved cryogenic plate map for '{spatial_map.sample_code}' in {spatial_map.location_code} ({spatial_map.occupancy_pct}% occupied).",
        data=spatial_map
    )
