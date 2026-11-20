from datetime import datetime, timezone
from sqlalchemy import (
    Column, BigInteger, Integer, String, Text, Numeric, Boolean,
    DateTime, ForeignKey, UniqueConstraint, CheckConstraint, JSON
)
from sqlalchemy.orm import relationship
from .database import Base

# Universal BigInteger that falls back to Integer for SQLite autoincrement primary keys
IdType = BigInteger().with_variant(Integer, "sqlite")


class AppUser(Base):
    __tablename__ = "AppUser"

    user_id = Column(IdType, primary_key=True, autoincrement=True)
    display_name = Column(String(120), nullable=False)
    email = Column(String(254), nullable=False, unique=True)
    password_hash = Column(Text, nullable=False)
    role = Column(String(30), nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("role IN ('ADMIN', 'RESEARCHER', 'TECHNICIAN', 'REVIEWER', 'VIEWER')", name="chk_user_role"),
    )


class SampleType(Base):
    __tablename__ = "SampleType"

    sample_type_id = Column(IdType, primary_key=True, autoincrement=True)
    type_code = Column(String(40), nullable=False, unique=True)
    type_name = Column(String(100), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class StorageLocation(Base):
    __tablename__ = "StorageLocation"

    storage_location_id = Column(IdType, primary_key=True, autoincrement=True)
    location_code = Column(String(80), nullable=False, unique=True)
    facility = Column(String(100), nullable=False)
    room = Column(String(80), nullable=True)
    unit_type = Column(String(40), nullable=False)
    unit_label = Column(String(80), nullable=True)
    rack = Column(String(40), nullable=True)
    box = Column(String(40), nullable=True)
    slot = Column(String(40), nullable=True)
    temperature_min_c = Column(Numeric(5, 2), nullable=True)
    temperature_max_c = Column(Numeric(5, 2), nullable=True)
    is_active = Column(Boolean, nullable=False, default=True)

    __table_args__ = (
        CheckConstraint("unit_type IN ('freezer', 'cabinet', 'shelf', 'liquid_nitrogen', 'bench')", name="chk_unit_type"),
    )


class Sample(Base):
    __tablename__ = "Sample"

    sample_id = Column(IdType, primary_key=True, autoincrement=True)
    sample_code = Column(String(40), nullable=False, unique=True)
    sample_name = Column(String(160), nullable=False)
    sample_type_id = Column(IdType, ForeignKey("SampleType.sample_type_id", ondelete="RESTRICT"), nullable=False)
    source_description = Column(Text, nullable=True)
    collected_at = Column(DateTime(timezone=True), nullable=True)
    registered_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    quantity_value = Column(Numeric(14, 4), nullable=False)
    quantity_unit = Column(String(24), nullable=False)
    sample_status = Column(String(24), nullable=False)
    current_storage_location_id = Column(IdType, ForeignKey("StorageLocation.storage_location_id", ondelete="SET NULL"), nullable=True)
    created_by = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)
    updated_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("quantity_value >= 0", name="chk_sample_quantity_positive"),
        CheckConstraint("sample_status IN ('REGISTERED', 'IN_STORAGE', 'IN_USE', 'DEPLETED', 'QUARANTINED', 'DISPOSED', 'MISSING')", name="chk_sample_status"),
    )

    # Relationships
    sample_type = relationship("SampleType")
    storage_location = relationship("StorageLocation")
    creator = relationship("AppUser")
    ancient_specimen = relationship("AncientSpecimen", back_populates="sample", uselist=False)


class SampleRelationship(Base):
    __tablename__ = "SampleRelationship"

    relationship_id = Column(IdType, primary_key=True, autoincrement=True)
    parent_sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="RESTRICT"), nullable=False)
    child_sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="RESTRICT"), nullable=False)
    transformation_type = Column(String(80), nullable=False)
    transformed_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    quantity_transferred = Column(Numeric(14, 4), nullable=True)
    quantity_unit = Column(String(24), nullable=True)
    recorded_by = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)
    notes = Column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("parent_sample_id <> child_sample_id", name="chk_no_self_lineage"),
        UniqueConstraint("parent_sample_id", "child_sample_id", "transformation_type", "transformed_at", name="uq_parent_child_transformation"),
    )

    parent_sample = relationship("Sample", foreign_keys=[parent_sample_id])
    child_sample = relationship("Sample", foreign_keys=[child_sample_id])


class SampleStorageHistory(Base):
    __tablename__ = "SampleStorageHistory"

    storage_history_id = Column(IdType, primary_key=True, autoincrement=True)
    sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="CASCADE"), nullable=False)
    storage_location_id = Column(IdType, ForeignKey("StorageLocation.storage_location_id", ondelete="SET NULL"), nullable=True)
    moved_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    moved_by = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)
    reason = Column(Text, nullable=True)


class SampleQuantityTransaction(Base):
    __tablename__ = "SampleQuantityTransaction"

    transaction_id = Column(IdType, primary_key=True, autoincrement=True)
    sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="CASCADE"), nullable=False)
    transaction_type = Column(String(50), nullable=False)  # 'INITIAL_REGISTRATION', 'ALIQUOT_DERIVATION', 'USAGE', 'ADJUSTMENT', 'RESTOCK'
    quantity_delta = Column(Numeric(14, 4), nullable=False)
    balance_after = Column(Numeric(14, 4), nullable=False)
    quantity_unit = Column(String(24), nullable=False)
    reference_sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="SET NULL"), nullable=True)
    reference_type = Column(String(50), nullable=True)  # 'CHILD_ALIQUOT', 'PARENT_SPECIMEN'
    notes = Column(Text, nullable=True)
    performed_by = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    sample = relationship("Sample", foreign_keys=[sample_id])
    reference_sample = relationship("Sample", foreign_keys=[reference_sample_id])
    performer = relationship("AppUser", foreign_keys=[performed_by])


class SampleTest(Base):
    __tablename__ = "SampleTest"

    sample_test_id = Column(IdType, primary_key=True, autoincrement=True)
    sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="RESTRICT"), nullable=False)
    test_type = Column(String(100), nullable=False)
    requested_at = Column(DateTime(timezone=True), nullable=True)
    performed_at = Column(DateTime(timezone=True), nullable=True)
    performed_by = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)
    test_status = Column(String(24), nullable=False)
    observation = Column(Text, nullable=True)
    result_value = Column(Numeric(16, 6), nullable=True)
    result_unit = Column(String(24), nullable=True)
    result_interpretation = Column(String(80), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("test_status IN ('requested', 'in_progress', 'completed', 'cancelled')", name="chk_test_status"),
    )

    sample = relationship("Sample")
    performer = relationship("AppUser", foreign_keys=[performed_by])


class ArchaeologicalSite(Base):
    __tablename__ = "ArchaeologicalSite"

    archaeological_site_id = Column(IdType, primary_key=True, autoincrement=True)
    site_code = Column(String(60), nullable=False, unique=True)
    site_name = Column(String(160), nullable=False)
    region = Column(String(120), nullable=True)
    country = Column(String(100), nullable=True)
    context_notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))


class AncientSpecimen(Base):
    __tablename__ = "AncientSpecimen"

    sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="CASCADE"), primary_key=True)
    archaeological_site_id = Column(IdType, ForeignKey("ArchaeologicalSite.archaeological_site_id", ondelete="SET NULL"), nullable=True)
    estimated_age_years = Column(Integer, nullable=True)
    age_uncertainty_years = Column(Integer, nullable=True)
    dating_method = Column(String(100), nullable=True)
    excavation_layer = Column(String(100), nullable=True)
    depth_cm = Column(Numeric(8, 2), nullable=True)
    preservation_state = Column(String(40), nullable=True)
    context_reference = Column(String(120), nullable=True)

    sample = relationship("Sample", back_populates="ancient_specimen")
    site = relationship("ArchaeologicalSite")


class Equipment(Base):
    __tablename__ = "Equipment"

    equipment_id = Column(IdType, primary_key=True, autoincrement=True)
    equipment_code = Column(String(50), nullable=False, unique=True)
    equipment_name = Column(String(140), nullable=False)
    manufacturer = Column(String(120), nullable=True)
    model_number = Column(String(100), nullable=True)
    equipment_status = Column(String(24), nullable=False, default="available")
    last_calibrated_at = Column(DateTime(timezone=True), nullable=True)
    calibration_due_at = Column(DateTime(timezone=True), nullable=True)
    notes = Column(Text, nullable=True)

    __table_args__ = (
        CheckConstraint("equipment_status IN ('available', 'in_use', 'maintenance', 'retired')", name="chk_equip_status"),
    )


class Experiment(Base):
    __tablename__ = "Experiment"

    experiment_id = Column(IdType, primary_key=True, autoincrement=True)
    experiment_code = Column(String(40), nullable=False, unique=True)
    experiment_name = Column(String(180), nullable=False)
    objective = Column(Text, nullable=True)
    protocol_reference = Column(String(200), nullable=True)
    created_by = Column(IdType, ForeignKey("AppUser.user_id", ondelete="RESTRICT"), nullable=False)
    lead_researcher_id = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)
    planned_start = Column(DateTime(timezone=True), nullable=True)
    planned_end = Column(DateTime(timezone=True), nullable=True)
    actual_start = Column(DateTime(timezone=True), nullable=True)
    actual_end = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(24), nullable=False, default="planned")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))

    __table_args__ = (
        CheckConstraint("status IN ('planned', 'active', 'completed', 'cancelled', 'on_hold')", name="chk_experiment_status"),
    )

    creator = relationship("AppUser", foreign_keys=[created_by])
    lead_researcher = relationship("AppUser", foreign_keys=[lead_researcher_id])
    samples = relationship("ExperimentSample", back_populates="experiment", cascade="all, delete-orphan")
    equipments = relationship("ExperimentEquipment", back_populates="experiment", cascade="all, delete-orphan")
    results = relationship("ExperimentResult", back_populates="experiment", cascade="all, delete-orphan")


class ExperimentSample(Base):
    __tablename__ = "ExperimentSample"

    experiment_id = Column(IdType, ForeignKey("Experiment.experiment_id", ondelete="CASCADE"), primary_key=True)
    sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="RESTRICT"), primary_key=True)
    usage_role = Column(String(60), primary_key=True, default="input")
    quantity_used = Column(Numeric(14, 4), nullable=True)
    quantity_unit = Column(String(24), nullable=True)
    added_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    notes = Column(Text, nullable=True)

    experiment = relationship("Experiment", back_populates="samples")
    sample = relationship("Sample")


class ExperimentEquipment(Base):
    __tablename__ = "ExperimentEquipment"

    experiment_equipment_id = Column(IdType, primary_key=True, autoincrement=True)
    experiment_id = Column(IdType, ForeignKey("Experiment.experiment_id", ondelete="CASCADE"), nullable=False)
    equipment_id = Column(IdType, ForeignKey("Equipment.equipment_id", ondelete="RESTRICT"), nullable=False)
    usage_start = Column(DateTime(timezone=True), nullable=True)
    usage_end = Column(DateTime(timezone=True), nullable=True)
    usage_notes = Column(Text, nullable=True)

    experiment = relationship("Experiment", back_populates="equipments")
    equipment = relationship("Equipment")


class ExperimentResult(Base):
    __tablename__ = "ExperimentResult"

    experiment_result_id = Column(IdType, primary_key=True, autoincrement=True)
    experiment_id = Column(IdType, ForeignKey("Experiment.experiment_id", ondelete="CASCADE"), nullable=False)
    result_code = Column(String(50), nullable=False, unique=True)
    result_title = Column(String(180), nullable=False)
    observation = Column(Text, nullable=True)
    result_value = Column(Numeric(16, 6), nullable=True)
    result_unit = Column(String(24), nullable=True)
    interpretation = Column(Text, nullable=True)
    recorded_by = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)
    recorded_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    is_final = Column(Boolean, nullable=False, default=False)

    experiment = relationship("Experiment", back_populates="results")
    recorder = relationship("AppUser", foreign_keys=[recorded_by])


class RestrictedMaterial(Base):
    __tablename__ = "RestrictedMaterial"

    restricted_material_id = Column(IdType, primary_key=True, autoincrement=True)
    sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="RESTRICT"), nullable=False)
    restriction_type = Column(String(80), nullable=False)
    risk_level = Column(String(20), nullable=False)
    access_level = Column(String(30), nullable=False)
    classification_basis = Column(Text, nullable=True)
    valid_from = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    valid_until = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(24), nullable=False, default="active")
    reviewed_by = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)


class Incident(Base):
    __tablename__ = "Incident"

    incident_id = Column(IdType, primary_key=True, autoincrement=True)
    incident_code = Column(String(50), nullable=False, unique=True)
    sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="RESTRICT"), nullable=True)
    storage_location_id = Column(IdType, ForeignKey("StorageLocation.storage_location_id", ondelete="SET NULL"), nullable=True)
    incident_type = Column(String(60), nullable=False)
    severity = Column(String(20), nullable=False)
    description = Column(Text, nullable=False)
    occurred_at = Column(DateTime(timezone=True), nullable=False)
    reported_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    reported_by = Column(IdType, ForeignKey("AppUser.user_id", ondelete="RESTRICT"), nullable=False)
    assigned_to = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)
    status = Column(String(24), nullable=False, default="open")
    resolution_notes = Column(Text, nullable=True)
    closed_at = Column(DateTime(timezone=True), nullable=True)


class AIAnalysis(Base):
    __tablename__ = "AIAnalysis"

    ai_analysis_id = Column(IdType, primary_key=True, autoincrement=True)
    sample_id = Column(IdType, ForeignKey("Sample.sample_id", ondelete="RESTRICT"), nullable=False)
    predicted_risk = Column(String(20), nullable=False)
    confidence = Column(Numeric(6, 5), nullable=False)
    class_probabilities = Column(JSON, nullable=True)
    important_factors = Column(JSON, nullable=False)
    model_registry_id = Column(IdType, ForeignKey("ModelRegistry.model_registry_id", ondelete="RESTRICT"), nullable=False, index=True)
    analysed_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    reviewed_by = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)
    reviewed_at = Column(DateTime(timezone=True), nullable=True)
    review_feedback = Column(String(24), nullable=True)
    review_notes = Column(Text, nullable=True)
    input_snapshot = Column(JSON, nullable=True)

    model_registry = relationship("ModelRegistry")


class AuditLog(Base):
    __tablename__ = "AuditLog"

    audit_log_id = Column(IdType, primary_key=True, autoincrement=True)
    actor_user_id = Column(IdType, ForeignKey("AppUser.user_id", ondelete="SET NULL"), nullable=True)
    action = Column(String(80), nullable=False)
    entity_type = Column(String(60), nullable=False)
    entity_id = Column(IdType, nullable=True)
    occurred_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    request_id = Column(String(64), nullable=True)
    details = Column(JSON, nullable=True)


class ModelRegistry(Base):
    __tablename__ = "ModelRegistry"

    model_registry_id = Column(IdType, primary_key=True, autoincrement=True)
    model_name = Column(String(100), nullable=False)
    model_version = Column(String(60), nullable=False, unique=True)
    artifact_uri = Column(String(255), nullable=False)
    trained_at = Column(DateTime(timezone=True), nullable=False, default=lambda: datetime.now(timezone.utc))
    training_data_version = Column(String(60), nullable=False)
    feature_schema_version = Column(String(60), nullable=False)
    metrics = Column(JSON, nullable=True)
    is_active = Column(Boolean, nullable=False, default=False)
