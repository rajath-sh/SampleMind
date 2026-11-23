"""
SampleMind Storage & Equipment Module - Service Layer
=====================================================
Strict isolation: imports only from app.common.
Encapsulates physical storage location hierarchy, 2D cryogenic slot grid
calculation, and laboratory equipment calibration lifecycles.
"""

from __future__ import annotations
from collections import defaultdict
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.common import (
    StorageLocation,
    Equipment,
    Sample,
    AuditLog,
    EntityNotFoundException,
    DuplicateEntityException,
    ValidationException,
)
from .schemas import (
    StorageLocationCreate,
    StorageLocationUpdate,
    StorageLocationDetail,
    StorageLocationWithSamples,
    SampleBriefInStorage,
    BoxOccupancySlot,
    OccupancyGridResponse,
    EquipmentCreate,
    EquipmentUpdate,
    EquipmentStatusUpdate,
    EquipmentDetail,
)


class StorageService:
    """Operations on physical storage facilities and coordinate slots."""

    @staticmethod
    def create_location(
        db: Session,
        req: StorageLocationCreate,
        actor_id: Optional[int] = None
    ) -> StorageLocation:
        """Provisions a new storage coordinate with code uniqueness check."""
        existing = db.query(StorageLocation).filter(
            StorageLocation.location_code == req.location_code
        ).first()
        if existing:
            raise DuplicateEntityException(f"Storage location '{req.location_code}' already exists.")

        if (req.temperature_min_c is not None and req.temperature_max_c is not None
                and req.temperature_min_c > req.temperature_max_c):
            raise ValidationException("The lower storage temperature limit cannot exceed the upper limit.")

        location = StorageLocation(
            location_code=req.location_code,
            facility=req.facility,
            room=req.room,
            unit_type=req.unit_type,
            unit_label=req.unit_label,
            rack=req.rack,
            box=req.box,
            slot=req.slot,
            temperature_min_c=req.temperature_min_c,
            temperature_max_c=req.temperature_max_c,
            is_active=req.is_active,
        )
        db.add(location)
        db.flush()

        # Audit entry
        audit = AuditLog(
            actor_user_id=actor_id,
            action="STORAGE_LOCATION_CREATED",
            entity_type="StorageLocation",
            entity_id=location.storage_location_id,
            details={"location_code": location.location_code, "facility": location.facility}
        )
        db.add(audit)
        db.commit()

        return location

    @staticmethod
    def get_location_by_id(db: Session, location_id: int) -> StorageLocationDetail:
        """Retrieves a storage location by ID along with its current sample count."""
        location = db.query(StorageLocation).filter(
            StorageLocation.storage_location_id == location_id
        ).first()
        if not location:
            raise EntityNotFoundException("StorageLocation", location_id)

        sample_count = db.query(func.count(Sample.sample_id)).filter(
            Sample.current_storage_location_id == location_id
        ).scalar() or 0

        detail = StorageLocationDetail(
            storage_location_id=location.storage_location_id,
            location_code=location.location_code,
            facility=location.facility,
            room=location.room,
            unit_type=location.unit_type,
            unit_label=location.unit_label,
            rack=location.rack,
            box=location.box,
            slot=location.slot,
            temperature_min_c=float(location.temperature_min_c) if location.temperature_min_c is not None else None,
            temperature_max_c=float(location.temperature_max_c) if location.temperature_max_c is not None else None,
            is_active=location.is_active,
            sample_count=sample_count,
        )
        return detail

    @staticmethod
    def get_location_with_samples(db: Session, location_id: int) -> StorageLocationWithSamples:
        """Returns storage location metadata alongside currently stored specimens."""
        base_detail = StorageService.get_location_by_id(db, location_id)
        samples = db.query(Sample).filter(
            Sample.current_storage_location_id == location_id
        ).all()

        sample_items = [
            SampleBriefInStorage(
                sample_id=s.sample_id,
                sample_code=s.sample_code,
                sample_name=s.sample_name,
                sample_status=s.sample_status,
                quantity_value=float(s.quantity_value),
                quantity_unit=s.quantity_unit,
            )
            for s in samples
        ]

        return StorageLocationWithSamples(
            **base_detail.dict(),
            samples=sample_items
        )

    @staticmethod
    def list_locations(
        db: Session,
        unit_type: Optional[str] = None,
        unit_label: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> List[StorageLocationDetail]:
        """Queries storage coordinates with active filters and sample counts."""
        query = db.query(StorageLocation)
        if unit_type:
            query = query.filter(StorageLocation.unit_type == unit_type)
        if unit_label:
            query = query.filter(StorageLocation.unit_label == unit_label)
        if is_active is not None:
            query = query.filter(StorageLocation.is_active == is_active)

        locations = query.order_by(StorageLocation.storage_location_id.asc()).all()

        # Compute sample counts
        counts_query = db.query(
            Sample.current_storage_location_id,
            func.count(Sample.sample_id)
        ).group_by(Sample.current_storage_location_id).all()
        counts_map = {loc_id: cnt for loc_id, cnt in counts_query if loc_id is not None}

        results = []
        for loc in locations:
            results.append(StorageLocationDetail(
                storage_location_id=loc.storage_location_id,
                location_code=loc.location_code,
                facility=loc.facility,
                room=loc.room,
                unit_type=loc.unit_type,
                unit_label=loc.unit_label,
                rack=loc.rack,
                box=loc.box,
                slot=loc.slot,
                temperature_min_c=float(loc.temperature_min_c) if loc.temperature_min_c is not None else None,
                temperature_max_c=float(loc.temperature_max_c) if loc.temperature_max_c is not None else None,
                is_active=loc.is_active,
                sample_count=counts_map.get(loc.storage_location_id, 0),
            ))
        return results

    @staticmethod
    def update_location(
        db: Session,
        location_id: int,
        req: StorageLocationUpdate,
        actor_id: Optional[int] = None
    ) -> StorageLocationDetail:
        """Modifies environmental conditions or status of a storage location."""
        location = db.query(StorageLocation).filter(
            StorageLocation.storage_location_id == location_id
        ).first()
        if not location:
            raise EntityNotFoundException("StorageLocation", location_id)

        old_state = {
            "facility": location.facility,
            "room": location.room,
            "unit_type": location.unit_type,
            "unit_label": location.unit_label,
            "is_active": location.is_active,
        }

        if req.facility is not None:
            location.facility = req.facility
        if req.unit_type is not None:
            location.unit_type = req.unit_type
        if req.room is not None:
            location.room = req.room
        if req.unit_label is not None:
            location.unit_label = req.unit_label
        if req.rack is not None:
            location.rack = req.rack
        if req.box is not None:
            location.box = req.box
        if req.slot is not None:
            location.slot = req.slot
        if req.temperature_min_c is not None:
            location.temperature_min_c = req.temperature_min_c
        if req.temperature_max_c is not None:
            location.temperature_max_c = req.temperature_max_c
        if req.is_active is not None:
            location.is_active = req.is_active

        if (location.temperature_min_c is not None and location.temperature_max_c is not None
                and location.temperature_min_c > location.temperature_max_c):
            raise ValidationException("The lower storage temperature limit cannot exceed the upper limit.")

        # Audit entry
        audit = AuditLog(
            actor_user_id=actor_id,
            action="STORAGE_LOCATION_UPDATED",
            entity_type="StorageLocation",
            entity_id=location.storage_location_id,
            details={"old_state": old_state}
        )
        db.add(audit)
        db.commit()

        return StorageService.get_location_by_id(db, location_id)

    @staticmethod
    def delete_location(
        db: Session,
        location_id: int,
        actor_id: Optional[int] = None
    ) -> bool:
        """Deletes a storage location."""
        location = db.query(StorageLocation).filter(
            StorageLocation.storage_location_id == location_id
        ).first()
        if not location:
            raise EntityNotFoundException("StorageLocation", location_id)

        # Unlink samples in this storage location if any
        db.query(Sample).filter(Sample.current_storage_location_id == location_id).update(
            {"current_storage_location_id": None}
        )

        db.delete(location)
        db.commit()
        return True

    @staticmethod
    def get_box_occupancy_grid(
        db: Session,
        unit_label: str,
        box: Optional[str] = None
    ) -> OccupancyGridResponse:
        """
        Builds a 2D cryogenic grid map showing occupied versus free slots
        for interactive laboratory visualization.
        """
        query = db.query(StorageLocation).filter(StorageLocation.unit_label == unit_label)
        if box:
            query = query.filter(StorageLocation.box == box)

        locations = query.filter(StorageLocation.is_active.is_(True)).order_by(
            StorageLocation.rack, StorageLocation.box, StorageLocation.slot, StorageLocation.location_code
        ).all()
        loc_ids = [loc.storage_location_id for loc in locations]

        samples = db.query(Sample).filter(
            Sample.current_storage_location_id.in_(loc_ids),
            Sample.sample_status.notin_(("DISPOSED", "DEPLETED", "MISSING")),
        ).order_by(Sample.sample_code).all()
        samples_by_location = defaultdict(list)
        for sample in samples:
            samples_by_location[sample.current_storage_location_id].append(sample)

        slots_data: List[BoxOccupancySlot] = []
        occupied_count = 0

        for loc in locations:
            occupants = samples_by_location[loc.storage_location_id]
            first = occupants[0] if occupants else None
            occupied_count += bool(first)
            slots_data.append(BoxOccupancySlot(
                storage_location_id=loc.storage_location_id,
                location_code=loc.location_code,
                slot=loc.slot or loc.location_code,
                occupied=bool(first),
                sample_id=first.sample_id if first else None,
                sample_code=first.sample_code if first else None,
                sample_name=first.sample_name if first else None,
                sample_status=first.sample_status if first else None,
                specimens=[SampleBriefInStorage.model_validate(sample) for sample in occupants],
            ))

        total = len(locations)
        available = total - occupied_count
        pct = round((occupied_count / total * 100.0), 1) if total > 0 else 0.0

        return OccupancyGridResponse(
            unit_label=unit_label,
            box=box,
            total_slots=total,
            occupied_slots=occupied_count,
            available_slots=available,
            occupancy_percentage=pct,
            slots=slots_data
        )


class EquipmentService:
    """Operations on laboratory instruments and calibration status."""

    @staticmethod
    def register_equipment(
        db: Session,
        req: EquipmentCreate,
        actor_id: Optional[int] = None
    ) -> Equipment:
        """Registers a new laboratory instrument."""
        existing = db.query(Equipment).filter(
            Equipment.equipment_code == req.equipment_code
        ).first()
        if existing:
            raise DuplicateEntityException(f"Equipment with code '{req.equipment_code}' already exists.")

        eq = Equipment(
            equipment_code=req.equipment_code,
            equipment_name=req.equipment_name,
            manufacturer=req.manufacturer,
            model_number=req.model_number,
            equipment_status=req.equipment_status,
            last_calibrated_at=req.last_calibrated_at,
            calibration_due_at=req.calibration_due_at,
            notes=req.notes,
        )
        db.add(eq)
        db.commit()
        db.refresh(eq)

        audit = AuditLog(
            actor_user_id=actor_id,
            action="EQUIPMENT_REGISTERED",
            entity_type="Equipment",
            entity_id=eq.equipment_id,
            details={"equipment_code": eq.equipment_code, "name": eq.equipment_name}
        )
        db.add(audit)
        db.commit()

        return eq

    @staticmethod
    def get_equipment_by_id(db: Session, equipment_id: int) -> Equipment:
        """Retrieves equipment details by ID."""
        eq = db.query(Equipment).filter(Equipment.equipment_id == equipment_id).first()
        if not eq:
            raise EntityNotFoundException("Equipment", equipment_id)
        return eq

    @staticmethod
    def list_equipment(
        db: Session,
        status: Optional[str] = None
    ) -> List[Equipment]:
        """Queries equipment catalog with optional status filter."""
        query = db.query(Equipment)
        if status:
            query = query.filter(Equipment.equipment_status == status)
        return query.order_by(Equipment.equipment_id.asc()).all()

    @staticmethod
    def update_equipment_status(
        db: Session,
        equipment_id: int,
        req: EquipmentStatusUpdate,
        actor_id: Optional[int] = None
    ) -> Equipment:
        """Updates operational or calibration status."""
        eq = EquipmentService.get_equipment_by_id(db, equipment_id)

        old_state = {
            "equipment_status": eq.equipment_status,
            "last_calibrated_at": str(eq.last_calibrated_at) if eq.last_calibrated_at else None,
        }

        if req.equipment_status is not None:
            eq.equipment_status = req.equipment_status
        if req.last_calibrated_at is not None:
            eq.last_calibrated_at = req.last_calibrated_at
        if req.calibration_due_at is not None:
            eq.calibration_due_at = req.calibration_due_at
        if req.notes is not None:
            eq.notes = req.notes

        db.commit()
        db.refresh(eq)

        audit = AuditLog(
            actor_user_id=actor_id,
            action="EQUIPMENT_STATUS_UPDATED",
            entity_type="Equipment",
            entity_id=eq.equipment_id,
            details={"old_state": old_state, "new_status": eq.equipment_status}
        )
        db.add(audit)
        db.commit()

        return eq

    @staticmethod
    def update_equipment(
        db: Session,
        equipment_id: int,
        req: EquipmentUpdate,
        actor_id: Optional[int] = None
    ) -> Equipment:
        """Updates equipment record fields."""
        eq = EquipmentService.get_equipment_by_id(db, equipment_id)

        if req.equipment_name is not None:
            eq.equipment_name = req.equipment_name
        if req.manufacturer is not None:
            eq.manufacturer = req.manufacturer
        if req.model_number is not None:
            eq.model_number = req.model_number
        if req.equipment_status is not None:
            eq.equipment_status = req.equipment_status
        if req.last_calibrated_at is not None:
            eq.last_calibrated_at = req.last_calibrated_at
        if req.calibration_due_at is not None:
            eq.calibration_due_at = req.calibration_due_at
        if req.notes is not None:
            eq.notes = req.notes

        db.commit()
        db.refresh(eq)
        return eq

    @staticmethod
    def delete_equipment(
        db: Session,
        equipment_id: int,
        actor_id: Optional[int] = None
    ) -> bool:
        """Deletes a laboratory equipment record."""
        eq = EquipmentService.get_equipment_by_id(db, equipment_id)
        # Delete any experiment reservations for this equipment
        from app.common.models import ExperimentEquipment
        db.query(ExperimentEquipment).filter(ExperimentEquipment.equipment_id == equipment_id).delete()

        db.delete(eq)
        db.commit()
        return True
