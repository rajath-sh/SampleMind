from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.common import (
    AIAnalysis,
    ModelRegistry,
    Sample,
    Incident,
    SampleTest,
    AppUser,
    AuditLog,
    EntityNotFoundException,
)
from .schemas import (
    ModelRegistryInfo,
    ContributingFactor,
    AIAnalysisResponse,
    AIReviewRequest,
    RiskDistributionResponse,
)


class AIAnalysisService:
    DEFAULT_MODEL_NAME = "Specimen Handling Rules"
    DEFAULT_MODEL_VERSION = "handling-rules-v1"
    DEFAULT_FEATURE_SCHEMA_VERSION = "evidence-v1"

    @classmethod
    def ensure_active_model(cls, db: Session) -> ModelRegistry:
        model = db.query(ModelRegistry).filter_by(model_version=cls.DEFAULT_MODEL_VERSION).first()
        if model is None:
            model = ModelRegistry(
                model_name=cls.DEFAULT_MODEL_NAME, model_version=cls.DEFAULT_MODEL_VERSION,
                artifact_uri="backend/app/modules/ai_analysis/service.py",
                training_data_version="none", feature_schema_version=cls.DEFAULT_FEATURE_SCHEMA_VERSION,
                metrics={"method": "deterministic_rules"}, is_active=True,
            )
            try:
                with db.begin_nested():
                    db.add(model)
                    db.flush()
            except IntegrityError:
                model = db.query(ModelRegistry).filter_by(model_version=cls.DEFAULT_MODEL_VERSION).one()
            db.commit()
        return model

    @classmethod
    def get_active_model_info(cls, db: Session) -> ModelRegistryInfo:
        return ModelRegistryInfo.model_validate(cls.ensure_active_model(db))

    @classmethod
    def predict_sample_risk(
        cls, db: Session, sample_id: int, actor_id: Optional[int] = None
    ) -> AIAnalysisResponse:
        """Assign handling priority from observed laboratory records."""
        sample = db.get(Sample, sample_id)
        if sample is None:
            raise EntityNotFoundException("Sample", sample_id)

        method = cls.ensure_active_model(db)

        incident_severities = [
            severity for (severity,) in db.query(Incident.severity)
            .filter(Incident.sample_id == sample_id, Incident.status.in_(("open", "investigating")))
        ]
        completed = db.query(SampleTest).filter_by(sample_id=sample_id, test_status="completed").all()
        outcomes = [(test.result_interpretation or "").strip().casefold() for test in completed]
        adverse = sum(outcome in {"fail", "marginal", "inconclusive", "warning", "critical"} for outcome in outcomes)
        location = sample.storage_location
        factors = []

        def add(label: str, priority: int, detail: str) -> None:
            factors.append(ContributingFactor(
                factor=label, weight=priority,
                impact="risk_increasing" if priority else "neutral", detail=detail,
            ))

        if sample.sample_status in {"QUARANTINED", "MISSING"}:
            add("Specimen status", 2, f"Current specimen status is {sample.sample_status.lower()}.")
        if incident_severities:
            priority = 2 if {"high", "critical"}.intersection(incident_severities) else 1
            add("Open incidents", priority, f"{len(incident_severities)} unresolved incident(s) reference this specimen.")
        if adverse:
            add("Recorded assay findings", 1, f"{adverse} completed assay(s) have an adverse or inconclusive outcome.")
        elif "pass" not in outcomes:
            add("Assay evidence gap", 1, "There is no completed assay recorded with a passing interpretation.")
        if location is None or not location.is_active:
            add("Storage assignment gap", 1, "There is no active storage location assigned.")
        if sample.sample_status in {"DEPLETED", "DISPOSED"}:
            add("Unavailable specimen", 1, f"Current specimen status is {sample.sample_status.lower()}.")
        if not factors:
            add("Checks reviewed", 0, "The stored status, incident, assay and location checks did not raise a flag.")

        factors.sort(key=lambda factor: factor.weight, reverse=True)
        priority = ("LOW", "MEDIUM", "HIGH")[int(factors[0].weight)]
        analysis = AIAnalysis(
            sample_id=sample_id, predicted_risk=priority.lower(),
            confidence=0,  # Legacy non-null column. Rule results have no probability.
            important_factors=[factor.model_dump() for factor in factors],
            model_registry_id=method.model_registry_id,
            analysed_at=datetime.now(timezone.utc),
            input_snapshot={
                "status": sample.sample_status,
                "storage_location": location.location_code if location else None,
                "active_storage": bool(location and location.is_active),
                "open_incident_severities": incident_severities,
                "recorded_assay_outcomes": outcomes,
            },
        )
        db.add(analysis)
        db.flush()
        db.add(AuditLog(
            actor_user_id=actor_id, action="AI_PREDICT", entity_type="AIAnalysis",
            entity_id=analysis.ai_analysis_id, details={"sample_id": sample_id, "priority": priority},
        ))
        db.commit()
        return cls._format_response(db, analysis, sample)

    @classmethod
    def review_analysis(
        cls,
        db: Session,
        analysis_id: int,
        review_data: AIReviewRequest,
        reviewer_id: int
    ) -> AIAnalysisResponse:
        """Records human-in-the-loop researcher confirmation or override with audit trail."""
        analysis = db.query(AIAnalysis).filter(AIAnalysis.ai_analysis_id == analysis_id).first()
        if not analysis:
            raise EntityNotFoundException("AIAnalysis", analysis_id)

        sample = db.query(Sample).filter(Sample.sample_id == analysis.sample_id).first()

        norm_feedback = review_data.review_feedback.strip().lower()

        analysis.reviewed_by = reviewer_id
        analysis.reviewed_at = datetime.now(timezone.utc)
        analysis.review_feedback = norm_feedback
        analysis.review_notes = review_data.review_notes.strip()

        db.add(AuditLog(
            actor_user_id=reviewer_id,
            action="AI_REVIEW",
            entity_type="AIAnalysis",
            entity_id=analysis.ai_analysis_id,
            details={
                "review_feedback": norm_feedback,
                "sample_id": analysis.sample_id,
                "review_notes": analysis.review_notes,
            },
        ))
        db.commit()
        db.refresh(analysis)

        return AIAnalysisService._format_response(db, analysis, sample)

    @classmethod
    def get_sample_analyses(cls, db: Session, sample_id: int) -> List[AIAnalysisResponse]:
        """Retrieves all historical AI risk evaluations for a specimen, latest first."""
        sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        rows = db.query(AIAnalysis).filter(
            AIAnalysis.sample_id == sample_id
        ).order_by(AIAnalysis.analysed_at.desc(), AIAnalysis.ai_analysis_id.desc()).all()

        return [cls._format_response(db, a, sample) for a in rows]

    @classmethod
    def get_risk_distribution(cls, db: Session) -> RiskDistributionResponse:
        """Computes aggregate risk level breakdown across all active samples."""
        total_samples = db.query(Sample).count()

        # Find latest analysis per sample
        latest_subq = db.query(
            AIAnalysis.sample_id,
            func.max(AIAnalysis.ai_analysis_id).label("max_id")
        ).filter(AIAnalysis.model_registry.has(model_version=cls.DEFAULT_MODEL_VERSION)).group_by(AIAnalysis.sample_id).subquery()

        latest_analyses = db.query(AIAnalysis).join(
            latest_subq, AIAnalysis.ai_analysis_id == latest_subq.c.max_id
        ).all()

        counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
        for a in latest_analyses:
            risk = a.predicted_risk.upper()
            if risk in counts:
                counts[risk] += 1
            else:
                counts["MEDIUM"] += 1

        assessed = len(latest_analyses)
        unassessed = max(0, total_samples - assessed)

        percentages = {}
        for k in ("LOW", "MEDIUM", "HIGH"):
            percentages[k] = round((counts[k] / assessed * 100.0), 1) if assessed > 0 else 0.0

        return RiskDistributionResponse(
            total_samples=total_samples,
            assessed_samples=assessed,
            unassessed_samples=unassessed,
            counts=counts,
            percentages=percentages,
        )

    @classmethod
    def _format_response(
        cls,
        db: Session,
        analysis: AIAnalysis,
        sample: Optional[Sample]
    ) -> AIAnalysisResponse:
        """Helper to construct strongly-typed AIAnalysisResponse."""
        if not sample:
            sample = db.query(Sample).filter(Sample.sample_id == analysis.sample_id).first()

        reviewer = None
        if analysis.reviewed_by:
            reviewer = db.query(AppUser).filter(AppUser.user_id == analysis.reviewed_by).first()

        factors: List[ContributingFactor] = []
        if analysis.important_factors and isinstance(analysis.important_factors, list):
            for f in analysis.important_factors:
                if isinstance(f, dict):
                    factors.append(ContributingFactor(
                        factor=f.get("factor", "General Feature"),
                        weight=float(f.get("weight", 0.0)),
                        impact=f.get("impact", "neutral"),
                        detail=f.get("detail", ""),
                    ))

        method = analysis.model_registry
        return AIAnalysisResponse(
            ai_analysis_id=analysis.ai_analysis_id,
            sample_id=analysis.sample_id,
            sample_code=sample.sample_code if sample else f"S{analysis.sample_id}",
            sample_name=sample.sample_name if sample else "Unknown Sample",
            predicted_risk=analysis.predicted_risk.upper(),
            confidence=None,
            class_probabilities={},
            legacy=method.model_version != cls.DEFAULT_MODEL_VERSION,
            important_factors=factors,
            model_name=method.model_name,
            model_version=method.model_version,
            feature_schema_version=method.feature_schema_version,
            analysed_at=analysis.analysed_at,
            reviewed_by=analysis.reviewed_by,
            reviewed_by_name=reviewer.display_name if reviewer else None,
            reviewed_at=analysis.reviewed_at,
            review_feedback=analysis.review_feedback,
            review_notes=analysis.review_notes,
            input_snapshot=analysis.input_snapshot,
        )
