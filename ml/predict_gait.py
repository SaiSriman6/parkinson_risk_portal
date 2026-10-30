"""
Parkinson's Gait Analysis & Inference Handler
----------------------------------------------
Coordinates feature extraction, model inference (when a validated model is configured),
and generation of transparent, non-fabricated gait assessment results.
"""

import os
import joblib
import numpy as np
from video_gait_pipeline import extract_gait_pipeline

MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
GAIT_MODEL_PATH = os.path.join(MODEL_DIR, "gait_model.pkl")
GAIT_CONFIG_PATH = os.path.join(MODEL_DIR, "gait_config.json")

_gait_model = None
_gait_config = None


def is_gait_model_configured() -> bool:
    """
    Checks if a trained gait classification model artifact exists on disk.
    """
    return os.path.exists(GAIT_MODEL_PATH)


def load_gait_model():
    """
    Loads trained gait model from disk if available.
    """
    global _gait_model, _gait_config
    if not is_gait_model_configured():
        return None, None

    if _gait_model is None:
        try:
            _gait_model = joblib.load(GAIT_MODEL_PATH)
            import json
            if os.path.exists(GAIT_CONFIG_PATH):
                with open(GAIT_CONFIG_PATH, "r") as f:
                    _gait_config = json.load(f)
            else:
                _gait_config = {"version": "gait-rf-v1.0.0"}
        except Exception as e:
            print(f"[WARNING] Failed to load gait model artifact: {e}")
            _gait_model = None
            _gait_config = None

    return _gait_model, _gait_config


def analyze_video_gait(video_path: str, filename: str) -> dict:
    """
    Executes end-to-end video gait analysis:
    1. Extracts pose landmarks and computes biomechanical gait parameters.
    2. Runs model inference ONLY IF a trained model is present.
    3. Returns honest metrics, limitations, and medical disclaimers.
    """
    # 1. Computer Vision & Biomechanics Pipeline
    pipeline_result = extract_gait_pipeline(video_path, filename)
    metrics = pipeline_result["gaitMetrics"]
    metadata = pipeline_result["metadata"]

    # 2. Check for Trained ML Model
    model, config = load_gait_model()

    if model is not None:
        # Build feature vector matching training feature order
        feature_order = config.get("feature_order", [
            "cadenceStepsPerMin",
            "meanStepTimeSec",
            "stepTimeStdSec",
            "strideVariabilityCvPercent",
            "overallSymmetryIndex",
            "leftKneeRomDeg",
            "rightKneeRomDeg"
        ])

        feat_vector = []
        for feat_name in feature_order:
            val = metrics.get(feat_name)
            feat_vector.append(val if val is not None else 0.0)

        X = np.array([feat_vector], dtype=np.float64)

        try:
            pred_label = int(model.predict(X)[0])
            if hasattr(model, "predict_proba"):
                probs = model.predict_proba(X)[0]
                pd_prob = float(probs[1]) if len(probs) > 1 else float(probs[0])
            else:
                pd_prob = float(pred_label)

            confidence_pct = round(pd_prob * 100.0, 1) if pred_label == 1 else round((1.0 - pd_prob) * 100.0, 1)

            if pd_prob >= 0.70:
                risk_level = "High"
            elif pd_prob >= 0.40:
                risk_level = "Medium"
            else:
                risk_level = "Low"

            prediction_block = {
                "available": True,
                "label": pred_label,
                "score": round(pd_prob, 4),
                "confidence": confidence_pct,
                "riskLevel": risk_level,
                "modelVersion": config.get("version", "gait-rf-v1.0.0"),
                "status": "Trained gait classifier inference completed."
            }
        except Exception as inf_err:
            print(f"[ERROR] Inference on gait model failed: {inf_err}")
            prediction_block = {
                "available": False,
                "label": None,
                "score": None,
                "confidence": None,
                "riskLevel": "Indeterminate",
                "modelVersion": None,
                "status": f"Inference execution error: {str(inf_err)}"
            }
    else:
        # No fabricated model: report transparent educational status
        prediction_block = {
            "available": False,
            "label": None,
            "score": None,
            "confidence": None,
            "riskLevel": "Indeterminate",
            "modelVersion": None,
            "status": "Experimental gait measurement only. A clinically validated Parkinson's gait classification model is not loaded on this server."
        }

    limitations = [
        "Biomechanical measurements (cadence, step times, joint ROM) are estimates derived from 2D monocular pose landmarks.",
        "Camera perspective, distance, tilt, clothing, and lens distortion can introduce variance into joint angles.",
        "Absolute walking speed (m/s) and step lengths require external camera calibration or depth sensors, which are unavailable in uncalibrated single-camera video.",
        "Elevated stride variability or asymmetry can arise from non-neurological factors including prior injuries, arthritis, or uneven walking surfaces.",
        "This tool is an educational research prototype and does NOT replace comprehensive neurological evaluation."
    ]

    disclaimer = (
        "Educational and Research Prototype Notice: This Video-Based Gait Analysis feature "
        "uses OpenCV and MediaPipe Pose to estimate human walking biomechanics. It is NOT a medical device, "
        "has not been cleared by regulatory health agencies, and cannot diagnose or rule out Parkinson's Disease. "
        "Any medical decisions must be made in consultation with a qualified neurologist or physician."
    )

    return {
        "success": True,
        "analysisType": "video_gait",
        "videoMetadata": metadata,
        "gaitAnalysis": metrics,
        "prediction": prediction_block,
        "limitations": limitations,
        "disclaimer": disclaimer
    }
