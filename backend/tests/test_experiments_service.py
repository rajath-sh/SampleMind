"""
Comprehensive Rigorous Test Suite for Module 6: Experiments Service Layer (Step 6A)
====================================================================================
Tests research experiment creation, cohort attachment, equipment reservations,
result generation, and formal verification locking.
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from app.common import SessionLocal, DuplicateEntityException, EntityNotFoundException
from app.modules.experiments.service import ExperimentService
from app.modules.experiments.schemas import (
    ExperimentCreateRequest,
    ExperimentUpdateRequest,
    ExperimentSampleInput,
    ExperimentSampleAttachRequest,
    ResultCreateRequest,
    ResultVerifyRequest,
)


def run_all_tests():
    print("=" * 65)
    print(" Executing Rigorous Test Suite for Module 6: Experiments Service")
    print("=" * 65)

    db = SessionLocal()

    try:
        exp_code = f"EXP-{uuid.uuid4().hex[:6].upper()}"

        # 1. Create experiment with sample 1 and equipment 1
        created_exp = ExperimentService.create_experiment(
            db=db,
            req=ExperimentCreateRequest(
                experiment_code=exp_code,
                experiment_name="High-Throughput Ancient Genome Sequencing Protocol",
                objective="Reconstruct 30x coverage whole genome from Indus Valley specimen",
                protocol_reference="SOP-NGS-2026-v2.1",
                lead_researcher_id=1,
                status="planned",
                samples=[
                    ExperimentSampleInput(
                        sample_id=1,
                        usage_role="input",
                        quantity_used=15.0,
                        quantity_unit="mg",
                        notes="Primary fossil powder input"
                    )
                ],
                equipment_ids=[1]
            ),
            actor_id=1
        )
        assert created_exp.experiment_id is not None
        assert created_exp.experiment_code == exp_code
        assert len(created_exp.samples) == 1
        assert len(created_exp.equipment) == 1
        exp_id = created_exp.experiment_id
        print(f"[PASS] Test 01: Created experiment {exp_code} (ID: {exp_id}) with cohort & equipment.")

        # 2. Duplicate experiment code rejected
        try:
            ExperimentService.create_experiment(
                db=db,
                req=ExperimentCreateRequest(
                    experiment_code=exp_code,
                    experiment_name="Duplicate Experiment"
                ),
                actor_id=1
            )
            assert False, "Expected DuplicateEntityException"
        except DuplicateEntityException:
            print("[PASS] Test 02: Duplicate experiment code rejected with DuplicateEntityException.")

        # 3. Retrieve experiment detail
        detail = ExperimentService.get_experiment_by_id(db=db, experiment_id=exp_id)
        assert detail.experiment_code == exp_code
        assert detail.samples[0].sample_id == 1
        print(f"[PASS] Test 03: Retrieved experiment detail: {len(detail.samples)} samples, {len(detail.equipment)} instruments.")

        # 4. Update experiment to 'active'
        updated = ExperimentService.update_experiment(
            db=db,
            experiment_id=exp_id,
            req=ExperimentUpdateRequest(
                status="active",
                objective="Updated objective with sequencing parameters"
            ),
            actor_id=1
        )
        assert updated.status == "active"
        print(f"[PASS] Test 04: Updated experiment status to 'active'.")

        # 5. Attach another sample to cohort
        attached = ExperimentService.attach_sample(
            db=db,
            experiment_id=exp_id,
            req=ExperimentSampleAttachRequest(
                sample_id=2,
                usage_role="control",
                quantity_used=5.0,
                quantity_unit="mg",
                notes="Negative extraction control"
            ),
            actor_id=1
        )
        assert attached is True

        # Verify sample count is now 2
        detail2 = ExperimentService.get_experiment_by_id(db=db, experiment_id=exp_id)
        assert len(detail2.samples) == 2
        print(f"[PASS] Test 05: Attached control specimen to cohort (Cohort size: {len(detail2.samples)}).")

        # 6. Record experimental result
        res_code = f"RES-{uuid.uuid4().hex[:6].upper()}"
        res1 = ExperimentService.create_result(
            db=db,
            experiment_id=exp_id,
            req=ResultCreateRequest(
                result_code=res_code,
                result_title="Endogenous DNA Alignment Fraction & Mean Read Length",
                observation="Paired-end NovaSeq 6000 sequencing reads trimmed with fastp",
                result_value=42.6,
                result_unit="%",
                interpretation="High endogenous DNA content (>40%) suitable for deep population genomics",
                is_final=False
            ),
            actor_id=1
        )
        assert res1.experiment_result_id is not None
        assert res1.result_code == res_code
        assert res1.result_value == 42.6
        assert res1.is_final is False
        res_id = res1.experiment_result_id
        print(f"[PASS] Test 06: Recorded experimental result {res_code} (Value: 42.6 %).")

        # 7. Duplicate result code rejected
        try:
            ExperimentService.create_result(
                db=db,
                experiment_id=exp_id,
                req=ResultCreateRequest(
                    result_code=res_code,
                    result_title="Duplicate Result"
                ),
                actor_id=1
            )
            assert False, "Expected DuplicateEntityException for duplicate result"
        except DuplicateEntityException:
            print("[PASS] Test 07: Duplicate result code rejected with DuplicateEntityException.")

        # 8. Verify and finalize result
        verified = ExperimentService.verify_result(
            db=db,
            result_id=res_id,
            req=ResultVerifyRequest(
                is_final=True,
                verification_notes="Lead bioinformatician review complete; deamination curves show classic C-to-T ancient DNA damage"
            ),
            actor_id=1
        )
        assert verified.is_final is True
        assert "damage" in verified.observation
        print(f"[PASS] Test 08: Verified and locked experimental result (is_final=True).")

        # 9. List experiments with counts
        exp_list, total_exp = ExperimentService.list_experiments(db=db, status="active")
        assert total_exp >= 1
        target_exp_item = next(e for e in exp_list if e.experiment_id == exp_id)
        assert target_exp_item.sample_count == 2
        assert target_exp_item.result_count == 1
        print(f"[PASS] Test 09: List experiments verified: {total_exp} active projects (Target samples: {target_exp_item.sample_count}, results: {target_exp_item.result_count}).")

        # 10. List global results
        all_res, total_res = ExperimentService.list_results(db=db, experiment_id=exp_id)
        assert total_res == 1
        assert all_res[0].result_code == res_code
        print(f"[PASS] Test 10: List results verified: {total_res} result linked to experiment {exp_code}.")

        print("=" * 65)
        print(" [ALL 10 MODULE 6 EXPERIMENTS SERVICE TESTS PASSED 100%!] ")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_all_tests()
