"""
SampleMind Common Layer - Central Entrypoint
===========================================
This is the single main file that exports all common utilities, database engine,
ORM models, authentication mechanisms, configurations, and exceptions.

Modular Design Contract:
- Every feature module (samples, lineage, experiments, incidents, ai_analysis, etc.)
  imports ONLY from `app.common`.
- Modules do NOT cross-import directly from sibling modules.
"""

from .config import settings
from .database import Base, engine, SessionLocal, get_db
from .constants import (
    UserRole,
    SampleStatus,
    TransformationType,
    UnitType,
    TestStatus,
    TestOutcome,
    ExperimentStatus,
    UsageRole,
    IncidentType,
    IncidentSeverity,
    IncidentStatus,
    RiskLevel,
    ReviewFeedback,
)
from .security import (
    verify_password,
    get_password_hash,
    create_access_token,
    decode_access_token,
)
from .dependencies import (
    get_current_user,
    require_roles,
    oauth2_scheme,
)
from .exceptions import (
    SampleMindException,
    EntityNotFoundException,
    DuplicateEntityException,
    LineageCycleException,
    InsufficientQuantityException,
    UnauthorizedRoleException,
    InvalidCredentialsException,
    ValidationException,
)
from .models import (
    AppUser,
    SampleType,
    StorageLocation,
    Sample,
    SampleRelationship,
    SampleStorageHistory,
    SampleQuantityTransaction,
    SampleTest,
    ArchaeologicalSite,
    AncientSpecimen,
    Equipment,
    Experiment,
    ExperimentSample,
    ExperimentEquipment,
    ExperimentResult,
    RestrictedMaterial,
    Incident,
    AIAnalysis,
    AuditLog,
    ModelRegistry,
)
from .schemas import (
    APIResponse,
    PaginatedResponse,
    ErrorDetail,
    TokenResponse,
    TokenData,
    UserSummary,
)

__all__ = [
    # Configuration
    "settings",
    # Database
    "Base",
    "engine",
    "SessionLocal",
    "get_db",
    # Constants & Enums
    "UserRole",
    "SampleStatus",
    "TransformationType",
    "UnitType",
    "TestStatus",
    "TestOutcome",
    "ExperimentStatus",
    "UsageRole",
    "IncidentType",
    "IncidentSeverity",
    "IncidentStatus",
    "RiskLevel",
    "ReviewFeedback",
    # Security
    "verify_password",
    "get_password_hash",
    "create_access_token",
    "decode_access_token",
    # Dependencies
    "get_current_user",
    "require_roles",
    "oauth2_scheme",
    # Exceptions
    "SampleMindException",
    "EntityNotFoundException",
    "DuplicateEntityException",
    "LineageCycleException",
    "InsufficientQuantityException",
    "UnauthorizedRoleException",
    "InvalidCredentialsException",
    # Models
    "AppUser",
    "SampleType",
    "StorageLocation",
    "Sample",
    "SampleRelationship",
    "SampleStorageHistory",
    "SampleTest",
    "ArchaeologicalSite",
    "AncientSpecimen",
    "Equipment",
    "Experiment",
    "ExperimentSample",
    "ExperimentEquipment",
    "ExperimentResult",
    "RestrictedMaterial",
    "Incident",
    "AIAnalysis",
    "AuditLog",
    "ModelRegistry",
    # Schemas & DTOs
    "APIResponse",
    "PaginatedResponse",
    "ErrorDetail",
    "TokenResponse",
    "TokenData",
    "UserSummary",
]
