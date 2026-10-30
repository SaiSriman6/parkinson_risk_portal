import { useState, useEffect, useContext } from "react";
import { Link } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import API from "../services/api";
import CardStats from "../components/CardStats";
import Charts from "../components/Charts";
import LoadingSpinner from "../components/LoadingSpinner";
import { motion } from "framer-motion";
import { 
  FaMicrophone, FaCloudUploadAlt, FaHistory, FaUser, 
  FaArrowRight, FaClock, FaHeartbeat, FaNotesMedical, 
  FaExclamationTriangle, FaStar, FaStickyNote, FaMedkit, 
  FaCalendarAlt, FaAngleDoubleRight, FaFilePdf, FaBrain, FaWalking
} from "react-icons/fa";

export default function Dashboard() {
  const { user } = useContext(AuthContext);
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

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
      console.error("Dashboard PDF download failed:", err);
      alert("Failed to download PDF report. Session may have expired.");
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [statsRes, predictionsRes] = await Promise.all([
          API.get("/api/predictions/stats"),
          API.get("/api/predictions?limit=5")
        ]);

        setStats(statsRes.data);
        setRecent(predictionsRes.data.predictions);
      } catch (err) {
        setError("Failed to fetch dashboard telemetry. The database or server might be offline.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  if (loading) return <LoadingSpinner message="Loading your clinical metrics..." />;

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
    return "var(--text-light)";
  };

  // Calculations
  const timeline = stats?.timeline || [];
  const confTimeline = timeline.filter(t => typeof t.confidence === "number");
  const averageConfidence = confTimeline.length > 0 
    ? (confTimeline.reduce((acc, curr) => acc + curr.confidence, 0) / confTimeline.length).toFixed(1) + "%"
    : "N/A";

  let riskTrendText = "Stable";
  let riskTrendColor = "var(--primary-color)";
  if (timeline.length >= 2) {
    const latest = timeline[timeline.length - 1];
    const prev = timeline[timeline.length - 2];
    const riskScores = { Low: 1, Medium: 2, High: 3 };
    const scoreDiff = riskScores[latest.riskLevel] - riskScores[prev.riskLevel];
    if (scoreDiff > 0) {
      riskTrendText = "Increased Risk Indicator";
      riskTrendColor = "var(--red)";
    } else if (scoreDiff < 0) {
      riskTrendText = "Decreased Risk Indicator";
      riskTrendColor = "var(--green)";
    } else {
      riskTrendText = "Stable (No variation)";
      riskTrendColor = "var(--green)";
    }
  }

  const currentDateString = new Date().toLocaleDateString(undefined, { 
    weekday: "long", year: "numeric", month: "long", day: "numeric" 
  });

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="container dashboard-container"
    >
      {/* 1. HERO SECTION */}
      <header className="glass-card mb-6" style={{ 
        background: "linear-gradient(135deg, rgba(2, 132, 199, 0.08) 0%, rgba(13, 148, 136, 0.08) 100%)", 
        borderLeft: "6px solid var(--primary-color)", 
        display: "flex", 
        justifyContent: "space-between", 
        alignItems: "center",
        flexWrap: "wrap",
        gap: "20px"
      }}>
        <div style={{ flex: 1, minWidth: "280px" }}>
          <span style={{ fontSize: "12.5px", fontWeight: "800", color: "var(--primary-color)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "6px" }}>
            <FaCalendarAlt /> {currentDateString}
          </span>
          <h1 style={{ fontSize: "30px", margin: "8px 0 6px" }}>Welcome back, {user.name}</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "15px", lineHeight: "1.6" }}>
            Tracking voice acoustics helps monitor Parkinsonian tremors and motor speech baselines.
          </p>
          <div style={{ display: "flex", gap: "16px", marginTop: "14px", fontSize: "13.5px", color: "var(--text-secondary)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <FaHeartbeat style={{ color: "var(--secondary-color)" }} /> 
              Status: <strong style={{ color: getRiskColor(stats?.latestPrediction?.riskLevel) }}>{stats?.latestPrediction ? `${stats.latestPrediction.riskLevel} Risk` : "No baseline"}</strong>
            </span>
            <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <FaClock style={{ color: "var(--primary-color)" }} /> 
              Last Assessment: <strong>{stats?.latestPrediction ? new Date(stats.latestPrediction.createdAt).toLocaleDateString() : "Never"}</strong>
            </span>
          </div>
        </div>
      </header>

      {error && (
        <div className="recommendations-box border-red mb-6" style={{ padding: "16px" }}>
          <span style={{ color: "var(--red)", fontWeight: "600" }}>{error}</span>
        </div>
      )}

      {/* 2. STATISTICS CARDS */}
      <div className="stats-grid">
        <motion.div whileHover={{ y: -4 }} className="stats-card">
          <div className="stats-header">
            <span className="stats-title">Total Predictions</span>
            <span className="stats-icon icon-blue"><FaNotesMedical /></span>
          </div>
          <div className="stats-value">{stats?.totalPredictions || 0}</div>
          <div className="stats-footer">Assessments logged to date</div>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} className="stats-card">
          <div className="stats-header">
            <span className="stats-title">Current Risk</span>
            <span className="stats-icon icon-purple"><FaHeartbeat /></span>
          </div>
          <div className="stats-value" style={{ color: getRiskColor(stats?.latestPrediction?.riskLevel) }}>
            {stats?.latestPrediction?.riskLevel || "N/A"}
          </div>
          <div className="stats-footer">Latest risk outcome</div>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} className="stats-card">
          <div className="stats-header">
            <span className="stats-title">Latest Confidence</span>
            <span className="stats-icon icon-red"><FaExclamationTriangle /></span>
          </div>
          <div className="stats-value">
            {typeof stats?.latestPrediction?.confidence === "number" ? `${stats.latestPrediction.confidence.toFixed(1)}%` : "N/A"}
          </div>
          <div className="stats-footer">Vocal tremor probability</div>
        </motion.div>

        <motion.div whileHover={{ y: -4 }} className="stats-card">
          <div className="stats-header">
            <span className="stats-title">Average Confidence</span>
            <span className="stats-icon icon-green"><FaStar /></span>
          </div>
          <div className="stats-value">{averageConfidence}</div>
          <div className="stats-footer">Average probability level</div>
        </motion.div>
      </div>

      {/* 3. QUICK ACTIONS */}
      <div className="section-card mb-6">
        <h3 className="section-title" style={{ marginBottom: "16px" }}>Quick Actions</h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px" }}>
          <Link to="/predict" className="btn-primary" style={{ padding: "18px 24px", borderRadius: "14px", display: "flex", flexDirection: "column", gap: "8px", height: "100px", justifyContent: "center" }}>
            <FaMicrophone style={{ fontSize: "20px" }} />
            <span>Voice Assessment</span>
          </Link>
          <Link to="/mri-analysis" className="btn-secondary" style={{ padding: "18px 24px", borderRadius: "14px", display: "flex", flexDirection: "column", gap: "8px", height: "100px", justifyContent: "center" }}>
            <FaBrain style={{ fontSize: "20px", color: "var(--primary-color)" }} />
            <span>MRI Image Analysis</span>
          </Link>
          <Link to="/video-gait-analysis" className="btn-secondary" style={{ padding: "18px 24px", borderRadius: "14px", display: "flex", flexDirection: "column", gap: "8px", height: "100px", justifyContent: "center" }}>
            <FaWalking style={{ fontSize: "20px", color: "var(--accent-color)" }} />
            <span>Video Gait Analysis</span>
          </Link>
          <Link to="/history" className="btn-secondary" style={{ padding: "18px 24px", borderRadius: "14px", display: "flex", flexDirection: "column", gap: "8px", height: "100px", justifyContent: "center" }}>
            <FaHistory style={{ fontSize: "20px", color: "var(--secondary-color)" }} />
            <span>Prediction History</span>
          </Link>
          <Link to="/profile" className="btn-secondary" style={{ padding: "18px 24px", borderRadius: "14px", display: "flex", flexDirection: "column", gap: "8px", height: "100px", justifyContent: "center" }}>
            <FaUser style={{ fontSize: "20px", color: "var(--accent-color)" }} />
            <span>My Profile</span>
          </Link>
        </div>
      </div>

      {/* 4. HEALTH INSIGHTS & DOCTOR REMARKS */}
      {stats?.latestPrediction && (
        <div className="profile-grid mb-6">
          {/* Trend & Confidence Insights */}
          <div className="section-card">
            <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--primary-color)" }}>
              <FaHeartbeat /> Health Biomarker Insights
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "20px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Vocal Trend Indicator:</span>
                <strong style={{ color: riskTrendColor, fontSize: "14.5px" }}>{riskTrendText}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--border-color)", paddingBottom: "10px" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Confidence Stability:</span>
                <strong>{typeof stats.latestPrediction?.confidence === "number" ? `${stats.latestPrediction.confidence.toFixed(2)}%` : "N/A"}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-secondary)", fontSize: "14px" }}>Diagnostic Class Outcome:</span>
                <strong>{stats.latestPrediction.label !== null && stats.latestPrediction.label !== undefined ? `Label ${stats.latestPrediction.label}` : "Unclassified"} ({stats.latestPrediction.riskLevel} Risk)</strong>
              </div>
            </div>
          </div>

          {/* Doctor Remarks */}
          <div className="section-card">
            <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--secondary-color)" }}>
              <FaStickyNote /> Doctor Feedback & Advice
            </h3>
            <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "12px" }}>
              {stats.latestPrediction.doctorNotes ? (
                <div style={{ background: "rgba(148, 163, 184, 0.05)", padding: "14px", borderRadius: "8px", border: "1px solid var(--border-color)" }}>
                  <strong>Doctor Notes:</strong> <p style={{ display: "inline", color: "var(--text-secondary)", fontSize: "14px" }}>{stats.latestPrediction.doctorNotes}</p>
                </div>
              ) : (
                <p style={{ color: "var(--text-light)", fontSize: "14px" }}>No medical notes added to this report yet.</p>
              )}
              {stats.latestPrediction.recommendations ? (
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span className="badge badge-low" style={{ display: "inline-flex", alignItems: "center", gap: "6px", textTransform: "capitalize", fontWeight: "700" }}>
                    <FaMedkit /> Action: {stats.latestPrediction.recommendations}
                  </span>
                </div>
              ) : (
                <p style={{ color: "var(--text-light)", fontSize: "14px" }}>No custom recommendation set.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 5. CHARTS VISUALIZATIONS */}
      {stats && <Charts stats={stats} />}

      {/* 6. RECENT SCREENINGS LIST */}
      <div className="section-card mt-8">
        <div className="section-header" style={{ marginBottom: "20px" }}>
          <h2 className="section-title">Recent Voice Screenings</h2>
          <Link to="/history" className="auth-link" style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontWeight: "700" }}>
            View Full History <FaArrowRight />
          </Link>
        </div>

        {recent.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">🎙️</span>
            <h3 className="empty-state-title">No Prediction Data Available</h3>
            <p className="empty-state-text">Start your first vocal tracking to view reports and diagnostic trends.</p>
            <Link to="/predict" className="btn-primary mt-4">Start Assessment</Link>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="recent-table">
              <thead>
                <tr>
                  <th>Date & Time</th>
                  <th>Assessment ID</th>
                  <th>Risk Outcome</th>
                  <th>Confidence Level</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((pred) => (
                  <tr key={pred._id}>
                    <td>{new Date(pred.createdAt).toLocaleString()}</td>
                    <td className="font-mono text-small">{pred._id}</td>
                    <td>
                      <span className={`badge ${getRiskClass(pred.riskLevel)}`}>
                        {pred.riskLevel} Risk
                      </span>
                    </td>
                    <td className="font-bold" style={{ color: "var(--text-main)" }}>
                      {typeof pred.confidence === "number" ? `${pred.confidence.toFixed(2)}%` : "N/A (Screening)"}
                    </td>
                    <td>
                      <div className="actions-cell">
                        <Link to={`/result/${pred._id}`} className="btn-secondary btn-small">
                          View Details
                        </Link>
                        <button 
                          onClick={() => handleDownloadPDF(pred._id)}
                          disabled={downloadingId === pred._id}
                          className="btn-success btn-small font-semibold"
                          style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                        >
                          <FaFilePdf /> {downloadingId === pred._id ? "..." : "PDF"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
