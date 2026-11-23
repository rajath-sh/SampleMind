"""
SampleMind Lineage Module - API Router
======================================
Strict isolation: imports only from app.common and local lineage schemas/service.
Exposes endpoints for recursive upstream ancestors, downstream descendants,
full DAG graph visualization payloads, and cycle-validated relationship creation.
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
    LineageNodeItem,
    LineageGraphResponse,
    RelationshipCreateRequest,
    RelationshipResponse,
)
from .service import LineageService

router = APIRouter(
    prefix="/api/v1/lineage",
    tags=["Sample Lineage & DAG Explorer"]
)


@router.get(
    "/{sample_id}",
    response_model=APIResponse[LineageGraphResponse],
    summary="Retrieve directed acyclic graph (DAG) topology for interactive visualization",
)
def get_lineage_graph(
    sample_id: int,
    direction: str = Query("all", description="Traversal direction: all, upstream, or downstream"),
    max_depth: int = Query(10, ge=1, le=50, description="Maximum traversal traversal depth limit"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Returns nodes and edges connecting the focal specimen to upstream ancestors
    and downstream derived aliquots, optimized for React Flow rendering.
    """
    graph = LineageService.get_lineage_graph(
        db=db,
        sample_id=sample_id,
        direction=direction,
        max_depth=max_depth
    )
    return APIResponse(
        message=f"DAG graph generated for specimen '{graph.focus_sample_code}' ({graph.total_nodes} nodes, {graph.total_edges} edges).",
        data=graph
    )


@router.get(
    "/{sample_id}/ancestors",
    response_model=APIResponse[List[LineageNodeItem]],
    summary="Recursive CTE upstream traversal to find all original source specimens",
)
def get_sample_ancestors(
    sample_id: int,
    max_depth: int = Query(10, ge=1, le=50, description="Max ancestry recursion levels"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Executes a SQL recursive Common Table Expression (CTE) to traverse
    the provenance tree upstream to root specimens.
    """
    ancestors = LineageService.get_ancestors(
        db=db,
        sample_id=sample_id,
        max_depth=max_depth
    )
    return APIResponse(
        message=f"Retrieved {len(ancestors)} upstream ancestor specimens.",
        data=ancestors
    )


@router.get(
    "/{sample_id}/descendants",
    response_model=APIResponse[List[LineageNodeItem]],
    summary="Recursive CTE downstream traversal to find all derived aliquots & extracts",
)
def get_sample_descendants(
    sample_id: int,
    max_depth: int = Query(10, ge=1, le=50, description="Max descendant recursion levels"),
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(get_current_user),
):
    """
    Executes a SQL recursive Common Table Expression (CTE) to traverse
    the derivation tree downstream to all child aliquots.
    """
    descendants = LineageService.get_descendants(
        db=db,
        sample_id=sample_id,
        max_depth=max_depth
    )
    return APIResponse(
        message=f"Retrieved {len(descendants)} downstream derived specimens.",
        data=descendants
    )


@router.post(
    "/relationships",
    response_model=APIResponse[RelationshipResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Record parent-child derivation link with strict DAG cycle detection",
)
def create_relationship(
    req: RelationshipCreateRequest,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Records a parent-child derivation edge between two biological specimens.
    - Disallows self-lineage (parent == child -> 400).
    - Prevents cyclic graphs (returns 409 if child is already an ancestor of parent).
    """
    res = LineageService.create_relationship(
        db=db,
        req=req,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Lineage edge created: '{res.parent_sample_code}' -> '{res.child_sample_code}' ({res.transformation_type}).",
        data=res
    )


@router.delete(
    "/relationships/{relationship_id}",
    response_model=APIResponse[dict],
    summary="Delete parent-child derivation relationship edge",
)
def delete_relationship(
    relationship_id: int,
    db: Session = Depends(get_db),
    current_user: AppUser = Depends(require_roles([UserRole.ADMIN.value, "ADMIN", "RESEARCHER"])),
):
    """
    Removes a parent-child derivation relationship edge between specimens.
    """
    LineageService.delete_relationship(
        db=db,
        relationship_id=relationship_id,
        actor_id=current_user.user_id
    )
    return APIResponse(
        message=f"Lineage derivation edge #{relationship_id} removed successfully.",
        data={"relationship_id": relationship_id, "deleted": True}
    )
