"""
Pydantic Schemas for Module 7: Ancient Specimens & Archaeological Provenance
Imports strictly from app.common or stdlib.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class SiteCreateRequest(BaseModel):
    site_code: str = Field(..., min_length=2, max_length=60, description="Unique alphanumeric site identifier (e.g. SITE-KRNL-01)")
    site_name: str = Field(..., min_length=2, max_length=160, description="Excavation site name")
    region: Optional[str] = Field(None, max_length=120, description="Geographic region / province / state")
    country: Optional[str] = Field(None, max_length=100, description="Sovereign nation")
    context_notes: Optional[str] = Field(None, description="Archaeological context, stratigraphy, or cultural period notes")


class SiteUpdateRequest(BaseModel):
    site_name: Optional[str] = Field(None, min_length=2, max_length=160)
    region: Optional[str] = Field(None, max_length=120)
    country: Optional[str] = Field(None, max_length=100)
    context_notes: Optional[str] = None


class SiteDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    archaeological_site_id: int
    site_code: str
    site_name: str
    region: Optional[str] = None
    country: Optional[str] = None
    context_notes: Optional[str] = None
    specimen_count: int = 0
    created_at: datetime


class AncientSpecimenCreate(BaseModel):
    sample_id: int = Field(..., description="ID of existing base specimen in Sample table")
    archaeological_site_id: Optional[int] = Field(None, description="Foreign key to ArchaeologicalSite")
    estimated_age_years: Optional[int] = Field(None, ge=0, description="Estimated calibrated age BP (Before Present)")
    age_uncertainty_years: Optional[int] = Field(None, ge=0, description="Margin of chronological uncertainty (± years)")
    dating_method: Optional[str] = Field(None, max_length=100, description="Chronometric method (e.g. 14C AMS, U-Th Dating)")
    excavation_layer: Optional[str] = Field(None, max_length=100, description="Stratigraphic excavation stratum (e.g. Layer IVb)")
    depth_cm: Optional[float] = Field(None, ge=0, description="Excavation depth below surface in centimeters")
    preservation_state: Optional[str] = Field(None, max_length=40, description="Taphonomic preservation state (e.g. calcified, charred, desiccated)")
    context_reference: Optional[str] = Field(None, max_length=120, description="Field grid quadrant / trench locator")


class AncientSpecimenUpdate(BaseModel):
    archaeological_site_id: Optional[int] = None
    estimated_age_years: Optional[int] = Field(None, ge=0)
    age_uncertainty_years: Optional[int] = Field(None, ge=0)
    dating_method: Optional[str] = Field(None, max_length=100)
    excavation_layer: Optional[str] = Field(None, max_length=100)
    depth_cm: Optional[float] = Field(None, ge=0)
    preservation_state: Optional[str] = Field(None, max_length=40)
    context_reference: Optional[str] = Field(None, max_length=120)


class AncientSpecimenListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sample_id: int
    sample_code: str
    sample_name: str
    sample_type_code: str
    status: str
    archaeological_site_id: Optional[int] = None
    site_code: Optional[str] = None
    site_name: Optional[str] = None
    country: Optional[str] = None
    estimated_age_years: Optional[int] = None
    age_uncertainty_years: Optional[int] = None
    dating_method: Optional[str] = None
    preservation_state: Optional[str] = None
    excavation_layer: Optional[str] = None


class AncientSpecimenDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    sample_id: int
    sample_code: str
    sample_name: str
    sample_type_code: str
    sample_type_name: Optional[str] = None
    storage_location_code: Optional[str] = None
    status: str
    source_description: Optional[str] = None
    archaeological_site_id: Optional[int] = None
    site_code: Optional[str] = None
    site_name: Optional[str] = None
    region: Optional[str] = None
    country: Optional[str] = None
    estimated_age_years: Optional[int] = None
    age_uncertainty_years: Optional[int] = None
    dating_method: Optional[str] = None
    excavation_layer: Optional[str] = None
    depth_cm: Optional[float] = None
    preservation_state: Optional[str] = None
    context_reference: Optional[str] = None
