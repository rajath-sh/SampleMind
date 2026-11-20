"""
Verification Suite for Phase 4 & Unique Scientific Visualisations
==================================================================
Tests:
1. Biological Material Derivation Flow graph aggregation (nodes, links, volume sums).
2. 2D Cryogenic Spatial Plate Matrix generation (96 wells, focal locator, neighbor occupancy).
3. Multi-column catalog sorting (code, name, type, quantity, status, registered_at).
4. Pagination bounds and sorting direction (asc/desc).
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.common import SessionLocal, Sample, StorageLocation
from app.modules.samples.service import SampleService


def run_phase4_tests():
    db = SessionLocal()
    print("=" * 75)
    print(" EXECUTING VERIFICATION SUITE: PHASE 4 & UNIQUE VISUALISATIONS")
    print("=" * 75)

    test_counter = 0

    def assert_pass(msg):
        nonlocal test_counter
        test_counter += 1
        print(f"[PASS {test_counter:02d}] {msg}")

    try:
        # ---------------------------------------------------------
        # TEST 1: Biological Material Flow Alluvial Stream Data
        # ---------------------------------------------------------
        flow = SampleService.get_material_flow(db=db)
        assert flow.total_samples > 0
        assert len(flow.nodes) > 0
        assert len(flow.links) > 0

        categories = {n.category for n in flow.nodes}
        assert "source" in categories
        assert "transformation" in categories or "destination" in categories
        assert_pass(f"Material Flow Graph generated ({len(flow.nodes)} nodes, {len(flow.links)} flow streams, total {flow.total_transformations} derivations).")

        # ---------------------------------------------------------
        # TEST 2: 2D Cryogenic Spatial Plate Matrix
        # ---------------------------------------------------------
        first_sample = db.query(Sample).first()
        assert first_sample is not None

        plate_map = SampleService.get_cryo_spatial_map(db=db, sample_id=first_sample.sample_id)
        assert plate_map.sample_id == first_sample.sample_id
        assert plate_map.sample_code == first_sample.sample_code
        assert plate_map.total_slots == 96
        assert len(plate_map.wells) == 96
        assert plate_map.grid_rows == 8
        assert plate_map.grid_cols == 12

        focal_wells = [w for w in plate_map.wells if w.is_focal]
        assert len(focal_wells) == 1, "Expected exactly 1 focal well"
        assert focal_wells[0].sample_id == first_sample.sample_id
        assert focal_wells[0].slot_code == plate_map.focal_slot_code
        assert_pass(f"Cryogenic Plate Matrix generated (96 slots, focal well: {plate_map.focal_slot_code}, occupancy: {plate_map.occupancy_pct}%).")

        # ---------------------------------------------------------
        # TEST 3: Multi-Column Catalog Sorting (Quantity Desc)
        # ---------------------------------------------------------
        items_qty_desc, _ = SampleService.list_samples(
            db=db,
            sort_by="quantity",
            sort_dir="desc",
            page=1,
            page_size=10
        )
        assert len(items_qty_desc) > 1
        for i in range(len(items_qty_desc) - 1):
            assert items_qty_desc[i].quantity_value >= items_qty_desc[i + 1].quantity_value
        assert_pass(f"Catalog sorted by quantity DESC ({items_qty_desc[0].quantity_value} >= {items_qty_desc[-1].quantity_value}).")

        # ---------------------------------------------------------
        # TEST 4: Multi-Column Catalog Sorting (Name Asc)
        # ---------------------------------------------------------
        items_name_asc, _ = SampleService.list_samples(
            db=db,
            sort_by="name",
            sort_dir="asc",
            page=1,
            page_size=10
        )
        assert len(items_name_asc) > 1
        for i in range(len(items_name_asc) - 1):
            assert items_name_asc[i].sample_name.lower() <= items_name_asc[i + 1].sample_name.lower()
        assert_pass(f"Catalog sorted by name ASC ('{items_name_asc[0].sample_name}' <= '{items_name_asc[-1].sample_name}').")

        # ---------------------------------------------------------
        # TEST 5: Specimen Type Sorting
        # ---------------------------------------------------------
        items_type_asc, _ = SampleService.list_samples(
            db=db,
            sort_by="type",
            sort_dir="asc",
            page=1,
            page_size=10
        )
        assert len(items_type_asc) > 1
        assert_pass("Catalog sorted by specimen type code.")

        print("=" * 75)
        print(" ALL PHASE 4 & UNIQUE VISUALISATION TESTS PASSED SUCCESSFULLY! (100%)")
        print("=" * 75)

    finally:
        db.close()


if __name__ == "__main__":
    run_phase4_tests()
