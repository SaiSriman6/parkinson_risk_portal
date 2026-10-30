import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import Toast from "../components/Toast";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FaBrain, FaCloudUploadAlt, FaFileMedicalAlt, FaArrowLeft, 
  FaCheckCircle, FaExclamationTriangle, FaRedo, FaInfoCircle, 
  FaImage, FaShieldAlt, FaEye
} from "react-icons/fa";

export default function MRIAnalysis() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
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

    const validExtensions = [".png", ".jpg", ".jpeg", ".webp", ".bmp"];
    const ext = selectedFile.name.substring(selectedFile.name.lastIndexOf(".")).toLowerCase();

    if (!validExtensions.includes(ext)) {
      setError(`Unsupported image format (${ext}). Please upload a valid PNG, JPG, JPEG, or WEBP MRI scan.`);
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError(`File size (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB) exceeds the 10 MB limit.`);
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
      setError("Please select or drop an MRI scan image first.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    try {
      setError("");
      setLoading(true);

      const response = await API.post("/api/predictions/upload-mri", formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        }
      });

      setResult(response.data);
    } catch (err) {
      console.error("MRI Analysis error:", err);
      const apiMsg = err.response?.data?.message || err.response?.data?.detail || err.message;
      setError(apiMsg || "MRI analysis failed. The machine learning microservice may be offline or initializing.");
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

  const getRiskClass = (risk) => {
    if (risk === "Low") return "badge-low";
    if (risk === "Medium") return "badge-medium";
    if (risk === "High") return "badge-high";
    return "badge-low";
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
          <FaArrowLeft /> Dashboard
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "2rem", color: "var(--primary-color)" }}>🧠</span>
          <div>
            <h1 className="page-title">MRI Image Analysis</h1>
            <p className="page-subtitle" style={{ marginTop: "4px" }}>
              Evaluate structural brain MRI scans for neuroimaging patterns associated with Parkinson's disease using transfer learning deep neural networks.
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

      {/* Main Upload & Analysis Section */}
      <div className="section-card" style={{ marginBottom: "24px" }}>
        {!result ? (
          <div>
            <div 
              className={`upload-dropzone ${dragActive ? "drag-active" : ""}`}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              style={{
                border: dragActive ? "2px dashed var(--primary-color)" : "2px dashed var(--border-color)",
                borderRadius: "var(--radius)",
                padding: "36px 20px",
                textAlign: "center",
                background: dragActive ? "rgba(2, 132, 199, 0.05)" : "var(--bg-color)",
                transition: "var(--transition)",
                cursor: "pointer"
              }}
            >
              <span className="upload-icon" style={{ fontSize: "42px", color: "var(--primary-color)", display: "block", marginBottom: "12px" }}>
                <FaCloudUploadAlt />
              </span>
              <p className="upload-instruction" style={{ fontSize: "16px", fontWeight: "600", marginBottom: "6px" }}>
                Drag & drop your brain MRI scan here, or{" "}
                <label className="upload-label" style={{ color: "var(--primary-color)", textDecoration: "underline", cursor: "pointer" }}>
                  browse files
                  <input 
                    type="file" 
                    className="file-input" 
                    accept=".png,.jpg,.jpeg,.webp,.bmp" 
                    onChange={handleChange}
                    style={{ display: "none" }}
                  />
                </label>
              </p>
              <p className="upload-formats" style={{ fontSize: "13px", color: "var(--text-light)" }}>
                Supported formats: <strong>PNG, JPG, JPEG, WEBP</strong> (Maximum file size: <strong>10 MB</strong>)
              </p>
            </div>

            {/* Selected File & Preview */}
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
                  alignItems: "center",
                  flexWrap: "wrap"
                }}
              >
                <div style={{ position: "relative", width: "160px", height: "160px", borderRadius: "12px", overflow: "hidden", background: "#000", border: "2px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <img 
                    src={previewUrl} 
                    alt="MRI Preview" 
                    style={{ width: "100%", height: "100%", objectFit: "contain" }} 
                  />
                </div>
                <div style={{ flex: 1, minWidth: "240px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    <FaImage style={{ color: "var(--primary-color)" }} />
                    <span style={{ fontWeight: "700", fontSize: "16px" }}>{file.name}</span>
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
                    <strong>File Size:</strong> {(file.size / 1024).toFixed(1)} KB ({(file.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "16px" }}>
                    <strong>Type:</strong> {file.type || "Medical Image"}
                  </p>

                  <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                    <button 
                      onClick={handleAnalyze} 
                      disabled={loading}
                      className="btn-primary"
                      style={{ display: "inline-flex", alignItems: "center", gap: "8px", minWidth: "160px", justifyContent: "center" }}
                    >
                      <FaBrain /> {loading ? "Analyzing Scan..." : "Run MRI Analysis"}
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
                <LoadingSpinner message="Preprocessing image (224x224 RGB), running MobileNetV2 inference..." />
              </div>
            )}
          </div>
        ) : (
          /* Results View */
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            className="mri-result-view"
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "16px", marginBottom: "20px", borderBottom: "1px solid var(--border-color)", paddingBottom: "16px" }}>
              <div>
                <span style={{ fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-light)", fontWeight: "600" }}>
                  Assessment Outcome
                </span>
                <h2 style={{ fontSize: "24px", marginTop: "4px" }}>
                  Classification: {result.mriDetails?.predictedClass === "PD" ? "Parkinson's Disease Pattern" : "Normal Baseline"}
                </h2>
              </div>
              <span className={`badge ${getRiskClass(result.riskLevel)}`} style={{ fontSize: "14px", padding: "6px 14px" }}>
                {result.riskLevel} Risk
              </span>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px", marginBottom: "24px" }}>
              {/* Scan Preview Card */}
              {previewUrl && (
                <div style={{ background: "var(--bg-color)", borderRadius: "var(--radius)", padding: "16px", border: "1px solid var(--border-color)", textAlign: "center" }}>
                  <div style={{ maxWidth: "200px", height: "200px", margin: "0 auto", background: "#000", borderRadius: "8px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <img src={previewUrl} alt="Analyzed Scan" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  </div>
                  <p style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-light)", fontStyle: "italic" }}>
                    {result.mriDetails?.imageFilename || file?.name}
                  </p>
                </div>
              )}

              {/* Confidence & Metrics Card */}
              <div style={{ background: "var(--bg-color)", borderRadius: "var(--radius)", padding: "20px", border: "1px solid var(--border-color)" }}>
                <h4 style={{ fontSize: "15px", marginBottom: "16px", color: "var(--primary-color)", display: "flex", alignItems: "center", gap: "8px" }}>
                  <FaBrain /> Model Confidence & Probabilities
                </h4>

                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
                    <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>Winning Class Confidence:</span>
                    <span style={{ fontWeight: "700" }}>{result.confidence?.toFixed(1)}%</span>
                  </div>
                  <div style={{ width: "100%", height: "10px", background: "var(--border-color)", borderRadius: "5px", overflow: "hidden" }}>
                    <div 
                      style={{ 
                        width: `${Math.min(100, Math.max(0, result.confidence || 0))}%`, 
                        height: "100%", 
                        background: result.riskLevel === "High" ? "var(--red)" : "var(--green)",
                        borderRadius: "5px" 
                      }} 
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginTop: "16px", paddingTop: "12px", borderTop: "1px solid var(--border-color)" }}>
                  <div style={{ background: "var(--card-bg)", padding: "12px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-light)", display: "block" }}>Normal Probability</span>
                    <span style={{ fontSize: "18px", fontWeight: "700", color: "var(--green)" }}>
                      {((result.mriDetails?.normalProbability || (result.label === 0 ? result.confidence / 100 : (100 - result.confidence) / 100)) * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div style={{ background: "var(--card-bg)", padding: "12px", borderRadius: "8px" }}>
                    <span style={{ fontSize: "11px", color: "var(--text-light)", display: "block" }}>PD Probability</span>
                    <span style={{ fontSize: "18px", fontWeight: "700", color: "var(--red)" }}>
                      {((result.mriDetails?.pdProbability || (result.label === 1 ? result.confidence / 100 : (100 - result.confidence) / 100)) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: "16px", fontSize: "12px", color: "var(--text-light)" }}>
                  <span>Model: <code>{result.modelVersion || "mri-mobilenetv2-v1.0.0"}</code></span>
                  {result.mriDetails?.imageDimensions && (
                    <span style={{ marginLeft: "12px" }}>Input: {result.mriDetails.imageDimensions}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Recommendations Box */}
            <div 
              className={`recommendations-box ${result.riskLevel === "High" ? "border-red" : "border-green"}`} 
              style={{ marginBottom: "20px" }}
            >
              <h4 
                className={`recommendation-header font-bold ${result.riskLevel === "High" ? "text-red" : "text-green"}`} 
                style={{ display: "flex", alignItems: "center", gap: "8px" }}
              >
                {result.riskLevel === "High" ? <FaExclamationTriangle /> : <FaCheckCircle />}
                {result.riskLevel === "High" ? "Follow-up Recommendation (High Risk Indication)" : "Follow-up Recommendation (Low Risk Baseline)"}
              </h4>
              <p className="recommendation-desc" style={{ marginTop: "8px", fontSize: "14px" }}>
                {result.riskLevel === "High" 
                  ? "The neural network detected neuroimaging slice features statistically associated with Parkinsonian patterns in research benchmarks. This is not a diagnosis. A full neurological examination, clinical history, and clinical radiologist review are essential."
                  : "Structural image patterns align with healthy baseline reference scans in the training cohort. Continue standard routine wellness check-ups."
                }
              </p>
            </div>

            {/* Actions: Analyze Another or View Record */}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "24px" }}>
              <button 
                onClick={handleReset} 
                className="btn-primary" 
                style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                <FaRedo /> Upload & Analyze Another MRI Scan
              </button>
              <Link 
                to={`/result/${result._id}`} 
                className="btn-secondary" 
                style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
              >
                <FaEye /> View Saved Assessment Record
              </Link>
              <Link 
                to="/history" 
                className="btn-secondary"
              >
                Assessment History
              </Link>
            </div>
          </motion.div>
        )}
      </div>

      {/* Mandatory Medical & Research Disclaimer */}
      <div 
        className="instructions-card" 
        style={{ 
          background: "rgba(239, 68, 68, 0.04)", 
          borderLeft: "4px solid var(--orange)",
          marginBottom: "24px"
        }}
      >
        <h4 style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--orange)", fontSize: "14px", fontWeight: "700" }}>
          <FaShieldAlt /> Educational Machine Learning Disclaimer & Regulatory Notice
        </h4>
        <p style={{ fontSize: "13px", marginTop: "8px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
          This MRI analysis tool is an <strong>educational and academic research demonstration</strong>. 
          The underlying neural network model was trained on a public 2D slice dataset and is <strong>not FDA-cleared, CE-marked, or clinically validated</strong>. 
          The prediction output represents statistical correlation with experimental benchmark data and <strong>must never be used as a medical diagnosis</strong>, 
          clinical decision aid, or to confirm or rule out Parkinson’s disease. Always consult a qualified neurologist or physician for medical evaluation.
        </p>
      </div>

      {/* Guidelines Card */}
      <div className="instructions-card" style={{ background: "linear-gradient(135deg, rgba(2, 132, 199, 0.04) 0%, rgba(13, 148, 136, 0.04) 100%)" }}>
        <h3 className="instructions-title font-semibold" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)" }}>
          <FaFileMedicalAlt /> MRI Upload Guidelines & Protocol
        </h3>
        <ul className="instructions-list" style={{ marginTop: "12px" }}>
          <li>Provide axial, sagittal, or coronal brain MRI slices in PNG, JPG, or WEBP format.</li>
          <li>For optimal feature resolution, ensure images are clear and free from excessive motion artifacts.</li>
          <li>Input images are automatically resized to 224 &times; 224 pixels and normalized to ImageNet color standards.</li>
          <li>Uploaded images are processed directly in-memory and are not permanently retained on disk for privacy protection.</li>
        </ul>
      </div>
    </motion.div>
  );
}
