import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import API from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import Toast from "../components/Toast";
import { motion } from "framer-motion";
import { 
  FaFilePdf, FaArrowLeft, FaPlay, FaMedkit, FaCheckCircle, 
  FaExclamationCircle, FaSlidersH, FaInfoCircle, FaClipboardCheck, FaExclamationTriangle, FaEnvelope, FaWalking
} from "react-icons/fa";

export default function Result() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [audioUrl, setAudioUrl] = useState(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailNotice, setEmailNotice] = useState("");

  useEffect(() => {
    const fetchResult = async () => {
      if (!id || id.trim() === "") {
        setError("No assessment ID provided in request URL.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");
        const response = await API.get(`/api/predictions/${id}`);
        setPrediction(response.data);
      } catch (err) {
        console.error("Result fetch error:", err);
        const apiMsg = err.response?.data?.message || "Failed to load assessment details. Check network or database connectivity.";
        setError(apiMsg);
      } finally {
        setLoading(false);
      }
    };

    fetchResult();
  }, [id]);

  useEffect(() => {
    let objectUrl = null;
    const fetchAudio = async () => {
      if (prediction && prediction.voicePath && prediction._id) {
        try {
          const res = await API.get(`/api/predictions/${prediction._id}/audio`, {
            responseType: "blob"
          });
          const contentType = res.headers["content-type"] || "audio/wav";
          const blob = new Blob([res.data], { type: contentType });
          objectUrl = window.URL.createObjectURL(blob);
          setAudioUrl(objectUrl);
        } catch (audioErr) {
          console.error("Audio playback fetch failed:", audioErr);
        }
      }
    };

    fetchAudio();

    return () => {
      if (objectUrl) {
        window.URL.revokeObjectURL(objectUrl);
      }
    };
  }, [prediction]);

  if (loading) return <LoadingSpinner message="Fetching acoustic assessment report details..." />;

  if (error || !prediction) {
    return (
      <div className="container center-container" style={{ padding: "80px 0", textAlign: "center" }}>
        {error && <Toast message={error} type="error" onClose={() => setError("")} />}
        <div className="empty-state">
          <span className="empty-state-icon">⚠️</span>
          <h2 style={{ marginTop: "12px", fontSize: "22px" }}>Assessment Not Found</h2>
          <p style={{ maxWidth: "520px", margin: "12px auto", color: "var(--text-secondary)", lineHeight: "1.6" }}>
            {error || "The assessment report you are trying to view does not exist, has been deleted, or belongs to another user."}
          </p>
          <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "24px" }}>
            <button onClick={() => navigate(-1)} className="btn-secondary">
              &larr; Go Back
            </button>
            <Link to="/history" className="btn-primary">
              View History
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isGait = prediction.predictionType === "video_gait" || prediction.predictionType === "video";
  const isMri = prediction.predictionType === "mri";
  const hasGaitModel = Boolean(prediction.videoGaitDetails?.predictionAvailable);

  const getRiskClass = (risk) => {
    if (risk === "Low") return "badge-low";
    if (risk === "Medium") return "badge-medium";
    if (risk === "High") return "badge-high";
    if (risk === "Indeterminate") return "badge-medium";
    return "badge-low";
  };

  const getRiskColor = (risk) => {
    if (risk === "Low") return "var(--green)";
    if (risk === "Medium") return "var(--orange)";
    if (risk === "High") return "var(--red)";
    if (risk === "Indeterminate") return "var(--primary-color)";
    return "var(--primary-color)";
  };

  const getRecommendations = (risk) => {
    if (isGait) {
      return (
        <div className="recommendations-box" style={{ borderLeft: "6px solid var(--primary-color)", background: "rgba(2, 132, 199, 0.05)" }}>
          <h4 className="recommendation-header font-bold" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)" }}>
            <FaWalking /> Gait Analysis Clinical Follow-up & Observations
          </h4>
          <p className="recommendation-desc">
            Computer-vision kinematic measurements have been extracted from your walking video. Because uncalibrated single-camera video produces kinematic estimates, findings should be reviewed in clinical context.
          </p>
          <ul className="recommendations-bullets">
            <li><strong>Neurologist Review:</strong> If you or family members observe motor stiffness, shuffling steps, unilateral arm swing reduction, or balance difficulties, share this report with a neurologist.</li>
            <li><strong>Orthopedic Considerations:</strong> Joint range of motion and bilateral asymmetry can also be caused by musculoskeletal factors (e.g. knee arthritis, past ankle sprains).</li>
            <li><strong>Longitudinal Assessment:</strong> For tracking movement consistency over time, record future videos from the same distance, angle, and lighting conditions.</li>
          </ul>
        </div>
      );
    }

    if (isMri) {
      return (
        <div className={`recommendations-box ${risk === "High" ? "border-red" : "border-green"}`}>
          <h4 className={`recommendation-header font-bold ${risk === "High" ? "text-red" : "text-green"}`} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {risk === "High" ? <FaMedkit /> : <FaCheckCircle />} Neuroimaging Follow-up Actions ({risk} Risk)
          </h4>
          <p className="recommendation-desc">
            {risk === "High"
              ? "Deep neural network analysis detected structural patterns statistically correlated with Parkinsonian cohorts in research datasets."
              : "Neuroimaging scan patterns align with healthy baseline reference cohorts."}
          </p>
          <ul className="recommendations-bullets">
            {risk === "High" ? (
              <>
                <li><strong>Neurologist Consultation:</strong> Consult with a neurologist for comprehensive motor and cognitive examination.</li>
                <li><strong>Clinical Radiologist Review:</strong> Formal multi-sequence MRI evaluation is required for clinical diagnosis.</li>
                <li>Download this PDF report to share with your medical provider.</li>
              </>
            ) : (
              <>
                <li>Maintain routine periodic wellness examinations.</li>
                <li>Notify your physician if you develop new motor, tremor, or balance symptoms.</li>
                <li>This transfer learning screening tool does not replace a clinical radiologist interpretation.</li>
              </>
            )}
          </ul>
        </div>
      );
    }

    if (risk === "Low") {
      return (
        <div className="recommendations-box border-green">
          <h4 className="recommendation-header text-green font-bold" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaCheckCircle /> Recommended Follow-up Actions (Low Risk)
          </h4>
          <p className="recommendation-desc">
            Acoustic markers and frequency distributions fall within normal healthy baselines. 
            No indications of Parkinsonian vocal tremors, micro-shimmer deviations, or Jitter perturbations were detected.
          </p>
          <ul className="recommendations-bullets">
            <li>No clinical speech or motor consultations are recommended.</li>
            <li>Maintain general vocal health (stay hydrated, avoid speech strain).</li>
            <li>Re-test in 6 months to maintain a baseline record.</li>
          </ul>
        </div>
      );
    } else if (risk === "Medium") {
      return (
        <div className="recommendations-box border-orange">
          <h4 className="recommendation-header text-orange font-bold" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaExclamationCircle /> Recommended Follow-up Actions (Medium Risk)
          </h4>
          <p className="recommendation-desc">
            Vocal features indicate slight variance in fundamental frequencies or amplitude stability. 
            This can occasionally occur due to environmental noise, fatigue, or common throat hoarseness.
          </p>
          <ul className="recommendations-bullets">
            <li>Re-take the assessment in an ultra-quiet room, holding a steady 'ah' sound.</li>
            <li>If vocal fatigue or mild motor symptoms persist, consult a family physician.</li>
            <li>Log assessments weekly to monitor feature variations.</li>
          </ul>
        </div>
      );
    } else {
      return (
        <div className="recommendations-box border-red">
          <h4 className="recommendation-header text-red font-bold" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaMedkit /> Recommended Follow-up Actions (High Risk)
          </h4>
          <p className="recommendation-desc">
            Acoustic measurements indicate high variance in micro-frequency perturbations and Harmonics-to-Noise spectral indices. 
            These properties are statistically associated with Parkinsonian hypokinetic dysarthria.
          </p>
          <ul className="recommendations-bullets">
            <li><strong>Clinical Consultation:</strong> Schedule an appointment with a neurologist or speech therapist.</li>
            <li>Download and share this PDF report with your doctor as baseline reference data.</li>
            <li>A comprehensive clinical neurological examination is required for diagnosis.</li>
          </ul>
        </div>
      );
    }
  };

  const riskLevel = prediction.riskLevel || "Low";
  const confidenceNum = typeof prediction.confidence === "number" ? prediction.confidence : 0;
  const confidenceStr = confidenceNum.toFixed(1);

  // Convert features map to JS object safely
  const featuresObj = (prediction.features && typeof prediction.features === "object")
    ? (typeof prediction.features.toJSON === "function" ? prediction.features.toJSON() : prediction.features)
    : {};

  const biomarkerCardsData = [
    { key: "fo", label: "Fundamental Frequency (F0)", range: "85 - 260 Hz", explanation: "Average vocal pitch. Lower values can suggest rigidity of vocal folds." },
    { key: "jitter_local", label: "Jitter (Local)", range: "< 1.04%", percentage: true, explanation: "Vocal frequency stability. High Jitter indicates vocal tremor." },
    { key: "shimmer_local", label: "Shimmer (Local)", range: "< 3.80%", percentage: true, explanation: "Vocal amplitude variation. Higher Shimmer signals voice hoarseness." },
    { key: "hnr", label: "Harmonics-to-Noise (HNR)", range: "> 20.00 dB", suffix: " dB", explanation: "Spectral signal purity. Lower HNR signals breathiness." },
    { key: "nhr", label: "Noise-to-Harmonics (NHR)", range: "< 0.02", explanation: "Proportion of noise in the voice. High values signify hoarseness." },
    { key: "rpde", label: "Recurrence Period Density (RPDE)", range: "< 0.45", explanation: "Signal chaos complexity. Higher value indicates vocal disorder." },
    { key: "dfa", label: "Signal Fractal Exponent (DFA)", range: "< 0.60", explanation: "Long-term fractal noise scaling in voice acoustics." },
    { key: "spread1", label: "Frequency Spread (Spread1)", range: "Nonlinear scale", explanation: "Fundamental frequency variation spread metric." },
    { key: "spread2", label: "Frequency Spread (Spread2)", range: "Nonlinear scale", explanation: "Index of pitch variability stability during vocalization." },
    { key: "ppe", label: "Pitch Period Entropy (PPE)", range: "< 0.15", explanation: "Entropy of pitch variations. Sensitive to motor-speech tremor." }
  ];

  const handleDownloadPDF = async () => {
    if (!prediction || !prediction._id) return;
    try {
      setDownloading(true);
      setDownloadError("");
      const response = await API.get(`/api/predictions/${prediction._id}/report`, {
        responseType: "blob"
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Parkinson_Report_${prediction._id}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF download failed:", err);
      const msg = err.response?.data?.message || "Failed to download PDF report. Session may have expired or a server error occurred.";
      setDownloadError(msg);
    } finally {
      setDownloading(false);
    }
  };

  const handleEmailReport = async () => {
    if (!prediction || !prediction._id) return;
    const confirmSend = window.confirm("Request a secure report access email sent to your registered email address?");
    if (!confirmSend) return;

    try {
      setSendingEmail(true);
      setEmailNotice("");
      await API.post(`/api/predictions/${prediction._id}/email-report`);
      setEmailNotice("Report access email dispatched successfully! Please check your inbox.");
    } catch (err) {
      console.error("Email report failed:", err);
      const msg = err.response?.data?.message || "Failed to dispatch email request. Please try again later.";
      setEmailNotice(`Email Request Error: ${msg}`);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="container result-container"
    >
      {/* Header block */}
      <div className="result-header-block mb-6">
        <div>
          <button onClick={() => navigate(-1)} className="btn-secondary btn-small" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
            <FaArrowLeft /> Back to Previous
          </button>
          <h1 className="page-title">
            {isMri 
              ? "MRI Neuroimaging Assessment Report" 
              : isGait
              ? "Video Gait Kinematics & Screening Report"
              : "Screening Assessment Report"}
          </h1>
          <p className="page-subtitle">
            {isMri 
              ? "MRI neuroimaging assessment" 
              : isGait
              ? "Video-based computer vision gait kinematics assessment"
              : "Acoustic assessment"}{" "}
            computed on {prediction.createdAt ? new Date(prediction.createdAt).toLocaleString() : "N/A"}
          </p>
        </div>
        <div className="header-actions" style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="btn-success btn-large font-semibold"
            style={{ display: "flex", alignItems: "center", gap: "8px", cursor: downloading ? "wait" : "pointer" }}
          >
            <FaFilePdf /> {downloading ? "Generating PDF..." : "Download PDF Report"}
          </button>

          <button
            onClick={handleEmailReport}
            disabled={sendingEmail}
            className="btn-secondary btn-large font-semibold"
            style={{ display: "flex", alignItems: "center", gap: "8px", cursor: sendingEmail ? "wait" : "pointer" }}
          >
            <FaEnvelope /> {sendingEmail ? "Sending Email..." : "Email Report Link"}
          </button>
        </div>
      </div>

      {downloadError && (
        <div className="recommendations-box border-red mb-6" style={{ padding: "14px" }}>
          <span style={{ color: "var(--red)", fontWeight: "600", fontSize: "13.5px", display: "flex", alignItems: "center", gap: "6px" }}>
            <FaExclamationTriangle /> {downloadError}
          </span>
        </div>
      )}

      {emailNotice && (
        <div className="recommendations-box border-green mb-6" style={{ padding: "14px" }}>
          <span style={{ color: "var(--green)", fontWeight: "600", fontSize: "13.5px", display: "flex", alignItems: "center", gap: "6px" }}>
            <FaCheckCircle /> {emailNotice}
          </span>
        </div>
      )}

      {/* Medical & Screening Disclaimer Banner */}
      <div className="recommendations-box border-orange mb-6" style={{ background: "rgba(245, 158, 11, 0.06)", borderLeft: "6px solid var(--orange)" }}>
        <h4 style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--orange)", fontWeight: "700" }}>
          <FaInfoCircle /> Research Prototype Notice & Medical Disclaimer
        </h4>
        <p style={{ fontSize: "13.5px", marginTop: "4px", color: "var(--text-secondary)" }}>
          {prediction.predictionType === "mri"
            ? "This MRI image analysis tool is an educational machine learning demonstration using transfer learning (MobileNetV2). It is NOT a certified medical diagnostic system, has not received regulatory clearance, and cannot diagnose or rule out Parkinson's disease. Clinical correlation by a licensed neurologist is mandatory."
            : (prediction.predictionType === "video_gait" || prediction.predictionType === "video")
            ? "This video gait analysis tool is an educational research prototype using computer vision (MediaPipe Pose + OpenCV). It provides biomechanical gait measurements and is NOT a certified medical diagnostic system. Clinical evaluation by a licensed neurologist is mandatory."
            : "This system uses machine learning models trained on synthetic baseline acoustic metrics to evaluate voice tremor patterns. It serves as an experimental screening research aid and does NOT constitute a medical diagnosis. Model confidence represents statistical classification probability, not calibrated clinical risk."}
        </p>
      </div>

      {/* Main summary card with gauge */}
      <div className="result-summary-card">
        <div className="risk-level-container">
          {/* Circular Gauge */}
          <div className="meter-circle" style={{ borderColor: getRiskColor(riskLevel), borderWidth: "12px", position: "relative" }}>
            <span className="meter-value" style={{ 
              color: getRiskColor(riskLevel),
              fontSize: (isGait && !hasGaitModel) ? "18px" : "28px"
            }}>
              {(isGait && !hasGaitModel) ? "N/A" : `${confidenceStr}%`}
            </span>
            <span className="meter-label">
              {(isGait && !hasGaitModel) ? "Screening" : "Risk Conf."}
            </span>
          </div>

          <div className="risk-classification-text">
            <h3>Diagnostic Analytics</h3>
            <div className="risk-badge-row" style={{ marginTop: "8px" }}>
              <span className={`badge ${getRiskClass(riskLevel)} badge-large`}>
                {isMri && prediction.mriDetails?.predictedClass
                  ? `${prediction.mriDetails.predictedClass} (${riskLevel} Risk)`
                  : isGait
                  ? (hasGaitModel
                    ? `${riskLevel} Risk Classification`
                    : "Biomechanical Gait Screening")
                  : `${riskLevel} Risk Classification`}
              </span>
            </div>
            <p className="classification-statement" style={{ marginTop: "12px" }}>
              {isGait && !hasGaitModel ? (
                <>
                  Computer-vision landmark tracking extracted <strong>8 physical gait parameters</strong> (cadence, step interval, symmetry, and joint ROM). In accordance with clinical AI safety best practices, a disease diagnosis score is not fabricated without a model trained on clinical cohorts (such as CARE-PD).
                </>
              ) : (
                <>
                  The machine learning model predicted class label <strong>{prediction.label !== null && prediction.label !== undefined ? prediction.label : "N/A"}</strong>.
                  {isMri
                    ? ` This represents detection of ${prediction.label === 1 ? "structural brain scan patterns statistically correlated with Parkinson's Disease (PD)" : "standard healthy baseline neuroimaging patterns"}.`
                    : isGait
                    ? ` This represents computer-vision kinematic tracking of human walking mechanics.`
                    : ` This represents the detection of ${prediction.label === 1 ? "vocal tremor biomarkers characteristic of Parkinson's" : "standard baseline voice properties"}.`}
                </>
              )}
            </p>
          </div>
        </div>

        {prediction.voicePath && (
          <div className="playback-section mt-6" style={{ marginTop: "30px" }}>
            <h4 className="playback-title font-semibold" style={{ display: "flex", alignItems: "center", gap: "6px" }}><FaPlay /> Playback Audio Sample</h4>
            {audioUrl ? (
              <audio src={audioUrl} controls className="audio-playback-control" style={{ marginTop: "10px" }} />
            ) : (
              <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginTop: "10px" }}>Loading audio sample...</p>
            )}
          </div>
        )}
      </div>

      {/* EXPLAINABLE AI (XAI) SECTION */}
      {prediction.globalFeatureImportances && typeof prediction.globalFeatureImportances === "object" && Object.keys(prediction.globalFeatureImportances).length > 0 && (
        <div className="section-card mt-8">
          <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)" }}>
            <FaSlidersH /> Explainable AI (XAI): Model Feature Weights
          </h3>
          <p className="section-subtitle">
            Global Random Forest feature importances representing overall metric weights learned by the model during training.
          </p>

          <div style={{ marginTop: "20px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px" }}>
            {Object.entries(prediction.globalFeatureImportances)
              .sort((a, b) => Number(b[1]) - Number(a[1]))
              .slice(0, 8)
              .map(([key, weight]) => {
                const wNum = typeof weight === "number" ? weight : 0;
                return (
                  <div key={key} style={{ background: "rgba(148, 163, 184, 0.05)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "700" }}>
                      <span>{key.toUpperCase()}</span>
                      <span style={{ color: "var(--primary-color)" }}>{(wNum * 100).toFixed(1)}% weight</span>
                    </div>
                    <div style={{ background: "rgba(148, 163, 184, 0.2)", height: "6px", borderRadius: "3px", marginTop: "8px", overflow: "hidden" }}>
                      <div style={{ width: `${Math.min(100, wNum * 300)}%`, height: "100%", background: "var(--primary-color)" }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* SCALER BASELINE RELATIVE DEVIATIONS TABLE */}
      {prediction.featureDeviations && typeof prediction.featureDeviations === "object" && Object.keys(prediction.featureDeviations).length > 0 && (
        <div className="section-card mt-8">
          <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <FaSlidersH /> Feature Measurements vs Scaler Baseline Statistics
          </h3>
          <p className="section-subtitle">
            Relative Z-score deviations calculated strictly against the model's fitted scaler training statistics (mean & standard deviation). 
            <em> Note: Relative deviations represent statistical position relative to training data, NOT causal explanations or clinical diagnoses.</em>
          </p>

          <div className="table-responsive" style={{ marginTop: "16px" }}>
            <table className="recent-table">
              <thead>
                <tr>
                  <th>Acoustic Metric</th>
                  <th>Measured Value</th>
                  <th>Scaler Training Mean</th>
                  <th>Scaler Std Dev</th>
                  <th>Relative Z-Score</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(prediction.featureDeviations).slice(0, 10).map(([key, dev]) => {
                  const measured = dev?.measured ?? "N/A";
                  const scalerMean = dev?.scalerMean ?? "N/A";
                  const scalerStd = dev?.scalerStd ?? "N/A";
                  const zScoreNum = typeof dev?.zScore === "number" ? dev.zScore : null;
                  const zScoreDisplay = zScoreNum !== null ? (zScoreNum > 0 ? `+${zScoreNum}` : zScoreNum) : "N/A";
                  const isHighZ = zScoreNum !== null && Math.abs(zScoreNum) > 1.5;

                  return (
                    <tr key={key}>
                      <td className="font-semibold" style={{ color: "var(--primary-color)" }}>{key.toUpperCase()}</td>
                      <td className="font-mono">{measured}</td>
                      <td className="font-mono text-secondary">{scalerMean}</td>
                      <td className="font-mono text-secondary">{scalerStd}</td>
                      <td>
                        <span className={`badge ${isHighZ ? "badge-high" : "badge-low"}`}>
                          {zScoreDisplay} σ
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Clinical Review Remarks */}
      {(prediction.doctorNotes || prediction.recommendations) && (
        <div className="section-card mt-8" style={{ borderLeft: "6px solid var(--primary-color)" }}>
          <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)" }}><FaClipboardCheck /> Clinical Practitioner Review</h3>
          <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "10px" }}>
            {prediction.doctorNotes && (
              <p style={{ fontSize: "15px" }}><strong>Medical Remarks:</strong> "{prediction.doctorNotes}"</p>
            )}
            {prediction.recommendations && (
              <p style={{ fontSize: "15px" }}><strong>Doctor Recommendation:</strong> <span className="badge badge-low" style={{ textTransform: "capitalize", fontWeight: "700" }}>{prediction.recommendations}</span></p>
            )}
          </div>
        </div>
      )}

      {/* Recommendations card */}
      <div className="mt-8">
        {getRecommendations(riskLevel)}
      </div>

      {/* Extracted Biomarkers or MRI Scan Information */}
      {prediction.predictionType === "mri" ? (
        <div className="section-card mt-8">
          <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)" }}>
            🧠 Neuroimaging Scan Profile & Convolutional Feature Summary
          </h3>
          <p className="section-subtitle">
            Processed through 224&times;224 ImageNet-normalized MobileNetV2 deep neural network.
          </p>

          <div className="features-grid" style={{ marginTop: "20px" }}>
            <div className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
              <span className="feature-label">Scan File Name</span>
              <span className="feature-val" style={{ color: "var(--primary-color)", fontSize: "16px" }}>
                {prediction.mriDetails?.imageFilename || "mri_scan.png"}
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Original uploaded neuroimaging slice
              </p>
            </div>

            <div className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
              <span className="feature-label">Image Input Dimensions</span>
              <span className="feature-val" style={{ color: "var(--secondary-color)", fontSize: "16px" }}>
                {prediction.mriDetails?.imageDimensions || "224x224"}
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Resized to standard 224&times;224 RGB tensor
              </p>
            </div>

            <div className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
              <span className="feature-label">Normal Pattern Probability</span>
              <span className="feature-val" style={{ color: "var(--green)", fontSize: "18px" }}>
                {((prediction.mriDetails?.normalProbability ?? (prediction.label === 0 ? prediction.confidence / 100 : (100 - prediction.confidence) / 100)) * 100).toFixed(1)}%
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Statistical alignment with healthy cohort
              </p>
            </div>

            <div className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
              <span className="feature-label">PD Pattern Probability</span>
              <span className="feature-val" style={{ color: "var(--red)", fontSize: "18px" }}>
                {((prediction.mriDetails?.pdProbability ?? (prediction.label === 1 ? prediction.confidence / 100 : (100 - prediction.confidence) / 100)) * 100).toFixed(1)}%
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Statistical alignment with Parkinson's cohort
              </p>
            </div>
          </div>
        </div>
      ) : (prediction.predictionType === "video_gait" || prediction.predictionType === "video") ? (
        <div className="section-card mt-8">
          <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)" }}>
            <FaWalking /> Video Gait Kinematics & Biomechanical Profile
          </h3>
          <p className="section-subtitle">
            Extracted from walking video using MediaPipe Pose 33-landmark estimation and OpenCV signal processing.
          </p>

          <div className="features-grid" style={{ marginTop: "20px" }}>
            <div className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
              <span className="feature-label">Step Cadence</span>
              <span className="feature-val" style={{ color: "var(--primary-color)", fontSize: "18px" }}>
                {prediction.videoGaitDetails?.cadenceStepsPerMin ? `${prediction.videoGaitDetails.cadenceStepsPerMin} steps/min` : "N/A"}
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Normal adult range: 100 - 125 steps/min
              </p>
            </div>

            <div className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
              <span className="feature-label">Mean Step Duration</span>
              <span className="feature-val" style={{ color: "var(--secondary-color)", fontSize: "18px" }}>
                {prediction.videoGaitDetails?.meanStepTimeSec ? `${prediction.videoGaitDetails.meanStepTimeSec} s` : "N/A"}
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Std Dev: {prediction.videoGaitDetails?.stepTimeStdSec ? `${prediction.videoGaitDetails.stepTimeStdSec} s` : "0.000 s"}
              </p>
            </div>

            <div className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
              <span className="feature-label">Bilateral Symmetry Index</span>
              <span className="feature-val" style={{ color: "var(--accent-color)", fontSize: "18px" }}>
                {prediction.videoGaitDetails?.overallSymmetryIndex ? `${prediction.videoGaitDetails.overallSymmetryIndex}%` : "N/A"}
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                100% = perfect left-right movement balance
              </p>
            </div>

            <div className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
              <span className="feature-label">Stride Timing Variability (CV)</span>
              <span className="feature-val" style={{ color: "var(--orange)", fontSize: "18px" }}>
                {prediction.videoGaitDetails?.strideVariabilityCvPercent ? `${prediction.videoGaitDetails.strideVariabilityCvPercent}%` : "N/A"}
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Coefficient of variation across gait cycles
              </p>
            </div>

            <div className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
              <span className="feature-label">Knee Range of Motion</span>
              <span className="feature-val" style={{ color: "var(--text-main)", fontSize: "16px" }}>
                L: {prediction.videoGaitDetails?.leftKneeRomDeg ? `${prediction.videoGaitDetails.leftKneeRomDeg}°` : "N/A"} | R: {prediction.videoGaitDetails?.rightKneeRomDeg ? `${prediction.videoGaitDetails.rightKneeRomDeg}°` : "N/A"}
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Knee flexion/extension amplitude
              </p>
            </div>

            <div className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
              <span className="feature-label">Pose Tracking Quality</span>
              <span className="feature-val" style={{ color: "var(--green)", fontSize: "16px" }}>
                {prediction.videoGaitDetails?.usableFrames ?? "N/A"} / {prediction.videoGaitDetails?.totalFrames ?? "N/A"} frames ({((prediction.videoGaitDetails?.usableFrameRatio ?? 0) * 100).toFixed(1)}%)
              </span>
              <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px" }}>
                Confidence: {((prediction.videoGaitDetails?.meanPoseTrackingConfidence ?? 0) * 100).toFixed(1)}%
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="section-card mt-8">
          <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}><FaSlidersH /> Extracted Acoustic Biomarkers</h3>
          <p className="section-subtitle">These voice metrics represent frequency shifts, tremors, and hoarseness properties extracted from the voice recording.</p>
          
          <div className="features-grid" style={{ marginTop: "24px" }}>
            {biomarkerCardsData.map((feat) => {
              const rawVal = featuresObj[feat.key];
              let displayVal = "N/A";
              if (typeof rawVal === "number") {
                if (feat.percentage) {
                  displayVal = `${(rawVal * 100).toFixed(4)}%`;
                } else {
                  displayVal = `${rawVal.toFixed(5)}${feat.suffix || ""}`;
                }
              }
              return (
                <div key={feat.key} className="feature-mini-card" style={{ background: "rgba(148, 163, 184, 0.04)" }}>
                  <span className="feature-label">{feat.label}</span>
                  <span className="feature-val" style={{ color: "var(--primary-color)" }}>{displayVal}</span>
                  <div style={{ fontSize: "11px", color: "var(--text-light)", fontWeight: "600", marginTop: "4px" }}>
                    Normal Range: {feat.range}
                  </div>
                  <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "8px", borderTop: "1px solid var(--border-color)", paddingTop: "8px" }}>
                    <FaInfoCircle style={{ marginRight: "4px", verticalAlign: "middle" }} /> {feat.explanation}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}

