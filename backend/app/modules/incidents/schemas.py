"""
Pydantic Schemas for Module 8: Laboratory Incidents & Blast Radius Tracing
Imports strictly from app.common or standard library.
"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class IncidentCreateRequest(BaseModel):
    incident_code: str = Field(..., min_length=2, max_length=50, description="Unique incident tracking code (e.g. INC-2026-001)")
    sample_id: Optional[int] = Field(None, description="Primary biological sample involved in the incident")
    storage_location_id: Optional[int] = Field(None, description="Physical storage unit where incident occurred")
    incident_type: str = Field(..., max_length=60, description="Type: contamination, temperature_excursion, missing_sample, handling_issue, equipment_failure, other")
    severity: str = Field(..., max_length=20, description="Severity: low, medium, high, critical")
    description: str = Field(..., min_length=5, description="Factual description of the incident circumstances")
    occurred_at: datetime = Field(..., description="Timestamp when the incident occurred")
    assigned_to: Optional[int] = Field(None, description="User ID of researcher/safety officer assigned to investigate")
    quarantine_descendants: bool = Field(default=False, description="Whether to recursively propagate QUARANTINED status to all child specimens")


class IncidentUpdateRequest(BaseModel):
    incident_type: Optional[str] = Field(None, description="Updated incident type")
    description: Optional[str] = Field(None, description="Updated incident description")
    status: Optional[str] = Field(None, description="Status: open, investigating, mitigated, closed")
    severity: Optional[str] = Field(None, description="Updated severity level")
    assigned_to: Optional[int] = Field(None, description="Reassigned investigator user ID")
    resolution_notes: Optional[str] = Field(None, description="Corrective and preventive actions (CAPA) notes")
    closed_at: Optional[datetime] = Field(None, description="Timestamp of incident closure")


class IncidentListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    incident_id: int
    incident_code: str
    incident_type: str
    severity: str
    status: str
    description: str
    sample_id: Optional[int] = None
    sample_code: Optional[str] = None
    sample_name: Optional[str] = None
    storage_location_id: Optional[int] = None
    storage_location_code: Optional[str] = None
    occurred_at: datetime
    reported_at: datetime
    reported_by_name: Optional[str] = None
    assigned_to_name: Optional[str] = None


class IncidentDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    incident_id: int
    incident_code: str
    incident_type: str
    severity: str
    status: str
    description: str
    occurred_at: datetime
    reported_at: datetime
    reported_by: int
    reported_by_name: Optional[str] = None
    assigned_to: Optional[int] = None
    assigned_to_name: Optional[str] = None
    sample_id: Optional[int] = None
    sample_code: Optional[str] = None
    sample_name: Optional[str] = None
    sample_status: Optional[str] = None
    storage_location_id: Optional[int] = None
    storage_location_code: Optional[str] = None
    resolution_notes: Optional[str] = None
    closed_at: Optional[datetime] = None


class BlastRadiusSampleItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sample_id: int
    sample_code: str
    sample_name: str
    generation_distance: int
    transformation_type: str
    current_status: str
    storage_location_code: Optional[str] = None


class BlastRadiusExperimentItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    experiment_id: int
    experiment_code: str
    experiment_name: str
    status: str
    usage_role: str
    associated_sample_code: str


class BlastRadiusResultItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    experiment_result_id: int
    result_code: str
    result_title: str
    experiment_code: str
    observation: Optional[str] = None
    result_value: Optional[float] = None
    result_unit: Optional[str] = None
    interpretation: Optional[str] = None
    is_final: bool


class IncidentBlastRadiusResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    incident_id: int
    incident_code: str
    root_sample_id: Optional[int] = None
    root_sample_code: Optional[str] = None
    severity: str
    downstream_samples: List[BlastRadiusSampleItem] = []
    affected_experiments: List[BlastRadiusExperimentItem] = []
    affected_results: List[BlastRadiusResultItem] = []
    total_samples_at_risk: int = 0
    total_experiments_compromised: int = 0
    total_results_tainted: int = 0
    max_generation_depth: int = 0
