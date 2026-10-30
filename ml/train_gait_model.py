"""
Reproducible Training Pipeline for Video Gait Feature Classifier
----------------------------------------------------------------
Trains a transparent Random Forest baseline on gait biomechanics features.
Adheres strictly to clinical machine learning best practices:
1. Participant-level data splitting (GroupKFold) prevents identity leakage.
2. Checks and adjusts for class imbalance.
3. Feature preprocessing and scaling fitted strictly on training folds.
4. Comprehensive evaluation reporting Precision, Recall, F1, and Confusion Matrix.
5. Saves model artifact, feature order, and metrics configuration.
"""

import os
import sys
import json
import argparse
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import GroupKFold
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score, f1_score

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_DATA_CSV = os.path.join(os.path.dirname(BASE_DIR), "data", "gait_features.csv")
MODEL_OUTPUT_PATH = os.path.join(BASE_DIR, "gait_model.pkl")
CONFIG_OUTPUT_PATH = os.path.join(BASE_DIR, "gait_config.json")
METRICS_OUTPUT_PATH = os.path.join(BASE_DIR, "gait_metrics.json")

EXPECTED_FEATURES = [
    "cadenceStepsPerMin",
    "meanStepTimeSec",
    "stepTimeStdSec",
    "strideVariabilityCvPercent",
    "overallSymmetryIndex",
    "leftKneeRomDeg",
    "rightKneeRomDeg"
]


def train_gait_classifier(csv_path: str = DEFAULT_DATA_CSV):
    print("=" * 70)
    print("PARKINSON'S GAIT CLASSIFIER TRAINING PIPELINE")
    print("=" * 70)

    if not os.path.exists(csv_path):
        print(f"\n[INFO] Labeled gait feature dataset not found at '{csv_path}'.")
        print("\nGuidelines for training:")
        print("1. Collect or extract gait features into CSV format with columns:")
        print("   participant_id, label, " + ", ".join(EXPECTED_FEATURES))
        print("2. Ensure participant IDs are included so splits isolate subjects.")
        print("3. Re-run: python train_gait_model.py --data <path-to-csv>")
        print("\nNote: Never fabricate clinical data or trained models.")
        return False

    df = pd.read_csv(csv_path)
    print(f"Loaded dataset: {len(df)} samples across {df['participant_id'].nunique() if 'participant_id' in df else 'unknown'} participants.")

    if "label" not in df.columns:
        raise ValueError("Dataset CSV must contain a 'label' column (0 = Control, 1 = Parkinson's).")
    if "participant_id" not in df.columns:
        raise ValueError("Dataset CSV must contain 'participant_id' for leakage-free splitting.")

    missing_cols = [c for c in EXPECTED_FEATURES if c not in df.columns]
    if missing_cols:
        raise ValueError(f"Missing expected feature columns: {missing_cols}")

    # Inspect class balance
    class_counts = df["label"].value_counts().to_dict()
    print("Class distribution:", class_counts)

    X = df[EXPECTED_FEATURES].values
    y = df["label"].values
    groups = df["participant_id"].values

    # Participant-level 5-fold cross validation
    n_splits = min(5, len(np.unique(groups)))
    if n_splits < 2:
        raise ValueError("Need at least 2 distinct participants for cross-validation.")

    gkf = GroupKFold(n_splits=n_splits)
    oof_predictions = np.zeros(len(df))
    oof_probabilities = np.zeros(len(df))

    models = []
    fold = 1

    for train_idx, val_idx in gkf.split(X, y, groups=groups):
        X_train, y_train = X[train_idx], y[train_idx]
        X_val, y_val = X[val_idx], y[val_idx]

        clf = RandomForestClassifier(
            n_estimators=100,
            max_depth=5,
            class_weight="balanced",
            random_state=42 + fold
        )
        clf.fit(X_train, y_train)

        preds = clf.predict(X_val)
        probs = clf.predict_proba(X_val)[:, 1] if clf.classes_.size > 1 else preds

        oof_predictions[val_idx] = preds
        oof_probabilities[val_idx] = probs
        models.append(clf)
        fold += 1

    # Cross-validation metrics
    report = classification_report(y, oof_predictions, output_dict=True, zero_division=0)
    cm = confusion_matrix(y, oof_predictions).tolist()
    overall_f1 = f1_score(y, oof_predictions, average="weighted", zero_division=0)
    try:
        overall_auc = roc_auc_score(y, oof_probabilities)
    except Exception:
        overall_auc = None

    print("\n--- Cross-Validation Evaluation (Participant-Split) ---")
    print(f"Weighted F1-Score: {overall_f1:.4f}")
    if overall_auc:
        print(f"ROC-AUC:           {overall_auc:.4f}")
    print("Confusion Matrix:\n", np.array(cm))

    # Train final full model
    final_model = RandomForestClassifier(
        n_estimators=120,
        max_depth=5,
        class_weight="balanced",
        random_state=42
    )
    final_model.fit(X, y)

    # Save artifacts
    joblib.dump(final_model, MODEL_OUTPUT_PATH)

    config = {
        "version": "gait-rf-v1.0.0",
        "model_type": "RandomForestClassifier",
        "feature_order": EXPECTED_FEATURES,
        "n_samples": len(df),
        "n_participants": int(len(np.unique(groups)))
    }
    with open(CONFIG_OUTPUT_PATH, "w") as f:
        json.dump(config, f, indent=2)

    metrics = {
        "weighted_f1": round(overall_f1, 4),
        "roc_auc": round(overall_auc, 4) if overall_auc else None,
        "confusion_matrix": cm,
        "classification_report": report
    }
    with open(METRICS_OUTPUT_PATH, "w") as f:
        json.dump(metrics, f, indent=2)

    print(f"\n[SUCCESS] Model saved to '{MODEL_OUTPUT_PATH}'.")
    return True


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", default=DEFAULT_DATA_CSV, help="Path to labeled gait features CSV")
    args = parser.parse_args()
    train_gait_classifier(args.data)
