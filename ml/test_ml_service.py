import os
import sys
import numpy as np
import soundfile as sf
import tempfile
from fastapi.testclient import TestClient

try:
    import pytest
except ImportError:
    pytest = None

from app import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "parkinson-ml-service"
    assert "mriConfigured" in data

def test_invalid_file_extension():
    files = {"file": ("test.txt", b"invalid content", "text/plain")}
    response = client.post("/predict", files=files)
    assert response.status_code == 400
    assert "Invalid audio format" in response.json()["detail"]

def test_short_audio_rejection():
    # Create a 0.5s audio file
    sample_rate = 16000
    t = np.linspace(0, 0.5, int(sample_rate * 0.5))
    audio_data = 0.5 * np.sin(2 * np.pi * 440 * t)
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        sf.write(tmp.name, audio_data, sample_rate)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            response = client.post("/predict", files={"file": ("short.wav", f, "audio/wav")})
        assert response.status_code == 400
        assert "too short" in response.json()["detail"].lower()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

def test_valid_audio_prediction_and_xai():
    # Create a valid 3-second synthetic voice wave (440Hz tone with noise)
    sample_rate = 16000
    t = np.linspace(0, 3.0, int(sample_rate * 3.0))
    audio_data = 0.4 * np.sin(2 * np.pi * 220 * t) + 0.05 * np.random.normal(0, 1, len(t))
    
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        sf.write(tmp.name, audio_data, sample_rate)
        tmp_path = tmp.name

    try:
        with open(tmp_path, "rb") as f:
            response = client.post("/predict", files={"file": ("sample.wav", f, "audio/wav")})
        assert response.status_code == 200
        data = response.json()
        assert "label" in data
        assert "riskLevel" in data
        assert "confidence" in data
        assert "features" in data
        assert "globalFeatureImportances" in data
        assert "featureDeviations" in data
        assert "fo" in data["globalFeatureImportances"]
        assert "fo" in data["featureDeviations"]
        assert "zScore" in data["featureDeviations"]["fo"]
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

def test_mri_invalid_file_extension():
    files = {"file": ("report.pdf", b"dummy pdf content", "application/pdf")}
    response = client.post("/predict_mri", files=files)
    assert response.status_code in [400, 503]
    if response.status_code == 400:
        detail = response.json()["detail"].lower()
        assert "invalid file extension" in detail or "supported" in detail

def test_mri_empty_file():
    files = {"file": ("empty.png", b"", "image/png")}
    response = client.post("/predict_mri", files=files)
    assert response.status_code in [400, 503]
    if response.status_code == 400:
        assert "empty" in response.json()["detail"].lower()

def test_mri_corrupt_image():
    files = {"file": ("corrupt.png", b"this is not an image", "image/png")}
    response = client.post("/predict_mri", files=files)
    assert response.status_code in [400, 503]
    if response.status_code == 400:
        detail = response.json()["detail"].lower()
        assert "corrupt" in detail or "not a valid" in detail

def test_mri_valid_synthetic_image():
    from PIL import Image
    import io
    # Create valid synthetic 224x224 RGB image
    img = Image.new("RGB", (224, 224), color=(73, 109, 137))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    img_bytes = buf.getvalue()

    files = {"file": ("test_mri.png", img_bytes, "image/png")}
    response = client.post("/predict_mri", files=files)
    
    assert response.status_code == 200
    data = response.json()
    assert "label" in data
    assert "predictedClass" in data
    assert data["predictedClass"] in ["Normal", "PD"]
    assert "confidence" in data
    assert "riskLevel" in data
    assert data["riskLevel"] in ["Low", "High"]
    assert "pdProbability" in data
    assert "normalProbability" in data
    assert "imageMetadata" in data
    assert "disclaimer" in data
    assert "timeMs" in data

def test_mri_real_dataset_images():
    # Test on one real Normal and one real PD image from data directory if available
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "mri_dataset"))
    if not os.path.exists(data_dir):
        return

    normal_dir = os.path.join(data_dir, "Normal")
    if os.path.exists(normal_dir):
        files = [f for f in os.listdir(normal_dir) if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        if files:
            sample_path = os.path.join(normal_dir, files[0])
            with open(sample_path, "rb") as f:
                resp = client.post("/predict_mri", files={"file": (files[0], f.read(), "image/png")})
            assert resp.status_code == 200
            assert resp.json()["predictedClass"] in ["Normal", "PD"]

if __name__ == "__main__":
    tests = [
        test_health_check,
        test_invalid_file_extension,
        test_short_audio_rejection,
        test_valid_audio_prediction_and_xai,
        test_mri_invalid_file_extension,
        test_mri_empty_file,
        test_mri_corrupt_image,
        test_mri_valid_synthetic_image,
        test_mri_real_dataset_images
    ]
    print(f"Running {len(tests)} ML service tests...\n")
    passed = 0
    for t in tests:
        try:
            t()
            print(f" [PASS] {t.__name__}")
            passed += 1
        except Exception as e:
            print(f" [FAIL] {t.__name__}: {e}")
            import traceback
            traceback.print_exc()

    print(f"\nResult: {passed}/{len(tests)} tests passed.")
    sys.exit(0 if passed == len(tests) else 1)
