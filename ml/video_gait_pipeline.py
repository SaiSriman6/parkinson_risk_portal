"""
Video-Based Parkinson's Gait Analysis Pipeline
----------------------------------------------
Processes uploaded walking videos using OpenCV and MediaPipe Pose to estimate
body landmarks, compute biomechanical gait metrics (cadence, step timing,
bilateral symmetry, joint kinematics, temporal stride variability), and
produce structured feature representations for downstream analysis.

Complies with research standards:
- Clear error handling for missing/insufficient poses or corrupted videos
- Strict temporary file management and cleanup
- Explicit separation between measured video kinematics and physical limitations
"""

import os
import math
import tempfile
import numpy as np
import cv2
import mediapipe as mp
from scipy.signal import find_peaks, butter, filtfilt

# Configurable limits (via environment variables with safe defaults)
MAX_VIDEO_SIZE_BYTES = int(os.getenv("MAX_VIDEO_SIZE_MB", "50")) * 1024 * 1024
MAX_VIDEO_DURATION_SEC = float(os.getenv("MAX_VIDEO_DURATION_SEC", "60.0"))
MIN_VIDEO_DURATION_SEC = float(os.getenv("MIN_VIDEO_DURATION_SEC", "1.5"))
MIN_USABLE_FRAMES = int(os.getenv("MIN_USABLE_FRAMES", "15"))
MIN_USABLE_FRAME_RATIO = float(os.getenv("MIN_USABLE_FRAME_RATIO", "0.25"))

ALLOWED_EXTENSIONS = {".mp4", ".webm", ".mov", ".avi"}

# MediaPipe Pose Landmark Indices
LM_LEFT_SHOULDER = 11
LM_RIGHT_SHOULDER = 12
LM_LEFT_HIP = 23
LM_RIGHT_HIP = 24
LM_LEFT_KNEE = 25
LM_RIGHT_KNEE = 26
LM_LEFT_ANKLE = 27
LM_RIGHT_ANKLE = 28
LM_LEFT_HEEL = 29
LM_RIGHT_HEEL = 30
LM_LEFT_FOOT_INDEX = 31
LM_RIGHT_FOOT_INDEX = 32


def calculate_angle_3pts(a, b, c):
    """
    Computes 2D angle (in degrees) at vertex b between vectors (a - b) and (c - b).
    a, b, c are (x, y) coordinates.
    """
    ba = np.array([a[0] - b[0], a[1] - b[1]], dtype=np.float64)
    bc = np.array([c[0] - b[0], c[1] - b[1]], dtype=np.float64)

    norm_ba = np.linalg.norm(ba)
    norm_bc = np.linalg.norm(bc)

    if norm_ba < 1e-6 or norm_bc < 1e-6:
        return 180.0

    cosine_angle = np.dot(ba, bc) / (norm_ba * norm_bc)
    cosine_angle = np.clip(cosine_angle, -1.0, 1.0)
    angle = np.degrees(np.arccos(cosine_angle))
    return float(angle)


def smooth_signal(signal_arr, window_len=5):
    """
    Applies moving average smoothing over a 1D numerical signal.
    """
    if len(signal_arr) < window_len:
        return np.array(signal_arr, dtype=np.float64)
    w = np.ones(window_len, 'd')
    smoothed = np.convolve(w / w.sum(), signal_arr, mode='same')
    return smoothed


def validate_video_file(file_path: str, filename: str):
    """
    Validates file extension, size, and readability via OpenCV.
    Raises ValueError with descriptive guidance on failure.
    """
    ext = os.path.splitext(filename)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(
            f"Unsupported video format '{ext}'. Allowed formats: {', '.join(sorted(ALLOWED_EXTENSIONS))}."
        )

    file_size = os.path.getsize(file_path)
    if file_size == 0:
        raise ValueError("Uploaded video file is empty (0 bytes).")
    if file_size > MAX_VIDEO_SIZE_BYTES:
        max_mb = MAX_VIDEO_SIZE_BYTES / (1024 * 1024)
        current_mb = file_size / (1024 * 1024)
        raise ValueError(
            f"Video file size ({current_mb:.1f} MB) exceeds maximum allowed limit of {max_mb:.0f} MB."
        )

    cap = cv2.VideoCapture(file_path)
    if not cap.isOpened():
        cap.release()
        raise ValueError(
            "Corrupt or unreadable video file. Could not decode video streams using standard OpenCV codecs."
        )

    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()

    if frame_count <= 0 or width <= 0 or height <= 0:
        raise ValueError(
            "Video file contains no readable frames or invalid dimensions."
        )

    # Fallback to 30 FPS if metadata reports 0 or unreasonable FPS
    effective_fps = fps if (fps and 5.0 <= fps <= 240.0) else 30.0
    duration_sec = frame_count / effective_fps

    if duration_sec < MIN_VIDEO_DURATION_SEC:
        raise ValueError(
            f"Video duration ({duration_sec:.2f}s) is too short. Please record at least {MIN_VIDEO_DURATION_SEC:.1f} seconds of continuous walking."
        )
    if duration_sec > MAX_VIDEO_DURATION_SEC:
        raise ValueError(
            f"Video duration ({duration_sec:.1f}s) exceeds maximum allowed limit of {MAX_VIDEO_DURATION_SEC:.0f} seconds."
        )

    return {
        "fps": effective_fps,
        "frameCount": frame_count,
        "durationSec": duration_sec,
        "width": width,
        "height": height
    }


def extract_gait_pipeline(video_path: str, filename: str):
    """
    Main pipeline:
    1. Validates video properties.
    2. Runs MediaPipe Pose landmark extraction frame by frame.
    3. Analyzes gait kinematics and temporal rhythms.
    4. Computes cadence, step timing, symmetry, and joint ROM.
    5. Returns structured telemetry and gait metrics dictionary.
    """
    meta = validate_video_file(video_path, filename)
    fps = meta["fps"]

    cap = cv2.VideoCapture(video_path)
    try:
        total_frames = 0
        usable_frames = 0

        # Landmark trajectory buffers
        left_ankle_y = []
        right_ankle_y = []
        left_heel_y = []
        right_heel_y = []
        left_knee_angles = []
        right_knee_angles = []
        left_hip_angles = []
        right_hip_angles = []
        confidences = []

        # Configure MediaPipe Pose
        mp_pose = mp.solutions.pose
        with mp_pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            smooth_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5
        ) as pose:
            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break
                total_frames += 1

                # Convert BGR frame to RGB for MediaPipe
                frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = pose.process(frame_rgb)

                if results.pose_landmarks:
                    landmarks = results.pose_landmarks.landmark

                    # Key visibility checks
                    l_hip_v = landmarks[LM_LEFT_HIP].visibility
                    r_hip_v = landmarks[LM_RIGHT_HIP].visibility
                    l_knee_v = landmarks[LM_LEFT_KNEE].visibility
                    r_knee_v = landmarks[LM_RIGHT_KNEE].visibility
                    l_ankle_v = landmarks[LM_LEFT_ANKLE].visibility
                    r_ankle_v = landmarks[LM_RIGHT_ANKLE].visibility

                    avg_vis = (l_hip_v + r_hip_v + l_knee_v + r_knee_v + l_ankle_v + r_ankle_v) / 6.0
                    confidences.append(avg_vis)

                    # Frame is considered usable if at least one leg and hips are tracked
                    if (l_hip_v > 0.4 and r_hip_v > 0.4) and ((l_knee_v > 0.4 and l_ankle_v > 0.4) or (r_knee_v > 0.4 and r_ankle_v > 0.4)):
                        usable_frames += 1

                        # Pixel / normalized coordinates
                        l_sh = (landmarks[LM_LEFT_SHOULDER].x, landmarks[LM_LEFT_SHOULDER].y)
                        r_sh = (landmarks[LM_RIGHT_SHOULDER].x, landmarks[LM_RIGHT_SHOULDER].y)
                        l_hip = (landmarks[LM_LEFT_HIP].x, landmarks[LM_LEFT_HIP].y)
                        r_hip = (landmarks[LM_RIGHT_HIP].x, landmarks[LM_RIGHT_HIP].y)
                        l_knee = (landmarks[LM_LEFT_KNEE].x, landmarks[LM_LEFT_KNEE].y)
                        r_knee = (landmarks[LM_RIGHT_KNEE].x, landmarks[LM_RIGHT_KNEE].y)
                        l_ank = (landmarks[LM_LEFT_ANKLE].x, landmarks[LM_LEFT_ANKLE].y)
                        r_ank = (landmarks[LM_RIGHT_ANKLE].x, landmarks[LM_RIGHT_ANKLE].y)

                        left_ankle_y.append(landmarks[LM_LEFT_ANKLE].y)
                        right_ankle_y.append(landmarks[LM_RIGHT_ANKLE].y)
                        left_heel_y.append(landmarks[LM_LEFT_HEEL].y)
                        right_heel_y.append(landmarks[LM_RIGHT_HEEL].y)

                        # Compute knee flexion angles (Hip - Knee - Ankle)
                        l_knee_ang = calculate_angle_3pts(l_hip, l_knee, l_ank)
                        r_knee_ang = calculate_angle_3pts(r_hip, r_knee, r_ank)
                        left_knee_angles.append(l_knee_ang)
                        right_knee_angles.append(r_knee_ang)

                        # Compute hip angles (Shoulder - Hip - Knee)
                        l_hip_ang = calculate_angle_3pts(l_sh, l_hip, l_knee)
                        r_hip_ang = calculate_angle_3pts(r_sh, r_hip, r_knee)
                        left_hip_angles.append(l_hip_ang)
                        right_hip_angles.append(r_hip_ang)
    finally:
        cap.release()

    if total_frames == 0:
        raise ValueError("No video frames could be decoded from the upload.")

    usable_ratio = usable_frames / total_frames if total_frames > 0 else 0.0

    if usable_frames < MIN_USABLE_FRAMES or usable_ratio < MIN_USABLE_FRAME_RATIO:
        raise ValueError(
            f"No visible walking subject detected or insufficient pose visibility (usable frames: {usable_frames}/{total_frames}, {usable_ratio*100:.1f}%). "
            "Please upload a clear video showing the patient's full body walking in an unobstructed path with good lighting."
        )

    # Signal Processing: Step Detection and Cadence
    # Min distance between steps: ~0.25 seconds (max 240 steps/min)
    min_step_dist = max(int(fps * 0.25), 3)

    # Smooth vertical ankle/heel oscillations
    l_heel_smooth = smooth_signal(np.array(left_heel_y))
    r_heel_smooth = smooth_signal(np.array(right_heel_y))

    # Peaks correspond to maximum vertical heel elevation or contact phases
    l_peaks, _ = find_peaks(l_heel_smooth, distance=min_step_dist, prominence=0.01)
    r_peaks, _ = find_peaks(r_heel_smooth, distance=min_step_dist, prominence=0.01)

    left_step_count = len(l_peaks)
    right_step_count = len(r_peaks)
    total_steps = left_step_count + right_step_count

    effective_duration_sec = usable_frames / fps

    # Cadence (steps per minute)
    if total_steps > 0 and effective_duration_sec > 0:
        cadence = (total_steps / effective_duration_sec) * 60.0
    else:
        cadence = None

    # Step times & Temporal Stride Variability
    all_peaks_indices = sorted(list(l_peaks) + list(r_peaks))
    step_intervals_sec = []
    if len(all_peaks_indices) >= 2:
        for i in range(1, len(all_peaks_indices)):
            interval = (all_peaks_indices[i] - all_peaks_indices[i - 1]) / fps
            if 0.2 <= interval <= 2.5:  # filter physiological range
                step_intervals_sec.append(interval)

    if step_intervals_sec:
        mean_step_time = float(np.mean(step_intervals_sec))
        step_time_std = float(np.std(step_intervals_sec))
        # Coefficient of variation (CV = std / mean * 100)
        stride_variability_cv = float((step_time_std / mean_step_time) * 100.0) if mean_step_time > 0 else 0.0
    else:
        mean_step_time = None
        step_time_std = None
        stride_variability_cv = None

    # Bilateral Symmetry Index:
    # 100% = perfectly symmetric, lower = asymmetric
    # Symmetry Index = (1 - abs(L - R) / max(L, R)) * 100
    if left_step_count > 0 and right_step_count > 0:
        max_steps = max(left_step_count, right_step_count)
        step_count_symmetry = (1.0 - abs(left_step_count - right_step_count) / max_steps) * 100.0
    else:
        step_count_symmetry = None

    # Joint Kinematics: Range of Motion (ROM in degrees)
    l_knee_rom = float(np.ptp(left_knee_angles)) if len(left_knee_angles) > 1 else None
    r_knee_rom = float(np.ptp(right_knee_angles)) if len(right_knee_angles) > 1 else None
    l_hip_rom = float(np.ptp(left_hip_angles)) if len(left_hip_angles) > 1 else None
    r_hip_rom = float(np.ptp(right_hip_angles)) if len(right_hip_angles) > 1 else None

    # Kinematic Symmetry: Knee ROM symmetry
    if l_knee_rom is not None and r_knee_rom is not None and max(l_knee_rom, r_knee_rom) > 1e-3:
        knee_rom_symmetry = (1.0 - abs(l_knee_rom - r_knee_rom) / max(l_knee_rom, r_knee_rom)) * 100.0
    else:
        knee_rom_symmetry = None

    # Overall Gait Symmetry Index (weighted composite of step timing and knee ROM)
    if step_count_symmetry is not None and knee_rom_symmetry is not None:
        overall_symmetry_index = float((step_count_symmetry * 0.5) + (knee_rom_symmetry * 0.5))
    elif step_count_symmetry is not None:
        overall_symmetry_index = float(step_count_symmetry)
    elif knee_rom_symmetry is not None:
        overall_symmetry_index = float(knee_rom_symmetry)
    else:
        overall_symmetry_index = None

    mean_confidence = float(np.mean(confidences)) if confidences else 0.0

    return {
        "metadata": {
            "filename": filename,
            "fps": round(fps, 2),
            "totalFrames": total_frames,
            "usableFrames": usable_frames,
            "usableFrameRatio": round(usable_ratio, 3),
            "durationSec": round(meta["durationSec"], 2),
            "effectiveDurationSec": round(effective_duration_sec, 2),
            "meanPoseTrackingConfidence": round(mean_confidence, 3),
            "dimensions": f"{meta['width']}x{meta['height']}"
        },
        "gaitMetrics": {
            "cadenceStepsPerMin": round(cadence, 1) if cadence is not None else None,
            "meanStepTimeSec": round(mean_step_time, 3) if mean_step_time is not None else None,
            "stepTimeStdSec": round(step_time_std, 3) if step_time_std is not None else None,
            "strideVariabilityCvPercent": round(stride_variability_cv, 2) if stride_variability_cv is not None else None,
            "overallSymmetryIndex": round(overall_symmetry_index, 1) if overall_symmetry_index is not None else None,
            "leftStepCount": left_step_count,
            "rightStepCount": right_step_count,
            "totalStepsDetected": total_steps,
            "leftKneeRomDeg": round(l_knee_rom, 1) if l_knee_rom is not None else None,
            "rightKneeRomDeg": round(r_knee_rom, 1) if r_knee_rom is not None else None,
            "leftHipRomDeg": round(l_hip_rom, 1) if l_hip_rom is not None else None,
            "rightHipRomDeg": round(r_hip_rom, 1) if r_hip_rom is not None else None
        }
    }
