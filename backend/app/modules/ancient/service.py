"""
Service Layer for Module 7: Ancient Specimens & Archaeological Provenance
Implements domain operations, validations, transaction safety, and audit trail.
Imports strictly from app.common.
"""
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.common import (
    ArchaeologicalSite,
    AncientSpecimen,
    Sample,
    SampleType,
    StorageLocation,
    AuditLog,
    EntityNotFoundException,
    DuplicateEntityException,
)
from .schemas import (
    SiteCreateRequest,
    SiteUpdateRequest,
    SiteDetailResponse,
    AncientSpecimenCreate,
    AncientSpecimenUpdate,
    AncientSpecimenListItem,
    AncientSpecimenDetail,
)


class AncientService:
    # -------------------------------------------------------------------------
    # Archaeological Excavation Sites
    # -------------------------------------------------------------------------
    @staticmethod
    def create_site(db: Session, data: SiteCreateRequest, actor_id: Optional[int] = None) -> SiteDetailResponse:
        """Registers a new archaeological excavation site."""
        existing = db.query(ArchaeologicalSite).filter(
            func.lower(ArchaeologicalSite.site_code) == data.site_code.strip().lower()
        ).first()
        if existing:
            raise DuplicateEntityException("ArchaeologicalSite", "site_code", data.site_code)

        site = ArchaeologicalSite(
            site_code=data.site_code.strip().upper(),
            site_name=data.site_name.strip(),
            region=data.region.strip() if data.region else None,
            country=data.country.strip() if data.country else None,
            context_notes=data.context_notes.strip() if data.context_notes else None,
        )
        db.add(site)
        db.flush()

        # Audit log
        db.add(AuditLog(
            actor_user_id=actor_id,
            action="CREATE",
            entity_type="ArchaeologicalSite",
            entity_id=site.archaeological_site_id,
            details={"site_code": site.site_code, "site_name": site.site_name},
        ))
        db.commit()
        db.refresh(site)

        return SiteDetailResponse(
            archaeological_site_id=site.archaeological_site_id,
            site_code=site.site_code,
            site_name=site.site_name,
            region=site.region,
            country=site.country,
            context_notes=site.context_notes,
            specimen_count=0,
            created_at=site.created_at,
        )

    @staticmethod
    def get_site(db: Session, site_id: int) -> SiteDetailResponse:
        """Retrieves site detail by ID including linked specimen count."""
        site = db.query(ArchaeologicalSite).filter(
            ArchaeologicalSite.archaeological_site_id == site_id
        ).first()
        if not site:
            raise EntityNotFoundException("ArchaeologicalSite", site_id)

        specimen_count = db.query(func.count(AncientSpecimen.sample_id)).filter(
            AncientSpecimen.archaeological_site_id == site_id
        ).scalar() or 0

        return SiteDetailResponse(
            archaeological_site_id=site.archaeological_site_id,
            site_code=site.site_code,
            site_name=site.site_name,
            region=site.region,
            country=site.country,
            context_notes=site.context_notes,
            specimen_count=specimen_count,
            created_at=site.created_at,
        )

    @staticmethod
    def list_sites(
        db: Session,
        country: Optional[str] = None,
        search: Optional[str] = None
    ) -> List[SiteDetailResponse]:
        """Lists archaeological excavation sites with specimen counts."""
        query = db.query(
            ArchaeologicalSite,
            func.count(AncientSpecimen.sample_id).label("specimen_count")
        ).outerjoin(
            AncientSpecimen,
            AncientSpecimen.archaeological_site_id == ArchaeologicalSite.archaeological_site_id
        )

        if country:
            query = query.filter(func.lower(ArchaeologicalSite.country) == country.strip().lower())

        if search:
            term = f"%{search.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(ArchaeologicalSite.site_code).like(term),
                    func.lower(ArchaeologicalSite.site_name).like(term),
                    func.lower(ArchaeologicalSite.region).like(term),
                )
            )

        query = query.group_by(ArchaeologicalSite.archaeological_site_id)
        query = query.order_by(ArchaeologicalSite.site_name.asc())

        results = query.all()
        output: List[SiteDetailResponse] = []
        for site, count in results:
            output.append(SiteDetailResponse(
                archaeological_site_id=site.archaeological_site_id,
                site_code=site.site_code,
                site_name=site.site_name,
                region=site.region,
                country=site.country,
                context_notes=site.context_notes,
                specimen_count=count,
                created_at=site.created_at,
            ))
        return output

    @staticmethod
    def update_site(
        db: Session,
        site_id: int,
        data: SiteUpdateRequest,
        actor_id: Optional[int] = None
    ) -> SiteDetailResponse:
        """Updates site geographic and contextual notes."""
        site = db.query(ArchaeologicalSite).filter(
            ArchaeologicalSite.archaeological_site_id == site_id
        ).first()
        if not site:
            raise EntityNotFoundException("ArchaeologicalSite", site_id)

        if data.site_name is not None:
            site.site_name = data.site_name.strip()
        if data.region is not None:
            site.region = data.region.strip() if data.region else None
        if data.country is not None:
            site.country = data.country.strip() if data.country else None
        if data.context_notes is not None:
            site.context_notes = data.context_notes.strip() if data.context_notes else None

        db.add(AuditLog(
            actor_user_id=actor_id,
            action="UPDATE",
            entity_type="ArchaeologicalSite",
            entity_id=site.archaeological_site_id,
            details={"site_code": site.site_code},
        ))
        db.commit()
        db.refresh(site)

        return AncientService.get_site(db, site_id)

    @staticmethod
    def delete_site(
        db: Session,
        site_id: int,
        actor_id: Optional[int] = None
    ) -> bool:
        """Deletes an archaeological site and unlinks associated specimens."""
        site = db.query(ArchaeologicalSite).filter(
            ArchaeologicalSite.archaeological_site_id == site_id
        ).first()
        if not site:
            raise EntityNotFoundException("ArchaeologicalSite", site_id)

        # Unlink any ancient specimens pointing to this site
        db.query(AncientSpecimen).filter(
            AncientSpecimen.archaeological_site_id == site_id
        ).update({"archaeological_site_id": None})

        db.delete(site)
        db.commit()
        return True

    # -------------------------------------------------------------------------
    # Ancient Specimen Provenance Extensions
    # -------------------------------------------------------------------------
    @staticmethod
    def create_ancient_specimen(
        db: Session,
        data: AncientSpecimenCreate,
        actor_id: Optional[int] = None
    ) -> AncientSpecimenDetail:
        """Attaches an ancient archaeological provenance record to a base sample."""
        # 1. Verify Sample exists
        sample = db.query(Sample).filter(Sample.sample_id == data.sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", data.sample_id)

        # 2. Verify no existing AncientSpecimen record (1-to-1 extension)
        existing = db.query(AncientSpecimen).filter(AncientSpecimen.sample_id == data.sample_id).first()
        if existing:
            raise DuplicateEntityException("AncientSpecimen", "sample_id", data.sample_id)

        # 3. Verify ArchaeologicalSite if provided
        if data.archaeological_site_id is not None:
            site = db.query(ArchaeologicalSite).filter(
                ArchaeologicalSite.archaeological_site_id == data.archaeological_site_id
            ).first()
            if not site:
                raise EntityNotFoundException("ArchaeologicalSite", data.archaeological_site_id)

        specimen = AncientSpecimen(
            sample_id=data.sample_id,
            archaeological_site_id=data.archaeological_site_id,
            estimated_age_years=data.estimated_age_years,
            age_uncertainty_years=data.age_uncertainty_years,
            dating_method=data.dating_method.strip() if data.dating_method else None,
            excavation_layer=data.excavation_layer.strip() if data.excavation_layer else None,
            depth_cm=data.depth_cm,
            preservation_state=data.preservation_state.strip() if data.preservation_state else None,
            context_reference=data.context_reference.strip() if data.context_reference else None,
        )
        db.add(specimen)
        db.flush()

        db.add(AuditLog(
            actor_user_id=actor_id,
            action="CREATE",
            entity_type="AncientSpecimen",
            entity_id=data.sample_id,
            details={
                "sample_code": sample.sample_code,
                "site_id": data.archaeological_site_id,
                "estimated_age_years": data.estimated_age_years,
            },
        ))
        db.commit()

        return AncientService.get_ancient_specimen(db, data.sample_id)

    @staticmethod
    def get_ancient_specimen(db: Session, sample_id: int) -> AncientSpecimenDetail:
        """Retrieves full ancient specimen dossier."""
        result = db.query(
            AncientSpecimen,
            Sample,
            SampleType,
            StorageLocation,
            ArchaeologicalSite
        ).join(
            Sample, Sample.sample_id == AncientSpecimen.sample_id
        ).join(
            SampleType, SampleType.sample_type_id == Sample.sample_type_id
        ).outerjoin(
            StorageLocation, StorageLocation.storage_location_id == Sample.current_storage_location_id
        ).outerjoin(
            ArchaeologicalSite, ArchaeologicalSite.archaeological_site_id == AncientSpecimen.archaeological_site_id
        ).filter(
            AncientSpecimen.sample_id == sample_id
        ).first()

        if not result:
            raise EntityNotFoundException("AncientSpecimen", sample_id)

        specimen, sample, s_type, loc, site = result

        return AncientSpecimenDetail(
            sample_id=sample.sample_id,
            sample_code=sample.sample_code,
            sample_name=sample.sample_name,
            sample_type_code=s_type.type_code,
            sample_type_name=s_type.type_name,
            storage_location_code=loc.location_code if loc else None,
            status=sample.sample_status,
            source_description=sample.source_description,
            archaeological_site_id=specimen.archaeological_site_id,
            site_code=site.site_code if site else None,
            site_name=site.site_name if site else None,
            region=site.region if site else None,
            country=site.country if site else None,
            estimated_age_years=specimen.estimated_age_years,
            age_uncertainty_years=specimen.age_uncertainty_years,
            dating_method=specimen.dating_method,
            excavation_layer=specimen.excavation_layer,
            depth_cm=float(specimen.depth_cm) if specimen.depth_cm is not None else None,
            preservation_state=specimen.preservation_state,
            context_reference=specimen.context_reference,
        )

    @staticmethod
    def update_ancient_specimen(
        db: Session,
        sample_id: int,
        data: AncientSpecimenUpdate,
        actor_id: Optional[int] = None
    ) -> AncientSpecimenDetail:
        """Updates provenance, dating, or stratigraphic attributes."""
        specimen = db.query(AncientSpecimen).filter(AncientSpecimen.sample_id == sample_id).first()
        if not specimen:
            raise EntityNotFoundException("AncientSpecimen", sample_id)

        if data.archaeological_site_id is not None:
            site = db.query(ArchaeologicalSite).filter(
                ArchaeologicalSite.archaeological_site_id == data.archaeological_site_id
            ).first()
            if not site:
                raise EntityNotFoundException("ArchaeologicalSite", data.archaeological_site_id)
            specimen.archaeological_site_id = data.archaeological_site_id

        if data.estimated_age_years is not None:
            specimen.estimated_age_years = data.estimated_age_years
        if data.age_uncertainty_years is not None:
            specimen.age_uncertainty_years = data.age_uncertainty_years
        if data.dating_method is not None:
            specimen.dating_method = data.dating_method.strip() if data.dating_method else None
        if data.excavation_layer is not None:
            specimen.excavation_layer = data.excavation_layer.strip() if data.excavation_layer else None
        if data.depth_cm is not None:
            specimen.depth_cm = data.depth_cm
        if data.preservation_state is not None:
            specimen.preservation_state = data.preservation_state.strip() if data.preservation_state else None
        if data.context_reference is not None:
            specimen.context_reference = data.context_reference.strip() if data.context_reference else None

        db.add(AuditLog(
            actor_user_id=actor_id,
            action="UPDATE",
            entity_type="AncientSpecimen",
            entity_id=sample_id,
            details={"estimated_age_years": specimen.estimated_age_years},
        ))
        db.commit()

        return AncientService.get_ancient_specimen(db, sample_id)

    @staticmethod
    def delete_ancient_specimen(
        db: Session,
        sample_id: int,
        actor_id: Optional[int] = None
    ) -> bool:
        """Deletes the ancient provenance record for a specimen."""
        specimen = db.query(AncientSpecimen).filter(
            AncientSpecimen.sample_id == sample_id
        ).first()
        if not specimen:
            raise EntityNotFoundException("AncientSpecimen", sample_id)

        db.delete(specimen)
        db.commit()
        return True

    @staticmethod
    def list_ancient_specimens(
        db: Session,
        site_id: Optional[int] = None,
        dating_method: Optional[str] = None,
        min_age: Optional[int] = None,
        max_age: Optional[int] = None,
        search: Optional[str] = None
    ) -> List[AncientSpecimenListItem]:
        """Lists ancient archaeological specimens with filters."""
        query = db.query(
            AncientSpecimen,
            Sample,
            SampleType,
            ArchaeologicalSite
        ).join(
            Sample, Sample.sample_id == AncientSpecimen.sample_id
        ).join(
            SampleType, SampleType.sample_type_id == Sample.sample_type_id
        ).outerjoin(
            ArchaeologicalSite, ArchaeologicalSite.archaeological_site_id == AncientSpecimen.archaeological_site_id
        )

        if site_id:
            query = query.filter(AncientSpecimen.archaeological_site_id == site_id)

        if dating_method:
            query = query.filter(
                func.lower(AncientSpecimen.dating_method).like(f"%{dating_method.strip().lower()}%")
            )

        if min_age is not None:
            query = query.filter(AncientSpecimen.estimated_age_years >= min_age)

        if max_age is not None:
            query = query.filter(AncientSpecimen.estimated_age_years <= max_age)

        if search:
            term = f"%{search.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(Sample.sample_code).like(term),
                    func.lower(Sample.sample_name).like(term),
                    func.lower(ArchaeologicalSite.site_name).like(term),
                    func.lower(AncientSpecimen.excavation_layer).like(term),
                )
            )

        query = query.order_by(AncientSpecimen.estimated_age_years.desc().nullslast())

        rows = query.all()
        output: List[AncientSpecimenListItem] = []
        for specimen, sample, s_type, site in rows:
            output.append(AncientSpecimenListItem(
                sample_id=sample.sample_id,
                sample_code=sample.sample_code,
                sample_name=sample.sample_name,
                sample_type_code=s_type.type_code,
                status=sample.sample_status,
                archaeological_site_id=specimen.archaeological_site_id,
                site_code=site.site_code if site else None,
                site_name=site.site_name if site else None,
                country=site.country if site else None,
                estimated_age_years=specimen.estimated_age_years,
                age_uncertainty_years=specimen.age_uncertainty_years,
                dating_method=specimen.dating_method,
                preservation_state=specimen.preservation_state,
                excavation_layer=specimen.excavation_layer,
            ))
        return output
