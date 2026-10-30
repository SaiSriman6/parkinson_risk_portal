import { useState, useEffect, useMemo } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import API from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import { motion, AnimatePresence } from "framer-motion";
import { 
  FaArrowLeft, FaExchangeAlt, FaInfoCircle, FaCalendarAlt, 
  FaHeartbeat, FaSlidersH, FaHistory, FaCheckCircle, FaExclamationTriangle,
  FaFilePdf, FaMicrophone, FaBrain, FaChevronDown, FaChevronUp,
  FaQuestionCircle, FaLayerGroup, FaChartLine, FaClock
} from "react-icons/fa";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid
} from "recharts";

export default function AssessmentComparison() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const id1Param = searchParams.get("id1") || "";
  const id2Param = searchParams.get("id2") || "";

  const [id1, setId1] = useState(id1Param);
  const [id2, setId2] = useState(id2Param);
  const [modalityFilter, setModalityFilter] = useState("all"); // "all" | "voice" | "mri"
  const [allAssessments, setAllAssessments] = useState([]);
  const [comparisonData, setComparisonData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState("");
  const [activeChartGroup, setActiveChartGroup] = useState("frequency");
  const [downloadingId, setDownloadingId] = useState(null);
  const [showExplanation, setShowExplanation] = useState(true);

  const handleDownloadPDF = async (predId) => {
    try {
      setDownloadingId(predId);
      const response = await API.get(`/api/predictions/${predId}/report`, {
        responseType: "blob"
      });

      const blob = new Blob([response.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Parkinson_Report_${predId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Comparison PDF download failed:", err);
      alert("Failed to download PDF report. Session may have expired.");
    } finally {
      setDownloadingId(null);
    }
  };

  // Fetch all user assessments for selection dropdowns
  useEffect(() => {
    const fetchAssessments = async () => {
      try {
        setLoading(true);
        const res = await API.get("/api/predictions?page=1&limit=100");
        const predictions = res.data.predictions || [];
        setAllAssessments(predictions);

        // Pre-select latest two if parameters not provided
        let sel1 = id1Param;
        let sel2 = id2Param;
        if (!sel1 || !sel2) {
          if (predictions.length >= 2) {
            // Prefer latest two of the same modality if possible
            const voiceOnly = predictions.filter(p => (p.predictionType || "voice") === "voice");
            const mriOnly = predictions.filter(p => p.predictionType === "mri");

            if (voiceOnly.length >= 2) {
              sel1 = voiceOnly[1]._id; // Earlier
              sel2 = voiceOnly[0]._id; // Later
            } else if (mriOnly.length >= 2) {
              sel1 = mriOnly[1]._id;
              sel2 = mriOnly[0]._id;
              setModalityFilter("mri");
            } else {
              sel1 = predictions[1]._id;
              sel2 = predictions[0]._id;
            }

            setId1(sel1);
            setId2(sel2);
            setSearchParams({ id1: sel1, id2: sel2 });
          }
        }
      } catch (err) {
        console.error("Failed to load assessments:", err);
        setError("Failed to load historical assessments for comparison.");
      } finally {
        setLoading(false);
      }
    };

    fetchAssessments();
  }, []);

  // Filtered assessments based on modality tab
  const filteredAssessments = useMemo(() => {
    if (modalityFilter === "voice") {
      return allAssessments.filter(a => (a.predictionType || "voice") === "voice");
    }
    if (modalityFilter === "mri") {
      return allAssessments.filter(a => a.predictionType === "mri");
    }
    return allAssessments;
  }, [allAssessments, modalityFilter]);

  // Handle switching modality filter tabs
  const handleModalityTabChange = (newModality) => {
    setModalityFilter(newModality);
    let candidates = allAssessments;
    if (newModality === "voice") {
      candidates = allAssessments.filter(a => (a.predictionType || "voice") === "voice");
    } else if (newModality === "mri") {
      candidates = allAssessments.filter(a => a.predictionType === "mri");
    }

    if (candidates.length >= 2) {
      const newSel1 = candidates[1]._id;
      const newSel2 = candidates[0]._id;
      setId1(newSel1);
      setId2(newSel2);
      setSearchParams({ id1: newSel1, id2: newSel2 });
    }
  };

  // Fetch comparison data whenever selected IDs change
  useEffect(() => {
    if (!id1 || !id2 || id1 === id2) return;

    const fetchComparison = async () => {
      try {
        setComparing(true);
        setError("");
        const res = await API.get(`/api/predictions/compare?id1=${id1}&id2=${id2}`);
        setComparisonData(res.data);
      } catch (err) {
        console.error("Comparison fetch error:", err);
        setError(err.response?.data?.message || "Failed to compare selected assessments.");
      } finally {
        setComparing(false);
      }
    };

    fetchComparison();
  }, [id1, id2]);

  const handleSelectCompare = (newId1, newId2) => {
    if (newId1 === newId2) {
      setError("Please select two different assessments to compare.");
      return;
    }
    setId1(newId1);
    setId2(newId2);
    setSearchParams({ id1: newId1, id2: newId2 });
  };

  const getRiskClass = (risk) => {
    if (risk === "Low") return "badge-low";
    if (risk === "Medium") return "badge-medium";
    if (risk === "High") return "badge-high";
    return "";
  };

  const getRiskColor = (risk) => {
    if (risk === "Low") return "var(--green)";
    if (risk === "Medium") return "var(--orange)";
    if (risk === "High") return "var(--red)";
    return "var(--primary-color)";
  };

  if (loading) return <LoadingSpinner message="Loading historical screening records..." />;

  const hasEnoughAssessments = allAssessments.length >= 2;

  // Feature metadata for descriptive table and chart grouping
  const featureMetadata = [
    { key: "fo", label: "F0 (Pitch Hz)", desc: "Average Fundamental Frequency", group: "frequency" },
    { key: "fhi", label: "Fhi (Max Hz)", desc: "Maximum Fundamental Frequency", group: "frequency" },
    { key: "flo", label: "Flo (Min Hz)", desc: "Minimum Fundamental Frequency", group: "frequency" },
    { key: "jitter_local", label: "Jitter Local (%)", desc: "Frequency variation ratio", group: "perturbation", isPct: true },
    { key: "jitter_rap", label: "Jitter RAP (%)", desc: "Relative average perturbation", group: "perturbation", isPct: true },
    { key: "jitter_ppq5", label: "Jitter PPQ5 (%)", desc: "5-point period perturbation", group: "perturbation", isPct: true },
    { key: "shimmer_local", label: "Shimmer Local (%)", desc: "Amplitude variation ratio", group: "perturbation", isPct: true },
    { key: "shimmer_db", label: "Shimmer (dB)", desc: "Amplitude variation in decibels", group: "spectral" },
    { key: "shimmer_apq3", label: "Shimmer APQ3 (%)", desc: "3-point amplitude perturbation", group: "perturbation", isPct: true },
    { key: "shimmer_apq5", label: "Shimmer APQ5 (%)", desc: "5-point amplitude perturbation", group: "perturbation", isPct: true },
    { key: "hnr", label: "HNR (dB)", desc: "Harmonics-to-noise spectral ratio", group: "spectral" },
    { key: "nhr", label: "NHR Ratio", desc: "Noise-to-harmonics ratio", group: "nonlinear" },
    { key: "rpde", label: "RPDE Entropy", desc: "Recurrence period density entropy", group: "nonlinear" },
    { key: "dfa", label: "DFA Exponent", desc: "Signal fractal scaling exponent", group: "nonlinear" },
    { key: "ppe", label: "PPE Entropy", desc: "Pitch period entropy index", group: "nonlinear" },
    { key: "spread1", label: "Spread1 Index", desc: "Nonlinear frequency variation spread 1", group: "nonlinear" },
    { key: "spread2", label: "Spread2 Index", desc: "Nonlinear frequency variation spread 2", group: "nonlinear" },
    { key: "d2", label: "D2 Dimension", desc: "Correlation dimension index", group: "nonlinear" }
  ];

  // Chart data preparation for selected group
  const chartGroupItems = featureMetadata.filter((f) => f.group === activeChartGroup);
  const chartData = comparisonData?.comparisons ? chartGroupItems.map((meta) => {
    const comp = comparisonData.comparisons[meta.key] || {};
    let val1 = comp.earlierValue;
    let val2 = comp.laterValue;
    if (meta.isPct) {
      if (typeof val1 === "number") val1 = Number((val1 * 100).toFixed(3));
      if (typeof val2 === "number") val2 = Number((val2 * 100).toFixed(3));
    }
    return {
      feature: meta.label,
      Earlier: val1 ?? 0,
      Later: val2 ?? 0
    };
  }) : [];

  const comparisonType = comparisonData?.comparisonType || "voice_vs_voice";

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="container history-container"
    >
      {/* Header Block */}
      <div className="result-header-block mb-6">
        <div>
          <button onClick={() => navigate("/history")} className="btn-secondary btn-small" style={{ marginBottom: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
            <FaArrowLeft /> Back to History
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <h1 className="page-title" style={{ margin: 0 }}>Compare Screenings & Biomarker Trends</h1>
            <span className="badge badge-low" style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "4px" }}>
              <FaExchangeAlt /> Longitudinal Analytics
            </span>
          </div>
          <p className="page-subtitle" style={{ marginTop: "6px" }}>
            Select any two historical screenings (speech recordings or brain MRI scans) to track biomarker evolution, risk transitions, and clinical indicators over time.
          </p>
        </div>
      </div>

      {/* Feature Explainer Guide (Interactive & User-Friendly) */}
      <div className="section-card mb-6" style={{ background: "rgba(30, 41, 59, 0.4)", border: "1px solid var(--border-color)", borderRadius: "14px", overflow: "hidden" }}>
        <div 
          onClick={() => setShowExplanation(!showExplanation)}
          style={{ 
            display: "flex", 
            justifyContent: "space-between", 
            alignItems: "center", 
            padding: "16px 20px", 
            cursor: "pointer",
            background: "rgba(59, 130, 246, 0.08)",
            borderBottom: showExplanation ? "1px solid var(--border-color)" : "none"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <FaQuestionCircle style={{ color: "var(--primary-color)", fontSize: "18px" }} />
            <div>
              <strong style={{ fontSize: "15px", color: "var(--text-primary)" }}>
                What is the "Compare Screenings" feature & How does it work?
              </strong>
              <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: 0 }}>
                Click to {showExplanation ? "collapse" : "expand"} the comprehensive guide to understanding longitudinal comparisons.
              </p>
            </div>
          </div>
          <button className="btn-secondary btn-small" style={{ padding: "6px 10px" }}>
            {showExplanation ? <FaChevronUp /> : <FaChevronDown />}
          </button>
        </div>

        <AnimatePresence>
          {showExplanation && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{ padding: "20px" }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginBottom: "16px" }}>
                <div style={{ background: "rgba(148, 163, 184, 0.05)", padding: "16px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)", fontWeight: "700", marginBottom: "8px" }}>
                    <FaChartLine /> 1. Why Compare Two Screenings?
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", margin: 0 }}>
                    A single screening only captures your biomarkers at one moment. Comparing an <strong>earlier baseline</strong> with a <strong>later follow-up</strong> reveals subtle longitudinal trends—such as vocal tremor changes or MRI confidence shifts—providing actionable insights for clinical discussions.
                  </p>
                </div>

                <div style={{ background: "rgba(148, 163, 184, 0.05)", padding: "16px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--secondary-color)", fontWeight: "700", marginBottom: "8px" }}>
                    <FaLayerGroup /> 2. Modality Guidelines
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", margin: 0 }}>
                    <strong>🎙️ Voice vs. Voice:</strong> Compares 22 speech acoustic metrics (Pitch stability, Jitter micro-tremors, Shimmer amplitude variations, and Harmonics).<br />
                    <strong>🧠 MRI vs. MRI:</strong> Compares brain structural scan probabilities, confidence, and imaging classifications.<br />
                    <strong>🔄 Multi-Modal:</strong> Examines how your voice and imaging results correlate.
                  </p>
                </div>

                <div style={{ background: "rgba(148, 163, 184, 0.05)", padding: "16px", borderRadius: "10px", border: "1px solid var(--border-color)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--green)", fontWeight: "700", marginBottom: "8px" }}>
                    <FaHeartbeat /> 3. How to Read Results
                  </div>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: "1.5", margin: 0 }}>
                    Look for the <strong>Risk Trajectory</strong> badge (Stable, Improved, or Elevated) and the <strong>Confidence Shift</strong> percentage. In the charts and tables below, positive (+) and negative (-) shifts highlight exactly which biological indicators evolved.
                  </p>
                </div>
              </div>

              <div style={{ background: "rgba(245, 158, 11, 0.08)", borderLeft: "4px solid var(--orange)", padding: "12px 16px", borderRadius: "6px" }}>
                <span style={{ fontSize: "12.5px", color: "var(--text-secondary)" }}>
                  <strong>Medical Disclaimer:</strong> This comparison is an educational and exploratory tool. Changes in acoustic measurements or model probabilities do not constitute disease progression or formal diagnosis. Variations may stem from microphone equipment, recording acoustics, or vocal fatigue.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {error && (
        <div className="recommendations-box border-red mb-6" style={{ padding: "14px" }}>
          <span style={{ color: "var(--red)", fontWeight: "600", fontSize: "13.5px", display: "flex", alignItems: "center", gap: "6px" }}>
            <FaExclamationTriangle /> {error}
          </span>
        </div>
      )}

      {!hasEnoughAssessments ? (
        <div className="section-card" style={{ padding: "60px 20px", textAlign: "center" }}>
          <div className="empty-state">
            <span className="empty-state-icon">📊</span>
            <h3 className="empty-state-title">Insufficient Screening History</h3>
            <p className="empty-state-text" style={{ maxWidth: "520px", margin: "8px auto" }}>
              You need at least <strong>2 completed assessments</strong> in your account to unlock side-by-side screening comparison. Record a voice sample or upload an MRI scan to get started.
            </p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "20px" }}>
              <Link to="/predict" className="btn-primary" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <FaMicrophone /> New Voice Assessment
              </Link>
              <Link to="/mri-analysis" className="btn-secondary" style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <FaBrain style={{ color: "var(--primary-color)" }} /> New MRI Analysis
              </Link>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Modality Filter Tabs */}
          <div style={{ display: "flex", gap: "10px", marginBottom: "16px", flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-secondary)", marginRight: "4px" }}>
              Filter Assessments By Modality:
            </span>
            <button 
              className={`btn-small ${modalityFilter === "all" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => handleModalityTabChange("all")}
              style={{ borderRadius: "8px", padding: "6px 14px" }}
            >
              All Screenings ({allAssessments.length})
            </button>
            <button 
              className={`btn-small ${modalityFilter === "voice" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => handleModalityTabChange("voice")}
              style={{ borderRadius: "8px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <FaMicrophone /> Voice Only ({allAssessments.filter(a => (a.predictionType || "voice") === "voice").length})
            </button>
            <button 
              className={`btn-small ${modalityFilter === "mri" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => handleModalityTabChange("mri")}
              style={{ borderRadius: "8px", padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              <FaBrain /> MRI Only ({allAssessments.filter(a => a.predictionType === "mri").length})
            </button>
          </div>

          {/* Assessment Selection Bar */}
          <div className="glass-card mb-6" style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "center" }}>
            <div className="form-group" style={{ flex: 1, minWidth: "260px" }}>
              <label style={{ fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                <FaCalendarAlt /> Assessment A (Baseline / Earlier)
              </label>
              <select value={id1} onChange={(e) => handleSelectCompare(e.target.value, id2)}>
                {filteredAssessments.map((a) => {
                  const isMri = a.predictionType === "mri";
                  const isGait = a.predictionType === "video_gait" || a.predictionType === "video";
                  const icon = isMri ? "🧠 [MRI]" : isGait ? "🚶 [Gait]" : "🎙️ [Voice]";
                  const confStr = typeof a.confidence === "number" ? `${a.confidence.toFixed(1)}% Conf` : "Screening";
                  return (
                    <option key={`a-${a._id}`} value={a._id}>
                      {icon} {new Date(a.createdAt).toLocaleString()} — {a.riskLevel} Risk ({confStr})
                    </option>
                  );
                })}
              </select>
            </div>

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", paddingTop: "20px" }}>
              <span className="badge badge-low" style={{ padding: "10px 14px", borderRadius: "50%" }} title="Comparing Earlier vs Later">
                <FaExchangeAlt />
              </span>
            </div>

            <div className="form-group" style={{ flex: 1, minWidth: "260px" }}>
              <label style={{ fontSize: "13px", fontWeight: "700", display: "flex", alignItems: "center", gap: "6px" }}>
                <FaCalendarAlt /> Assessment B (Follow-Up / Later)
              </label>
              <select value={id2} onChange={(e) => handleSelectCompare(id1, e.target.value)}>
                {filteredAssessments.map((a) => {
                  const isMri = a.predictionType === "mri";
                  const isGait = a.predictionType === "video_gait" || a.predictionType === "video";
                  const icon = isMri ? "🧠 [MRI]" : isGait ? "🚶 [Gait]" : "🎙️ [Voice]";
                  const confStr = typeof a.confidence === "number" ? `${a.confidence.toFixed(1)}% Conf` : "Screening";
                  return (
                    <option key={`b-${a._id}`} value={a._id}>
                      {icon} {new Date(a.createdAt).toLocaleString()} — {a.riskLevel} Risk ({confStr})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {comparing && <LoadingSpinner message="Synthesizing multi-modal assessment comparison..." />}

          {comparisonData && !comparing && (
            <>
              {/* Longitudinal Trajectory Strip */}
              <div className="glass-card mb-6" style={{ background: "rgba(15, 23, 42, 0.6)", padding: "16px 20px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "var(--text-light)" }}>
                      Comparison Mode
                    </span>
                    <div style={{ fontSize: "15px", fontWeight: "700", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                      {comparisonType === "voice_vs_voice" && <>🎙️ Voice-to-Voice</>}
                      {comparisonType === "mri_vs_mri" && <>🧠 MRI-to-MRI</>}
                      {comparisonType === "mixed" && <>🔄 Multi-Modal (Voice + MRI)</>}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "var(--text-light)" }}>
                      Time Between Tests
                    </span>
                    <div style={{ fontSize: "15px", fontWeight: "700", marginTop: "2px", display: "flex", alignItems: "center", gap: "6px" }}>
                      <FaClock style={{ color: "var(--primary-color)" }} />
                      {comparisonData.daysBetween === 0 ? "Same day" : `${comparisonData.daysBetween} day${comparisonData.daysBetween > 1 ? "s" : ""} apart`}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "var(--text-light)" }}>
                      Risk Trajectory
                    </span>
                    <div style={{ marginTop: "2px" }}>
                      {comparisonData.riskTrend === "improved" && (
                        <span className="badge badge-low" style={{ fontSize: "13px" }}>
                          🟢 Improved ({comparisonData.earlierAssessment.riskLevel} &rarr; {comparisonData.laterAssessment.riskLevel})
                        </span>
                      )}
                      {comparisonData.riskTrend === "stable" && (
                        <span className="badge badge-low" style={{ fontSize: "13px", background: "rgba(59, 130, 246, 0.15)", color: "var(--primary-color)" }}>
                          🔵 Stable ({comparisonData.earlierAssessment.riskLevel})
                        </span>
                      )}
                      {comparisonData.riskTrend === "elevated" && (
                        <span className="badge badge-high" style={{ fontSize: "13px" }}>
                          🔴 Elevated ({comparisonData.earlierAssessment.riskLevel} &rarr; {comparisonData.laterAssessment.riskLevel})
                        </span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span style={{ fontSize: "11px", textTransform: "uppercase", fontWeight: "700", color: "var(--text-light)" }}>
                      Confidence Shift
                    </span>
                    <div style={{ fontSize: "15px", fontWeight: "700", marginTop: "2px" }}>
                      {typeof comparisonData.confidenceDiff === "number" ? (
                        comparisonData.confidenceDiff > 0 ? (
                          <span style={{ color: "var(--orange)" }}>+{comparisonData.confidenceDiff.toFixed(1)}%</span>
                        ) : comparisonData.confidenceDiff < 0 ? (
                          <span style={{ color: "var(--green)" }}>{comparisonData.confidenceDiff.toFixed(1)}%</span>
                        ) : (
                          <span style={{ color: "var(--text-secondary)" }}>0.0% (Unchanged)</span>
                        )
                      ) : (
                        <span style={{ color: "var(--text-secondary)" }}>N/A (Screening)</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="profile-grid mb-6">
                {/* Earlier Card */}
                <div className="section-card" style={{ borderTop: "4px solid var(--primary-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: "800", color: "var(--primary-color)" }}>
                      Baseline (Earlier Screening)
                    </span>
                    <span className="badge" style={{ fontSize: "11px", background: "rgba(148, 163, 184, 0.15)" }}>
                      {comparisonData.earlierAssessment.predictionType === "mri" ? "🧠 Brain MRI" : "🎙️ Voice Audio"}
                    </span>
                  </div>

                  <h3 style={{ fontSize: "18px", marginTop: "8px" }}>
                    {new Date(comparisonData.earlierAssessment.createdAt).toLocaleDateString()}
                  </h3>
                  <p style={{ fontSize: "12px", color: "var(--text-light)" }}>
                    {new Date(comparisonData.earlierAssessment.createdAt).toLocaleTimeString()}
                  </p>

                  <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className={`badge ${getRiskClass(comparisonData.earlierAssessment.riskLevel)}`}>
                      {comparisonData.earlierAssessment.riskLevel} Risk
                    </span>
                    <strong style={{ fontSize: "16px", color: getRiskColor(comparisonData.earlierAssessment.riskLevel) }}>
                      {typeof comparisonData.earlierAssessment.confidence === "number" ? `${comparisonData.earlierAssessment.confidence.toFixed(1)}% Conf.` : "N/A (Screening)"}
                    </strong>
                  </div>

                  {comparisonData.earlierAssessment.predictionType === "mri" && comparisonData.earlierAssessment.mriDetails && (
                    <div style={{ marginTop: "12px", padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", fontSize: "12px" }}>
                      <div><strong>Predicted Class:</strong> {comparisonData.earlierAssessment.mriDetails.predictedClass || "Normal"}</div>
                      <div><strong>PD Prob:</strong> {((comparisonData.earlierAssessment.mriDetails.pdProbability || 0) * 100).toFixed(1)}%</div>
                    </div>
                  )}

                  <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Link to={`/result/${comparisonData.earlierAssessment._id}`} className="auth-link" style={{ fontSize: "12.5px" }}>
                      View Full Details &rarr;
                    </Link>
                    <button 
                      onClick={() => handleDownloadPDF(comparisonData.earlierAssessment._id)}
                      disabled={downloadingId === comparisonData.earlierAssessment._id}
                      className="btn-secondary btn-small"
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
                    >
                      <FaFilePdf style={{ color: "var(--red)" }} /> {downloadingId === comparisonData.earlierAssessment._id ? "Downloading..." : "Download PDF"}
                    </button>
                  </div>
                </div>

                {/* Later Card */}
                <div className="section-card" style={{ borderTop: "4px solid var(--secondary-color)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: "12px", textTransform: "uppercase", fontWeight: "800", color: "var(--secondary-color)" }}>
                      Follow-Up (Later Screening)
                    </span>
                    <span className="badge" style={{ fontSize: "11px", background: "rgba(148, 163, 184, 0.15)" }}>
                      {comparisonData.laterAssessment.predictionType === "mri" ? "🧠 Brain MRI" : "🎙️ Voice Audio"}
                    </span>
                  </div>

                  <h3 style={{ fontSize: "18px", marginTop: "8px" }}>
                    {new Date(comparisonData.laterAssessment.createdAt).toLocaleDateString()}
                  </h3>
                  <p style={{ fontSize: "12px", color: "var(--text-light)" }}>
                    {new Date(comparisonData.laterAssessment.createdAt).toLocaleTimeString()}
                  </p>

                  <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span className={`badge ${getRiskClass(comparisonData.laterAssessment.riskLevel)}`}>
                      {comparisonData.laterAssessment.riskLevel} Risk
                    </span>
                    <strong style={{ fontSize: "16px", color: getRiskColor(comparisonData.laterAssessment.riskLevel) }}>
                      {typeof comparisonData.laterAssessment.confidence === "number" ? `${comparisonData.laterAssessment.confidence.toFixed(1)}% Conf.` : "N/A (Screening)"}
                    </strong>
                  </div>

                  {comparisonData.laterAssessment.predictionType === "mri" && comparisonData.laterAssessment.mriDetails && (
                    <div style={{ marginTop: "12px", padding: "10px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", fontSize: "12px" }}>
                      <div><strong>Predicted Class:</strong> {comparisonData.laterAssessment.mriDetails.predictedClass || "Normal"}</div>
                      <div><strong>PD Prob:</strong> {((comparisonData.laterAssessment.mriDetails.pdProbability || 0) * 100).toFixed(1)}%</div>
                    </div>
                  )}

                  <div style={{ marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Link to={`/result/${comparisonData.laterAssessment._id}`} className="auth-link" style={{ fontSize: "12.5px" }}>
                      View Full Details &rarr;
                    </Link>
                    <button 
                      onClick={() => handleDownloadPDF(comparisonData.laterAssessment._id)}
                      disabled={downloadingId === comparisonData.laterAssessment._id}
                      className="btn-secondary btn-small"
                      style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px" }}
                    >
                      <FaFilePdf style={{ color: "var(--red)" }} /> {downloadingId === comparisonData.laterAssessment._id ? "Downloading..." : "Download PDF"}
                    </button>
                  </div>
                </div>
              </div>

              {/* CONDITION 1: MRI VS MRI COMPARISON */}
              {comparisonType === "mri_vs_mri" && comparisonData.mriComparison && (
                <div className="section-card mb-6">
                  <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
                    <FaBrain style={{ color: "var(--primary-color)" }} /> Side-by-Side Neuroimaging MRI Comparison
                  </h3>
                  <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px" }}>
                    Direct comparison of structural deep-learning probability outputs and classification labels across both MRI sessions.
                  </p>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                    {/* Parkinson's Probability Comparison */}
                    <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "18px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)" }}>
                        Parkinson's Disease (PD) Probability
                      </span>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
                        <div>
                          <span style={{ fontSize: "11px", color: "var(--text-light)" }}>Earlier Scan:</span>
                          <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--primary-color)" }}>
                            {comparisonData.mriComparison.earlier.pdProbability !== null ? `${comparisonData.mriComparison.earlier.pdProbability}%` : "N/A"}
                          </div>
                        </div>
                        <FaExchangeAlt style={{ color: "var(--text-light)" }} />
                        <div>
                          <span style={{ fontSize: "11px", color: "var(--text-light)" }}>Later Scan:</span>
                          <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--secondary-color)" }}>
                            {comparisonData.mriComparison.later.pdProbability !== null ? `${comparisonData.mriComparison.later.pdProbability}%` : "N/A"}
                          </div>
                        </div>
                      </div>
                      {comparisonData.mriComparison.pdProbabilityDiff !== null && (
                        <div style={{ marginTop: "12px", fontSize: "12.5px" }}>
                          <strong>Shift: </strong>
                          <span style={{ 
                            color: comparisonData.mriComparison.pdProbabilityDiff > 0 ? "var(--red)" : "var(--green)",
                            fontWeight: "700"
                          }}>
                            {comparisonData.mriComparison.pdProbabilityDiff > 0 ? `+${comparisonData.mriComparison.pdProbabilityDiff}%` : `${comparisonData.mriComparison.pdProbabilityDiff}%`}
                          </span>
                          <span style={{ color: "var(--text-secondary)", marginLeft: "6px" }}>
                            ({comparisonData.mriComparison.pdProbabilityDiff > 0 ? "Higher likelihood" : "Lower likelihood"})
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Normal / Healthy Probability Comparison */}
                    <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "18px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)" }}>
                        Normal / Non-PD Probability
                      </span>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "12px" }}>
                        <div>
                          <span style={{ fontSize: "11px", color: "var(--text-light)" }}>Earlier Scan:</span>
                          <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--primary-color)" }}>
                            {comparisonData.mriComparison.earlier.normalProbability !== null ? `${comparisonData.mriComparison.earlier.normalProbability}%` : "N/A"}
                          </div>
                        </div>
                        <FaExchangeAlt style={{ color: "var(--text-light)" }} />
                        <div>
                          <span style={{ fontSize: "11px", color: "var(--text-light)" }}>Later Scan:</span>
                          <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--secondary-color)" }}>
                            {comparisonData.mriComparison.later.normalProbability !== null ? `${comparisonData.mriComparison.later.normalProbability}%` : "N/A"}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Scan Image Metadata */}
                    <div style={{ background: "rgba(15, 23, 42, 0.5)", padding: "18px", borderRadius: "12px", border: "1px solid var(--border-color)" }}>
                      <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--text-primary)" }}>
                        Image Metadata & Specs
                      </span>
                      <div style={{ marginTop: "10px", fontSize: "12.5px", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                        <div><strong>Earlier File:</strong> {comparisonData.mriComparison.earlier.imageFilename} ({comparisonData.mriComparison.earlier.imageDimensions})</div>
                        <div><strong>Later File:</strong> {comparisonData.mriComparison.later.imageFilename} ({comparisonData.mriComparison.later.imageDimensions})</div>
                        <div><strong>Classification:</strong> {comparisonData.mriComparison.earlier.predictedClass} &rarr; {comparisonData.mriComparison.later.predictedClass}</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* CONDITION 2: MIXED MODALITY COMPARISON (VOICE + MRI) */}
              {comparisonType === "mixed" && (
                <div className="section-card mb-6" style={{ background: "rgba(59, 130, 246, 0.04)", border: "1px solid rgba(59, 130, 246, 0.3)" }}>
                  <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)" }}>
                    <FaLayerGroup /> Multi-Modal Cross-Comparison Overview
                  </h3>
                  <p style={{ fontSize: "13.5px", color: "var(--text-secondary)", marginTop: "8px", lineHeight: "1.6" }}>
                    You are comparing two different diagnostic modalities: one <strong>🎙️ Voice Acoustic Screening</strong> and one <strong>🧠 Brain MRI Analysis</strong>. 
                    These two screening types capture complementary physiological signals:
                  </p>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "16px", marginTop: "16px" }}>
                    <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "16px", borderRadius: "10px" }}>
                      <strong style={{ color: "var(--primary-color)", fontSize: "14px" }}>🎙️ Voice Acoustic Screening</strong>
                      <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginTop: "6px", lineHeight: "1.5" }}>
                        Measures physical vocal cord micro-tremor, vocal fold tension, and harmonic breathiness. Captures real-time motor control disruptions in speech.
                      </p>
                    </div>
                    <div style={{ background: "rgba(15, 23, 42, 0.6)", padding: "16px", borderRadius: "10px" }}>
                      <strong style={{ color: "var(--secondary-color)", fontSize: "14px" }}>🧠 Brain MRI Image Analysis</strong>
                      <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", marginTop: "6px", lineHeight: "1.5" }}>
                        Evaluates deep-learning structural patterns in magnetic resonance images. Captures neuroanatomical changes independent of temporary vocal fatigue.
                      </p>
                    </div>
                  </div>
                  <div style={{ marginTop: "16px", padding: "12px", background: "rgba(255,255,255,0.03)", borderRadius: "8px", fontSize: "13px" }}>
                    <strong>Longitudinal takeaway:</strong> Both tests corroborate an overall 
                    <span className={`badge ${getRiskClass(comparisonData.laterAssessment.riskLevel)}`} style={{ margin: "0 6px" }}>
                      {comparisonData.laterAssessment.riskLevel} Risk
                    </span> 
                    profile with {typeof comparisonData.laterAssessment.confidence === "number" ? `${comparisonData.laterAssessment.confidence.toFixed(1)}% model confidence` : "biomechanical screening"}. For a granular 22-acoustic-feature chart, switch the filter tab above to <strong>Voice Only</strong>.
                  </div>
                </div>
              )}

              {/* CONDITION 3: VOICE VS VOICE COMPARISON */}
              {comparisonType === "voice_vs_voice" && (
                <>
                  {/* Side-by-Side Interactive Bar Chart */}
                  <div className="section-card mb-6">
                    <div className="section-header mb-4" style={{ flexWrap: "wrap", gap: "12px" }}>
                      <div>
                        <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <FaSlidersH /> Acoustic Feature Variation Chart
                        </h3>
                        <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: "4px 0 0" }}>
                          Compare mean values between baseline and follow-up across vocal biomarker groups.
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "6px", flexWrap: "wrap" }}>
                        <button 
                          className={`btn-small ${activeChartGroup === "frequency" ? "btn-primary" : "btn-secondary"}`}
                          onClick={() => setActiveChartGroup("frequency")}
                          title="Fundamental Pitch (Hz)"
                        >
                          Pitch (Hz)
                        </button>
                        <button 
                          className={`btn-small ${activeChartGroup === "perturbation" ? "btn-primary" : "btn-secondary"}`}
                          onClick={() => setActiveChartGroup("perturbation")}
                          title="Jitter & Shimmer Micro-Tremor (%)"
                        >
                          Tremor / Perturbation (%)
                        </button>
                        <button 
                          className={`btn-small ${activeChartGroup === "spectral" ? "btn-primary" : "btn-secondary"}`}
                          onClick={() => setActiveChartGroup("spectral")}
                          title="Harmonics to Noise Ratio (dB)"
                        >
                          Resonance / Spectral (dB)
                        </button>
                        <button 
                          className={`btn-small ${activeChartGroup === "nonlinear" ? "btn-primary" : "btn-secondary"}`}
                          onClick={() => setActiveChartGroup("nonlinear")}
                          title="Nonlinear Complexity Dynamics"
                        >
                          Nonlinear Complexity
                        </button>
                      </div>
                    </div>

                    <div className="chart-container-wrapper" style={{ marginTop: "16px" }}>
                      <ResponsiveContainer width="100%" height={290}>
                        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-color)" />
                          <XAxis dataKey="feature" tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
                          <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 12 }} />
                          <Tooltip 
                            contentStyle={{ background: "var(--card-bg)", borderColor: "var(--border-color)", borderRadius: "8px" }}
                          />
                          <Legend verticalAlign="top" height={36} />
                          <Bar dataKey="Earlier" fill="var(--primary-color)" radius={[4, 4, 0, 0]} name="Baseline (Earlier)" />
                          <Bar dataKey="Later" fill="var(--secondary-color)" radius={[4, 4, 0, 0]} name="Follow-Up (Later)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Detailed 22-Feature Comparison Table */}
                  <div className="section-card">
                    <div style={{ marginBottom: "16px" }}>
                      <h3 className="section-title">Granular Acoustic Biomarker Breakdown</h3>
                      <p style={{ fontSize: "12.5px", color: "var(--text-secondary)", margin: "4px 0 0" }}>
                        Detailed differences across all 22 vocal dimensions extracted via Praat acoustic signal processing.
                      </p>
                    </div>

                    <div className="table-responsive">
                      <table className="recent-table">
                        <thead>
                          <tr>
                            <th>Biomarker Name</th>
                            <th>What It Measures (Plain English)</th>
                            <th>Baseline</th>
                            <th>Follow-Up</th>
                            <th>Absolute Diff</th>
                            <th>Percentage Shift</th>
                            <th>Direction</th>
                          </tr>
                        </thead>
                        <tbody>
                          {featureMetadata.map((meta) => {
                            const comp = comparisonData.comparisons?.[meta.key] || {};
                            let val1 = comp.earlierValue;
                            let val2 = comp.laterValue;

                            let displayVal1 = "N/A";
                            let displayVal2 = "N/A";

                            if (typeof val1 === "number") {
                              displayVal1 = meta.isPct ? `${(val1 * 100).toFixed(4)}%` : val1.toFixed(5);
                            }
                            if (typeof val2 === "number") {
                              displayVal2 = meta.isPct ? `${(val2 * 100).toFixed(4)}%` : val2.toFixed(5);
                            }

                            const absStr = comp.absoluteDiff !== null ? (comp.absoluteDiff > 0 ? `+${comp.absoluteDiff}` : `${comp.absoluteDiff}`) : "N/A";
                            const pctStr = comp.percentageDiff !== null ? (comp.percentageDiff > 0 ? `+${comp.percentageDiff}%` : `${comp.percentageDiff}%`) : "N/A";

                            return (
                              <tr key={meta.key}>
                                <td className="font-semibold" style={{ color: "var(--primary-color)" }}>{meta.label}</td>
                                <td className="text-secondary" style={{ fontSize: "12.5px" }}>{meta.desc}</td>
                                <td className="font-mono">{displayVal1}</td>
                                <td className="font-mono">{displayVal2}</td>
                                <td className="font-mono text-secondary">{absStr}</td>
                                <td className="font-mono font-bold">{pctStr}</td>
                                <td>
                                  {comp.status === "increased" ? (
                                    <span className="badge badge-medium" style={{ fontSize: "11px" }}>▲ Increase</span>
                                  ) : comp.status === "decreased" ? (
                                    <span className="badge badge-low" style={{ fontSize: "11px" }}>▼ Decrease</span>
                                  ) : (
                                    <span className="badge" style={{ background: "rgba(148, 163, 184, 0.2)", color: "var(--text-secondary)", fontSize: "11px" }}>= Unchanged</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
    </motion.div>
  );
}
