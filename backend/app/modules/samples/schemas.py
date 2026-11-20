"""
SampleMind Samples Module - Schemas & DTOs
==========================================
Strict isolation: imports only from app.common.
Defines schemas for biological specimen registration, filtering,
atomic sub-sample derivation, and storage movement audit logs.
"""

from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


# ==============================================================================
# Sample Type Schemas
# ==============================================================================

class SampleTypeResponse(BaseModel):
    """Controlled vocabulary entry for biological sample types."""
    sample_type_id: int
    type_code: str
    type_name: str
    description: Optional[str] = None
    is_active: bool

    class Config:
        from_attributes = True


# ==============================================================================
# Sample Registration & Mutation Schemas
# ==============================================================================

class SampleCreateRequest(BaseModel):
    """Payload to register a new primary biological specimen."""
    sample_code: str = Field(..., min_length=2, max_length=40, description="Unique specimen identifier e.g. S001")
    sample_name: str = Field(..., min_length=2, max_length=160, description="Descriptive biological specimen title")
    sample_type_id: int = Field(..., description="Foreign key to SampleType catalog")
    quantity_value: float = Field(..., ge=0, lt=10_000_000_000, allow_inf_nan=False, description="Measured quantity or volume")
    quantity_unit: str = Field(..., min_length=1, max_length=24, description="Measurement unit e.g. mg, g, uL, mL")
    sample_status: str = Field(default="REGISTERED", description="REGISTERED, IN_STORAGE, IN_USE, etc.")
    source_description: Optional[str] = Field(None, description="Collection provenance or geological stratum")
    collected_at: Optional[datetime] = None
    current_storage_location_id: Optional[int] = Field(None, description="Initial physical storage slot coordinate")
    notes: Optional[str] = None


class SampleUpdateRequest(BaseModel):
    """Payload to update an existing specimen's metadata, quantity, or location."""
    sample_name: Optional[str] = Field(None, min_length=2, max_length=160)
    source_description: Optional[str] = None
    quantity_value: Optional[float] = Field(None, ge=0, lt=10_000_000_000, allow_inf_nan=False)
    quantity_unit: Optional[str] = Field(None, min_length=1, max_length=24)
    sample_status: Optional[str] = None
    current_storage_location_id: Optional[int] = None
    notes: Optional[str] = None
    movement_reason: Optional[str] = Field(None, max_length=300, description="Reason recorded in audit history if storage location changes")


# ==============================================================================
# Atomic Derivation Schemas
# ==============================================================================

class SampleDerivationRequest(BaseModel):
    """
    Payload for atomic parent-child sample derivation.
    Deducts quantity from parent, provisions child sample, and records lineage edge
    within a single transactional boundary.
    """
    child_sample_code: str = Field(..., min_length=2, max_length=40, description="Unique child identifier e.g. S002")
    child_sample_name: str = Field(..., min_length=2, max_length=160, description="Child aliquot or extract name")
    child_sample_type_id: int = Field(..., description="Child sample type ID")
    quantity_transferred: float = Field(..., ge=0.0001, lt=10_000_000_000, allow_inf_nan=False, description="Quantity consumed from parent stock")
    quantity_unit: str = Field(..., min_length=1, max_length=24, description="Unit e.g. mg, uL")
    transformation_type: str = Field(..., min_length=2, max_length=80, description="e.g. Pulverization, DNA Extraction, Aliquot")
    child_storage_location_id: Optional[int] = Field(None, description="Initial storage coordinate for derived child")
    notes: Optional[str] = None


class SampleDerivationResponse(BaseModel):
    """Confirmation payload returned upon successful atomic derivation."""
    parent_sample_id: int
    parent_sample_code: str
    parent_remaining_quantity: float
    parent_status: str
    child_sample_id: int
    child_sample_code: str
    child_sample_name: str
    transformation_type: str
    relationship_id: int
    derived_at: datetime


# ==============================================================================
# Sample Presentation & Query DTOs
# ==============================================================================

class SampleRelationshipSummary(BaseModel):
    """Summary of parent or child connection."""
    relationship_id: int
    related_sample_id: int
    related_sample_code: str
    related_sample_name: str
    transformation_type: str
    quantity_transferred: Optional[float] = None
    quantity_unit: Optional[str] = None
    transformed_at: datetime


class StorageHistoryItem(BaseModel):
    """Audit entry recording a historical physical storage transfer."""
    storage_history_id: int
    sample_id: int
    storage_location_id: Optional[int] = None
    location_code: Optional[str] = None
    facility: Optional[str] = None
    unit_label: Optional[str] = None
    slot: Optional[str] = None
    moved_at: datetime
    moved_by_name: Optional[str] = None
    reason: Optional[str] = None


class SampleListItem(BaseModel):
    """Compact summary of a sample for collection queries."""
    sample_id: int
    sample_code: str
    sample_name: str
    sample_type_id: int
    sample_type_code: str
    sample_type_name: str
    quantity_value: float
    quantity_unit: str
    sample_status: str
    current_storage_location_id: Optional[int] = None
    current_storage_location_code: Optional[str] = None
    is_ancient: bool = False
    registered_at: datetime

    class Config:
        from_attributes = True


class SampleTestSummary(BaseModel):
    """Quality assay or analytical test associated with a specimen."""
    sample_test_id: int
    test_type: str
    test_status: str
    result_value: Optional[float] = None
    result_unit: Optional[str] = None
    result_interpretation: Optional[str] = None
    performed_at: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SampleDetailResponse(BaseModel):
    """Complete dossier of a biological specimen."""
    sample_id: int
    sample_code: str
    sample_name: str
    sample_type_id: int
    sample_type_code: str
    sample_type_name: str
    quantity_value: float
    quantity_unit: str
    sample_status: str
    source_description: Optional[str] = None
    collected_at: Optional[datetime] = None
    registered_at: datetime
    updated_at: datetime
    current_storage_location_id: Optional[int] = None
    current_storage_location_code: Optional[str] = None
    facility: Optional[str] = None
    room: Optional[str] = None
    slot: Optional[str] = None
    created_by: Optional[int] = None
    created_by_name: Optional[str] = None
    notes: Optional[str] = None
    is_ancient: bool = False
    ancestor_count: int = 0
    descendant_count: int = 0
    parents: List[SampleRelationshipSummary] = []
    children: List[SampleRelationshipSummary] = []
    qc_tests: List[SampleTestSummary] = []

    class Config:
        from_attributes = True


class QuantityHistoryItem(BaseModel):
    """An individual quantity modification or transfer transaction entry."""
    transaction_id: Optional[int] = None
    transaction_type: str  # 'INITIAL_REGISTRATION', 'ALIQUOT_DERIVATION', 'USAGE', 'ADJUSTMENT'
    quantity_delta: float
    balance_after: float
    quantity_unit: str
    event_timestamp: datetime
    performed_by_name: Optional[str] = None
    reference_sample_id: Optional[int] = None
    reference_sample_code: Optional[str] = None
    reference_sample_name: Optional[str] = None
    transformation_type: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class SampleQuantityHistoryResponse(BaseModel):
    """Auditable stock breakdown and timeline of derivations for a specimen."""
    sample_id: int
    sample_code: str
    sample_name: str
    current_quantity: float
    initial_quantity: float
    quantity_unit: str
    total_deducted: float
    utilization_pct: float
    derivation_count: int
    transactions: List[QuantityHistoryItem] = []


class ChainOfCustodyStep(BaseModel):
    """A chronological custody transfer event between locations."""
    step_number: int
    storage_history_id: Optional[int] = None
    event_timestamp: datetime
    action_label: str  # e.g. "Initial Storage Placement", "Custody Transfer & Relocation"
    from_location_code: Optional[str] = None
    to_location_code: Optional[str] = None
    from_facility: Optional[str] = None
    to_facility: Optional[str] = None
    to_unit_label: Optional[str] = None
    to_slot: Optional[str] = None
    moved_by_name: Optional[str] = None
    reason: Optional[str] = None
    elapsed_time_human: Optional[str] = None


class ChainOfCustodyResponse(BaseModel):
    """Chronological chain-of-custody transfer history for a biological specimen."""
    sample_id: int
    sample_code: str
    sample_name: str
    current_location_code: Optional[str] = None
    current_status: str
    total_movements: int
    steps: List[ChainOfCustodyStep] = []


class SampleQualityMetricsResponse(BaseModel):
    """Real-time operational inventory metrics calculated across database specimens."""
    total_samples: int
    available_samples: int
    low_volume_samples: int
    quarantined_samples: int
    missing_samples: int
    depleted_samples: int
    low_volume_threshold: float = 10.0


class IntegrityAlertItem(BaseModel):
    """Individual database invariant anomaly or data integrity warning."""
    rule_code: str
    severity: str  # 'CRITICAL', 'WARNING', 'INFO'
    sample_id: int
    sample_code: str
    sample_name: str
    description: str
    remedy: str


class SampleIntegrityAlertsResponse(BaseModel):
    """Comprehensive invariant check audit detecting anomalies across biological samples."""
    total_alerts: int
    critical_count: int
    warning_count: int
    info_count: int
    alerts: List[IntegrityAlertItem] = []


class ReadinessCheckItem(BaseModel):
    """Individual evaluation check for experimental specimen readiness."""
    check_id: str
    name: str
    passed: bool
    severity: str  # 'CRITICAL', 'WARNING', 'INFO'
    score_points: int
    max_points: int
    message: str


class SampleReadinessResponse(BaseModel):
    """Multi-parameter readiness assessment for experimental and downstream usage."""
    sample_id: int
    sample_code: str
    sample_name: str
    overall_status: str  # 'READY', 'NEEDS_REVIEW', 'UNAVAILABLE'
    readiness_score: int  # 0 to 100
    checks: List[ReadinessCheckItem] = []
    recommendations: List[str] = []


class MaterialFlowNode(BaseModel):
    """A biological origin, transformation stage, or inventory destination node."""
    id: str
    label: str
    category: str  # 'source', 'transformation', 'destination'
    total_volume: float
    sample_count: int
    color: str


class MaterialFlowLink(BaseModel):
    """An alluvial flow stream connecting stages in the biological transformation pipeline."""
    source_id: str
    target_id: str
    flow_volume: float
    sample_count: int
    flow_label: str


class MaterialFlowResponse(BaseModel):
    """Biological material derivation and lifecycle transformation flow graph."""
    nodes: List[MaterialFlowNode] = []
    links: List[MaterialFlowLink] = []
    total_samples: int
    total_transformations: int
    total_volume_processed: float


class CryoWellSlot(BaseModel):
    """Individual cryogenic well coordinate in an 8x12 or 9x9 freezer rack box."""
    row_label: str  # 'A', 'B', 'C', ...
    col_label: int  # 1, 2, 3, ...
    slot_code: str  # 'A-01', 'B-04', ...
    is_focal: bool
    is_occupied: bool
    sample_id: Optional[int] = None
    sample_code: Optional[str] = None
    sample_name: Optional[str] = None
    sample_status: Optional[str] = None
    sample_type_code: Optional[str] = None
    quantity_value: Optional[float] = None
    quantity_unit: Optional[str] = None


class CryoSpatialMapResponse(BaseModel):
    """Interactive 2D cryogenic freezer plate and rack coordinate matrix."""
    sample_id: int
    sample_code: str
    sample_name: str
    storage_location_id: Optional[int] = None
    location_code: str
    facility: str
    room: Optional[str] = None
    unit_type: str
    unit_label: Optional[str] = None
    rack: Optional[str] = None
    box: Optional[str] = None
    temperature_celsius: Optional[float] = None
    total_slots: int
    occupied_slots: int
    occupancy_pct: float
    focal_slot_code: str
    grid_rows: int = 8
    grid_cols: int = 12
    wells: List[CryoWellSlot] = []



