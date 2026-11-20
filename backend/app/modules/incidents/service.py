"""
Service Layer for Module 8: Laboratory Incidents & Downstream Blast Radius Tracing
Implements incident logging, critical status propagation, and recursive blast radius calculations.
Imports strictly from app.common.
"""
from datetime import datetime, timezone
from typing import Optional, List, Tuple, Set, Dict
from sqlalchemy.orm import Session
from sqlalchemy import func, or_

from app.common import (
    Incident,
    Sample,
    SampleRelationship,
    StorageLocation,
    AppUser,
    Experiment,
    ExperimentSample,
    ExperimentResult,
    AuditLog,
    EntityNotFoundException,
    DuplicateEntityException,
)
from .schemas import (
    IncidentCreateRequest,
    IncidentUpdateRequest,
    IncidentListItem,
    IncidentDetailResponse,
    BlastRadiusSampleItem,
    BlastRadiusExperimentItem,
    BlastRadiusResultItem,
    IncidentBlastRadiusResponse,
)


class IncidentService:
    @staticmethod
    def create_incident(
        db: Session,
        data: IncidentCreateRequest,
        reporter_id: int
    ) -> IncidentDetailResponse:
        """Records a new laboratory incident and automatically handles critical status propagation."""
        # 1. Check duplicate incident code
        existing = db.query(Incident).filter(
            func.lower(Incident.incident_code) == data.incident_code.strip().lower()
        ).first()
        if existing:
            raise DuplicateEntityException("Incident", "incident_code", data.incident_code)

        # 2. Validate sample if provided
        sample = None
        if data.sample_id is not None:
            sample = db.query(Sample).filter(Sample.sample_id == data.sample_id).first()
            if not sample:
                raise EntityNotFoundException("Sample", data.sample_id)

        # 3. Validate storage location if provided
        if data.storage_location_id is not None:
            loc = db.query(StorageLocation).filter(
                StorageLocation.storage_location_id == data.storage_location_id
            ).first()
            if not loc:
                raise EntityNotFoundException("StorageLocation", data.storage_location_id)

        # 4. Create Incident entity
        incident = Incident(
            incident_code=data.incident_code.strip().upper(),
            sample_id=data.sample_id,
            storage_location_id=data.storage_location_id,
            incident_type=data.incident_type.strip().lower(),
            severity=data.severity.strip().lower(),
            description=data.description.strip(),
            occurred_at=data.occurred_at,
            reported_at=datetime.now(timezone.utc),
            reported_by=reporter_id,
            assigned_to=data.assigned_to,
            status="open",
        )
        db.add(incident)
        db.flush()

        # 5. Automated Critical Sample Status Propagation
        normalized_severity = data.severity.strip().lower()
        if sample and normalized_severity in ("high", "critical"):
            if sample.sample_status not in ("QUARANTINED", "DISPOSED"):
                old_status = sample.sample_status
                sample.sample_status = "QUARANTINED"
                sample.updated_at = datetime.now(timezone.utc)
                db.add(AuditLog(
                    actor_user_id=reporter_id,
                    action="AUTOMATED_QUARANTINE",
                    entity_type="Sample",
                    entity_id=sample.sample_id,
                    details={
                        "incident_code": incident.incident_code,
                        "severity": normalized_severity,
                        "previous_status": old_status,
                        "reason": f"Automated quarantine triggered by incident {incident.incident_code}",
                    },
                ))

            # Cascade quarantine to downstream specimens if requested
            if data.quarantine_descendants:
                descendants = IncidentService._get_all_descendant_sample_ids(db, sample.sample_id)
                if descendants:
                    child_samples = db.query(Sample).filter(Sample.sample_id.in_(descendants)).all()
                    for child in child_samples:
                        if child.sample_status not in ("QUARANTINED", "DISPOSED"):
                            child_old = child.sample_status
                            child.sample_status = "QUARANTINED"
                            child.updated_at = datetime.now(timezone.utc)
                            db.add(AuditLog(
                                actor_user_id=reporter_id,
                                action="CASCADED_QUARANTINE",
                                entity_type="Sample",
                                entity_id=child.sample_id,
                                details={
                                    "incident_code": incident.incident_code,
                                    "parent_sample_id": sample.sample_id,
                                    "previous_status": child_old,
                                    "reason": "Cascading quarantine propagated from upstream ancestor incident",
                                },
                            ))

        # 6. Audit log for Incident creation
        db.add(AuditLog(
            actor_user_id=reporter_id,
            action="CREATE",
            entity_type="Incident",
            entity_id=incident.incident_id,
            details={
                "incident_code": incident.incident_code,
                "severity": incident.severity,
                "sample_id": incident.sample_id,
            },
        ))
        db.commit()
        db.refresh(incident)

        return IncidentService.get_incident_detail(db, incident.incident_id)

    @staticmethod
    def get_incident_detail(db: Session, incident_id: int) -> IncidentDetailResponse:
        """Retrieves detailed incident dossier with joined sample, location, and personnel."""
        incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not incident:
            raise EntityNotFoundException("Incident", incident_id)

        sample = db.query(Sample).filter(Sample.sample_id == incident.sample_id).first() if incident.sample_id else None
        loc = db.query(StorageLocation).filter(StorageLocation.storage_location_id == incident.storage_location_id).first() if incident.storage_location_id else None
        reporter = db.query(AppUser).filter(AppUser.user_id == incident.reported_by).first() if incident.reported_by else None
        assignee = db.query(AppUser).filter(AppUser.user_id == incident.assigned_to).first() if incident.assigned_to else None

        return IncidentDetailResponse(
            incident_id=incident.incident_id,
            incident_code=incident.incident_code,
            incident_type=incident.incident_type,
            severity=incident.severity,
            status=incident.status,
            description=incident.description,
            occurred_at=incident.occurred_at,
            reported_at=incident.reported_at,
            reported_by=incident.reported_by,
            reported_by_name=reporter.display_name if reporter else None,
            assigned_to=incident.assigned_to,
            assigned_to_name=assignee.display_name if assignee else None,
            sample_id=sample.sample_id if sample else None,
            sample_code=sample.sample_code if sample else None,
            sample_name=sample.sample_name if sample else None,
            sample_status=sample.sample_status if sample else None,
            storage_location_id=loc.storage_location_id if loc else None,
            storage_location_code=loc.location_code if loc else None,
            resolution_notes=incident.resolution_notes,
            closed_at=incident.closed_at,
        )

    @staticmethod
    def list_incidents(
        db: Session,
        severity: Optional[str] = None,
        status: Optional[str] = None,
        sample_id: Optional[int] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[IncidentListItem], int]:
        """Lists laboratory incidents with multi-facet filters and pagination."""
        query = db.query(
            Incident,
            Sample,
            StorageLocation,
            AppUser
        ).outerjoin(
            Sample, Sample.sample_id == Incident.sample_id
        ).outerjoin(
            StorageLocation, StorageLocation.storage_location_id == Incident.storage_location_id
        ).outerjoin(
            AppUser, AppUser.user_id == Incident.reported_by
        )

        if severity:
            query = query.filter(func.lower(Incident.severity) == severity.strip().lower())
        if status:
            query = query.filter(func.lower(Incident.status) == status.strip().lower())
        if sample_id:
            query = query.filter(Incident.sample_id == sample_id)
        if search:
            term = f"%{search.strip().lower()}%"
            query = query.filter(
                or_(
                    func.lower(Incident.incident_code).like(term),
                    func.lower(Incident.description).like(term),
                    func.lower(Sample.sample_code).like(term),
                )
            )

        total = query.count()
        offset = (page - 1) * page_size
        results = query.order_by(Incident.occurred_at.desc()).offset(offset).limit(page_size).all()

        items: List[IncidentListItem] = []
        for inc, s, loc, rep in results:
            assignee = db.query(AppUser).filter(AppUser.user_id == inc.assigned_to).first() if inc.assigned_to else None
            items.append(IncidentListItem(
                incident_id=inc.incident_id,
                incident_code=inc.incident_code,
                incident_type=inc.incident_type,
                severity=inc.severity,
                status=inc.status,
                description=inc.description,
                sample_id=s.sample_id if s else None,
                sample_code=s.sample_code if s else None,
                sample_name=s.sample_name if s else None,
                storage_location_id=loc.storage_location_id if loc else None,
                storage_location_code=loc.location_code if loc else None,
                occurred_at=inc.occurred_at,
                reported_at=inc.reported_at,
                reported_by_name=rep.display_name if rep else None,
                assigned_to_name=assignee.display_name if assignee else None,
            ))

        return items, total

    @staticmethod
    def update_incident(
        db: Session,
        incident_id: int,
        data: IncidentUpdateRequest,
        actor_id: Optional[int] = None
    ) -> IncidentDetailResponse:
        """Updates incident status, severity, investigator, or resolution notes."""
        incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not incident:
            raise EntityNotFoundException("Incident", incident_id)

        if data.status is not None:
            incident.status = data.status.strip().lower()
            if incident.status in ("closed", "mitigated") and not incident.closed_at:
                incident.closed_at = datetime.now(timezone.utc)
        if data.severity is not None:
            incident.severity = data.severity.strip().lower()
        if data.assigned_to is not None:
            incident.assigned_to = data.assigned_to
        if data.resolution_notes is not None:
            incident.resolution_notes = data.resolution_notes.strip()
        if data.closed_at is not None:
            incident.closed_at = data.closed_at

        db.add(AuditLog(
            actor_user_id=actor_id,
            action="UPDATE",
            entity_type="Incident",
            entity_id=incident.incident_id,
            details={"status": incident.status, "severity": incident.severity},
        ))
        db.commit()
        db.refresh(incident)

        return IncidentService.get_incident_detail(db, incident_id)

    # -------------------------------------------------------------------------
    # Signature Blast Radius Tracing Query
    # -------------------------------------------------------------------------
    @staticmethod
    def get_downstream_blast_radius(db: Session, incident_id: int) -> IncidentBlastRadiusResponse:
        """
        Traverses the lineage DAG recursively to determine the full blast radius:
        1. All derived child/descendant biological samples.
        2. All experiments that utilized the contaminated sample or any descendant.
        3. All experimental results recorded by those compromised experiments.
        """
        incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not incident:
            raise EntityNotFoundException("Incident", incident_id)

        if incident.sample_id is None:
            return IncidentBlastRadiusResponse(
                incident_id=incident.incident_id,
                incident_code=incident.incident_code,
                root_sample_id=None,
                root_sample_code=None,
                severity=incident.severity,
                downstream_samples=[],
                affected_experiments=[],
                affected_results=[],
                total_samples_at_risk=0,
                total_experiments_compromised=0,
                total_results_tainted=0,
                max_generation_depth=0,
            )

        root_sample = db.query(Sample).filter(Sample.sample_id == incident.sample_id).first()
        root_sample_code = root_sample.sample_code if root_sample else None

        # 1. Breadth-First Recursive DAG Traversal for Downstream Samples
        queue: List[Tuple[int, int]] = [(incident.sample_id, 0)]  # (sample_id, depth)
        visited: Set[int] = {incident.sample_id}
        downstream_map: Dict[int, Tuple[int, str]] = {}  # child_id -> (distance, transformation_type)

        while queue:
            curr_id, curr_depth = queue.pop(0)
            rels = db.query(SampleRelationship).filter(
                SampleRelationship.parent_sample_id == curr_id
            ).all()

            for rel in rels:
                if rel.child_sample_id not in visited:
                    visited.add(rel.child_sample_id)
                    downstream_map[rel.child_sample_id] = (curr_depth + 1, rel.transformation_type)
                    queue.append((rel.child_sample_id, curr_depth + 1))

        # Assemble Downstream Sample Items
        downstream_samples: List[BlastRadiusSampleItem] = []
        if downstream_map:
            children = db.query(
                Sample, StorageLocation
            ).outerjoin(
                StorageLocation, StorageLocation.storage_location_id == Sample.current_storage_location_id
            ).filter(
                Sample.sample_id.in_(list(downstream_map.keys()))
            ).all()

            for child, loc in children:
                dist, trans = downstream_map[child.sample_id]
                downstream_samples.append(BlastRadiusSampleItem(
                    sample_id=child.sample_id,
                    sample_code=child.sample_code,
                    sample_name=child.sample_name,
                    generation_distance=dist,
                    transformation_type=trans,
                    current_status=child.sample_status,
                    storage_location_code=loc.location_code if loc else None,
                ))

        # Sort by generation distance
        downstream_samples.sort(key=lambda s: (s.generation_distance, s.sample_code))

        # 2. Identify Compromised Experiments across the entire blast cohort (root + children)
        all_compromised_sample_ids = list(visited)
        sample_code_lookup = {s.sample_id: s.sample_code for s in db.query(Sample).filter(Sample.sample_id.in_(all_compromised_sample_ids)).all()}

        exp_samples = db.query(
            ExperimentSample, Experiment
        ).join(
            Experiment, Experiment.experiment_id == ExperimentSample.experiment_id
        ).filter(
            ExperimentSample.sample_id.in_(all_compromised_sample_ids)
        ).all()

        affected_experiments: List[BlastRadiusExperimentItem] = []
        compromised_experiment_ids: Set[int] = set()

        for es, exp in exp_samples:
            compromised_experiment_ids.add(exp.experiment_id)
            affected_experiments.append(BlastRadiusExperimentItem(
                experiment_id=exp.experiment_id,
                experiment_code=exp.experiment_code,
                experiment_name=exp.experiment_name,
                status=exp.status,
                usage_role=es.usage_role,
                associated_sample_code=sample_code_lookup.get(es.sample_id, f"S{es.sample_id}"),
            ))

        # 3. Identify Tainted Experimental Results
        affected_results: List[BlastRadiusResultItem] = []
        if compromised_experiment_ids:
            results = db.query(
                ExperimentResult, Experiment
            ).join(
                Experiment, Experiment.experiment_id == ExperimentResult.experiment_id
            ).filter(
                ExperimentResult.experiment_id.in_(list(compromised_experiment_ids))
            ).all()

            for r, exp in results:
                affected_results.append(BlastRadiusResultItem(
                    experiment_result_id=r.experiment_result_id,
                    result_code=r.result_code,
                    result_title=r.result_title,
                    experiment_code=exp.experiment_code,
                    observation=r.observation,
                    result_value=float(r.result_value) if r.result_value is not None else None,
                    result_unit=r.result_unit,
                    interpretation=r.interpretation,
                    is_final=r.is_final,
                ))

        max_depth = max((item.generation_distance for item in downstream_samples), default=0)

        return IncidentBlastRadiusResponse(
            incident_id=incident.incident_id,
            incident_code=incident.incident_code,
            root_sample_id=incident.sample_id,
            root_sample_code=root_sample_code,
            severity=incident.severity,
            downstream_samples=downstream_samples,
            affected_experiments=affected_experiments,
            affected_results=affected_results,
            total_samples_at_risk=len(downstream_samples),
            total_experiments_compromised=len(affected_experiments),
            total_results_tainted=len(affected_results),
            max_generation_depth=max_depth,
        )

    @staticmethod
    def _get_all_descendant_sample_ids(db: Session, sample_id: int) -> List[int]:
        """Helper to collect all descendant sample IDs via BFS."""
        visited: Set[int] = set()
        queue: List[int] = [sample_id]
        while queue:
            curr = queue.pop(0)
            child_ids = [r[0] for r in db.query(SampleRelationship.child_sample_id).filter(
                SampleRelationship.parent_sample_id == curr
            ).all()]
            for cid in child_ids:
                if cid not in visited:
                    visited.add(cid)
                    queue.append(cid)
        return list(visited)
