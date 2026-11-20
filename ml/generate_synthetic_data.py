"""
Synthetic Sample Dataset Generator
==================================
Generates realistic, domain-plausible synthetic training data for training
the Random Forest sample handling and integrity risk model.
Uses a fixed random seed for strict scientific reproducibility.

Output:
    ml/artifacts/synthetic_sample_risk_dataset.csv
"""

import os
from pathlib import Path
import numpy as np
import pandas as pd

BASE_DIR = Path(__file__).resolve().parent.parent
OUTPUT_DIR = BASE_DIR / "ml" / "artifacts"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_FILE = OUTPUT_DIR / "synthetic_sample_risk_dataset.csv"

SEED = 42
N_SAMPLES = 2500


def generate_synthetic_dataset(n_samples: int = N_SAMPLES, seed: int = SEED) -> pd.DataFrame:
    np.random.seed(seed)

    sample_types = ["ARCH-BONE", "BONE-PWD", "DNA-EXT", "RNA-EXT", "TISSUE", "BLOOD-WHL", "MICROBIAL"]
    type_probs = [0.20, 0.15, 0.25, 0.10, 0.15, 0.10, 0.05]

    data = []
    for i in range(1, n_samples + 1):
        st = np.random.choice(sample_types, p=type_probs)
        is_ancient = (st in ["ARCH-BONE", "BONE-PWD"])

        if is_ancient:
            age_years = int(np.random.exponential(scale=3500) + 500)
            preservation = np.random.choice(["Pristine", "Moderate", "Poor", "Severely_Degraded"], p=[0.15, 0.45, 0.30, 0.10])
            storage_temp = np.random.choice([-80.0, -20.0, 4.0], p=[0.20, 0.70, 0.10])
        else:
            age_years = 0
            preservation = "Unknown"
            if st in ["DNA-EXT", "RNA-EXT"]:
                storage_temp = np.random.choice([-80.0, -20.0], p=[0.75, 0.25])
            else:
                storage_temp = np.random.choice([-80.0, -20.0, 4.0], p=[0.30, 0.40, 0.30])

        storage_days = float(np.random.gamma(shape=2.5, scale=60.0))
        tests_count = int(np.random.poisson(lam=2.0))
        failed_tests = int(np.random.binomial(n=tests_count, p=0.15)) if tests_count > 0 else 0

        incidents_count = int(np.random.choice([0, 1, 2, 3], p=[0.82, 0.13, 0.04, 0.01]))
        critical_incidents = int(np.random.binomial(n=incidents_count, p=0.30)) if incidents_count > 0 else 0

        restricted_risk = np.random.choice(["none", "low", "medium", "high"], p=[0.75, 0.12, 0.10, 0.03])

        # Transparent domain rule score to assign target class label
        risk_score = 0.0

        if st == "RNA-EXT" and storage_temp > -70.0:
            risk_score += 2.5
        if preservation in ["Poor", "Severely_Degraded"]:
            risk_score += 2.0
        if age_years > 3000:
            risk_score += 1.5
        if storage_days > 365:
            risk_score += 1.0
        if failed_tests > 0:
            risk_score += (failed_tests * 1.5)
        if critical_incidents > 0:
            risk_score += (critical_incidents * 3.0)
        elif incidents_count > 0:
            risk_score += 1.0
        if restricted_risk in ["medium", "high"]:
            risk_score += 1.0

        # Add mild Gaussian noise
        risk_score += np.random.normal(0, 0.5)

        if risk_score >= 4.0:
            target_risk = "high"
        elif risk_score >= 2.0:
            target_risk = "medium"
        else:
            target_risk = "low"

        data.append({
            "sample_code": f"SMP-SYN-{i:05d}",
            "sample_type_code": st,
            "estimated_age_years": age_years,
            "preservation_state": preservation,
            "storage_temp_min_c": storage_temp,
            "storage_duration_days": round(storage_days, 1),
            "total_tests_conducted": tests_count,
            "failed_tests_count": failed_tests,
            "total_incidents_logged": incidents_count,
            "critical_incidents_logged": critical_incidents,
            "restricted_risk_level": restricted_risk,
            "risk_label": target_risk,
        })

    df = pd.DataFrame(data)
    df.to_csv(OUTPUT_FILE, index=False)
    print(f"[+] Successfully generated {len(df)} synthetic records to {OUTPUT_FILE}")
    print("[*] Class distribution:")
    print(df["risk_label"].value_counts(normalize=True).round(3))
    return df


if __name__ == "__main__":
    generate_synthetic_dataset()
