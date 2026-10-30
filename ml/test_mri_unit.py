"""
Unit and Integration Tests for MRI Image Analysis Module
Tests image validation, error handling, preprocessing, model inference, and metadata formatting.
"""

import os
import sys
import io
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from predict_mri import (
    is_mri_model_configured,
    load_mri_model,
    validate_and_preprocess_image,
    predict_mri_image,
    ALLOWED_EXTENSIONS,
    MAX_FILE_SIZE_BYTES,
    MIN_DIMENSION
)


def test_model_configured():
    assert is_mri_model_configured() is True, "MRI model should be detected as configured."
    model, config = load_mri_model()
    assert model is not None, "Loaded model cannot be None."
    assert "classes" in config, "Config must contain 'classes' key."
    assert config["classes"] == ["Normal", "PD"], "Classes must be ['Normal', 'PD']."
    print(" [PASS] test_model_configured")


def test_invalid_extension():
    try:
        validate_and_preprocess_image(b"fake data", "test.txt")
        assert False, "Should have raised ValueError for .txt"
    except ValueError as e:
        assert "invalid file extension" in str(e).lower()
    print(" [PASS] test_invalid_extension")


def test_empty_file():
    try:
        validate_and_preprocess_image(b"", "empty.png")
        assert False, "Should have raised ValueError for empty file"
    except ValueError as e:
        assert "empty" in str(e).lower()
    print(" [PASS] test_empty_file")


def test_corrupt_image():
    try:
        validate_and_preprocess_image(b"not a valid image content at all", "corrupt.jpg")
        assert False, "Should have raised ValueError for corrupt image"
    except ValueError as e:
        assert "corrupt" in str(e).lower() or "not a valid" in str(e).lower()
    print(" [PASS] test_corrupt_image")


def test_too_small_dimensions():
    # 10x10 is below MIN_DIMENSION (20)
    img = Image.new("RGB", (10, 10), (255, 0, 0))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    try:
        validate_and_preprocess_image(buf.getvalue(), "tiny.png")
        assert False, "Should have raised ValueError for tiny dimensions"
    except ValueError as e:
        assert "too small" in str(e).lower()
    print(" [PASS] test_too_small_dimensions")


def test_oversized_file():
    # Test boundary of file size limit
    fake_huge = b"0" * (MAX_FILE_SIZE_BYTES + 1024)
    try:
        validate_and_preprocess_image(fake_huge, "huge.png")
        assert False, "Should have raised ValueError for oversized file"
    except ValueError as e:
        assert "exceeds" in str(e).lower()
    print(" [PASS] test_oversized_file")


def test_synthetic_image_prediction():
    img = Image.new("RGB", (224, 224), (128, 128, 128))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    
    result = predict_mri_image(buf.getvalue(), "synthetic_brain.png")
    
    assert "label" in result
    assert result["label"] in [0, 1]
    assert result["predictedClass"] in ["Normal", "PD"]
    assert result["riskLevel"] in ["Low", "High"]
    assert 0.0 <= result["confidence"] <= 100.0
    assert 0.0 <= result["pdProbability"] <= 1.0
    assert 0.0 <= result["normalProbability"] <= 1.0
    assert abs((result["pdProbability"] + result["normalProbability"]) - 1.0) < 0.01
    assert "modelVersion" in result
    assert "imageMetadata" in result
    assert result["imageMetadata"]["width"] == 224
    assert result["imageMetadata"]["height"] == 224
    assert "disclaimer" in result
    print(f" [PASS] test_synthetic_image_prediction -> {result['predictedClass']} ({result['confidence']}%)")


def test_real_dataset_images():
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data", "mri_dataset"))
    if not os.path.exists(data_dir):
        print(" [SKIP] real dataset images directory not found.")
        return

    # Test one Normal image
    normal_dir = os.path.join(data_dir, "Normal")
    if os.path.exists(normal_dir):
        samples = [f for f in os.listdir(normal_dir) if f.lower().endswith(('.png', '.jpg'))]
        if samples:
            path = os.path.join(normal_dir, samples[0])
            with open(path, "rb") as f:
                res = predict_mri_image(f.read(), samples[0])
            assert res["predictedClass"] in ["Normal", "PD"]
            print(f" [PASS] test_real_normal_sample ({samples[0]}) -> Predicted: {res['predictedClass']} (Normal Prob: {res['normalProbability']:.4f})")

    # Test one PD image
    pd_dir = os.path.join(data_dir, "PD")
    if os.path.exists(pd_dir):
        samples = [f for f in os.listdir(pd_dir) if f.lower().endswith(('.png', '.jpg'))]
        if samples:
            path = os.path.join(pd_dir, samples[0])
            with open(path, "rb") as f:
                res = predict_mri_image(f.read(), samples[0])
            assert res["predictedClass"] in ["Normal", "PD"]
            print(f" [PASS] test_real_pd_sample ({samples[0]}) -> Predicted: {res['predictedClass']} (PD Prob: {res['pdProbability']:.4f})")


def test_missing_model_behavior():
    import tempfile
    # Check that when model path does not exist, FileNotFoundError is cleanly raised
    from unittest.mock import patch
    with patch("predict_mri.MODEL_PATH", "/non/existent/path/model.pt"):
        with patch("predict_mri._MODEL_CACHE", None):
            try:
                load_mri_model()
                assert False, "Should raise FileNotFoundError when model is missing"
            except FileNotFoundError as e:
                assert "not configured" in str(e).lower()
    print(" [PASS] test_missing_model_behavior")


if __name__ == "__main__":
    print("=" * 60)
    print("RUNNING MRI MODULE UNIT AND INTEGRATION TESTS")
    print("=" * 60)

    test_model_configured()
    test_invalid_extension()
    test_empty_file()
    test_corrupt_image()
    test_too_small_dimensions()
    test_oversized_file()
    test_synthetic_image_prediction()
    test_real_dataset_images()
    test_missing_model_behavior()

    print("=" * 60)
    print("ALL MRI TESTS PASSED SUCCESSFULLY!")
    print("=" * 60)
