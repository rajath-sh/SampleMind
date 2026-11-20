"""
SampleMind Experiments Module - Service Layer
==============================================
Strict isolation: imports only from app.common and local experiments schemas.
Implements:
1. Research experiment lifecycle management (planned, active, completed).
2. Multi-sample cohort association and analytical instrument reservation.
3. Experimental result recording with measurement metrics.
4. Result verification and lock workflow.
"""

from __future__ import annotations
from typing import List, Tuple, Optional
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, func

from app.common import (
    Experiment,
    ExperimentSample,
    ExperimentEquipment,
    ExperimentResult,
    Sample,
    Equipment,
    AppUser,
    AuditLog,
    EntityNotFoundException,
    DuplicateEntityException,
    SampleMindException,
)
from .schemas import (
    ExperimentCreateRequest,
    ExperimentUpdateRequest,
    ExperimentSampleAttachRequest,
    ResultCreateRequest,
    ResultVerifyRequest,
    ExperimentListItem,
    ExperimentDetailResponse,
    ExperimentSampleItem,
    ExperimentEquipmentItem,
    ResultDetailResponse,
)

VALID_EXP_STATUSES = {'planned', 'active', 'completed', 'cancelled', 'on_hold'}


class ExperimentService:

    @classmethod
    def _build_detail_response(cls, exp: Experiment) -> ExperimentDetailResponse:
        """Helper to construct full experiment dossier DTO."""
        sample_items: List[ExperimentSampleItem] = []
        for es in exp.samples:
            s = es.sample
            sample_items.append(ExperimentSampleItem(
                sample_id=es.sample_id,
                sample_code=s.sample_code if s else "UNKNOWN",
                sample_name=s.sample_name if s else "Unknown Sample",
                sample_type_code=s.sample_type.type_code if s and s.sample_type else "UNKNOWN",
                usage_role=es.usage_role,
                quantity_used=float(es.quantity_used) if es.quantity_used is not None else None,
                quantity_unit=es.quantity_unit,
                added_at=es.added_at,
                notes=es.notes,
            ))

        equip_items: List[ExperimentEquipmentItem] = []
        for ee in exp.equipments:
            eq = ee.equipment
            equip_items.append(ExperimentEquipmentItem(
                experiment_equipment_id=ee.experiment_equipment_id,
                equipment_id=ee.equipment_id,
                equipment_code=eq.equipment_code if eq else "UNKNOWN",
                equipment_name=eq.equipment_name if eq else "Unknown Equipment",
                equipment_status=eq.equipment_status if eq else "unknown",
                usage_notes=ee.usage_notes,
            ))

        result_items: List[ResultDetailResponse] = []
        for r in exp.results:
            recorder_name = r.recorder.display_name if r.recorder else None
            result_items.append(ResultDetailResponse(
                experiment_result_id=r.experiment_result_id,
                experiment_id=r.experiment_id,
                experiment_code=exp.experiment_code,
                result_code=r.result_code,
                result_title=r.result_title,
                observation=r.observation,
                result_value=float(r.result_value) if r.result_value is not None else None,
                result_unit=r.result_unit,
                interpretation=r.interpretation,
                recorded_by=r.recorded_by,
                recorded_by_name=recorder_name,
                recorded_at=r.recorded_at,
                is_final=r.is_final,
            ))

        creator_name = exp.creator.display_name if exp.creator else None
        lead_name = exp.lead_researcher.display_name if exp.lead_researcher else None

        return ExperimentDetailResponse(
            experiment_id=exp.experiment_id,
            experiment_code=exp.experiment_code,
            experiment_name=exp.experiment_name,
            objective=exp.objective,
            protocol_reference=exp.protocol_reference,
            created_by=exp.created_by,
            created_by_name=creator_name,
            lead_researcher_id=exp.lead_researcher_id,
            lead_researcher_name=lead_name,
            status=exp.status,
            planned_start=exp.planned_start,
            planned_end=exp.planned_end,
            actual_start=exp.actual_start,
            actual_end=exp.actual_end,
            created_at=exp.created_at,
            samples=sample_items,
            equipment=equip_items,
            results=result_items,
        )

    @classmethod
    def list_experiments(
        cls,
        db: Session,
        status: Optional[str] = None,
        lead_researcher_id: Optional[int] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[ExperimentListItem], int]:
        """
        Retrieves a paginated catalog of research experiments with counts.
        """
        query = db.query(Experiment)

        if status:
            query = query.filter(Experiment.status == status.lower().strip())

        if lead_researcher_id is not None:
            query = query.filter(Experiment.lead_researcher_id == lead_researcher_id)

        if search:
            pattern = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    Experiment.experiment_code.ilike(pattern),
                    Experiment.experiment_name.ilike(pattern),
                    Experiment.objective.ilike(pattern),
                    Experiment.protocol_reference.ilike(pattern),
                )
            )

        total = query.count()
        offset = (page - 1) * page_size
        exps = query.order_by(desc(Experiment.created_at)).offset(offset).limit(page_size).all()

        items: List[ExperimentListItem] = []
        for e in exps:
            lead_name = e.lead_researcher.display_name if e.lead_researcher else None
            items.append(ExperimentListItem(
                experiment_id=e.experiment_id,
                experiment_code=e.experiment_code,
                experiment_name=e.experiment_name,
                protocol_reference=e.protocol_reference,
                status=e.status,
                lead_researcher_name=lead_name,
                sample_count=len(e.samples),
                equipment_count=len(e.equipments),
                result_count=len(e.results),
                planned_start=e.planned_start,
                planned_end=e.planned_end,
                created_at=e.created_at,
            ))

        return items, total

    @classmethod
    def get_experiment_by_id(cls, db: Session, experiment_id: int) -> ExperimentDetailResponse:
        """Retrieves full research project dossier."""
        exp = db.query(Experiment).filter(Experiment.experiment_id == experiment_id).first()
        if not exp:
            raise EntityNotFoundException("Experiment", experiment_id)
        return cls._build_detail_response(exp)

    @classmethod
    def create_experiment(
        cls,
        db: Session,
        req: ExperimentCreateRequest,
        actor_id: int
    ) -> ExperimentDetailResponse:
        """
        Creates a new research experiment, initializes sample cohorts,
        and assigns analytical equipment.
        """
        # Validate code uniqueness
        existing = db.query(Experiment).filter(Experiment.experiment_code == req.experiment_code).first()
        if existing:
            raise DuplicateEntityException("Experiment", "experiment_code", req.experiment_code)

        status_norm = req.status.lower().strip()
        if status_norm not in VALID_EXP_STATUSES:
            raise SampleMindException(
                status_code=400,
                detail=f"Invalid experiment status '{req.status}'. Must be one of: {', '.join(sorted(VALID_EXP_STATUSES))}.",
                code="INVALID_STATUS"
            )

        now = datetime.now(timezone.utc)
        exp = Experiment(
            experiment_code=req.experiment_code.strip(),
            experiment_name=req.experiment_name.strip(),
            objective=req.objective,
            protocol_reference=req.protocol_reference,
            created_by=actor_id,
            lead_researcher_id=req.lead_researcher_id or actor_id,
            planned_start=req.planned_start,
            planned_end=req.planned_end,
            status=status_norm,
            created_at=now,
        )
        db.add(exp)
        db.flush()

        # Link initial samples
        for s_input in req.samples:
            sample = db.query(Sample).filter(Sample.sample_id == s_input.sample_id).first()
            if sample:
                es = ExperimentSample(
                    experiment_id=exp.experiment_id,
                    sample_id=s_input.sample_id,
                    usage_role=s_input.usage_role,
                    quantity_used=s_input.quantity_used,
                    quantity_unit=s_input.quantity_unit,
                    added_at=now,
                    notes=s_input.notes,
                )
                db.add(es)

        # Link initial equipment
        for eq_id in req.equipment_ids:
            eq = db.query(Equipment).filter(Equipment.equipment_id == eq_id).first()
            if eq:
                ee = ExperimentEquipment(
                    experiment_id=exp.experiment_id,
                    equipment_id=eq_id,
                    usage_start=now,
                    usage_notes="Reserved during experiment initialization",
                )
                db.add(ee)

        # Audit log entry
        audit = AuditLog(
            action="CREATE_EXPERIMENT",
            entity_type="Experiment",
            entity_id=exp.experiment_id,
            actor_user_id=actor_id,
            details={
                "experiment_code": exp.experiment_code,
                "experiment_name": exp.experiment_name,
                "sample_count": len(req.samples),
                "equipment_count": len(req.equipment_ids),
            }
        )
        db.add(audit)
        db.commit()
        db.refresh(exp)

        return cls._build_detail_response(exp)

    @classmethod
    def update_experiment(
        cls,
        db: Session,
        experiment_id: int,
        req: ExperimentUpdateRequest,
        actor_id: int
    ) -> ExperimentDetailResponse:
        """Updates experiment protocol, timeline, or status."""
        exp = db.query(Experiment).filter(Experiment.experiment_id == experiment_id).first()
        if not exp:
            raise EntityNotFoundException("Experiment", experiment_id)

        if req.status is not None:
            status_norm = req.status.lower().strip()
            if status_norm not in VALID_EXP_STATUSES:
                raise SampleMindException(
                    status_code=400,
                    detail=f"Invalid status '{req.status}'.",
                    code="INVALID_STATUS"
                )
            exp.status = status_norm

        if req.experiment_name is not None:
            exp.experiment_name = req.experiment_name.strip()

        if req.objective is not None:
            exp.objective = req.objective

        if req.protocol_reference is not None:
            exp.protocol_reference = req.protocol_reference

        if req.lead_researcher_id is not None:
            exp.lead_researcher_id = req.lead_researcher_id

        if req.planned_start is not None:
            exp.planned_start = req.planned_start

        if req.planned_end is not None:
            exp.planned_end = req.planned_end

        if req.actual_start is not None:
            exp.actual_start = req.actual_start

        if req.actual_end is not None:
            exp.actual_end = req.actual_end

        # Audit log
        audit = AuditLog(
            action="UPDATE_EXPERIMENT",
            entity_type="Experiment",
            entity_id=exp.experiment_id,
            actor_user_id=actor_id,
            details={"status": exp.status}
        )
        db.add(audit)
        db.commit()
        db.refresh(exp)

        return cls._build_detail_response(exp)

    @classmethod
    def attach_sample(
        cls,
        db: Session,
        experiment_id: int,
        req: ExperimentSampleAttachRequest,
        actor_id: int
    ) -> bool:
        """Attaches a specimen to an experiment cohort."""
        exp = db.query(Experiment).filter(Experiment.experiment_id == experiment_id).first()
        if not exp:
            raise EntityNotFoundException("Experiment", experiment_id)

        sample = db.query(Sample).filter(Sample.sample_id == req.sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", req.sample_id)

        now = datetime.now(timezone.utc)
        es = ExperimentSample(
            experiment_id=experiment_id,
            sample_id=req.sample_id,
            usage_role=req.usage_role,
            quantity_used=req.quantity_used,
            quantity_unit=req.quantity_unit,
            added_at=now,
            notes=req.notes,
        )
        db.merge(es)
        db.commit()
        return True

    @classmethod
    def create_result(
        cls,
        db: Session,
        experiment_id: int,
        req: ResultCreateRequest,
        actor_id: int
    ) -> ResultDetailResponse:
        """Records a scientific result generated by an experiment."""
        exp = db.query(Experiment).filter(Experiment.experiment_id == experiment_id).first()
        if not exp:
            raise EntityNotFoundException("Experiment", experiment_id)

        existing = db.query(ExperimentResult).filter(ExperimentResult.result_code == req.result_code).first()
        if existing:
            raise DuplicateEntityException("ExperimentResult", "result_code", req.result_code)

        now = datetime.now(timezone.utc)
        res = ExperimentResult(
            experiment_id=experiment_id,
            result_code=req.result_code.strip(),
            result_title=req.result_title.strip(),
            observation=req.observation,
            result_value=req.result_value,
            result_unit=req.result_unit,
            interpretation=req.interpretation,
            recorded_by=actor_id,
            recorded_at=now,
            is_final=req.is_final,
        )
        db.add(res)
        db.flush()

        audit = AuditLog(
            action="CREATE_EXPERIMENT_RESULT",
            entity_type="ExperimentResult",
            entity_id=res.experiment_result_id,
            actor_user_id=actor_id,
            details={
                "experiment_id": experiment_id,
                "result_code": res.result_code,
                "is_final": res.is_final,
            }
        )
        db.add(audit)
        db.commit()
        db.refresh(res)

        recorder = db.query(AppUser).filter(AppUser.user_id == actor_id).first()
        recorder_name = recorder.display_name if recorder else None

        return ResultDetailResponse(
            experiment_result_id=res.experiment_result_id,
            experiment_id=res.experiment_id,
            experiment_code=exp.experiment_code,
            result_code=res.result_code,
            result_title=res.result_title,
            observation=res.observation,
            result_value=float(res.result_value) if res.result_value is not None else None,
            result_unit=res.result_unit,
            interpretation=res.interpretation,
            recorded_by=res.recorded_by,
            recorded_by_name=recorder_name,
            recorded_at=res.recorded_at,
            is_final=res.is_final,
        )

    @classmethod
    def list_results(
        cls,
        db: Session,
        sample_id: Optional[int] = None,
        experiment_id: Optional[int] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[ResultDetailResponse], int]:
        """Lists experimental results across experiments."""
        query = db.query(ExperimentResult).join(Experiment, ExperimentResult.experiment_id == Experiment.experiment_id)

        if experiment_id is not None:
            query = query.filter(ExperimentResult.experiment_id == experiment_id)

        if sample_id is not None:
            query = query.join(ExperimentSample, Experiment.experiment_id == ExperimentSample.experiment_id)\
                         .filter(ExperimentSample.sample_id == sample_id)

        total = query.count()
        offset = (page - 1) * page_size
        results = query.order_by(desc(ExperimentResult.recorded_at)).offset(offset).limit(page_size).all()

        items: List[ResultDetailResponse] = []
        for r in results:
            recorder_name = r.recorder.display_name if r.recorder else None
            items.append(ResultDetailResponse(
                experiment_result_id=r.experiment_result_id,
                experiment_id=r.experiment_id,
                experiment_code=r.experiment.experiment_code,
                result_code=r.result_code,
                result_title=r.result_title,
                observation=r.observation,
                result_value=float(r.result_value) if r.result_value is not None else None,
                result_unit=r.result_unit,
                interpretation=r.interpretation,
                recorded_by=r.recorded_by,
                recorded_by_name=recorder_name,
                recorded_at=r.recorded_at,
                is_final=r.is_final,
            ))

        return items, total

    @classmethod
    def verify_result(
        cls,
        db: Session,
        result_id: int,
        req: ResultVerifyRequest,
        actor_id: int
    ) -> ResultDetailResponse:
        """Formally verifies and finalizes an experimental result."""
        res = db.query(ExperimentResult).filter(ExperimentResult.experiment_result_id == result_id).first()
        if not res:
            raise EntityNotFoundException("ExperimentResult", result_id)

        res.is_final = req.is_final
        if req.verification_notes:
            existing_obs = res.observation or ""
            res.observation = f"{existing_obs}\n[VERIFICATION NOTE]: {req.verification_notes}".strip()

        audit = AuditLog(
            action="VERIFY_EXPERIMENT_RESULT",
            entity_type="ExperimentResult",
            entity_id=res.experiment_result_id,
            actor_user_id=actor_id,
            details={"is_final": res.is_final}
        )
        db.add(audit)
        db.commit()
        db.refresh(res)

        recorder_name = res.recorder.display_name if res.recorder else None
        return ResultDetailResponse(
            experiment_result_id=res.experiment_result_id,
            experiment_id=res.experiment_id,
            experiment_code=res.experiment.experiment_code,
            result_code=res.result_code,
            result_title=res.result_title,
            observation=res.observation,
            result_value=float(res.result_value) if res.result_value is not None else None,
            result_unit=res.result_unit,
            interpretation=res.interpretation,
            recorded_by=res.recorded_by,
            recorded_by_name=recorder_name,
            recorded_at=res.recorded_at,
            is_final=res.is_final,
        )
