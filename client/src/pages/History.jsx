import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import API from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import { FaSearch, FaFilter, FaFilePdf, FaEye, FaExchangeAlt } from "react-icons/fa";
import { motion } from "framer-motion";


export default function History() {
  const [allPredictions, setAllPredictions] = useState([]);
  const [filteredPredictions, setFilteredPredictions] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRisk, setFilterRisk] = useState("All");
  const [filterType, setFilterType] = useState("All");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState(null);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const itemsPerPage = 8;

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        // Fetch up to 1000 records to support seamless client-side search & filtering
        const response = await API.get(`/api/predictions?page=1&limit=1000`);
        const predictionsList = response.data?.predictions || [];
        setAllPredictions(predictionsList);
        setFilteredPredictions(predictionsList);
      } catch (err) {
        setError("Failed to fetch assessment history. The database connection could be down.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, []);

  // Handle Search and Filtering
  useEffect(() => {
    let results = Array.isArray(allPredictions) ? allPredictions : [];

    if (searchTerm) {
      results = results.filter(
        (p) => 
          (p._id && p._id.toLowerCase().includes(searchTerm.toLowerCase())) ||
          (p.createdAt && new Date(p.createdAt).toLocaleDateString().includes(searchTerm))
      );
    }

    if (filterType !== "All") {
      results = results.filter((p) => (p.predictionType || "voice") === filterType.toLowerCase());
    }

    if (filterRisk !== "All") {
      results = results.filter((p) => p.riskLevel === filterRisk);
    }

    if (startDate) {
      const start = new Date(startDate);
      if (!isNaN(start.getTime())) {
        results = results.filter((p) => new Date(p.createdAt) >= start);
      }
    }

    if (endDate) {
      const end = new Date(endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        results = results.filter((p) => new Date(p.createdAt) <= end);
      }
    }

    setFilteredPredictions(results);
    setPage(1); // Reset to page 1 on search/filter
  }, [searchTerm, filterRisk, filterType, startDate, endDate, allPredictions]);

  const resetFilters = () => {
    setSearchTerm("");
    setFilterRisk("All");
    setFilterType("All");
    setStartDate("");
    setEndDate("");
  };

  const getRiskClass = (risk) => {
    if (risk === "Low") return "badge-low";
    if (risk === "Medium") return "badge-medium";
    if (risk === "High") return "badge-high";
    if (risk === "Indeterminate") return "badge-medium";
    return "";
  };

  // Pagination calculation
  const safeFilteredPredictions = Array.isArray(filteredPredictions) ? filteredPredictions : [];
  const totalPages = Math.ceil(safeFilteredPredictions.length / itemsPerPage) || 1;
  const paginatedItems = safeFilteredPredictions.slice((page - 1) * itemsPerPage, page * itemsPerPage);

  if (loading) return <LoadingSpinner message="Fetching your acoustic database records..." />;

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
      console.error("History PDF download failed:", err);
      alert("Failed to download PDF report. Session may have expired.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="container history-container"
    >
      <header className="mb-6" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
        <div>
          <h1 className="page-title">Assessment History Logs</h1>
          <p className="page-subtitle">Historical records of vocal biomarker and neuroimaging MRI evaluations.</p>
        </div>
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <Link to="/mri-analysis" className="btn-primary font-semibold" style={{ display: "inline-flex", alignItems: "center", gap: "8px", borderRadius: "10px", padding: "10px 18px" }}>
            🧠 New MRI Analysis
          </Link>
          <Link to="/video-gait-analysis" className="btn-secondary font-semibold" style={{ display: "inline-flex", alignItems: "center", gap: "8px", borderRadius: "10px", padding: "10px 18px" }}>
            🚶 New Gait Analysis
          </Link>
          <Link to="/compare" className="btn-secondary font-semibold" style={{ display: "inline-flex", alignItems: "center", gap: "8px", borderRadius: "10px", padding: "10px 18px" }}>
            <FaExchangeAlt style={{ color: "var(--primary-color)" }} /> Compare Assessments
          </Link>
        </div>
      </header>

      {error && (
        <div className="recommendations-box border-red mb-6" style={{ padding: "16px" }}>
          <span style={{ color: "var(--red)", fontWeight: "600" }}>{error}</span>
        </div>
      )}

      {/* Search and Filters Bar */}
      <div className="glass-card mb-6" style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" }}>
        <div className="form-group" style={{ flex: 1, minWidth: "200px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}><FaSearch /> Search ID / Date</label>
          <input
            type="text"
            placeholder="Search assessment..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ width: "150px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}>Modality</label>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)}>
            <option value="All">All Types</option>
            <option value="voice">🎙️ Voice</option>
            <option value="mri">🧠 MRI Scan</option>
            <option value="video_gait">🚶 Video Gait</option>
          </select>
        </div>
        <div className="form-group" style={{ width: "150px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px" }}><FaFilter /> Risk Level</label>
          <select value={filterRisk} onChange={(e) => setFilterRisk(e.target.value)}>
            <option value="All">All Risks</option>
            <option value="Low">Low Risk</option>
            <option value="Medium">Medium Risk</option>
            <option value="High">High Risk</option>
          </select>
        </div>
        <div className="form-group" style={{ width: "140px" }}>
          <label style={{ fontSize: "13px" }}>Start Date</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div className="form-group" style={{ width: "140px" }}>
          <label style={{ fontSize: "13px" }}>End Date</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        {(searchTerm || filterRisk !== "All" || filterType !== "All" || startDate || endDate) && (
          <button onClick={resetFilters} className="btn-secondary btn-small" style={{ height: "42px", marginBottom: "2px" }}>
            Reset Filters
          </button>
        )}
      </div>

      <div className="section-card">
        {safeFilteredPredictions.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">📋</span>
            <h3 className="empty-state-title">No Records Match</h3>
            <p className="empty-state-text">Try adjusting your filters or run a new screening assessment.</p>
            <div style={{ display: "flex", gap: "12px", justifyContent: "center", marginTop: "16px" }}>
              <Link to="/predict" className="btn-primary">Record Speech</Link>
              <Link to="/mri-analysis" className="btn-secondary">Upload MRI</Link>
            </div>
          </div>
        ) : (
          <>
            <div className="table-responsive">
              <table className="recent-table">
                <thead>
                  <tr>
                    <th>Date & Time</th>
                    <th>Assessment ID</th>
                    <th>Modality</th>
                    <th>Risk Level</th>
                    <th>Confidence Probability</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((pred) => (
                    <tr key={pred._id}>
                      <td>{new Date(pred.createdAt).toLocaleString()}</td>
                      <td className="font-mono text-small">{pred._id}</td>
                      <td>
                        <span style={{ 
                          fontSize: "12px", 
                          fontWeight: "600",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: pred.predictionType === "mri" ? "rgba(13, 148, 136, 0.12)" : (pred.predictionType === "video_gait" || pred.predictionType === "video" ? "rgba(79, 70, 229, 0.12)" : "rgba(2, 132, 199, 0.12)"),
                          color: pred.predictionType === "mri" ? "var(--secondary-color)" : (pred.predictionType === "video_gait" || pred.predictionType === "video" ? "var(--accent-color)" : "var(--primary-color)")
                        }}>
                          {pred.predictionType === "mri" ? "🧠 MRI" : (pred.predictionType === "video_gait" || pred.predictionType === "video" ? "🚶 Gait" : "🎙️ Voice")}
                        </span>
                      </td>
                      <td>
                        <span className={`badge ${getRiskClass(pred.riskLevel)}`}>
                          {pred.predictionType === "mri" && pred.mriDetails?.predictedClass 
                            ? `${pred.mriDetails.predictedClass} (${pred.riskLevel})`
                            : (pred.predictionType === "video_gait" || pred.predictionType === "video")
                            ? (pred.videoGaitDetails?.predictionAvailable
                              ? `${pred.riskLevel} Risk`
                              : "Biomechanical Screening")
                            : `${pred.riskLevel} Risk`}
                        </span>
                      </td>
                      <td className="font-bold" style={{ color: "var(--text-main)" }}>
                        {typeof pred.confidence === "number" ? `${pred.confidence.toFixed(2)}%` : "N/A (Screening)"}
                      </td>
                      <td>
                        <div className="actions-cell">
                          <Link to={`/result/${pred._id}`} className="btn-secondary btn-small">
                            <FaEye /> View Detail
                          </Link>
                          <button 
                            onClick={() => handleDownloadPDF(pred._id)}
                            disabled={downloadingId === pred._id}
                            className="btn-success btn-small font-semibold"
                            style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}
                          >
                            <FaFilePdf /> {downloadingId === pred._id ? "..." : "Report"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="pagination-container">
                <button
                  disabled={page === 1}
                  onClick={() => setPage((prev) => prev - 1)}
                  className="btn-pagination"
                >
                  &larr; Previous
                </button>
                <span className="pagination-text">
                  Page {page} of {totalPages}
                </span>
                <button
                  disabled={page === totalPages}
                  onClick={() => setPage((prev) => prev + 1)}
                  className="btn-pagination"
                >
                  Next &rarr;
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </motion.div>
  );
}
