import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import Toast from "../components/Toast";
import { motion } from "framer-motion";
import { 
  FaWalking, FaCloudUploadAlt, FaVideo, FaArrowLeft, 
  FaCheckCircle, FaExclamationTriangle, FaRedo, FaInfoCircle, 
  FaShieldAlt, FaFilePdf, FaHistory, FaCheck, FaRulerHorizontal
} from "react-icons/fa";

export default function VideoGaitAnalysis() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const navigate = useNavigate();

  // Clean up object URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        window.URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateAndSetFile = (selectedFile) => {
    if (!selectedFile) return;

    const validExtensions = [".mp4", ".webm", ".mov", ".avi"];
    const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf(".")).toLowerCase();

    if (!validExtensions.includes(ext)) {
      setError(`Unsupported video format (${ext}). Please upload an MP4, WEBM, MOV, or AVI walking video.`);
      return;
    }

    if (selectedFile.size > 50 * 1024 * 1024) {
      setError(`File size (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB) exceeds the 50 MB limit.`);
      return;
    }

    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }

    setError("");
    setResult(null);
    setFile(selectedFile);
    setPreviewUrl(window.URL.createObjectURL(selectedFile));
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError("Please select or drop a walking video first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setError("");
      setLoading(true);

      const response = await API.post("/api/video-analysis/predict", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        },
        timeout: 120000
      });

      setResult(response.data);
    } catch (err) {
      console.error("Video Gait Analysis error:", err);
      const apiMsg = err.response?.data?.message || err.response?.data?.detail || err.message;
      setError(apiMsg || "Video gait analysis failed. The machine learning microservice may be offline or initializing.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
    }
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError("");
  };

  const handleDownloadPDF = async () => {
    const recordId = result?._id || result?.predictionRecord?._id;
    if (!recordId) return;

    try {
      setDownloadingPdf(true);
      const res = await API.get(`/api/predictions/${recordId}/report`, {
        responseType: "blob"
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Parkinson_Gait_Report_${recordId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
      alert("Failed to download gait analysis PDF report.");
    } finally {
      setDownloadingPdf(false);
    }
  };

  const getRiskClass = (risk) => {
    if (risk === "Low") return "badge-low";
    if (risk === "Medium") return "badge-medium";
    if (risk === "High") return "badge-high";
    return "badge-medium";
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="container prediction-container"
    >
      {/* Header & Back Button */}
      <div className="prediction-header" style={{ marginBottom: "28px" }}>
        <button 
          onClick={() => navigate("/")} 
          className="btn-secondary btn-small" 
          style={{ marginBottom: "16px", display: "inline-flex", alignItems: "center", gap: "6px" }}
        >
          <FaArrowLeft /> Back to Dashboard
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ 
            width: "48px", 
            height: "48px", 
            borderRadius: "12px", 
            background: "rgba(2, 132, 199, 0.12)", 
            display: "flex", 
            alignItems: "center", 
            justifyContent: "center",
            color: "var(--primary-color)",
            fontSize: "24px"
          }}>
            <FaWalking />
          </div>
          <div>
            <h1 className="page-title" style={{ margin: 0 }}>Video-Based Gait Analysis</h1>
            <p className="page-subtitle" style={{ margin: "4px 0 0" }}>
              Computer vision assessment of human walking mechanics, cadence, symmetry, and joint kinematics.
            </p>
          </div>
        </div>
      </div>

      {error && (
        <Toast 
          message={error} 
          type="error" 
          onClose={() => setError("")} 
        />
      )}

      {/* Recording Instructions Banner */}
      <div className="glass-card mb-6" style={{ background: "rgba(2, 132, 199, 0.04)", borderLeft: "5px solid var(--primary-color)" }}>
        <h4 style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)", fontSize: "16px", marginBottom: "8px" }}>
          <FaInfoCircle /> Video Recording Best Practices for Computer Vision
        </h4>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", fontSize: "13.5px", color: "var(--text-secondary)" }}>
          <div>
            <strong style={{ color: "var(--text-main)" }}>1. Full Body Visibility:</strong> Keep head, torso, knees, and feet in frame throughout the recording.
          </div>
          <div>
            <strong style={{ color: "var(--text-main)" }}>2. Steady Camera:</strong> Place camera at waist height (side view or corridor view) 3-5 meters away.
          </div>
          <div>
            <strong style={{ color: "var(--text-main)" }}>3. Natural Walking:</strong> Walk 5-10 meters at your regular, continuous pace.
          </div>
          <div>
            <strong style={{ color: "var(--text-main)" }}>4. Contrast & Lighting:</strong> Ensure bright indoor lighting; avoid baggy robes that hide knee and ankle movement.
          </div>
        </div>
      </div>

      {/* Main Upload / Results Card */}
      <div className="section-card">
        {!result ? (
          /* Upload Interface */
          <div>
            <h3 className="section-title" style={{ marginBottom: "8px" }}>Upload Walking Video</h3>
            <p className="section-subtitle">
              Select or drag an MP4 walking video clip (5 to 60 seconds duration).
            </p>

            <div 
              className={`file-uploader-box ${dragActive ? "drag-active" : ""}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              style={{
                border: "2px dashed var(--border-color)",
                borderRadius: "var(--radius)",
                padding: "40px 20px",
                textAlign: "center",
                background: dragActive ? "rgba(2, 132, 199, 0.05)" : "transparent",
                transition: "var(--transition)",
                cursor: "pointer",
                marginTop: "16px"
              }}
              onClick={() => document.getElementById("video-file-input").click()}
            >
              <input 
                id="video-file-input"
                type="file" 
                accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
                onChange={handleChange}
                style={{ display: "none" }}
              />

              <div style={{ fontSize: "48px", color: "var(--primary-color)", marginBottom: "12px" }}>
                <FaCloudUploadAlt />
              </div>
              <h4 style={{ fontSize: "17px", marginBottom: "6px" }}>
                Drag and drop your walking video here
              </h4>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", marginBottom: "12px" }}>
                or click to browse your computer
              </p>
              <p style={{ fontSize: "12px", color: "var(--text-light)" }}>
                Supported formats: <strong>MP4, WEBM, MOV, AVI</strong> (Max size: <strong>50 MB</strong>)
              </p>
            </div>

            {/* Selected Video Preview */}
            {file && previewUrl && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                style={{ 
                  marginTop: "24px", 
                  padding: "20px", 
                  borderRadius: "var(--radius)", 
                  background: "var(--card-bg)", 
                  border: "1px solid var(--border-color)",
                  display: "flex",
                  gap: "24px",
                  alignItems: "flex-start",
                  flexWrap: "wrap"
                }}
              >
                <div style={{ width: "280px", maxWidth: "100%", borderRadius: "12px", overflow: "hidden", background: "#000", border: "2px solid var(--border-color)" }}>
                  <video 
                    src={previewUrl} 
                    controls 
                    style={{ width: "100%", height: "auto", display: "block" }} 
                  />
                </div>
                <div style={{ flex: 1, minWidth: "240px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <FaVideo style={{ color: "var(--primary-color)" }} />
                    <span style={{ fontWeight: "700", fontSize: "16px" }}>{file.name}</span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    <strong>File Size:</strong> {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    <strong>Format:</strong> {file.type || "Video"}
                  </p>

                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <button 
                      onClick={handleAnalyze} 
                      disabled={loading}
                      className="btn-primary"
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px", minWidth: "180px", justifyContent: "center" }}
                    >
                      <FaWalking /> {loading ? "Analyzing Gait..." : "Analyze Walking Gait"}
                    </button>
                    <button 
                      onClick={handleReset} 
                      disabled={loading}
                      className="btn-secondary"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {loading && (
              <div style={{ marginTop: "32px", padding: "30px 0", textAlign: "center" }}>
                <LoadingSpinner message="Extracting frames via OpenCV, tracking 33 body landmarks via MediaPipe Pose, and computing gait kinematics..." />
              </div>
            )}
          </div>
        ) : (
          /* Results View */
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="gait-result-view"
          >
            {/* Outcome Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-light)", fontWeight: "600" }}>
                  Computer Vision Gait Analysis
                </span>
                <h2 style={{ fontSize: "24px", marginTop: "4px" }}>
                  {result.prediction?.available 
                    ? `Classification: ${result.prediction.riskLevel} Risk` 
                    : "Biomechanical Gait Screening Completed"}
                </h2>
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <span className={`badge ${getRiskClass(result.riskLevel)}`} style={{ fontSize: "14px", padding: "6px 14px" }}>
                  {result.riskLevel || "Analyzed"}
                </span>
              </div>
            </div>

            {/* Video Quality & Tracking Telemetry */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "24px" }}>
              <div className="feature-mini-card" style={{ background: "rgba(2, 132, 199, 0.05)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "16px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>Usable Frame Ratio</span>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "var(--primary-color)", margin: "4px 0" }}>
                  {result.videoMetadata?.usableFrameRatio ? `${(result.videoMetadata.usableFrameRatio * 100).toFixed(1)}%` : "N/A"}
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-light)", margin: 0 }}>
                  {result.videoMetadata?.usableFrames} of {result.videoMetadata?.totalFrames} frames with clear pose
                </p>
              </div>

              <div className="feature-mini-card" style={{ background: "rgba(13, 148, 136, 0.05)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "16px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>Pose Tracking Confidence</span>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "var(--secondary-color)", margin: "4px 0" }}>
                  {result.videoMetadata?.meanPoseTrackingConfidence ? `${(result.videoMetadata.meanPoseTrackingConfidence * 100).toFixed(1)}%` : "N/A"}
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-light)", margin: 0 }}>
                  MediaPipe landmark detection score
                </p>
              </div>

              <div className="feature-mini-card" style={{ background: "rgba(79, 70, 229, 0.05)", border: "1px solid var(--border-color)", borderRadius: "12px", padding: "16px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-secondary)", fontWeight: "600" }}>Video Duration & FPS</span>
                <div style={{ fontSize: "22px", fontWeight: "700", color: "var(--accent-color)", margin: "4px 0" }}>
                  {result.videoMetadata?.durationSec ? `${result.videoMetadata.durationSec}s @ ${result.videoMetadata.fps} fps` : "N/A"}
                </div>
                <p style={{ fontSize: "12px", color: "var(--text-light)", margin: 0 }}>
                  Resolution: {result.videoMetadata?.dimensions || "N/A"}
                </p>
              </div>
            </div>

            {/* Biomechanical Gait Parameters Grid */}
            <div className="section-card mb-6" style={{ background: "var(--card-bg)" }}>
              <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)", marginBottom: "16px" }}>
                <FaRulerHorizontal /> Measured Gait Kinematics & Timing
              </h3>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(148, 163, 184, 0.05)", border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Step Cadence</span>
                  <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)", margin: "4px 0" }}>
                    {result.gaitAnalysis?.cadenceStepsPerMin ? `${result.gaitAnalysis.cadenceStepsPerMin} steps/min` : "N/A"}
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-light)", margin: 0 }}>
                    Normal adult walking cadence: 100 - 125 steps/min
                  </p>
                </div>

                <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(148, 163, 184, 0.05)", border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Mean Step Duration</span>
                  <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)", margin: "4px 0" }}>
                    {result.gaitAnalysis?.meanStepTimeSec ? `${result.gaitAnalysis.meanStepTimeSec} s` : "N/A"}
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-light)", margin: 0 }}>
                    Std Dev: {result.gaitAnalysis?.stepTimeStdSec ? `${result.gaitAnalysis.stepTimeStdSec} s` : "N/A"}
                  </p>
                </div>

                <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(148, 163, 184, 0.05)", border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Bilateral Symmetry Index</span>
                  <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)", margin: "4px 0" }}>
                    {result.gaitAnalysis?.overallSymmetryIndex ? `${result.gaitAnalysis.overallSymmetryIndex}%` : "N/A"}
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-light)", margin: 0 }}>
                    100% = perfect left-right movement symmetry
                  </p>
                </div>

                <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(148, 163, 184, 0.05)", border: "1px solid var(--border-color)" }}>
                  <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Stride Timing Variability (CV)</span>
                  <div style={{ fontSize: "24px", fontWeight: "700", color: "var(--text-main)", margin: "4px 0" }}>
                    {result.gaitAnalysis?.strideVariabilityCvPercent ? `${result.gaitAnalysis.strideVariabilityCvPercent}%` : "N/A"}
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-light)", margin: 0 }}>
                    Normal variability &lt; 4.0%; elevated in gait instability
                  </p>
                </div>
              </div>

              {/* Joint Angles / ROM Subgrid */}
              <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
                <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(148, 163, 184, 0.04)" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--primary-color)" }}>Knee Range of Motion (ROM)</span>
                  <div style={{ marginTop: "6px", fontSize: "14px" }}>
                    Left: <strong>{result.gaitAnalysis?.leftKneeRomDeg ? `${result.gaitAnalysis.leftKneeRomDeg}°` : "N/A"}</strong> | Right: <strong>{result.gaitAnalysis?.rightKneeRomDeg ? `${result.gaitAnalysis.rightKneeRomDeg}°` : "N/A"}</strong>
                  </div>
                </div>

                <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(148, 163, 184, 0.04)" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--secondary-color)" }}>Hip Range of Motion (ROM)</span>
                  <div style={{ marginTop: "6px", fontSize: "14px" }}>
                    Left: <strong>{result.gaitAnalysis?.leftHipRomDeg ? `${result.gaitAnalysis.leftHipRomDeg}°` : "N/A"}</strong> | Right: <strong>{result.gaitAnalysis?.rightHipRomDeg ? `${result.gaitAnalysis.rightHipRomDeg}°` : "N/A"}</strong>
                  </div>
                </div>

                <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(148, 163, 184, 0.04)" }}>
                  <span style={{ fontSize: "12px", fontWeight: "600", color: "var(--accent-color)" }}>Detected Steps</span>
                  <div style={{ marginTop: "6px", fontSize: "14px" }}>
                    Left: <strong>{result.gaitAnalysis?.leftStepCount ?? 0}</strong> | Right: <strong>{result.gaitAnalysis?.rightStepCount ?? 0}</strong> (Total: {result.gaitAnalysis?.totalStepsDetected ?? 0})
                  </div>
                </div>
              </div>
            </div>

            {/* Model & Research Status Card */}
            <div className="section-card mb-6" style={{ background: "rgba(245, 158, 11, 0.04)", border: "1px solid var(--orange-border)" }}>
              <h4 style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--orange)", marginBottom: "8px" }}>
                <FaShieldAlt /> Machine Learning Model Status
              </h4>
              <p style={{ fontSize: "14px", color: "var(--text-secondary)", marginBottom: "12px" }}>
                {result.prediction?.available 
                  ? `Validated model active (${result.prediction.modelVersion}). Disease score: ${result.prediction.score} (${result.prediction.confidence}% confidence).`
                  : (result.prediction?.status || "Experimental gait measurement only. A clinically validated Parkinson's classifier is not loaded.")}
              </p>
              {!result.prediction?.available && (
                <p style={{ fontSize: "13px", color: "var(--text-light)" }}>
                  In accordance with medical AI safety rules, disease risk scores are not fabricated without properly trained models on clinical cohorts (such as CARE-PD). The kinematic metrics above represent genuine, reproducible computer-vision measurements.
                </p>
              )}
            </div>

            {/* Limitations Box */}
            {result.limitations && result.limitations.length > 0 && (
              <div className="section-card mb-6">
                <h4 style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--text-main)", fontSize: "15px", marginBottom: "10px" }}>
                  <FaInfoCircle style={{ color: "var(--primary-color)" }} /> Measurement Limitations
                </h4>
                <ul style={{ paddingLeft: "20px", fontSize: "13.5px", color: "var(--text-secondary)", lineHeight: "1.7" }}>
                  {result.limitations.map((lim, idx) => (
                    <li key={idx}>{lim}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Prominent Medical Disclaimer */}
            <div className="recommendations-box border-orange mb-6" style={{ background: "rgba(245, 158, 11, 0.06)", borderLeft: "6px solid var(--orange)" }}>
              <h4 style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--orange)", fontWeight: "700" }}>
                <FaInfoCircle /> Research Prototype Notice & Medical Disclaimer
              </h4>
              <p style={{ fontSize: "13.5px", marginTop: "6px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                {result.disclaimer || "This video-based gait analysis tool is an educational research prototype. Gait measurements (cadence, symmetry, stride variability) are estimates derived from 2D video landmark tracking. Many physical conditions (prior orthopedic injuries, arthritis, footwear, fatigue) can affect walking patterns. This tool cannot independently diagnose or rule out Parkinson's disease. Consultation with a licensed neurologist is mandatory."}
              </p>
            </div>

            {/* Action Buttons */}
            <div style={{ display: "flex", gap: "14px", flexWrap: "wrap", marginTop: "24px" }}>
              <button 
                onClick={handleDownloadPDF} 
                disabled={downloadingPdf}
                className="btn-primary" 
                style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                <FaFilePdf /> {downloadingPdf ? "Generating PDF..." : "Download Gait Report (PDF)"}
              </button>

              <Link 
                to="/history" 
                className="btn-secondary" 
                style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                <FaHistory /> View in History Logs
              </Link>

              <button 
                onClick={handleReset} 
                className="btn-secondary"
                style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                <FaRedo /> Analyze Another Video
              </button>
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
