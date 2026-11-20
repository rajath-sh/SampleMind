"""
SampleMind Lineage Module - Schemas & DTOs
==========================================
Strict isolation: imports only from app.common.
Defines schemas for DAG lineage graph visualization, recursive ancestors/descendants,
and parent-child relationship creation with cycle detection.
"""

from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


# ==============================================================================
# Lineage DAG Graph DTOs
# ==============================================================================

class LineageNodeItem(BaseModel):
    """Represents a sample node in the lineage directed acyclic graph (DAG)."""
    sample_id: int
    sample_code: str
    sample_name: str
    sample_type_code: str
    sample_type_name: str
    sample_status: str
    quantity_value: float
    quantity_unit: str
    storage_location_code: Optional[str] = None
    generation: int = Field(0, description="Relative generation: 0 for focus, negative for ancestors, positive for descendants")
    is_root: bool = Field(False, description="True if specimen has no known parent accession")
    is_leaf: bool = Field(False, description="True if specimen has no derived child aliquots")
    is_focus: bool = Field(False, description="True if this is the focal sample of the graph query")
    is_ancient: bool = Field(False, description="True if sample is an ancient archaeological specimen")

    class Config:
        from_attributes = True


class LineageEdgeItem(BaseModel):
    """Represents a directed transformation edge between parent and child samples."""
    relationship_id: int
    source: int = Field(..., description="Parent sample ID (edge source)")
    target: int = Field(..., description="Child sample ID (edge target)")
    source_code: str
    target_code: str
    transformation_type: str
    quantity_transferred: Optional[float] = None
    quantity_unit: Optional[str] = None
    transformed_at: datetime
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class LineageGraphResponse(BaseModel):
    """Comprehensive DAG payload consumed by graph visualization engines (React Flow)."""
    focus_sample_id: int
    focus_sample_code: str
    direction: str = Field("all", description="all, upstream, or downstream")
    max_depth: int
    total_nodes: int
    total_edges: int
    nodes: List[LineageNodeItem]
    edges: List[LineageEdgeItem]


# ==============================================================================
# Relationship Mutation Schemas
# ==============================================================================

class RelationshipCreateRequest(BaseModel):
    """Payload to register a new direct lineage derivation edge with cycle validation."""
    parent_sample_id: int = Field(..., description="Identifier of the origin source sample")
    child_sample_id: int = Field(..., description="Identifier of the derived target aliquot")
    transformation_type: str = Field(..., min_length=2, max_length=80, description="e.g. DNA Extraction, Aliquot, Pulverization")
    quantity_transferred: Optional[float] = Field(None, gt=0, description="Quantity consumed during transformation")
    quantity_unit: Optional[str] = Field(None, max_length=24)
    notes: Optional[str] = None


class RelationshipResponse(BaseModel):
    """Confirmation payload returned upon successful relationship link registration."""
    relationship_id: int
    parent_sample_id: int
    parent_sample_code: str
    child_sample_id: int
    child_sample_code: str
    transformation_type: str
    quantity_transferred: Optional[float] = None
    quantity_unit: Optional[str] = None
    transformed_at: datetime
    recorded_by: Optional[int] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True
