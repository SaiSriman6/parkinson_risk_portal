"""
Parkinson's Disease MRI Inference Module
Handles image validation, preprocessing, model loading, and prediction.
"""

import io
import os
import json
import torch
import torch.nn as nn
from PIL import Image
import torchvision.transforms as transforms
import torchvision.models as models

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE_DIR, "mri_model.pt")
CONFIG_PATH = os.path.join(BASE_DIR, "mri_config.json")

# In-memory singleton cache
_MODEL_CACHE = None
_CONFIG_CACHE = None

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MIN_DIMENSION = 20
MAX_DIMENSION = 8000


def is_mri_model_configured() -> bool:
    """Checks whether the trained MRI model and config exist on disk."""
    return os.path.exists(MODEL_PATH) and os.path.exists(CONFIG_PATH)


def load_mri_model():
    """
    Loads and caches the trained MobileNetV2 MRI classification model.
    Reuses cached model on subsequent calls for high performance.
    """
    global _MODEL_CACHE, _CONFIG_CACHE

    if _MODEL_CACHE is not None and _CONFIG_CACHE is not None:
        return _MODEL_CACHE, _CONFIG_CACHE

    if not is_mri_model_configured():
        raise FileNotFoundError(
            "MRI analysis model is not configured. The model file 'mri_model.pt' or "
            "'mri_config.json' was not found. Please train the MRI model using train_mri_model.py."
        )

    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)

    # Reconstruct architecture matching training
    model = models.mobilenet_v2(weights=None)
    in_features = model.classifier[1].in_features
    model.classifier = nn.Sequential(
        nn.Dropout(p=0.3),
        nn.Linear(in_features, len(config.get("classes", ["Normal", "PD"])))
    )

    state_dict = torch.load(MODEL_PATH, map_location=torch.device("cpu"))
    model.load_state_dict(state_dict)
    model.eval()

    _MODEL_CACHE = model
    _CONFIG_CACHE = config
    return _MODEL_CACHE, _CONFIG_CACHE


def validate_and_preprocess_image(file_bytes: bytes, filename: str):
    """
    Validates file extension, file size, image readability, and dimensions.
    Applies identical preprocessing transforms used during training.
    """
    if not file_bytes or len(file_bytes) == 0:
        raise ValueError("Uploaded image file is empty (0 bytes).")

    if len(file_bytes) > MAX_FILE_SIZE_BYTES:
        raise ValueError(f"File size exceeds the 10 MB limit ({len(file_bytes) / (1024*1024):.2f} MB uploaded).")

    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Invalid file extension '{ext}'. Only PNG, JPG, JPEG, and WEBP image files are supported."
        )

    # Validate image readability using Pillow
    try:
        buffer = io.BytesIO(file_bytes)
        with Image.open(buffer) as img_check:
            img_check.verify()
    except Exception as e:
        raise ValueError(f"Uploaded file is corrupted or not a valid readable image: {str(e)}")

    # Open image for transformation
    buffer.seek(0)
    image = Image.open(buffer)
    width, height = image.size

    if width < MIN_DIMENSION or height < MIN_DIMENSION:
        raise ValueError(f"Image resolution too small ({width}x{height}). Minimum is {MIN_DIMENSION}x{MIN_DIMENSION} pixels.")
    if width > MAX_DIMENSION or height > MAX_DIMENSION:
        raise ValueError(f"Image resolution exceeds allowed limits ({width}x{height}). Maximum is {MAX_DIMENSION}x{MAX_DIMENSION} pixels.")

    # Convert to RGB (handles grayscale, RGBA, palette)
    image_rgb = image.convert("RGB")

    # Load preprocessing parameters from config if available
    norm_mean = [0.485, 0.456, 0.406]
    norm_std = [0.229, 0.224, 0.225]
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                cfg = json.load(f)
                norm_mean = cfg.get("norm_mean", norm_mean)
                norm_std = cfg.get("norm_std", norm_std)
        except Exception:
            pass

    transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=norm_mean, std=norm_std)
    ])

    tensor = transform(image_rgb).unsqueeze(0)  # Shape: [1, 3, 224, 224]

    metadata = {
        "filename": filename,
        "width": width,
        "height": height,
        "format": image.format or ext.lstrip(".").upper(),
        "fileSizeBytes": len(file_bytes)
    }

    return tensor, metadata


def predict_mri_image(file_bytes: bytes, filename: str) -> dict:
    """
    Executes MRI prediction on raw image bytes.
    Returns structured prediction outcome with confidence, probabilities, and metadata.
    """
    model, config = load_mri_model()
    tensor, metadata = validate_and_preprocess_image(file_bytes, filename)

    with torch.no_grad():
        logits = model(tensor)
        probs = torch.softmax(logits, dim=1)[0]

    prob_normal = float(probs[0].item())
    prob_pd = float(probs[1].item())

    pred_idx = int(torch.argmax(probs).item())
    idx_to_class = config.get("idx_to_class", {"0": "Normal", "1": "PD"})
    pred_class = idx_to_class.get(str(pred_idx), "Normal" if pred_idx == 0 else "PD")

    risk_mapping = config.get("risk_mapping", {"Normal": "Low", "PD": "High"})
    risk_level = risk_mapping.get(pred_class, "High" if pred_class == "PD" else "Low")

    # Primary confidence is probability of the predicted winning class
    winning_prob = prob_pd if pred_idx == 1 else prob_normal
    confidence = round(winning_prob * 100.0, 2)

    return {
        "label": pred_idx,
        "predictedClass": pred_class,
        "riskLevel": risk_level,
        "confidence": confidence,
        "pdProbability": round(prob_pd, 4),
        "normalProbability": round(prob_normal, 4),
        "modelVersion": config.get("modelVersion", "mri-mobilenetv2-v1.0.0"),
        "imageMetadata": metadata,
        "classProbabilities": {
            "Normal": round(prob_normal, 4),
            "PD": round(prob_pd, 4)
        },
        "disclaimer": (
            "This prediction is produced by an experimental machine learning model trained for "
            "academic research. It does NOT constitute a medical diagnosis or rule out Parkinson's "
            "disease. Clinical correlation by a licensed neurologist is required."
        )
    }
