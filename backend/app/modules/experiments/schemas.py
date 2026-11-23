"""
SampleMind Experiments Module - Schemas & DTOs
==============================================
Strict isolation: imports only from app.common.
Defines schemas for research experiment creation, cohort attachment,
analytical equipment allocation, and result verification workflows.
"""

from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


# ==============================================================================
# Nested Cohort & Equipment Inputs
# ==============================================================================

class ExperimentSampleInput(BaseModel):
    """Associates a biological specimen with an experiment cohort."""
    sample_id: int = Field(..., description="ID of the specimen to include")
    usage_role: str = Field(default="input", description="input, control, reference, output")
    quantity_used: Optional[float] = Field(None, ge=0, description="Quantity allocated or consumed")
    quantity_unit: Optional[str] = Field(None, max_length=24)
    notes: Optional[str] = None


class ExperimentCreateRequest(BaseModel):
    """Payload to register a new research experiment."""
    experiment_code: str = Field(..., min_length=2, max_length=40, description="Unique experiment code e.g. EXP-2026-001")
    experiment_name: str = Field(..., min_length=2, max_length=180, description="Scientific title of the research project")
    objective: Optional[str] = Field(None, description="Primary hypothesis and scientific goals")
    protocol_reference: Optional[str] = Field(None, max_length=200, description="SOP or publication reference")
    lead_researcher_id: Optional[int] = None
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    status: str = Field(default="planned", description="planned, active, completed, cancelled, on_hold")
    samples: List[ExperimentSampleInput] = []
    equipment_ids: List[int] = []


class ExperimentUpdateRequest(BaseModel):
    """Payload to modify experiment protocol, timeline, or operational state."""
    experiment_name: Optional[str] = None
    objective: Optional[str] = None
    protocol_reference: Optional[str] = None
    lead_researcher_id: Optional[int] = None
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    status: Optional[str] = None


class ExperimentSampleAttachRequest(BaseModel):
    """Payload to attach an additional specimen to an active experiment."""
    sample_id: int
    usage_role: str = Field(default="input", description="input, control, reference, output")
    quantity_used: Optional[float] = Field(None, ge=0)
    quantity_unit: Optional[str] = None
    notes: Optional[str] = None


# ==============================================================================
# Result Schemas
# ==============================================================================

class ResultCreateRequest(BaseModel):
    """Payload to record an experimental measurement or observational result."""
    result_code: str = Field(..., min_length=2, max_length=50, description="Unique result identifier e.g. RES-001")
    result_title: str = Field(..., min_length=2, max_length=180)
    observation: Optional[str] = None
    result_value: Optional[float] = None
    result_unit: Optional[str] = None
    interpretation: Optional[str] = None
    is_final: bool = False


class ResultUpdateRequest(BaseModel):
    """Payload to update an experimental result."""
    result_title: Optional[str] = None
    observation: Optional[str] = None
    result_value: Optional[float] = None
    result_unit: Optional[str] = None
    interpretation: Optional[str] = None
    is_final: Optional[bool] = None


class ExperimentEquipmentAttachRequest(BaseModel):
    """Payload to allocate an instrument to an experiment."""
    equipment_id: int
    usage_notes: Optional[str] = None


class ResultVerifyRequest(BaseModel):
    """Payload to formally verify and lock an experimental result."""
    is_final: bool = True
    verification_notes: Optional[str] = None


class ResultDetailResponse(BaseModel):
    """Comprehensive dossier of an experimental result."""
    experiment_result_id: int
    experiment_id: int
    experiment_code: str
    result_code: str
    result_title: str
    observation: Optional[str] = None
    result_value: Optional[float] = None
    result_unit: Optional[str] = None
    interpretation: Optional[str] = None
    recorded_by: Optional[int] = None
    recorded_by_name: Optional[str] = None
    recorded_at: datetime
    is_final: bool

    class Config:
        from_attributes = True


# ==============================================================================
# Cohort Presentation DTOs
# ==============================================================================

class ExperimentSampleItem(BaseModel):
    """Details of a specimen attached to an experiment cohort."""
    sample_id: int
    sample_code: str
    sample_name: str
    sample_type_code: str
    usage_role: str
    quantity_used: Optional[float] = None
    quantity_unit: Optional[str] = None
    added_at: datetime
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class ExperimentEquipmentItem(BaseModel):
    """Details of an analytical instrument allocated to an experiment."""
    experiment_equipment_id: int
    equipment_id: int
    equipment_code: str
    equipment_name: str
    equipment_status: str
    usage_notes: Optional[str] = None

    class Config:
        from_attributes = True


class ExperimentListItem(BaseModel):
    """Compact summary of an experiment for catalog browsing."""
    experiment_id: int
    experiment_code: str
    experiment_name: str
    objective: Optional[str] = None
    protocol_reference: Optional[str] = None
    status: str
    lead_researcher_name: Optional[str] = None
    sample_count: int
    equipment_count: int
    result_count: int
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True


class ExperimentDetailResponse(BaseModel):
    """Complete dossier of a research project with cohorts, equipment, and results."""
    experiment_id: int
    experiment_code: str
    experiment_name: str
    objective: Optional[str] = None
    protocol_reference: Optional[str] = None
    created_by: int
    created_by_name: Optional[str] = None
    lead_researcher_id: Optional[int] = None
    lead_researcher_name: Optional[str] = None
    status: str
    planned_start: Optional[datetime] = None
    planned_end: Optional[datetime] = None
    actual_start: Optional[datetime] = None
    actual_end: Optional[datetime] = None
    created_at: datetime
    samples: List[ExperimentSampleItem] = []
    equipment: List[ExperimentEquipmentItem] = []
    results: List[ResultDetailResponse] = []

    class Config:
        from_attributes = True
