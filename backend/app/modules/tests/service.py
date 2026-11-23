"""
SampleMind Tests Module - Service Layer (Phase 1 Data Integrity Hardened)
========================================================================
Strict isolation: imports only from app.common and local tests schemas.
Implements:
1. Analytical assay scheduling and registration with lifecycle guardrails.
2. Outcome recording, metric ingestion, and interpretation tagging.
3. Specimen stock consumption & double-entry ledger integration.
4. Automated QC failure quarantine propagation.
5. Strict temporal and measurement bound invariants.
6. Defensive duplicate active assay prevention.
"""

from __future__ import annotations
from typing import List, Tuple, Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_

import math
from app.common import (
    SampleTest,
    Sample,
    SampleQuantityTransaction,
    AuditLog,
    TestStatus,
    TestOutcome,
    SampleStatus,
    EntityNotFoundException,
    SampleMindException,
)
from .schemas import (
    TestCreateRequest,
    TestUpdateRequest,
    TestListItem,
    TestDetailResponse,
    QCEvaluationRequest,
    QCEvaluationResponse,
    EvaluatedAssaySummary,
    SpecimenClearanceDossier,
    InstrumentQCReport,
    BatchTestCreateRequest,
    BatchTestCreateResponse,
    BatchSkippedItem,
    TestTypeBreakdownItem,
    QCAlertItem,
    TestQualityMetricsResponse,
)

VALID_STATUSES = {s.value for s in TestStatus}
NON_NEGATIVE_UNITS = {'ng/ul', 'bp', 'din', 'copies/ul', 'mg', 'ml', 'years bp', 'copies/rxn', 'ug/ml'}
DIAGNOSTIC_KEYWORDS = ('contamination', 'diagnostic', 'screen', 'qc', 'sterility', 'verification', 'clearance')


class TestService:

    @classmethod
    def _build_detail_response(
        cls,
        test: SampleTest,
        quantity_consumed: Optional[float] = None,
        sample_quarantined_by_test: bool = False
    ) -> TestDetailResponse:
        """Helper to map a SampleTest ORM instance to a full detail DTO."""
        sample = test.sample
        loc_code = sample.storage_location.location_code if sample and sample.storage_location else None
        type_code = sample.sample_type.type_code if sample and sample.sample_type else "UNKNOWN"
        type_name = sample.sample_type.type_name if sample and sample.sample_type else "Unknown Type"
        performer_name = test.performer.display_name if test.performer else None
        remaining_qty = float(sample.quantity_value) if sample and sample.quantity_value is not None else None

        return TestDetailResponse(
            sample_test_id=test.sample_test_id,
            sample_id=test.sample_id,
            sample_code=sample.sample_code if sample else "UNKNOWN",
            sample_name=sample.sample_name if sample else "Unknown Sample",
            sample_type_code=type_code,
            sample_type_name=type_name,
            sample_status=sample.sample_status if sample else "UNKNOWN",
            sample_storage_location=loc_code,
            test_type=test.test_type,
            test_status=test.test_status,
            requested_at=test.requested_at,
            performed_at=test.performed_at,
            performed_by=test.performed_by,
            performed_by_name=performer_name,
            observation=test.observation,
            result_value=float(test.result_value) if test.result_value is not None else None,
            result_unit=test.result_unit,
            result_interpretation=test.result_interpretation,
            quantity_consumed=quantity_consumed,
            sample_remaining_quantity=remaining_qty,
            sample_quarantined_by_test=sample_quarantined_by_test,
            created_at=test.created_at,
        )

    @classmethod
    def list_tests(
        cls,
        db: Session,
        sample_id: Optional[int] = None,
        test_status: Optional[str] = None,
        result_interpretation: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[TestListItem], int]:
        """
        Retrieves a paginated list of analytical assays matching search and filter criteria.
        """
        query = db.query(SampleTest).join(Sample, SampleTest.sample_id == Sample.sample_id)

        if sample_id is not None:
            query = query.filter(SampleTest.sample_id == sample_id)

        if test_status:
            query = query.filter(SampleTest.test_status == test_status.lower().strip())

        if result_interpretation:
            query = query.filter(SampleTest.result_interpretation == result_interpretation.upper().strip())

        if search:
            pattern = f"%{search.strip()}%"
            query = query.filter(
                or_(
                    SampleTest.test_type.ilike(pattern),
                    SampleTest.observation.ilike(pattern),
                    Sample.sample_code.ilike(pattern),
                    Sample.sample_name.ilike(pattern)
                )
            )

        total = query.count()
        offset = (page - 1) * page_size
        tests = query.order_by(desc(SampleTest.created_at)).offset(offset).limit(page_size).all()

        items: List[TestListItem] = []
        for t in tests:
            s = t.sample
            performer_name = t.performer.display_name if t.performer else None
            items.append(TestListItem(
                sample_test_id=t.sample_test_id,
                sample_id=t.sample_id,
                sample_code=s.sample_code if s else "UNKNOWN",
                sample_name=s.sample_name if s else "Unknown Sample",
                sample_type_code=s.sample_type.type_code if s and s.sample_type else "UNKNOWN",
                sample_status=s.sample_status if s else "UNKNOWN",
                test_type=t.test_type,
                test_status=t.test_status,
                result_value=float(t.result_value) if t.result_value is not None else None,
                result_unit=t.result_unit,
                result_interpretation=t.result_interpretation,
                performed_by_name=performer_name,
                requested_at=t.requested_at,
                performed_at=t.performed_at,
                created_at=t.created_at,
            ))

        return items, total

    @classmethod
    def get_test_by_id(cls, db: Session, test_id: int) -> TestDetailResponse:
        """Retrieves full detail of a specific analytical assay."""
        test = db.query(SampleTest).filter(SampleTest.sample_test_id == test_id).first()
        if not test:
            raise EntityNotFoundException("SampleTest", test_id)
        return cls._build_detail_response(test)

    @classmethod
    def create_test(
        cls,
        db: Session,
        req: TestCreateRequest,
        actor_id: Optional[int] = None
    ) -> TestDetailResponse:
        """
        Schedules or records a new analytical laboratory assay with strict Phase 1 invariants:
        1. Validates target specimen existence and availability (rejects DISPOSED/MISSING).
        2. Blocks destructive assays on DEPLETED specimens.
        3. Enforces quarantine guardrails (diagnostic/screening clearance assays only).
        4. Prevents duplicate concurrent identical active assays.
        5. Validates non-negative outcome metrics and chronological integrity.
        6. Atomically deducts physical stock and records a quantity ledger transaction if consumed.
        7. Auto-quarantines target specimen if an immediate FAIL outcome is recorded.
        """
        now = datetime.now(timezone.utc)

        # 1. Target Specimen Guardrails
        sample = db.query(Sample).filter(Sample.sample_id == req.sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", req.sample_id)

        s_status = (sample.sample_status or "").upper()
        if s_status in (SampleStatus.DISPOSED.value, SampleStatus.MISSING.value):
            raise SampleMindException(
                status_code=400,
                detail=f"Cannot schedule or execute assay on specimen with status '{s_status}'. Specimen is unavailable.",
                code="INVALID_SAMPLE_STATUS"
            )

        consumed = float(req.quantity_consumed or 0.0)
        curr_stock = float(sample.quantity_value or 0.0)

        if s_status == SampleStatus.DEPLETED.value or curr_stock <= 0:
            if consumed > 0:
                raise SampleMindException(
                    status_code=400,
                    detail="Cannot schedule destructive assay on DEPLETED specimen (remaining stock is 0.0 units).",
                    code="SPECIMEN_DEPLETED"
                )

        if s_status == SampleStatus.QUARANTINED.value:
            t_lower = req.test_type.lower()
            if not any(k in t_lower for k in DIAGNOSTIC_KEYWORDS):
                raise SampleMindException(
                    status_code=400,
                    detail="Specimen is QUARANTINED. Only contamination screening and diagnostic clearance assays are permitted until released.",
                    code="QUARANTINE_LOCKED"
                )

        # 2. Status Validation
        status_norm = req.test_status.lower().strip()
        if status_norm not in VALID_STATUSES:
            raise SampleMindException(
                status_code=400,
                detail=f"Invalid test_status '{req.test_status}'. Must be one of: {', '.join(sorted(VALID_STATUSES))}.",
                code="INVALID_STATUS"
            )

        # 3. Defensive Duplicate Active Assay Prevention
        if status_norm in (TestStatus.REQUESTED.value, TestStatus.IN_PROGRESS.value):
            existing_active = db.query(SampleTest).filter(
                SampleTest.sample_id == req.sample_id,
                SampleTest.test_type.ilike(req.test_type.strip()),
                SampleTest.test_status.in_([TestStatus.REQUESTED.value, TestStatus.IN_PROGRESS.value])
            ).first()
            if existing_active:
                raise SampleMindException(
                    status_code=409,
                    detail=f"An identical assay '{req.test_type}' is already active ({existing_active.test_status}) on specimen {sample.sample_code}.",
                    code="DUPLICATE_ACTIVE_ASSAY"
                )

        # 4. Temporal Integrity
        req_time = req.requested_at or now
        if req.performed_at:
            if req.performed_at > now + timedelta(minutes=5):
                raise SampleMindException(
                    status_code=400,
                    detail="performed_at cannot be set to a future timestamp.",
                    code="FUTURE_DATE_INVALID"
                )
            if req.performed_at < req_time:
                raise SampleMindException(
                    status_code=400,
                    detail="performed_at timestamp cannot precede requested_at timestamp.",
                    code="INVALID_CHRONOLOGY"
                )

        # 5. Non-negative outcome metrics
        if req.result_value is not None:
            unit = (req.result_unit or "").lower().strip()
            if unit in NON_NEGATIVE_UNITS and req.result_value < 0:
                raise SampleMindException(
                    status_code=400,
                    detail=f"result_value cannot be negative ({req.result_value}) for measurement unit '{req.result_unit}'.",
                    code="NEGATIVE_VALUE_INVALID"
                )

        # 6. Physical Stock Consumption & Overdraft Check
        if consumed > 0:
            if consumed > curr_stock:
                raise SampleMindException(
                    status_code=409,
                    detail=f"Requested test consumption ({consumed} {sample.quantity_unit}) exceeds available stock ({curr_stock} {sample.quantity_unit}).",
                    code="STOCK_OVERDRAFT"
                )
            new_stock = curr_stock - consumed
            sample.quantity_value = new_stock
            if new_stock <= 0:
                sample.sample_status = SampleStatus.DEPLETED.value
            sample.updated_at = now

        # Create assay entity
        test = SampleTest(
            sample_id=req.sample_id,
            test_type=req.test_type,
            test_status=status_norm,
            requested_at=req_time,
            performed_at=req.performed_at or (now if status_norm == TestStatus.COMPLETED.value else None),
            performed_by=req.performed_by or (actor_id if status_norm == TestStatus.COMPLETED.value else None),
            observation=req.observation,
            result_value=req.result_value,
            result_unit=req.result_unit,
            result_interpretation=req.result_interpretation.upper().strip() if req.result_interpretation else None,
            created_at=now,
        )
        db.add(test)
        db.flush()

        # Record double-entry quantity ledger transaction if stock was consumed
        if consumed > 0:
            tx = SampleQuantityTransaction(
                sample_id=sample.sample_id,
                transaction_type="USAGE",
                quantity_delta=-consumed,
                balance_after=sample.quantity_value,
                quantity_unit=sample.quantity_unit or "mg",
                notes=f"Consumed by analytical assay #{test.sample_test_id} ({test.test_type})",
                performed_by=actor_id,
                created_at=now,
            )
            db.add(tx)

        # 7. Automated QC Failure Quarantine or Specimen Status Update
        quarantined_by_test = False
        interp = (req.result_interpretation or "").upper().strip()
        is_failure = interp in ('FAIL', 'CONTAMINATED', 'DEGRADED', 'UNVIABLE')

        if status_norm == TestStatus.COMPLETED.value and is_failure:
            if req.auto_quarantine_on_failure and sample.sample_status != SampleStatus.QUARANTINED.value:
                prev_status = sample.sample_status
                sample.sample_status = SampleStatus.QUARANTINED.value
                sample.updated_at = now
                quarantined_by_test = True

                audit_quar = AuditLog(
                    action="AUTO_QUARANTINE_QC_FAILURE",
                    entity_type="Sample",
                    entity_id=sample.sample_id,
                    actor_user_id=actor_id,
                    details={
                        "sample_code": sample.sample_code,
                        "previous_status": prev_status,
                        "sample_test_id": test.sample_test_id,
                        "test_type": test.test_type,
                        "result_interpretation": interp,
                        "reason": f"Automatic quarantine triggered by failed QC assay #{test.sample_test_id} ({test.test_type}) with outcome '{interp}'."
                    }
                )
                db.add(audit_quar)
        elif status_norm in (TestStatus.IN_PROGRESS.value, TestStatus.COMPLETED.value) and sample.sample_status == SampleStatus.IN_STORAGE.value:
            sample.sample_status = SampleStatus.IN_USE.value
            sample.updated_at = now

        # Audit log entry for assay creation
        audit = AuditLog(
            action="CREATE_SAMPLE_TEST",
            entity_type="SampleTest",
            entity_id=test.sample_test_id,
            actor_user_id=actor_id,
            details={
                "sample_id": req.sample_id,
                "sample_code": sample.sample_code,
                "test_type": req.test_type,
                "test_status": status_norm,
                "quantity_consumed": consumed if consumed > 0 else None,
            }
        )
        db.add(audit)
        db.commit()
        db.refresh(test)

        return cls._build_detail_response(
            test,
            quantity_consumed=consumed if consumed > 0 else None,
            sample_quarantined_by_test=quarantined_by_test
        )

    @classmethod
    def update_test(
        cls,
        db: Session,
        test_id: int,
        req: TestUpdateRequest,
        actor_id: Optional[int] = None
    ) -> TestDetailResponse:
        """
        Updates an assay's execution status, outcome metric, and interpretation with Phase 1 invariants:
        1. Validates status transitions and ensures performed_at/performed_by populated on completion.
        2. Enforces non-empty justification if cancelling an assay.
        3. Validates non-negative numerical outcomes for bounded units.
        4. Handles physical specimen quantity consumption and updates double-entry stock ledger.
        5. Auto-quarantines target specimen if outcome interpretation is FAIL/CONTAMINATED.
        6. Reverts specimen from IN_USE to IN_STORAGE if all active assays finish with PASS.
        """
        test = db.query(SampleTest).filter(SampleTest.sample_test_id == test_id).first()
        if not test:
            raise EntityNotFoundException("SampleTest", test_id)

        sample = test.sample
        now = datetime.now(timezone.utc)
        quarantined_by_test = False

        # Status validation
        target_status = test.test_status
        if req.test_status is not None:
            status_norm = req.test_status.lower().strip()
            if status_norm not in VALID_STATUSES:
                raise SampleMindException(
                    status_code=400,
                    detail=f"Invalid test_status '{req.test_status}'. Must be one of: {', '.join(sorted(VALID_STATUSES))}.",
                    code="INVALID_STATUS"
                )
            target_status = status_norm
            test.test_status = status_norm

            # Cancellation justification invariant
            if status_norm == TestStatus.CANCELLED.value:
                reason = req.cancellation_reason or req.observation or test.observation
                if not reason or not reason.strip():
                    raise SampleMindException(
                        status_code=400,
                        detail="A non-empty observation or cancellation reason is required to cancel an assay.",
                        code="CANCELLATION_REASON_REQUIRED"
                    )
                if req.cancellation_reason and not req.observation:
                    test.observation = f"[CANCELLATION REASON]: {req.cancellation_reason.strip()}"

            if status_norm == TestStatus.COMPLETED.value and not test.performed_at:
                test.performed_at = req.performed_at or now
                if not test.performed_by:
                    test.performed_by = req.performed_by or actor_id

        # Temporal invariants
        if req.performed_at is not None:
            if req.performed_at > now + timedelta(minutes=5):
                raise SampleMindException(
                    status_code=400,
                    detail="performed_at cannot be set to a future timestamp.",
                    code="FUTURE_DATE_INVALID"
                )
            if test.requested_at and req.performed_at < test.requested_at:
                raise SampleMindException(
                    status_code=400,
                    detail="performed_at timestamp cannot precede requested_at timestamp.",
                    code="INVALID_CHRONOLOGY"
                )
            test.performed_at = req.performed_at

        if req.performed_by is not None:
            test.performed_by = req.performed_by

        if req.observation is not None:
            test.observation = req.observation

        if req.result_value is not None:
            unit = (req.result_unit or test.result_unit or "").lower().strip()
            if unit in NON_NEGATIVE_UNITS and req.result_value < 0:
                raise SampleMindException(
                    status_code=400,
                    detail=f"result_value cannot be negative ({req.result_value}) for measurement unit '{unit}'.",
                    code="NEGATIVE_VALUE_INVALID"
                )
            test.result_value = req.result_value

        if req.result_unit is not None:
            test.result_unit = req.result_unit

        if req.result_interpretation is not None:
            test.result_interpretation = req.result_interpretation.upper().strip()

        # Physical Stock Consumption
        consumed = float(req.quantity_consumed or 0.0)
        if consumed > 0 and sample:
            curr_stock = float(sample.quantity_value or 0.0)
            if consumed > curr_stock:
                raise SampleMindException(
                    status_code=409,
                    detail=f"Requested test consumption ({consumed} {sample.quantity_unit}) exceeds available stock ({curr_stock} {sample.quantity_unit}).",
                    code="STOCK_OVERDRAFT"
                )
            new_stock = curr_stock - consumed
            sample.quantity_value = new_stock
            if new_stock <= 0:
                sample.sample_status = SampleStatus.DEPLETED.value
            sample.updated_at = now

            tx = SampleQuantityTransaction(
                sample_id=sample.sample_id,
                transaction_type="USAGE",
                quantity_delta=-consumed,
                balance_after=new_stock,
                quantity_unit=sample.quantity_unit or "mg",
                notes=f"Consumed by analytical assay #{test.sample_test_id} ({test.test_type})",
                performed_by=actor_id,
                created_at=now,
            )
            db.add(tx)

        # Automated QC Failure Quarantine
        interp = (test.result_interpretation or "").upper().strip()
        is_failure = interp in ('FAIL', 'CONTAMINATED', 'DEGRADED', 'UNVIABLE')

        if target_status == TestStatus.COMPLETED.value and is_failure and sample:
            if req.auto_quarantine_on_failure and sample.sample_status != SampleStatus.QUARANTINED.value:
                prev_status = sample.sample_status
                sample.sample_status = SampleStatus.QUARANTINED.value
                sample.updated_at = now
                quarantined_by_test = True

                audit_quar = AuditLog(
                    action="AUTO_QUARANTINE_QC_FAILURE",
                    entity_type="Sample",
                    entity_id=sample.sample_id,
                    actor_user_id=actor_id,
                    details={
                        "sample_code": sample.sample_code,
                        "previous_status": prev_status,
                        "sample_test_id": test.sample_test_id,
                        "test_type": test.test_type,
                        "result_interpretation": interp,
                        "reason": f"Automatic quarantine triggered by failed QC assay #{test.sample_test_id} ({test.test_type}) with outcome '{interp}'."
                    }
                )
                db.add(audit_quar)
        elif target_status == TestStatus.COMPLETED.value and not is_failure and sample:
            # If test finished successfully and sample was IN_USE, check if it can return to IN_STORAGE
            if sample.sample_status == SampleStatus.IN_USE.value:
                other_active = db.query(SampleTest).filter(
                    SampleTest.sample_id == sample.sample_id,
                    SampleTest.sample_test_id != test.sample_test_id,
                    SampleTest.test_status.in_([TestStatus.REQUESTED.value, TestStatus.IN_PROGRESS.value])
                ).count()
                if other_active == 0 and float(sample.quantity_value or 0.0) > 0:
                    sample.sample_status = SampleStatus.IN_STORAGE.value
                    sample.updated_at = now

        # Audit log entry for update
        audit = AuditLog(
            action="UPDATE_SAMPLE_TEST",
            entity_type="SampleTest",
            entity_id=test.sample_test_id,
            actor_user_id=actor_id,
            details={
                "test_status": test.test_status,
                "result_value": float(test.result_value) if test.result_value is not None else None,
                "result_interpretation": test.result_interpretation,
                "quantity_consumed": consumed if consumed > 0 else None,
            }
        )
        db.add(audit)
        db.commit()
        db.refresh(test)

        return cls._build_detail_response(
            test,
            quantity_consumed=consumed if consumed > 0 else None,
            sample_quarantined_by_test=quarantined_by_test
        )

    # =========================================================================
    # Phase 2: Scientific Acceptance Criteria & QC Decision Engine
    # =========================================================================

    @classmethod
    def evaluate_qc_thresholds(
        cls,
        test_type: str,
        result_value: float,
        result_unit: Optional[str] = None
    ) -> QCEvaluationResponse:
        """
        Phase 2 Feature: Automated Scientific QC Acceptance Criteria & Specimen Tolerance Engine.
        Evaluates analytical assay readings against codified molecular laboratory standards.
        """
        tt_lower = (test_type or "").lower().strip()
        unit_lower = (result_unit or "").lower().strip()
        val = float(result_value)

        # 1. Fluorometric dsDNA Concentration (Qubit, Nanodrop, etc.)
        if any(k in tt_lower for k in ('qubit', 'fluorometer', 'concentration', 'yield', 'nanodrop')) or unit_lower in ('ng/ul', 'ug/ml', 'ng/µl'):
            unit_display = result_unit or "ng/uL"
            if val >= 15.0:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="OPTIMAL",
                    compliance_level="ACCEPTABLE",
                    confidence_score=98.5,
                    parameter_name="dsDNA Concentration (High Yield)",
                    reference_standard="ISO 17025 / Illumina NovaSeq & TruSeq Protocol (>= 15 ng/uL)",
                    threshold_criteria=f"Concentration ({val:.2f} {unit_display}) satisfies optimal high-throughput genomics specifications (threshold >= 15.0 ng/uL).",
                    laboratory_guidance="Specimen certified for direct acoustic shearing, enzymatic fragmentation, or long-read sequencing."
                )
            elif val >= 5.0:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="PASS",
                    compliance_level="ACCEPTABLE",
                    confidence_score=92.0,
                    parameter_name="dsDNA Concentration (Standard Yield)",
                    reference_standard="Standard NGS Library Prep Guidelines (5.0 - 15.0 ng/uL)",
                    threshold_criteria=f"Concentration ({val:.2f} {unit_display}) satisfies standard library preparation guidelines (threshold >= 5.0 ng/uL).",
                    laboratory_guidance="Proceed with standard low-input library preparation protocol (e.g. Nextera XT / NEBNext Ultra II)."
                )
            elif val >= 1.5:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="BORDERLINE",
                    compliance_level="CONDITIONAL",
                    confidence_score=78.0,
                    parameter_name="dsDNA Concentration (Marginal Yield)",
                    reference_standard="Ultra-Low Input Genomic Protocols (1.5 - 5.0 ng/uL)",
                    threshold_criteria=f"Concentration ({val:.2f} {unit_display}) is marginal. Risk of PCR duplication bias in standard workflows.",
                    laboratory_guidance="Perform vacuum concentration (speed-vac) or utilize single-stranded / ancient DNA library preparation protocols."
                )
            else:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="FAIL",
                    compliance_level="REJECTED",
                    confidence_score=96.0,
                    parameter_name="dsDNA Concentration (Deficient)",
                    reference_standard="Lower Limit of Quantification (LLOQ < 1.5 ng/uL)",
                    threshold_criteria=f"Concentration ({val:.2f} {unit_display}) is below minimal analytical detection limits (< 1.5 ng/uL).",
                    laboratory_guidance="Insufficient physical DNA mass for NGS. Recommend secondary extraction or Whole Genome Amplification (WGA)."
                )

        # 2. Genomic Integrity Number (TapeStation DIN / Bioanalyzer RIN)
        if any(k in tt_lower for k in ('tapestation', 'din', 'rin', 'integrity', 'bioanalyzer', 'fragment analyzer')) or unit_lower in ('din', 'rin', 'score'):
            unit_display = result_unit or "DIN"
            if val >= 7.0:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="OPTIMAL",
                    compliance_level="ACCEPTABLE",
                    confidence_score=97.0,
                    parameter_name="DNA Integrity Number (High-Molecular Weight)",
                    reference_standard="Agilent DIN Standard (DIN >= 7.0 = Intact gDNA)",
                    threshold_criteria=f"Integrity score of {val:.1f} indicates intact high-molecular-weight genomic DNA with negligible shearing.",
                    laboratory_guidance="Specimen certified for long-read Oxford Nanopore / PacBio HiFi sequencing and high-fidelity libraries."
                )
            elif val >= 4.5:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="PASS",
                    compliance_level="ACCEPTABLE",
                    confidence_score=90.0,
                    parameter_name="DNA Integrity Number (Moderate Fragmentation)",
                    reference_standard="Agilent DIN Standard (DIN 4.5 - 6.9 = Partially Degraded)",
                    threshold_criteria=f"Integrity score of {val:.1f} indicates moderate molecular fragmentation. Target insert sizes remain viable.",
                    laboratory_guidance="Proceed with short-read NGS (Illumina NovaSeq / NextSeq); reduce mechanical shearing duration."
                )
            elif val >= 2.5:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="BORDERLINE",
                    compliance_level="CONDITIONAL",
                    confidence_score=82.0,
                    parameter_name="DNA Integrity Number (Heavily Fragmented)",
                    reference_standard="Agilent DIN Standard (DIN 2.5 - 4.4 = Heavily Degraded)",
                    threshold_criteria=f"Integrity score of {val:.1f} shows heavy fragmentation typical of aged or museum specimens.",
                    laboratory_guidance="Do not shear. Utilize short-insert library adapters and increase adapter ligation time."
                )
            else:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="FAIL",
                    compliance_level="REJECTED",
                    confidence_score=95.0,
                    parameter_name="DNA Integrity Number (Severely Degraded)",
                    reference_standard="Agilent DIN Standard (DIN < 2.5 = Unviable Fragmentation)",
                    threshold_criteria=f"Integrity score of {val:.1f} indicates extensive cross-linking or severe molecular depurination.",
                    laboratory_guidance="Specimen failed integrity acceptance. Evaluate suitability for paleogenomic specialized capture only."
                )

        # 3. 16S / Environmental Bacterial Contamination Screen (qPCR)
        if any(k in tt_lower for k in ('16s', 'contamination', 'bacterial', 'endotoxin', 'sterility', 'mycoplasma')) or unit_lower in ('copies/ul', 'copies/rxn', 'eu/ml'):
            unit_display = result_unit or "copies/uL"
            if val < 50.0:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="OPTIMAL",
                    compliance_level="ACCEPTABLE",
                    confidence_score=99.0,
                    parameter_name="Microbial Bio-Burden (Clean Extraction)",
                    reference_standard="Cleanroom ISO Class 5 Extraction Standard (< 50 copies/uL)",
                    threshold_criteria=f"Microbial copy count ({val:.1f} {unit_display}) is negligible and indistinguishable from negative controls.",
                    laboratory_guidance="Clean extract certified for ultra-sensitive ancient or forensic targeted sequencing."
                )
            elif val < 150.0:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="PASS",
                    compliance_level="ACCEPTABLE",
                    confidence_score=91.0,
                    parameter_name="Microbial Bio-Burden (Nominal Background)",
                    reference_standard="Standard Biological Acceptance Threshold (< 150 copies/uL)",
                    threshold_criteria=f"Microbial count of {val:.1f} {unit_display} represents low nominal laboratory background.",
                    laboratory_guidance="Acceptable for standard experimental protocols; apply metagenomic de-contamination filters during bioinformatic QC."
                )
            elif val < 500.0:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="BORDERLINE",
                    compliance_level="CONDITIONAL",
                    confidence_score=84.0,
                    parameter_name="Microbial Bio-Burden (Elevated Signal)",
                    reference_standard="Microbial Caution Limit (150 - 500 copies/uL)",
                    threshold_criteria=f"Elevated bacterial signal ({val:.1f} {unit_display}) detected. Specimen purity is compromised.",
                    laboratory_guidance="Requires laboratory manager review. Include negative extraction blank controls alongside specimen."
                )
            else:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="CONTAMINATED",
                    compliance_level="REJECTED",
                    confidence_score=99.5,
                    parameter_name="Microbial Bio-Burden (Severe Contamination)",
                    reference_standard="Sterility Breach Threshold (>= 500 copies/uL)",
                    threshold_criteria=f"Massive microbial signal ({val:.1f} {unit_display}) indicates severe environmental or modern contamination.",
                    laboratory_guidance="Specimen automatically quarantined. Quarantine parent stock, isolate reagents, and clean laminar flow cabinet."
                )

        # 4. Fragment Sizing (Agilent 2100 Bioanalyzer bp)
        if any(k in tt_lower for k in ('sizing', 'fragment', 'bp', 'size')) or unit_lower in ('bp', 'basepairs'):
            unit_display = result_unit or "bp"
            if 160.0 <= val <= 550.0:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="OPTIMAL",
                    compliance_level="ACCEPTABLE",
                    confidence_score=95.0,
                    parameter_name="Library Fragment Distribution",
                    reference_standard="Illumina Standard Insert Window (160 - 550 bp)",
                    threshold_criteria=f"Peak fragment size ({val:.0f} bp) is centered within optimal flow-cell cluster generation window.",
                    laboratory_guidance="Ready for flow-cell loading and equimolar library pooling."
                )
            elif 100.0 <= val < 160.0:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="BORDERLINE",
                    compliance_level="CONDITIONAL",
                    confidence_score=80.0,
                    parameter_name="Library Fragment Distribution (Short Inserts)",
                    reference_standard="Short-Insert Caution Threshold (100 - 159 bp)",
                    threshold_criteria=f"Peak fragment size ({val:.0f} bp) is close to adapter-dimer size range.",
                    laboratory_guidance="Perform 0.8x SPRI magnetic bead size selection to remove adapter dimers prior to sequencing."
                )
            elif val < 100.0:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="FAIL",
                    compliance_level="REJECTED",
                    confidence_score=98.0,
                    parameter_name="Library Fragment Distribution (Adapter Dimer Dominant)",
                    reference_standard="Adapter Dimer Failure Threshold (< 100 bp)",
                    threshold_criteria=f"Predominant peak at {val:.0f} bp represents unligated adapter dimers with no insert.",
                    laboratory_guidance="Do not load onto sequencing instrument. Repeat post-ligation magnetic bead wash."
                )
            else:
                return QCEvaluationResponse(
                    test_type=test_type,
                    result_value=val,
                    result_unit=unit_display,
                    recommended_interpretation="PASS",
                    compliance_level="ACCEPTABLE",
                    confidence_score=88.0,
                    parameter_name="Library Fragment Distribution (Long Fragments)",
                    reference_standard="Extended Fragment Window (> 550 bp)",
                    threshold_criteria=f"Peak size ({val:.0f} bp) reflects long molecular fragments.",
                    laboratory_guidance="Suitable for long-read Oxford Nanopore or specialized mate-pair sequencing."
                )

        # 5. Default Fallback
        return QCEvaluationResponse(
            test_type=test_type,
            result_value=val,
            result_unit=result_unit,
            recommended_interpretation="PASS" if val > 0 else "FAIL",
            compliance_level="ACCEPTABLE" if val > 0 else "REJECTED",
            confidence_score=85.0,
            parameter_name="General Analytical Assay Measurement",
            reference_standard="Standard Laboratory Practice Metric",
            threshold_criteria=f"Measurement of {val} {result_unit or ''} recorded within operational analytical limits.",
            laboratory_guidance="Review observation notes for protocol-specific interpretations."
        )

    # =========================================================================
    # Phase 2: Multi-Assay Specimen Clearance & Certificate of Analysis (CoA)
    # =========================================================================

    @classmethod
    def get_specimen_clearance(cls, db: Session, sample_id: int) -> SpecimenClearanceDossier:
        """
        Phase 2 Feature: Multi-Assay Specimen Clearance & Certificate of Analysis (CoA).
        Evaluates full battery of QC tests to compute whether specimen is certified for downstream genomics.
        """
        sample = db.query(Sample).filter(Sample.sample_id == sample_id).first()
        if not sample:
            raise EntityNotFoundException("Sample", sample_id)

        all_tests = db.query(SampleTest).filter(
            SampleTest.sample_id == sample_id
        ).order_by(SampleTest.created_at.asc()).all()

        type_name = sample.sample_type.type_name if sample.sample_type else "Unknown Type"
        loc_code = sample.storage_location.location_code if sample.storage_location else None

        now = datetime.now(timezone.utc)
        cert_id = f"COA-{sample.sample_code}-{now.strftime('%Y%m%d%H%M')}"

        evaluated: List[EvaluatedAssaySummary] = []
        passed_count = 0
        failed_count = 0
        borderline_count = 0
        pending_count = 0

        for t in all_tests:
            interp = (t.result_interpretation or "").upper().strip()
            status_norm = t.test_status.lower().strip()
            performer_name = t.performer.display_name if t.performer else None

            if status_norm in (TestStatus.REQUESTED.value, TestStatus.IN_PROGRESS.value):
                tol = "PENDING"
                pending_count += 1
            elif interp in ('OPTIMAL', 'PASS'):
                tol = "PASS"
                passed_count += 1
            elif interp in ('FAIL', 'CONTAMINATED', 'DEGRADED', 'UNVIABLE'):
                tol = "FAIL"
                failed_count += 1
            elif interp == 'BORDERLINE':
                tol = "BORDERLINE"
                borderline_count += 1
            else:
                tol = "PASS" if status_norm == TestStatus.COMPLETED.value else "PENDING"
                if tol == "PASS":
                    passed_count += 1
                else:
                    pending_count += 1

            evaluated.append(EvaluatedAssaySummary(
                sample_test_id=t.sample_test_id,
                test_type=t.test_type,
                test_status=t.test_status,
                result_value=float(t.result_value) if t.result_value is not None else None,
                result_unit=t.result_unit,
                result_interpretation=t.result_interpretation,
                performed_at=t.performed_at,
                performed_by_name=performer_name,
                tolerance_status=tol
            ))

        total_tests = len(all_tests)

        # Compute clearance verdict
        if total_tests == 0:
            clearance_status = "INSUFFICIENT_TESTS"
            can_release = False
            clearance_decision = "No analytical quality assays have been scheduled or completed for this specimen."
            specs_met = False
        elif sample.sample_status == SampleStatus.QUARANTINED.value:
            clearance_status = "QC_HOLD_QUARANTINED"
            can_release = False
            clearance_decision = "Specimen is locked in QUARANTINED status. Release for study is strictly prohibited under ISO 17025."
            specs_met = False
        elif sample.sample_status in (SampleStatus.DISPOSED.value, SampleStatus.MISSING.value, SampleStatus.DEPLETED.value):
            clearance_status = "REJECTED_QC_HOLD"
            can_release = False
            clearance_decision = f"Specimen is {sample.sample_status}. Zero physical stock available for experimental release."
            specs_met = False
        elif failed_count > 0:
            clearance_status = "REJECTED_QC_HOLD"
            can_release = False
            clearance_decision = f"One or more assays failed QC specifications ({failed_count} failure(s)). Specimen held for re-extraction or disposal."
            specs_met = False
        elif pending_count > 0:
            clearance_status = "TESTING_PENDING"
            can_release = False
            clearance_decision = f"{pending_count} analytical assay(s) currently in progress. Final release pending instrument outcome ingestion."
            specs_met = False
        elif borderline_count > 0:
            clearance_status = "CONDITIONAL_APPROVAL"
            can_release = True
            clearance_decision = f"All assays completed. {borderline_count} borderline parameter(s) noted. Conditional release granted for low-input protocols."
            specs_met = True
        else:
            clearance_status = "RELEASED_FOR_STUDY"
            can_release = True
            clearance_decision = "All laboratory quality assurance specifications satisfied. Specimen formally certified for high-throughput genomics."
            specs_met = True

        return SpecimenClearanceDossier(
            sample_id=sample.sample_id,
            sample_code=sample.sample_code,
            sample_name=sample.sample_name,
            sample_type_name=type_name,
            sample_status=sample.sample_status,
            storage_location=loc_code,
            clearance_status=clearance_status,
            clearance_decision=clearance_decision,
            can_release=can_release,
            total_tests_conducted=total_tests,
            passed_tests_count=passed_count,
            failed_tests_count=failed_count,
            borderline_tests_count=borderline_count,
            pending_tests_count=pending_count,
            evaluated_assays=evaluated,
            certificate_id=cert_id,
            certified_at=now,
            quality_specifications_met=specs_met
        )

    # =========================================================================
    # Phase 2: Statistical Quality Control & Instrument Drift Monitoring
    # =========================================================================

    @classmethod
    def get_instrument_drift_analytics(cls, db: Session) -> List[InstrumentQCReport]:
        """
        Phase 2 Feature: Statistical Quality Control & Instrument Calibration Drift Monitoring.
        Groups completed analytical assays by instrument protocol, calculating Mean, Std Dev,
        Coefficient of Variation (%CV), and Westgard rule deviation counts (2-sigma, 3-sigma).
        """
        completed_tests = db.query(SampleTest).filter(
            SampleTest.test_status == TestStatus.COMPLETED.value,
            SampleTest.result_value.isnot(None)
        ).order_by(SampleTest.performed_at.asc()).all()

        # Group by test_type
        grouped: dict[str, list[SampleTest]] = {}
        for t in completed_tests:
            tt = t.test_type.strip()
            if tt not in grouped:
                grouped[tt] = []
            grouped[tt].append(t)

        reports: List[InstrumentQCReport] = []

        for tt, test_list in grouped.items():
            vals = [float(t.result_value) for t in test_list if t.result_value is not None]
            n = len(vals)
            if n == 0:
                continue

            unit = test_list[-1].result_unit
            mean_val = sum(vals) / n
            min_val = min(vals)
            max_val = max(vals)

            if n >= 2:
                variance = sum((x - mean_val) ** 2 for x in vals) / (n - 1)
                std_dev = math.sqrt(variance)
            else:
                std_dev = 0.0

            cv_pct = (std_dev / mean_val * 100.0) if mean_val > 0 else 0.0

            # Compute z-scores and Westgard rule violations
            latest_val = vals[-1]
            latest_z = ((latest_val - mean_val) / std_dev) if std_dev > 0 else 0.0

            warn_count = 0
            action_count = 0

            if std_dev > 0:
                for v in vals:
                    z = abs(v - mean_val) / std_dev
                    if z >= 3.0:
                        action_count += 1
                    elif z >= 2.0:
                        warn_count += 1

            # Determine control status
            if n < 3:
                status_str = "INSUFFICIENT_DATA"
                action_text = f"Insufficient run history (N={n}). Accumulate at least 3 completed runs for statistical process control."
            elif action_count > 0 or cv_pct > 15.0:
                status_str = "DRIFT_DETECTED"
                action_text = f"Westgard 3s alarm triggered or high variance (%CV={cv_pct:.1f}%). Instrument recalibration and optical realignment required."
            elif warn_count > 0 or cv_pct > 8.0:
                status_str = "MARGINAL"
                action_text = f"Advisory notice (%CV={cv_pct:.1f}%). Reagent lot drift or minor baseline fluctuation detected. Monitor next 3 runs."
            else:
                status_str = "STABLE"
                action_text = f"Nominal precision verified (%CV={cv_pct:.1f}%). Instrument calibration certified for clinical/research testing."

            reports.append(InstrumentQCReport(
                test_type=tt,
                measurement_unit=unit,
                run_count=n,
                mean_value=round(mean_val, 4),
                std_deviation=round(std_dev, 4),
                coeff_of_variation_pct=round(cv_pct, 2),
                min_value=round(min_val, 4),
                max_value=round(max_val, 4),
                latest_reading=round(latest_val, 4),
                latest_z_score=round(latest_z, 2),
                warning_count_2sigma=warn_count,
                action_count_3sigma=action_count,
                control_status=status_str,
                recommended_action=action_text
            ))

        # Sort by run_count descending
        reports.sort(key=lambda r: r.run_count, reverse=True)
        return reports

    # =========================================================================
    # Phase 2: High-Throughput Batch Assay Scheduling
    # =========================================================================

    @classmethod
    def create_batch_tests(
        cls,
        db: Session,
        req: BatchTestCreateRequest,
        actor_id: Optional[int] = None
    ) -> BatchTestCreateResponse:
        """
        Phase 2 Feature: High-Throughput Batch Assay Scheduling.
        Schedules an identical analytical protocol across a cohort of specimens (e.g. 8-strip, 96-well plate),
        enforcing Phase 1 data integrity checks individually per specimen.
        """
        now = datetime.now(timezone.utc)
        batch_id = req.batch_run_identifier or f"BATCH-{now.strftime('%Y%m%d%H%M%S')}"

        created_items: List[TestListItem] = []
        skipped_items: List[BatchSkippedItem] = []

        seen_ids = set()
        for sid in req.sample_ids:
            if sid in seen_ids:
                continue
            seen_ids.add(sid)

            sample = db.query(Sample).filter(Sample.sample_id == sid).first()
            if not sample:
                skipped_items.append(BatchSkippedItem(
                    sample_id=sid,
                    sample_code=f"ID-{sid}",
                    reason="Specimen record not found in database.",
                    error_code="SPECIMEN_NOT_FOUND"
                ))
                continue

            # Inactive specimen check
            if sample.sample_status in (SampleStatus.DISPOSED.value, SampleStatus.MISSING.value):
                skipped_items.append(BatchSkippedItem(
                    sample_id=sid,
                    sample_code=sample.sample_code,
                    reason=f"Specimen is {sample.sample_status}. Testing prohibited.",
                    error_code="INVALID_SAMPLE_STATUS"
                ))
                continue

            # Quarantine check
            is_diag = any(k in req.test_type.lower() for k in DIAGNOSTIC_KEYWORDS)
            if sample.sample_status == SampleStatus.QUARANTINED.value and not is_diag:
                skipped_items.append(BatchSkippedItem(
                    sample_id=sid,
                    sample_code=sample.sample_code,
                    reason="Specimen is QUARANTINED. Non-screening assays blocked.",
                    error_code="QUARANTINE_LOCKED"
                ))
                continue

            # Overdraft check
            consumed = float(req.quantity_consumed_per_sample or 0.0)
            curr_stock = float(sample.quantity_value or 0.0)
            if consumed > 0 and consumed > curr_stock:
                skipped_items.append(BatchSkippedItem(
                    sample_id=sid,
                    sample_code=sample.sample_code,
                    reason=f"Stock overdraft: requested {consumed} exceeds available {curr_stock}.",
                    error_code="STOCK_OVERDRAFT"
                ))
                continue

            # Duplicate active assay check
            existing_active = db.query(SampleTest).filter(
                SampleTest.sample_id == sid,
                SampleTest.test_type.ilike(req.test_type.strip()),
                SampleTest.test_status.in_([TestStatus.REQUESTED.value, TestStatus.IN_PROGRESS.value])
            ).first()
            if existing_active:
                skipped_items.append(BatchSkippedItem(
                    sample_id=sid,
                    sample_code=sample.sample_code,
                    reason=f"Specimen already has active assay #{existing_active.sample_test_id} of identical type.",
                    error_code="DUPLICATE_ACTIVE_ASSAY"
                ))
                continue

            # Deduction if destructive
            if consumed > 0:
                new_stock = curr_stock - consumed
                sample.quantity_value = new_stock
                if new_stock <= 0:
                    sample.sample_status = SampleStatus.DEPLETED.value
                sample.updated_at = now

                tx = SampleQuantityTransaction(
                    sample_id=sample.sample_id,
                    transaction_type="USAGE",
                    quantity_delta=-consumed,
                    balance_after=new_stock,
                    quantity_unit=sample.quantity_unit or "mg",
                    notes=f"Consumed by batch assay run [{batch_id}]: {req.test_type}",
                    performed_by=actor_id,
                    created_at=now,
                )
                db.add(tx)

            obs = f"[Batch Run: {batch_id}]"
            if req.observation:
                obs = f"{obs} {req.observation.strip()}"

            test_obj = SampleTest(
                sample_id=sid,
                test_type=req.test_type.strip(),
                test_status=TestStatus.REQUESTED.value,
                requested_at=req.requested_at or now,
                performed_by=actor_id,
                observation=obs,
                result_unit=req.result_unit,
                created_at=now,
            )
            db.add(test_obj)
            db.flush()

            if sample.sample_status == SampleStatus.IN_STORAGE.value:
                sample.sample_status = SampleStatus.IN_USE.value
                sample.updated_at = now

            created_items.append(TestListItem(
                sample_test_id=test_obj.sample_test_id,
                sample_id=sample.sample_id,
                sample_code=sample.sample_code,
                sample_name=sample.sample_name,
                sample_type_code=sample.sample_type.type_code if sample.sample_type else "UNKNOWN",
                sample_status=sample.sample_status,
                test_type=test_obj.test_type,
                test_status=test_obj.test_status,
                result_value=None,
                result_unit=test_obj.result_unit,
                result_interpretation=None,
                performed_by_name=None,
                requested_at=test_obj.requested_at,
                performed_at=None,
                created_at=test_obj.created_at,
            ))

        db.commit()

        return BatchTestCreateResponse(
            batch_run_identifier=batch_id,
            scheduled_count=len(created_items),
            skipped_count=len(skipped_items),
            created_tests=created_items,
            skipped_samples=skipped_items
        )

    # =========================================================================
    # Phase 3: Analytical Laboratory Quality & Operational Intelligence
    # =========================================================================

    @classmethod
    def delete_test(cls, db: Session, test_id: int, actor_id: Optional[int] = None) -> bool:
        """
        Deletes a laboratory assay record.
        """
        test = db.query(SampleTest).filter(SampleTest.sample_test_id == test_id).first()
        if not test:
            raise EntityNotFoundException("SampleTest", test_id)
        db.delete(test)
        db.commit()
        return True

    @classmethod
    def get_quality_metrics(cls, db: Session) -> TestQualityMetricsResponse:
        """
        Phase 3 Feature: Analytical Laboratory Quality & Operational Intelligence.
        Calculates pass rates, turnaround times, contamination alerts, and protocol breakdown.
        """
        all_tests = db.query(SampleTest).all()
        total = len(all_tests)

        completed = 0
        in_progress = 0
        requested = 0
        cancelled = 0

        passed = 0
        contaminated = 0
        turnaround_seconds: list[float] = []

        type_map: dict[str, dict[str, int]] = {}
        alerts: list[QCAlertItem] = []

        for t in all_tests:
            s = t.test_status.lower().strip()
            if s == TestStatus.COMPLETED.value:
                completed += 1
            elif s == TestStatus.IN_PROGRESS.value:
                in_progress += 1
            elif s == TestStatus.REQUESTED.value:
                requested += 1
            elif s == TestStatus.CANCELLED.value:
                cancelled += 1

            interp = (t.result_interpretation or "").upper().strip()
            if interp in ('OPTIMAL', 'PASS'):
                passed += 1
            elif interp in ('FAIL', 'CONTAMINATED', 'DEGRADED', 'UNVIABLE'):
                contaminated += 1
                sample_code = t.sample.sample_code if t.sample else f"SMP-{t.sample_id}"
                alerts.append(QCAlertItem(
                    sample_test_id=t.sample_test_id,
                    sample_id=t.sample_id,
                    sample_code=sample_code,
                    test_type=t.test_type,
                    result_value=float(t.result_value) if t.result_value is not None else None,
                    result_unit=t.result_unit,
                    result_interpretation=interp,
                    performed_at=t.performed_at
                ))

            # Turnaround time calculation
            if t.requested_at and t.performed_at and t.performed_at >= t.requested_at:
                diff = (t.performed_at - t.requested_at).total_seconds()
                turnaround_seconds.append(diff)

            # Type breakdown
            tt = t.test_type.strip()
            if tt not in type_map:
                type_map[tt] = {"count": 0, "optimal": 0, "pass": 0, "borderline": 0, "fail": 0}
            type_map[tt]["count"] += 1
            if interp == "OPTIMAL":
                type_map[tt]["optimal"] += 1
            elif interp == "PASS":
                type_map[tt]["pass"] += 1
            elif interp == "BORDERLINE":
                type_map[tt]["borderline"] += 1
            elif interp in ("FAIL", "CONTAMINATED", "DEGRADED"):
                type_map[tt]["fail"] += 1

        pass_rate = round((passed / completed * 100.0), 1) if completed > 0 else 0.0
        contam_rate = round((contaminated / completed * 100.0), 1) if completed > 0 else 0.0

        avg_tat = (
            round((sum(turnaround_seconds) / len(turnaround_seconds)) / 3600.0, 1)
            if len(turnaround_seconds) > 0
            else None
        )

        quarantined_count = db.query(Sample).filter(Sample.sample_status == SampleStatus.QUARANTINED.value).count()

        breakdown_items = [
            TestTypeBreakdownItem(
                test_type=k,
                count=v["count"],
                optimal_count=v["optimal"],
                pass_count=v["pass"],
                borderline_count=v["borderline"],
                fail_count=v["fail"]
            )
            for k, v in sorted(type_map.items(), key=lambda x: x[1]["count"], reverse=True)
        ]

        # Recent alerts (sorted by performed_at descending)
        alerts.sort(
            key=lambda a: a.performed_at.timestamp() if a.performed_at else 0.0,
            reverse=True
        )

        return TestQualityMetricsResponse(
            total_tests=total,
            completed_tests=completed,
            in_progress_tests=in_progress,
            requested_tests=requested,
            cancelled_tests=cancelled,
            pass_rate_pct=pass_rate,
            contamination_rate_pct=contam_rate,
            quarantined_samples_count=quarantined_count,
            avg_turnaround_hours=avg_tat,
            test_type_breakdown=breakdown_items,
            recent_qc_alerts=alerts[:10]
        )


