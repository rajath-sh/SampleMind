"""
SampleMind Storage & Equipment Module - Schemas & DTOs
======================================================
Strict isolation: imports only from app.common.
Defines schemas for physical storage locations, box-slot occupancy grids,
and analytical equipment registry.
"""

from __future__ import annotations
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field


# ==============================================================================
# Storage Location Schemas
# ==============================================================================

class StorageLocationCreate(BaseModel):
    """Payload to register a new storage coordinate or container."""
    location_code: str = Field(..., min_length=3, max_length=80, description="Unique human-readable storage code")
    facility: str = Field(..., min_length=2, max_length=100, description="Facility or building name")
    room: Optional[str] = Field(None, max_length=80, description="Room or bay identifier")
    unit_type: str = Field(default="freezer", description="freezer, cabinet, shelf, liquid_nitrogen, bench")
    unit_label: Optional[str] = Field(None, max_length=80, description="Freezer or unit label e.g. FRZ-ULT-01")
    rack: Optional[str] = Field(None, max_length=40, description="Rack identifier")
    box: Optional[str] = Field(None, max_length=40, description="Box identifier")
    slot: Optional[str] = Field(None, max_length=40, description="Specific grid coordinate e.g. A01")
    temperature_min_c: Optional[float] = Field(None, ge=-273.15, le=150, allow_inf_nan=False, description="Lower temperature limit in Celsius")
    temperature_max_c: Optional[float] = Field(None, ge=-273.15, le=150, allow_inf_nan=False, description="Upper temperature limit in Celsius")
    is_active: bool = Field(default=True, description="Active storage status")


class StorageLocationUpdate(BaseModel):
    """Payload to update an existing storage location's environmental conditions or status."""
    facility: Optional[str] = None
    room: Optional[str] = None
    unit_type: Optional[str] = None
    unit_label: Optional[str] = None
    rack: Optional[str] = None
    box: Optional[str] = None
    slot: Optional[str] = None
    temperature_min_c: Optional[float] = Field(None, ge=-273.15, le=150, allow_inf_nan=False)
    temperature_max_c: Optional[float] = Field(None, ge=-273.15, le=150, allow_inf_nan=False)
    is_active: Optional[bool] = None


class SampleBriefInStorage(BaseModel):
    """Lightweight representation of a sample located in a storage slot."""
    sample_id: int
    sample_code: str
    sample_name: str
    sample_status: str
    quantity_value: float
    quantity_unit: str

    class Config:
        from_attributes = True


class StorageLocationDetail(BaseModel):
    """Full detail of a storage location including computed sample count."""
    storage_location_id: int
    location_code: str
    facility: str
    room: Optional[str] = None
    unit_type: str
    unit_label: Optional[str] = None
    rack: Optional[str] = None
    box: Optional[str] = None
    slot: Optional[str] = None
    temperature_min_c: Optional[float] = None
    temperature_max_c: Optional[float] = None
    is_active: bool
    sample_count: int = 0

    class Config:
        from_attributes = True


class StorageLocationWithSamples(StorageLocationDetail):
    """Storage location profile along with currently resident biological samples."""
    samples: List[SampleBriefInStorage] = []


class BoxOccupancySlot(BaseModel):
    """Single coordinate slot in a 2D cryogenic box grid."""
    storage_location_id: int
    location_code: str
    slot: str
    occupied: bool
    specimens: List[SampleBriefInStorage] = Field(default_factory=list)
    sample_id: Optional[int] = None
    sample_code: Optional[str] = None
    sample_name: Optional[str] = None
    sample_status: Optional[str] = None


class OccupancyGridResponse(BaseModel):
    """Interactive 2D slot occupancy grid representation for UI visualization."""
    unit_label: str
    rack: Optional[str] = None
    box: Optional[str] = None
    total_slots: int
    occupied_slots: int
    available_slots: int
    occupancy_percentage: float
    slots: List[BoxOccupancySlot]


# ==============================================================================
# Laboratory Equipment Schemas
# ==============================================================================

class EquipmentCreate(BaseModel):
    """Payload to register a new laboratory instrument."""
    equipment_code: str = Field(..., min_length=3, max_length=50, description="Unique instrument identifier")
    equipment_name: str = Field(..., min_length=2, max_length=140, description="Formal instrument name")
    manufacturer: Optional[str] = Field(None, max_length=120)
    model_number: Optional[str] = Field(None, max_length=100)
    equipment_status: str = Field(default="available", description="available, in_use, maintenance, retired")
    last_calibrated_at: Optional[datetime] = None
    calibration_due_at: Optional[datetime] = None
    notes: Optional[str] = None


class EquipmentUpdate(BaseModel):
    """Payload to update laboratory instrument details."""
    equipment_name: Optional[str] = None
    manufacturer: Optional[str] = None
    model_number: Optional[str] = None
    equipment_status: Optional[str] = None
    last_calibrated_at: Optional[datetime] = None
    calibration_due_at: Optional[datetime] = None
    notes: Optional[str] = None


class EquipmentStatusUpdate(BaseModel):
    """Payload to update operational and calibration status."""
    equipment_status: Optional[str] = None
    last_calibrated_at: Optional[datetime] = None
    calibration_due_at: Optional[datetime] = None
    notes: Optional[str] = None


class EquipmentDetail(BaseModel):
    """Full dossier of a laboratory instrument."""
    equipment_id: int
    equipment_code: str
    equipment_name: str
    manufacturer: Optional[str] = None
    model_number: Optional[str] = None
    equipment_status: str
    last_calibrated_at: Optional[datetime] = None
    calibration_due_at: Optional[datetime] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True
