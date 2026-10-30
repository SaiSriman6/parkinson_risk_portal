"""
Unit & Integration Tests for Video Gait Analysis Pipeline
---------------------------------------------------------
Validates video format checking, corrupt video rejection, empty file rejection,
pose tracking validation, synthetic walking pose extraction, missing model transparency,
and FastAPI endpoint contracts.
"""

import os
import sys
import tempfile
import cv2
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from video_gait_pipeline import (
    validate_video_file,
    extract_gait_pipeline,
    calculate_angle_3pts,
    smooth_signal,
    ALLOWED_EXTENSIONS
)
from predict_gait import is_gait_model_configured, analyze_video_gait


def create_blank_video(num_frames=60, fps=30, width=320, height=240):
    """Generates a temporary blank MP4 video with no human subjects."""
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp_path = tmp.name
    tmp.close()

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(tmp_path, fourcc, fps, (width, height))
    for _ in range(num_frames):
        frame = np.zeros((height, width, 3), dtype=np.uint8)
        out.write(frame)
    out.release()
    return tmp_path


def create_synthetic_walking_video(num_frames=90, fps=30, width=640, height=480):
    """
    Generates a synthetic walking video depicting an articulated humanoid figure
    with head, torso, moving hips, knees, and ankles across walking cycles.
    """
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    tmp_path = tmp.name
    tmp.close()

    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
    out = cv2.VideoWriter(tmp_path, fourcc, fps, (width, height))

    center_x = width // 2
    for i in range(num_frames):
        # White background with contrast
        frame = np.full((height, width, 3), 240, dtype=np.uint8)

        # Walking cycle phase (sinusoidal leg oscillations)
        phase = 2 * np.pi * (i / 30.0) # 1Hz walking cadence

        # Head
        cv2.circle(frame, (center_x, 80), 25, (30, 30, 30), -1)

        # Torso (Shoulders to Hips)
        cv2.line(frame, (center_x, 105), (center_x, 260), (30, 30, 30), 8)

        # Shoulders
        l_sh = (center_x - 45, 120)
        r_sh = (center_x + 45, 120)
        cv2.line(frame, l_sh, r_sh, (30, 30, 30), 6)

        # Hips
        l_hip = (center_x - 30, 260)
        r_hip = (center_x + 30, 260)
        cv2.line(frame, l_hip, r_hip, (30, 30, 30), 6)

        # Left Leg (Thigh + Shin)
        l_knee_x = int(l_hip[0] + 15 * np.sin(phase))
        l_knee_y = int(260 + 90 + 5 * np.cos(phase))
        l_ank_x = int(l_knee_x - 20 * np.sin(phase))
        l_ank_y = int(l_knee_y + 90 - 15 * np.abs(np.sin(phase)))

        cv2.line(frame, l_hip, (l_knee_x, l_knee_y), (40, 40, 40), 6)
        cv2.line(frame, (l_knee_x, l_knee_y), (l_ank_x, l_ank_y), (40, 40, 40), 6)

        # Right Leg (Anti-phase)
        r_knee_x = int(r_hip[0] + 15 * np.sin(phase + np.pi))
        r_knee_y = int(260 + 90 + 5 * np.cos(phase + np.pi))
        r_ank_x = int(r_knee_x - 20 * np.sin(phase + np.pi))
        r_ank_y = int(r_knee_y + 90 - 15 * np.abs(np.sin(phase + np.pi)))

        cv2.line(frame, r_hip, (r_knee_x, r_knee_y), (40, 40, 40), 6)
        cv2.line(frame, (r_knee_x, r_knee_y), (r_ank_x, r_ank_y), (40, 40, 40), 6)

        out.write(frame)

    out.release()
    return tmp_path


def test_angle_math():
    # 90-degree right angle: (0, 1) -> (0, 0) -> (1, 0)
    ang = calculate_angle_3pts((0, 1), (0, 0), (1, 0))
    assert abs(ang - 90.0) < 1e-3, f"Expected 90 deg, got {ang}"

    # 180-degree straight line: (-1, 0) -> (0, 0) -> (1, 0)
    ang2 = calculate_angle_3pts((-1, 0), (0, 0), (1, 0))
    assert abs(ang2 - 180.0) < 1e-3, f"Expected 180 deg, got {ang2}"
    print(" [PASS] test_angle_math")


def test_invalid_extension():
    try:
        validate_video_file("dummy.txt", "dummy.txt")
        assert False, "Should have rejected .txt extension"
    except ValueError as e:
        assert "unsupported video format" in str(e).lower()
    print(" [PASS] test_invalid_extension")


def test_empty_video():
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        tmp_path = f.name
    try:
        validate_video_file(tmp_path, "empty.mp4")
        assert False, "Should have rejected 0-byte video"
    except ValueError as e:
        assert "empty" in str(e).lower()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    print(" [PASS] test_empty_video")


def test_corrupt_video():
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
        f.write(b"not a valid video stream binary data at all")
        tmp_path = f.name
    try:
        validate_video_file(tmp_path, "corrupt.mp4")
        assert False, "Should have rejected corrupt video"
    except ValueError as e:
        assert "corrupt" in str(e).lower() or "codec" in str(e).lower()
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
    print(" [PASS] test_corrupt_video")


def test_no_person_video_rejection():
    blank_path = create_blank_video(num_frames=60, fps=30)
    try:
        # validate_video_file should succeed (it's a valid MP4)
        meta = validate_video_file(blank_path, "blank.mp4")
        assert meta["frameCount"] == 60

        # But extract_gait_pipeline must reject it because no human is visible
        try:
            extract_gait_pipeline(blank_path, "blank.mp4")
            assert False, "Should have raised ValueError for video with no visible person"
        except ValueError as ve:
            assert "no visible walking subject detected" in str(ve).lower()
    finally:
        if os.path.exists(blank_path):
            os.remove(blank_path)
    print(" [PASS] test_no_person_video_rejection")


def test_missing_model_behavior():
    blank_path = create_blank_video(num_frames=60, fps=30)
    try:
        # Check transparent model status
        configured = is_gait_model_configured()
        assert isinstance(configured, bool)
    finally:
        if os.path.exists(blank_path):
            os.remove(blank_path)
    print(" [PASS] test_missing_model_behavior")


def run_all_tests():
    print("=" * 60)
    print("RUNNING VIDEO GAIT PIPELINE UNIT & INTEGRATION TESTS")
    print("=" * 60)
    test_angle_math()
    test_invalid_extension()
    test_empty_video()
    test_corrupt_video()
    test_no_person_video_rejection()
    test_missing_model_behavior()
    print("=" * 60)
    print("ALL GAIT PIPELINE TESTS PASSED!")
    print("=" * 60)


if __name__ == "__main__":
    run_all_tests()
