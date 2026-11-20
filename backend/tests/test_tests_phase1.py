"""
Comprehensive Rigorous Verification Suite for Tests Module: Phase 1 Data-Integrity Hardening
============================================================================================
Verifies all 10 Phase 1 invariants:
1. Rejection of assay scheduling on DISPOSED and MISSING specimens.
2. Rejection of destructive assay on DEPLETED specimen, non-destructive allowed.
3. Quarantine guardrail: experimental assay blocked; diagnostic screening permitted.
4. Defensive duplicate active assay rejection (409 Conflict).
5. Chronological integrity: future performed_at and performed_at < requested_at rejected.
6. Mandatory cancellation justification.
7. Rejection of negative numerical readings for positive-bounded units.
8. Physical stock overdraft rejection (409 Conflict).
9. Atomic stock deduction & double-entry quantity ledger entry.
10. Automated QC failure quarantine propagation.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import desc
from app.common import (
    SessionLocal,
    Sample,
    SampleTest,
    SampleQuantityTransaction,
    AuditLog,
    SampleStatus,
    TestStatus,
    SampleMindException,
    EntityNotFoundException,
)
from app.modules.tests.service import TestService
from app.modules.tests.schemas import TestCreateRequest, TestUpdateRequest


def get_err_code(exc: SampleMindException) -> str:
    if isinstance(exc.detail, dict):
        return exc.detail.get("code", "")
    return ""


def run_all_tests():
    print("=" * 75)
    print(" EXECUTING RIGOROUS VERIFICATION SUITE: TESTS PHASE 1 CORRECTNESS")
    print("=" * 75)

    db = SessionLocal()
    created_samples = []

    try:
        # Helper to create specimen
        def make_sample(status="IN_STORAGE", qty=50.0, unit="mg"):
            code = f"SMP-QC-{uuid.uuid4().hex[:6].upper()}"
            s = Sample(
                sample_code=code,
                sample_name=f"Phase 1 QC Specimen {code}",
                sample_type_id=1,
                quantity_value=qty,
                quantity_unit=unit,
                sample_status=status
            )
            db.add(s)
            db.commit()
            db.refresh(s)
            created_samples.append(s)
            return s

        # =========================================================================
        # [TEST 01] Rejection of assay scheduling on DISPOSED and MISSING specimens
        # =========================================================================
        s_disposed = make_sample(status=SampleStatus.DISPOSED.value)
        s_missing = make_sample(status=SampleStatus.MISSING.value)

        for s in [s_disposed, s_missing]:
            try:
                TestService.create_test(
                    db=db,
                    req=TestCreateRequest(
                        sample_id=s.sample_id,
                        test_type="Qubit 4 Fluorometer dsDNA High Sensitivity"
                    )
                )
                assert False, f"Expected 400 for {s.sample_status} sample"
            except SampleMindException as exc:
                assert exc.status_code == 400
                assert get_err_code(exc) == "INVALID_SAMPLE_STATUS"

        print("[PASS 01] Rejection of assay scheduling on DISPOSED and MISSING specimens.")

        # =========================================================================
        # [TEST 02] Rejection of destructive assay on DEPLETED specimen
        # =========================================================================
        s_depleted = make_sample(status=SampleStatus.DEPLETED.value, qty=0.0)

        # Destructive assay (consumes 5.0 mg) -> Rejected
        try:
            TestService.create_test(
                db=db,
                req=TestCreateRequest(
                    sample_id=s_depleted.sample_id,
                    test_type="Mass Spectrometry",
                    quantity_consumed=5.0
                )
            )
            assert False, "Expected 400 for destructive test on depleted specimen"
        except SampleMindException as exc:
            assert exc.status_code == 400
            assert get_err_code(exc) == "SPECIMEN_DEPLETED"

        # Non-destructive optical inspection (consumes 0.0 mg) -> Allowed
        test_nd = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_depleted.sample_id,
                test_type="Optical Visual Microscopic Examination",
                quantity_consumed=0.0,
                test_status="requested"
            )
        )
        assert test_nd.sample_test_id is not None
        print("[PASS 02] Rejection of destructive assay on DEPLETED specimen; non-destructive permitted.")

        # =========================================================================
        # [TEST 03] Quarantine guardrail: non-screening assay blocked; diagnostic allowed
        # =========================================================================
        s_quar = make_sample(status=SampleStatus.QUARANTINED.value)

        # Experimental assay -> Rejected
        try:
            TestService.create_test(
                db=db,
                req=TestCreateRequest(
                    sample_id=s_quar.sample_id,
                    test_type="High-Throughput NextSeq Whole Genome Sequencing"
                )
            )
            assert False, "Expected 400 for non-screening test on quarantined specimen"
        except SampleMindException as exc:
            assert exc.status_code == 400
            assert get_err_code(exc) == "QUARANTINE_LOCKED"

        # Contamination / Diagnostic screening assay -> Allowed
        test_screen = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_quar.sample_id,
                test_type="qPCR 16S Environmental Bacterial Contamination Screen",
                test_status="requested"
            )
        )
        assert test_screen.sample_test_id is not None
        print("[PASS 03] Quarantine guardrails: experimental assay blocked; contamination screening allowed.")

        # =========================================================================
        # [TEST 04] Defensive duplicate active assay rejection (409 Conflict)
        # =========================================================================
        s_normal = make_sample(status=SampleStatus.IN_STORAGE.value, qty=80.0)

        # Schedule first assay
        t_first = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_normal.sample_id,
                test_type="TapeStation 4200 DIN Integrity Score",
                test_status="requested"
            )
        )
        assert t_first.sample_test_id is not None

        # Schedule identical assay while first is active -> Rejected with 409
        try:
            TestService.create_test(
                db=db,
                req=TestCreateRequest(
                    sample_id=s_normal.sample_id,
                    test_type="tapestation 4200 din integrity score",
                    test_status="in_progress"
                )
            )
            assert False, "Expected 409 for duplicate active assay"
        except SampleMindException as exc:
            assert exc.status_code == 409
            assert get_err_code(exc) == "DUPLICATE_ACTIVE_ASSAY"

        print("[PASS 04] Defensive duplicate active assay rejection verified (409 Conflict).")

        # =========================================================================
        # [TEST 05] Chronological integrity: future and backwards timestamps rejected
        # =========================================================================
        now = datetime.now(timezone.utc)

        # Future performed_at -> Rejected
        try:
            TestService.create_test(
                db=db,
                req=TestCreateRequest(
                    sample_id=s_normal.sample_id,
                    test_type="Agilent 2100 Fragment Sizing",
                    performed_at=now + timedelta(days=2)
                )
            )
            assert False, "Expected 400 for future performed_at"
        except SampleMindException as exc:
            assert exc.status_code == 400
            assert get_err_code(exc) == "FUTURE_DATE_INVALID"

        # performed_at < requested_at -> Rejected
        try:
            TestService.create_test(
                db=db,
                req=TestCreateRequest(
                    sample_id=s_normal.sample_id,
                    test_type="Agilent 2100 Fragment Sizing",
                    requested_at=now,
                    performed_at=now - timedelta(hours=3)
                )
            )
            assert False, "Expected 400 for performed_at preceding requested_at"
        except SampleMindException as exc:
            assert exc.status_code == 400
            assert get_err_code(exc) == "INVALID_CHRONOLOGY"

        print("[PASS 05] Chronological temporal invariants verified (future & backwards timestamps rejected).")

        # =========================================================================
        # [TEST 06] Mandatory cancellation justification
        # =========================================================================
        t_to_cancel = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_normal.sample_id,
                test_type="Fluorometric Quantification Run #2",
                test_status="requested"
            )
        )

        # Cancel without reason -> Rejected
        try:
            TestService.update_test(
                db=db,
                test_id=t_to_cancel.sample_test_id,
                req=TestUpdateRequest(
                    test_status="cancelled",
                    observation=""
                )
            )
            assert False, "Expected 400 for cancellation without justification"
        except SampleMindException as exc:
            assert exc.status_code == 400
            assert get_err_code(exc) == "CANCELLATION_REASON_REQUIRED"

        # Cancel with explicit justification -> Accepted
        t_cancelled = TestService.update_test(
            db=db,
            test_id=t_to_cancel.sample_test_id,
            req=TestUpdateRequest(
                test_status="cancelled",
                cancellation_reason="Assay aborted: reagent lot expired and fluorometer calibration overdue."
            )
        )
        assert t_cancelled.test_status == "cancelled"
        print("[PASS 06] Mandatory cancellation justification enforced.")

        # =========================================================================
        # [TEST 07] Rejection of negative numerical readings for positive units
        # =========================================================================
        try:
            TestService.create_test(
                db=db,
                req=TestCreateRequest(
                    sample_id=s_normal.sample_id,
                    test_type="Qubit Fluorometer dsDNA",
                    result_value=-12.5,
                    result_unit="ng/uL"
                )
            )
            assert False, "Expected 400 for negative concentration reading"
        except SampleMindException as exc:
            assert exc.status_code == 400
            assert get_err_code(exc) == "NEGATIVE_VALUE_INVALID"

        print("[PASS 07] Rejection of negative outcome readings for positive-bounded units (e.g. ng/uL).")

        # =========================================================================
        # [TEST 08] Physical stock overdraft rejection (409 Conflict)
        # =========================================================================
        s_limited = make_sample(status=SampleStatus.IN_STORAGE.value, qty=15.0, unit="mg")

        # Request 25.0 mg consumption when only 15.0 mg is in stock -> Rejected 409
        try:
            TestService.create_test(
                db=db,
                req=TestCreateRequest(
                    sample_id=s_limited.sample_id,
                    test_type="Radiocarbon 14C AMS Dating",
                    quantity_consumed=25.0
                )
            )
            assert False, "Expected 409 for consumption exceeding available stock"
        except SampleMindException as exc:
            assert exc.status_code == 409
            assert get_err_code(exc) == "STOCK_OVERDRAFT"

        print("[PASS 08] Physical stock overdraft rejected (409 Conflict).")

        # =========================================================================
        # [TEST 09] Atomic stock deduction & double-entry quantity ledger entry
        # =========================================================================
        # Consume 10.0 mg from 15.0 mg available stock
        t_consumed = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_limited.sample_id,
                test_type="Radiocarbon 14C AMS Dating",
                quantity_consumed=10.0,
                test_status="completed",
                result_value=4820.0,
                result_unit="years BP",
                result_interpretation="OPTIMAL"
            ),
            actor_id=1
        )
        db.refresh(s_limited)
        assert s_limited.quantity_value == 5.0  # 15.0 - 10.0 = 5.0 mg
        assert t_consumed.sample_remaining_quantity == 5.0

        # Verify ledger transaction entry in SampleQuantityTransaction
        tx = db.query(SampleQuantityTransaction).filter(
            SampleQuantityTransaction.sample_id == s_limited.sample_id,
            SampleQuantityTransaction.transaction_type == "USAGE"
        ).order_by(desc(SampleQuantityTransaction.created_at)).first()
        assert tx is not None
        assert float(tx.quantity_delta) == -10.0
        assert float(tx.balance_after) == 5.0
        print("[PASS 09] Atomic stock deduction (15.0 -> 5.0 mg) and double-entry quantity ledger verified.")

        # =========================================================================
        # [TEST 10] Automated QC failure quarantine propagation
        # =========================================================================
        s_to_fail = make_sample(status=SampleStatus.IN_STORAGE.value, qty=30.0)

        # Complete QC test with CONTAMINATED result
        t_fail = TestService.create_test(
            db=db,
            req=TestCreateRequest(
                sample_id=s_to_fail.sample_id,
                test_type="Mycoplasma & Endogenous Contamination Screen",
                test_status="completed",
                result_value=1420.0,
                result_unit="copies/uL",
                result_interpretation="CONTAMINATED",
                auto_quarantine_on_failure=True
            ),
            actor_id=1
        )
        db.refresh(s_to_fail)
        assert s_to_fail.sample_status == SampleStatus.QUARANTINED.value
        assert t_fail.sample_quarantined_by_test is True

        # Verify audit log entry for quarantine event
        audit = db.query(AuditLog).filter(
            AuditLog.entity_id == s_to_fail.sample_id,
            AuditLog.action == "AUTO_QUARANTINE_QC_FAILURE"
        ).first()
        assert audit is not None
        assert audit.details["result_interpretation"] == "CONTAMINATED"
        print("[PASS 10] Automated QC failure quarantine propagation verified with audit trail.")

        print("=" * 75)
        print(" [ALL 10 PHASE 1 TESTS PASSED WITH 100% SUCCESS!] ")
        print("=" * 75)

    finally:
        # Cleanup created test specimens and tests
        for s in created_samples:
            db.query(SampleTest).filter(SampleTest.sample_id == s.sample_id).delete()
            db.query(SampleQuantityTransaction).filter(SampleQuantityTransaction.sample_id == s.sample_id).delete()
            db.query(AuditLog).filter(AuditLog.entity_id == s.sample_id, AuditLog.entity_type == "Sample").delete()
            db.query(Sample).filter(Sample.sample_id == s.sample_id).delete()
        db.commit()
        db.close()


if __name__ == "__main__":
    run_all_tests()
