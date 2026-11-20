from enum import Enum


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    RESEARCHER = "RESEARCHER"
    TECHNICIAN = "TECHNICIAN"
    REVIEWER = "REVIEWER"
    VIEWER = "VIEWER"


class SampleStatus(str, Enum):
    REGISTERED = "REGISTERED"
    IN_STORAGE = "IN_STORAGE"
    IN_USE = "IN_USE"
    DEPLETED = "DEPLETED"
    QUARANTINED = "QUARANTINED"
    DISPOSED = "DISPOSED"
    MISSING = "MISSING"


class TransformationType(str, Enum):
    EXTRACTION = "Extraction"
    PULVERIZATION = "Pulverization"
    ALIQUOTING = "Aliquoting"
    PCR_AMPLIFICATION = "PCR_Amplification"
    PURIFICATION = "Purification"
    CHEMICAL_SYNTHESIS = "Chemical_Synthesis"


class UnitType(str, Enum):
    FREEZER = "freezer"
    CABINET = "cabinet"
    SHELF = "shelf"
    LIQUID_NITROGEN = "liquid_nitrogen"
    BENCH = "bench"


class TestStatus(str, Enum):
    REQUESTED = "requested"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class TestOutcome(str, Enum):
    PASS = "Pass"
    MARGINAL = "Marginal"
    FAIL = "Fail"
    INCONCLUSIVE = "Inconclusive"


class ExperimentStatus(str, Enum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    ON_HOLD = "on_hold"


class UsageRole(str, Enum):
    INPUT = "input"
    CONTROL = "control"
    REFERENCE = "reference"
    OUTPUT = "output"


class IncidentType(str, Enum):
    CONTAMINATION = "contamination"
    TEMPERATURE_EXCURSION = "temperature_excursion"
    MISSING_SAMPLE = "missing_sample"
    HANDLING_ISSUE = "handling_issue"
    EQUIPMENT_FAILURE = "equipment_failure"
    OTHER = "other"


class IncidentSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class IncidentStatus(str, Enum):
    OPEN = "open"
    INVESTIGATING = "investigating"
    MITIGATED = "mitigated"
    CLOSED = "closed"


class RiskLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ReviewFeedback(str, Enum):
    AGREE = "agree"
    DISAGREE = "disagree"
    NEEDS_REVIEW = "needs_review"
