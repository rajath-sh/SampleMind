"""
Random Forest Model Training Pipeline
=====================================
Trains the supervised Random Forest Classifier for sample integrity/handling risk
using scikit-learn Pipeline with automated imputation, encoding, and scaling.

Outputs:
    ml/artifacts/rf_sample_risk_model.joblib
    ml/artifacts/model_manifest.json
"""

import hashlib
import json
from pathlib import Path
import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.metrics import classification_report, confusion_matrix, f1_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from generate_synthetic_data import generate_synthetic_dataset, OUTPUT_FILE

BASE_DIR = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = BASE_DIR / "ml" / "artifacts"
MODEL_FILE = ARTIFACTS_DIR / "rf_sample_risk_model.joblib"
MANIFEST_FILE = ARTIFACTS_DIR / "model_manifest.json"

MODEL_VERSION = "rf-sample-risk-v1.1.0"
FEATURE_SCHEMA_VERSION = "v1.1"
SEED = 42


def train_and_evaluate():
    # 1. Load or generate training data
    if not OUTPUT_FILE.exists():
        print("[*] Generating synthetic training data...")
        df = generate_synthetic_dataset()
    else:
        df = pd.read_csv(OUTPUT_FILE)

    X = df.drop(columns=["sample_code", "risk_label"])
    y = df["risk_label"]

    categorical_cols = ["sample_type_code", "preservation_state", "restricted_risk_level"]
    numerical_cols = [
        "estimated_age_years", "storage_temp_min_c", "storage_duration_days",
        "total_tests_conducted", "failed_tests_count", "total_incidents_logged", "critical_incidents_logged"
    ]

    # 2. Preprocessing pipelines
    num_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    cat_pipeline = Pipeline([
        ("imputer", SimpleImputer(strategy="constant", fill_value="Unknown")),
        ("encoder", OneHotEncoder(handle_unknown="ignore")),
    ])

    preprocessor = ColumnTransformer(transformers=[
        ("num", num_pipeline, numerical_cols),
        ("cat", cat_pipeline, categorical_cols),
    ])

    # 3. Model Pipeline
    model = RandomForestClassifier(
        n_estimators=150,
        max_depth=12,
        min_samples_split=4,
        min_samples_leaf=2,
        class_weight="balanced",
        random_state=SEED
    )

    clf_pipeline = Pipeline([
        ("preprocessor", preprocessor),
        ("classifier", model)
    ])

    # 4. Stratified Train / Test Split
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=SEED, stratify=y
    )

    print(f"[*] Training Random Forest on {len(X_train)} samples...")
    clf_pipeline.fit(X_train, y_train)

    # 5. Evaluation
    y_pred = clf_pipeline.predict(X_test)
    macro_f1 = float(f1_score(y_test, y_pred, average="macro"))
    report = classification_report(y_test, y_pred, output_dict=True)
    matrix = confusion_matrix(y_test, y_pred, labels=["low", "medium", "high"]).tolist()

    print("[+] Model Evaluation Report:")
    print(classification_report(y_test, y_pred))
    print("[*] Confusion Matrix (Rows: true, Cols: pred):", matrix)

    # 6. Save Model Artifact
    joblib.dump(clf_pipeline, MODEL_FILE)
    print(f"[+] Model saved to {MODEL_FILE}")

    # 7. Save Model Manifest
    manifest = {
        "model_name": "RandomForestClassifier",
        "dataset_kind": "synthetic",
        "dataset_sha256": hashlib.sha256(OUTPUT_FILE.read_bytes()).hexdigest(),
        "artifact_sha256": hashlib.sha256(MODEL_FILE.read_bytes()).hexdigest(),
        "seed": SEED,
        "model_version": MODEL_VERSION,
        "feature_schema_version": FEATURE_SCHEMA_VERSION,
        "features": {
            "numerical": numerical_cols,
            "categorical": categorical_cols
        },
        "target_classes": ["low", "medium", "high"],
        "metrics": {
            "macro_f1": round(macro_f1, 4),
            "classification_report": report,
            "confusion_matrix": matrix
        },
        "training_samples": len(X_train),
        "test_samples": len(X_test)
    }

    with open(MANIFEST_FILE, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)
    print(f"[+] Manifest saved to {MANIFEST_FILE}")


if __name__ == "__main__":
    train_and_evaluate()
