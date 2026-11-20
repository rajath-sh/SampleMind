"""
Unit & Service Tests for Module 7: Ancient Specimens & Archaeological Provenance (Step 7A)
"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import uuid
from app.common import (
    SessionLocal,
    DuplicateEntityException,
    EntityNotFoundException,
    Sample,
    SampleType,
    AppUser,
    AuditLog,
)
from app.modules.ancient.service import AncientService
from app.modules.ancient.schemas import (
    SiteCreateRequest,
    SiteUpdateRequest,
    AncientSpecimenCreate,
    AncientSpecimenUpdate,
)


def run_tests():
    db = SessionLocal()
    print("=" * 65)
    print(" Executing Step 7A Service Tests for Module 7: Ancient Provenance")
    print("=" * 65)

    try:
        # Get admin user and a sample type
        user = db.query(AppUser).first()
        assert user is not None, "Expected at least one seeded user"
        s_type = db.query(SampleType).first()
        assert s_type is not None, "Expected at least one sample type"

        # -------------------------------------------------------------
        # Test 1: List initial sites
        # -------------------------------------------------------------
        initial_sites = AncientService.list_sites(db)
        print(f"[PASS] Test 01: Listed {len(initial_sites)} initial archaeological sites.")

        # -------------------------------------------------------------
        # Test 2: Create new excavation site
        # -------------------------------------------------------------
        unique_code = f"SITE-{uuid.uuid4().hex[:6].upper()}"
        site_req = SiteCreateRequest(
            site_code=unique_code,
            site_name="Kurnool Paleolithic Caves",
            region="Andhra Pradesh",
            country="India",
            context_notes="Pleistocene ossiferous cave deposits with rich Pleistocene fauna.",
        )
        created_site = AncientService.create_site(db, site_req, actor_id=user.user_id)
        assert created_site.site_code == unique_code
        assert created_site.specimen_count == 0
        site_id = created_site.archaeological_site_id
        print(f"[PASS] Test 02: Created site {unique_code} (ID: {site_id}).")

        # -------------------------------------------------------------
        # Test 3: Duplicate site code rejection
        # -------------------------------------------------------------
        dup_raised = False
        try:
            AncientService.create_site(db, site_req, actor_id=user.user_id)
        except DuplicateEntityException:
            dup_raised = True
        assert dup_raised, "Expected DuplicateEntityException on duplicate site code"
        print(f"[PASS] Test 03: Duplicate site code correctly rejected (DuplicateEntityException).")

        # -------------------------------------------------------------
        # Test 4: Retrieve site detail
        # -------------------------------------------------------------
        retrieved_site = AncientService.get_site(db, site_id)
        assert retrieved_site.site_code == unique_code
        assert retrieved_site.country == "India"
        print(f"[PASS] Test 04: Retrieved site detail: {retrieved_site.site_name} in {retrieved_site.country}.")

        # -------------------------------------------------------------
        # Test 5: Update excavation site
        # -------------------------------------------------------------
        updated_site = AncientService.update_site(
            db,
            site_id,
            SiteUpdateRequest(region="Rayalaseema Region", context_notes="Updated stratigraphical survey"),
            actor_id=user.user_id
        )
        assert updated_site.region == "Rayalaseema Region"
        print(f"[PASS] Test 05: Updated site region to '{updated_site.region}'.")

        # -------------------------------------------------------------
        # Helper: Create dedicated test sample for ancient specimen
        # -------------------------------------------------------------
        test_sample = Sample(
            sample_code=f"S-ANC-{uuid.uuid4().hex[:6].upper()}",
            sample_name="Fossilized Ursus Bicuspid",
            sample_type_id=s_type.sample_type_id,
            quantity_value=100.0,
            quantity_unit="mg",
            sample_status="REGISTERED",
            created_by=user.user_id,
        )
        db.add(test_sample)
        db.commit()
        db.refresh(test_sample)

        # -------------------------------------------------------------
        # Test 6: Create ancient specimen profile
        # -------------------------------------------------------------
        spec_req = AncientSpecimenCreate(
            sample_id=test_sample.sample_id,
            archaeological_site_id=site_id,
            estimated_age_years=42000,
            age_uncertainty_years=1200,
            dating_method="14C Accelerator Mass Spectrometry",
            excavation_layer="Stratum IVc",
            depth_cm=310.5,
            preservation_state="calcified",
            context_reference="Trench A3-NE",
        )
        created_specimen = AncientService.create_ancient_specimen(db, spec_req, actor_id=user.user_id)
        assert created_specimen.sample_id == test_sample.sample_id
        assert created_specimen.estimated_age_years == 42000
        assert created_specimen.site_code == unique_code
        print(f"[PASS] Test 06: Attached ancient provenance to sample {test_sample.sample_code} (Age: 42,000 BP).")

        # -------------------------------------------------------------
        # Test 7: Duplicate ancient specimen rejection (1-to-1 extension)
        # -------------------------------------------------------------
        dup_spec_raised = False
        try:
            AncientService.create_ancient_specimen(db, spec_req, actor_id=user.user_id)
        except DuplicateEntityException:
            dup_spec_raised = True
        assert dup_spec_raised, "Expected DuplicateEntityException when specimen profile already exists"
        print(f"[PASS] Test 07: Duplicate ancient profile on same sample rejected.")

        # -------------------------------------------------------------
        # Test 8: Non-existent sample ID rejection
        # -------------------------------------------------------------
        bad_sample_raised = False
        try:
            AncientService.create_ancient_specimen(
                db,
                AncientSpecimenCreate(sample_id=999999, estimated_age_years=5000),
                actor_id=user.user_id
            )
        except EntityNotFoundException:
            bad_sample_raised = True
        assert bad_sample_raised, "Expected EntityNotFoundException on non-existent sample"
        print(f"[PASS] Test 08: Non-existent sample rejected with EntityNotFoundException.")

        # -------------------------------------------------------------
        # Test 9: Retrieve ancient specimen detail
        # -------------------------------------------------------------
        spec_detail = AncientService.get_ancient_specimen(db, test_sample.sample_id)
        assert spec_detail.sample_code == test_sample.sample_code
        assert spec_detail.dating_method == "14C Accelerator Mass Spectrometry"
        assert spec_detail.site_name == "Kurnool Paleolithic Caves"
        print(f"[PASS] Test 09: Retrieved dossier for {spec_detail.sample_code} at {spec_detail.site_name}.")

        # -------------------------------------------------------------
        # Test 10: Update ancient specimen attributes
        # -------------------------------------------------------------
        updated_spec = AncientService.update_ancient_specimen(
            db,
            test_sample.sample_id,
            AncientSpecimenUpdate(
                estimated_age_years=43500,
                depth_cm=325.0,
                preservation_state="heavily calcified"
            ),
            actor_id=user.user_id
        )
        assert updated_spec.estimated_age_years == 43500
        assert updated_spec.depth_cm == 325.0
        assert updated_spec.preservation_state == "heavily calcified"
        print(f"[PASS] Test 10: Updated ancient specimen age to 43,500 BP and depth to 325.0 cm.")

        # -------------------------------------------------------------
        # Test 11: List ancient specimens with filters
        # -------------------------------------------------------------
        filtered_specs = AncientService.list_ancient_specimens(
            db,
            site_id=site_id,
            min_age=40000,
            dating_method="Mass Spectrometry"
        )
        assert len(filtered_specs) >= 1
        assert any(s.sample_id == test_sample.sample_id for s in filtered_specs)
        print(f"[PASS] Test 11: Filtered query returned {len(filtered_specs)} specimen(s) matching age & method.")

        # -------------------------------------------------------------
        # Test 12: Audit trail verification
        # -------------------------------------------------------------
        audit = db.query(AuditLog).filter(
            AuditLog.entity_type == "AncientSpecimen",
            AuditLog.entity_id == test_sample.sample_id
        ).all()
        assert len(audit) >= 2, "Expected CREATE and UPDATE audit records"
        print(f"[PASS] Test 12: Audit log verified: {len(audit)} transactions recorded for AncientSpecimen.")

        print("=" * 65)
        print(" [ALL 12 STEP 7A SERVICE TESTS PASSED 100%!]")
        print("=" * 65)

    finally:
        db.close()


if __name__ == "__main__":
    run_tests()
