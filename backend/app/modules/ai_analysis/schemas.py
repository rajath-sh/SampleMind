"""
Pydantic Schemas for Module 9: AI Risk Advisory Subsystem
Imports strictly from app.common or standard library.
"""
from datetime import datetime
from typing import Optional, List, Dict, Any, Literal, Annotated
from pydantic import BaseModel, Field, ConfigDict, StringConstraints


class ModelRegistryInfo(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    model_registry_id: int
    model_name: str
    model_version: str
    artifact_uri: str
    trained_at: datetime
    training_data_version: str
    feature_schema_version: str
    metrics: Dict[str, Any] = {}
    is_active: bool


class ContributingFactor(BaseModel):
    factor: str = Field(..., description="Human-readable name of contributing feature")
    weight: float = Field(..., description="Normalized feature importance / attribution weight")
    impact: str = Field(..., description="'risk_increasing', 'risk_mitigating', or 'neutral'")
    detail: str = Field(..., description="Specific observation on the sample record")


class AIAnalysisResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ai_analysis_id: int
    sample_id: int
    sample_code: str
    sample_name: str
    predicted_risk: str = Field(..., description="Advisory risk classification: LOW, MEDIUM, or HIGH")
    confidence: Optional[float] = None
    legacy: bool = False
    class_probabilities: Dict[str, float] = Field(..., description="Class probabilities for LOW, MEDIUM, HIGH")
    important_factors: List[ContributingFactor] = []
    model_name: str
    model_version: str
    feature_schema_version: str
    analysed_at: datetime
    reviewed_by: Optional[int] = None
    reviewed_by_name: Optional[str] = None
    reviewed_at: Optional[datetime] = None
    review_feedback: Optional[str] = None
    review_notes: Optional[str] = None
    input_snapshot: Optional[Dict[str, Any]] = None


class AIReviewRequest(BaseModel):
    review_feedback: Literal["agree", "disagree", "needs_review"]
    review_notes: Annotated[str, StringConstraints(strip_whitespace=True, min_length=5, max_length=2000)]


class RiskDistributionResponse(BaseModel):
    total_samples: int
    assessed_samples: int
    unassessed_samples: int
    counts: Dict[str, int] = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
    percentages: Dict[str, float] = {"LOW": 0.0, "MEDIUM": 0.0, "HIGH": 0.0}
