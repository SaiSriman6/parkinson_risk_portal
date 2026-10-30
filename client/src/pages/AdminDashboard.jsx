import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import API from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import Toast from "../components/Toast";
import { motion, AnimatePresence } from "framer-motion";
import { 
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, 
  LineChart, Line, PieChart, Pie, Cell, Tooltip, XAxis, YAxis, CartesianGrid, Legend 
} from "recharts";
import { 
  FaUsers, FaChartLine, FaClipboardList, FaBrain, FaCog, FaSearch, 
  FaUserEdit, FaTrashAlt, FaToggleOn, FaToggleOff, FaDownload, 
  FaFileCsv, FaFilePdf, FaEye, FaHistory, FaStickyNote, FaMedkit, FaEnvelope, FaExclamationTriangle 
} from "react-icons/fa";

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "overview";

  const setActiveTab = (tabName) => {
    setSearchParams({ tab: tabName });
  };
  
  // Data stores
  const [allPredictions, setAllPredictions] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  // Sub-states
  const [userSearch, setUserSearch] = useState("");
  const [userSort, setUserSort] = useState("name"); // name | date | predictions
  const [userFilter, setUserFilter] = useState("All"); // All | Active | Deactive

  const [recordsSearch, setRecordsSearch] = useState("");
  const [recordsFilter, setRecordsFilter] = useState("All");

  const [risksSearch, setRisksSearch] = useState("");
  const [risksFilter, setRisksFilter] = useState("All");
  const [risksSort, setRisksSort] = useState("HighestRisk"); // HighestRisk | LowestRisk | HighestConfidence | LowestConfidence | Newest | Oldest

  const [notesSearch, setNotesSearch] = useState("");
  const [recsSearch, setRecsSearch] = useState("");

  // Email Center State
  const [emailTarget, setEmailTarget] = useState("selected"); // selected | high_risk | low_risk | all
  const [emailTemplate, setEmailTemplate] = useState("reminder"); // reminder | advisory
  const [emailSubject, setEmailSubject] = useState("Appointment Reminder - Parkinson's Assessment Portal");
  const [emailBody, setEmailBody] = useState("Dear Patient,\n\nThis is a friendly reminder to schedule your follow-up vocal biomarker screening on our AI platform.\n\nBest regards,\nClinical Team");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  
  // Modals / expanded panels
  const [editingUser, setEditingUser] = useState(null);
  const [selectedUserHistory, setSelectedUserHistory] = useState(null);
  const [reviewingPrediction, setReviewingPrediction] = useState(null);
  const [savingReview, setSavingReview] = useState(false);
  const [downloadingReportId, setDownloadingReportId] = useState(null);

  // Pagination states for records
  const [recordsPage, setRecordsPage] = useState(1);
  const recordsPerPage = 6;

  const [risksPage, setRisksPage] = useState(1);
  const risksPerPage = 8;

  useEffect(() => {
    const fetchDoctorPortalData = async () => {
      try {
        setLoading(true);
        const [predsRes, usersRes] = await Promise.all([
          API.get("/api/predictions/admin/all-predictions?limit=1000"),
          API.get("/api/predictions/admin/all-users?limit=1000")
        ]);

        setAllPredictions(predsRes.data.predictions || []);
        setAllUsers(usersRes.data.users || []);
      } catch (err) {
        setError("Failed to synchronize doctor portal statistics. The database might be offline.");
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchDoctorPortalData();
  }, []);

  // Update email template details dynamically
  useEffect(() => {
    if (emailTemplate === "reminder") {
      setEmailSubject("Appointment Reminder - Parkinson's Assessment Portal");
      setEmailBody("Dear Patient,\n\nThis is a friendly reminder to schedule your follow-up vocal biomarker screening on our AI platform.\n\nBest regards,\nClinical Team");
    } else {
      setEmailSubject("Health Advisory - Vocal Biomarker Monitoring");
      setEmailBody("Dear Patient,\n\nWe advise maintaining regular vocal exercises and keeping a weekly log of your vocal samples. If your symptoms change, please schedule a clinical consultation.\n\nBest regards,\nClinical Team");
    }
  }, [emailTemplate]);

  if (loading) return <LoadingSpinner message="Securing doctor portal connection..." />;

  // Calculate dynamic stats
  const totalPatients = allUsers.filter(u => u.role !== "admin").length;
  const totalPredictions = allPredictions.length;

  const highRiskPredictions = allPredictions.filter(p => p.riskLevel === "High");
  const lowRiskPredictions = allPredictions.filter(p => p.riskLevel === "Low");
  
  // Unique patients in high/low risk categories
  const highRiskPatientsCount = new Set(highRiskPredictions.map(p => p.user?._id || p.user)).size;
  const lowRiskPatientsCount = new Set(lowRiskPredictions.map(p => p.user?._id || p.user)).size;

  const pendingReviewsCount = allPredictions.filter(p => !p.doctorNotes && !p.recommendations).length;

  // Time-based calculations
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const oneWeekAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const oneMonthAgo = now.getTime() - 30 * 24 * 60 * 60 * 1000;

  const todayPredictions = allPredictions.filter(p => new Date(p.createdAt).getTime() >= todayStart).length;
  const weeklyPredictions = allPredictions.filter(p => new Date(p.createdAt).getTime() >= oneWeekAgo).length;
  const monthlyPredictions = allPredictions.filter(p => new Date(p.createdAt).getTime() >= oneMonthAgo).length;

  // Recent activity logs
  const recentActivity = allPredictions.slice(0, 5);

  // --- CHARTS PREPARATION ---
  
  // 1. Pie Chart - Risk Proportion
  const riskPieData = [
    { name: "High Risk", value: highRiskPredictions.length, color: "var(--red)" },
    { name: "Medium Risk", value: allPredictions.filter(p => p.riskLevel === "Medium").length, color: "var(--orange)" },
    { name: "Low Risk", value: lowRiskPredictions.length, color: "var(--green)" }
  ].filter(d => d.value > 0);

  // 2. Bar Chart - Predictions month count
  const monthlyCounts = {};
  allPredictions.forEach(p => {
    const month = new Date(p.createdAt).toLocaleString("default", { month: "short", year: "2-digit" });
    monthlyCounts[month] = (monthlyCounts[month] || 0) + 1;
  });
  const barChartData = Object.keys(monthlyCounts).map(month => ({
    month,
    count: monthlyCounts[month]
  })).reverse();

  // 3. Line Chart - Daily predictions & growth
  const dailyCounts = {};
  allPredictions.forEach(p => {
    const day = new Date(p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    dailyCounts[day] = (dailyCounts[day] || 0) + 1;
  });
  const lineChartData = Object.keys(dailyCounts).map(day => ({
    day,
    predictions: dailyCounts[day]
  })).reverse();

  // 4. Area Chart - Registration Trend
  const registrationTimeline = {};
  allUsers.forEach(u => {
    const day = new Date(u.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" });
    registrationTimeline[day] = (registrationTimeline[day] || 0) + 1;
  });
  const areaChartData = Object.keys(registrationTimeline).map(day => ({
    day,
    registrations: registrationTimeline[day]
  })).reverse();

  // --- HANDLERS ---

  const handleToggleActivation = async (userId, currentStatus) => {
    try {
      const updatedStatus = currentStatus === undefined ? false : !currentStatus;
      await API.put(`/api/predictions/admin/users/${userId}`, { isActive: updatedStatus });
      setAllUsers(prev => prev.map(u => u._id === userId ? { ...u, isActive: updatedStatus } : u));
      setToastMessage("User account status synchronized successfully.");
    } catch (err) {
      console.error(err);
      setError("Failed to update user status.");
    }
  };

  const handleEditUserSubmit = async (e) => {
    e.preventDefault();
    try {
      await API.put(`/api/predictions/admin/users/${editingUser._id}`, { name: editingUser.name, email: editingUser.email });
      setAllUsers(prev => prev.map(u => u._id === editingUser._id ? { ...u, name: editingUser.name, email: editingUser.email } : u));
      setToastMessage(`Patient profile saved for ${editingUser.name}`);
      setEditingUser(null);
    } catch (err) {
      console.error(err);
      setError("Failed to save patient profile.");
    }
  };

  const handleDeleteUser = async (userId) => {
    if (window.confirm("Are you sure you want to delete this patient account? This action is permanent.")) {
      try {
        await API.delete(`/api/predictions/admin/users/${userId}`);
        setAllUsers(prev => prev.filter(u => u._id !== userId));
        setToastMessage("Patient account deleted successfully.");
      } catch (err) {
        console.error(err);
        setError("Failed to delete user account.");
      }
    }
  };

  const handleSaveReview = async (e) => {
    e.preventDefault();
    try {
      setSavingReview(true);
      const res = await API.put(`/api/predictions/${reviewingPrediction._id}/review`, {
        doctorNotes: reviewingPrediction.doctorNotes,
        recommendations: reviewingPrediction.recommendations
      });
      // Update predictions lists
      setAllPredictions(prev => prev.map(p => p._id === reviewingPrediction._id ? { ...p, ...res.data } : p));
      setToastMessage("Medical notes and clinical recommendations saved.");
      setReviewingPrediction(null);
    } catch (err) {
      console.error(err);
      setError("Failed to save clinical review.");
    } finally {
      setSavingReview(false);
    }
  };

  const handleExportCSV = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Assessment ID,Patient Name,Patient Email,Risk Classification,Confidence,Timestamp,Doctor Notes,Recommendations\n";
    allPredictions.forEach(p => {
      const confDisplay = typeof p.confidence === "number" ? `${p.confidence.toFixed(2)}%` : "N/A";
      csvContent += `${p._id},"${p.user?.name || 'Deleted'}","${p.user?.email || 'N/A'}",${p.riskLevel},${confDisplay},${p.createdAt},"${p.doctorNotes || ''}","${p.recommendations || ''}"\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `parkinson_records_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setToastMessage("CSV Log exported successfully.");
  };

  const handleDownloadPDF = async (predId) => {
    try {
      setDownloadingReportId(predId);
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
      console.error("PDF download failed:", err);
      setError("Failed to download PDF report. Session may have expired.");
    } finally {
      setDownloadingReportId(null);
    }
  };

  const handleSendEmails = (e) => {
    e.preventDefault();
    let recipients = [];
    if (emailTarget === "selected") {
      recipients = allUsers.filter(u => selectedUserIds.includes(u._id)).map(u => u.email);
    } else if (emailTarget === "high_risk") {
      const highRiskIds = new Set(highRiskPredictions.map(p => p.user?._id || p.user));
      recipients = allUsers.filter(u => highRiskIds.has(u._id)).map(u => u.email);
    } else if (emailTarget === "low_risk") {
      const lowRiskIds = new Set(lowRiskPredictions.map(p => p.user?._id || p.user));
      recipients = allUsers.filter(u => lowRiskIds.has(u._id)).map(u => u.email);
    } else {
      recipients = allUsers.filter(u => u.role !== "admin").map(u => u.email);
    }

    if (recipients.length === 0) {
      setError("No recipients matched the email criteria.");
      return;
    }

    setToastMessage(`Email campaign sent successfully to ${recipients.length} recipients: ${recipients.slice(0, 3).join(", ")}${recipients.length > 3 ? "..." : ""}`);
    setSelectedUserIds([]);
  };

  // --- FILTERS & SORTS ---

  // Patients Management
  const processedUsers = allUsers
    .filter(u => u.role !== "admin")
    .filter(u => {
      const matchSearch = u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase());
      const matchFilter = userFilter === "All" || (userFilter === "Active" && u.isActive !== false) || (userFilter === "Deactive" && u.isActive === false);
      return matchSearch && matchFilter;
    })
    .sort((a, b) => {
      if (userSort === "name") return a.name.localeCompare(b.name);
      if (userSort === "date") return new Date(b.createdAt) - new Date(a.createdAt);
      if (userSort === "predictions") {
        const countA = allPredictions.filter(p => (p.user?._id || p.user) === a._id).length;
        const countB = allPredictions.filter(p => (p.user?._id || p.user) === b._id).length;
        return countB - countA;
      }
      return 0;
    });

  // Risk Analysis
  const processedRisks = allPredictions
    .filter(p => {
      const nameMatch = (p.user?.name || "").toLowerCase().includes(risksSearch.toLowerCase());
      const emailMatch = (p.user?.email || "").toLowerCase().includes(risksSearch.toLowerCase());
      const riskMatch = risksFilter === "All" || p.riskLevel === risksFilter;
      return (nameMatch || emailMatch) && riskMatch;
    })
    .sort((a, b) => {
      if (risksSort === "HighestRisk") {
        const score = { High: 3, Medium: 2, Low: 1 };
        return score[b.riskLevel] - score[a.riskLevel] || b.confidence - a.confidence;
      }
      if (risksSort === "LowestRisk") {
        const score = { High: 3, Medium: 2, Low: 1 };
        return score[a.riskLevel] - score[b.riskLevel] || a.confidence - b.confidence;
      }
      if (risksSort === "HighestConfidence") return b.confidence - a.confidence;
      if (risksSort === "LowestConfidence") return a.confidence - b.confidence;
      if (risksSort === "Newest") return new Date(b.createdAt) - new Date(a.createdAt);
      if (risksSort === "Oldest") return new Date(a.createdAt) - new Date(b.createdAt);
      return 0;
    });

  const paginatedRisks = processedRisks.slice((risksPage - 1) * risksPerPage, risksPage * risksPerPage);
  const risksTotalPages = Math.ceil(processedRisks.length / risksPerPage) || 1;

  // Prediction Records (All Assessments)
  const processedRecords = allPredictions.filter(p => {
    const nameMatch = (p.user?.name || "").toLowerCase().includes(recordsSearch.toLowerCase());
    const idMatch = p._id.toLowerCase().includes(recordsSearch.toLowerCase());
    const riskMatch = recordsFilter === "All" || p.riskLevel === recordsFilter;
    return (nameMatch || idMatch) && riskMatch;
  });

  const paginatedRecords = processedRecords.slice((recordsPage - 1) * recordsPerPage, recordsPage * recordsPerPage);
  const recordsTotalPages = Math.ceil(processedRecords.length / recordsPerPage) || 1;

  // Critical Patients logic (multiple consecutive High Risk predictions)
  const criticalPatients = allUsers
    .filter(u => u.role !== "admin")
    .map(u => {
      const userPreds = allPredictions
        .filter(p => (p.user?._id || p.user) === u._id)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // Sort newest first
      
      let consecutiveHighCount = 0;
      for (let p of userPreds) {
        if (p.riskLevel === "High") {
          consecutiveHighCount++;
        } else {
          break; // Stop counting once we hit non-high
        }
      }
      return { user: u, consecutiveHighCount, lastPrediction: userPreds[0] };
    })
    .filter(item => item.consecutiveHighCount >= 2); // At least 2 consecutive high risk predictions

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

  return (
    <div className="container admin-container">
      {/* Title */}
      <header className="mb-6">
        <h1 className="page-title">Doctor Portal Dashboard</h1>
        <p className="page-subtitle">Review patient vocal screening records, manage profiles, write notes, and analyze AI performance.</p>
      </header>

      {/* Toast and Error notifications */}
      {toastMessage && <Toast message={toastMessage} type="success" onClose={() => setToastMessage("")} />}
      {error && <Toast message={error} type="error" onClose={() => setError("")} />}

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -15 }}
          transition={{ duration: 0.2 }}
        >
          {/* TAB 1: OVERVIEW */}
          {activeTab === "overview" && (
            <div>
              {/* Stats Widgets */}
              <div className="stats-grid">
                <div className="stats-card">
                  <div className="stats-header">
                    <span className="stats-title">Registered Patients</span>
                    <span className="stats-icon icon-blue"><FaUsers /></span>
                  </div>
                  <div className="stats-value">{totalPatients}</div>
                  <div className="stats-footer">Total registered patient profiles</div>
                </div>
                <div className="stats-card">
                  <div className="stats-header">
                    <span className="stats-title">Total Predictions</span>
                    <span className="stats-icon icon-purple"><FaClipboardList /></span>
                  </div>
                  <div className="stats-value">{totalPredictions}</div>
                  <div className="stats-footer">Total calculated assessments</div>
                </div>
                <div className="stats-card">
                  <div className="stats-header">
                    <span className="stats-title">High Risk Cases</span>
                    <span className="stats-icon icon-red"><FaExclamationTriangle /></span>
                  </div>
                  <div className="stats-value text-red">{highRiskPatientsCount}</div>
                  <div className="stats-footer">Unique patients flagged High Risk</div>
                </div>
                <div className="stats-card">
                  <div className="stats-header">
                    <span className="stats-title">Pending Reviews</span>
                    <span className="stats-icon icon-green"><FaStickyNote /></span>
                  </div>
                  <div className="stats-value text-green">{pendingReviewsCount}</div>
                  <div className="stats-footer">Awaiting doctor notes / advice</div>
                </div>
              </div>

              {/* Recent Activity */}
              <div className="section-card mt-8">
                <h3 className="section-title" style={{ marginBottom: "16px" }}>Recent Patient Activity</h3>
                <div className="table-responsive">
                  <table className="recent-table">
                    <thead>
                      <tr>
                        <th>Date & Time</th>
                        <th>Patient Name</th>
                        <th>Patient Email</th>
                        <th>Risk Outcome</th>
                        <th>Confidence</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentActivity.map(p => (
                        <tr key={p._id}>
                          <td>{new Date(p.createdAt).toLocaleString()}</td>
                          <td className="font-bold">{p.user?.name || "Deleted Patient"}</td>
                          <td>{p.user?.email || "N/A"}</td>
                          <td><span className={`badge ${getRiskClass(p.riskLevel)}`}>{p.riskLevel} Risk</span></td>
                          <td className="font-mono">{typeof p.confidence === "number" ? `${p.confidence.toFixed(2)}%` : "N/A"}</td>
                          <td>
                            {p.doctorNotes || p.recommendations ? (
                              <span className="badge badge-low" style={{ textTransform: "capitalize" }}>Reviewed</span>
                            ) : (
                              <span className="badge badge-high" style={{ textTransform: "capitalize" }}>Pending</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PATIENT DATABASE */}
          {activeTab === "users" && (
            <div className="section-card">
              <div className="section-header" style={{ marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
                <h2 className="section-title">Patient Management Database</h2>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ position: "relative", width: "250px" }}>
                    <FaSearch style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-light)" }} />
                    <input
                      type="text"
                      placeholder="Search patients..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      style={{ paddingLeft: "36px", height: "40px", width: "100%" }}
                    />
                  </div>
                  <select 
                    value={userFilter} 
                    onChange={(e) => setUserFilter(e.target.value)}
                    style={{ height: "40px", padding: "0 10px", border: "1.5px solid var(--border-color)", borderRadius: "10px", background: "var(--card-bg)" }}
                  >
                    <option value="All">All Accounts</option>
                    <option value="Active">Active only</option>
                    <option value="Deactive">Deactivated only</option>
                  </select>
                  <select 
                    value={userSort} 
                    onChange={(e) => setUserSort(e.target.value)}
                    style={{ height: "40px", padding: "0 10px", border: "1.5px solid var(--border-color)", borderRadius: "10px", background: "var(--card-bg)" }}
                  >
                    <option value="name">Sort by Name</option>
                    <option value="date">Sort by Reg Date</option>
                    <option value="predictions">Sort by Screenings count</option>
                  </select>
                </div>
              </div>

              <div className="table-responsive">
                <table className="recent-table">
                  <thead>
                    <tr>
                      <th style={{ width: "40px" }}>
                        <input 
                          type="checkbox" 
                          checked={selectedUserIds.length === processedUsers.length && processedUsers.length > 0}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedUserIds(processedUsers.map(u => u._id));
                            } else {
                              setSelectedUserIds([]);
                            }
                          }}
                        />
                      </th>
                      <th>Registration Date</th>
                      <th>Patient Name</th>
                      <th>Email Address</th>
                      <th>Total Predictions</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {processedUsers.map(u => {
                      const userPredsCount = allPredictions.filter(p => (p.user?._id || p.user) === u._id).length;
                      return (
                        <tr key={u._id}>
                          <td>
                            <input 
                              type="checkbox" 
                              checked={selectedUserIds.includes(u._id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedUserIds(prev => [...prev, u._id]);
                                } else {
                                  setSelectedUserIds(prev => prev.filter(id => id !== u._id));
                                }
                              }}
                            />
                          </td>
                          <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                          <td className="font-bold">{u.name}</td>
                          <td>{u.email}</td>
                          <td className="font-bold" style={{ textAlign: "center" }}>{userPredsCount}</td>
                          <td>
                            <button 
                              onClick={() => handleToggleActivation(u._id, u.isActive)}
                              style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: "22px" }}
                            >
                              {u.isActive === false ? (
                                <FaToggleOff style={{ color: "var(--text-light)" }} />
                              ) : (
                                <FaToggleOn style={{ color: "var(--green)" }} />
                              )}
                            </button>
                          </td>
                          <td>
                            <div className="actions-cell">
                              <button className="btn-secondary btn-small" onClick={() => setEditingUser(u)}><FaUserEdit /> Edit</button>
                              <button className="btn-secondary btn-small" onClick={() => {
                                const history = allPredictions.filter(p => (p.user?._id || p.user) === u._id);
                                setSelectedUserHistory({ user: u, history });
                              }}><FaHistory /> History</button>
                              <button className="btn-danger btn-small" onClick={() => handleDeleteUser(u._id)}><FaTrashAlt /></button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Editing Dialog Modal */}
              {editingUser && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                  <div className="glass-card" style={{ width: "100%", maxWidth: "450px", background: "var(--bg-color)" }}>
                    <h3>Edit Patient Details</h3>
                    <form onSubmit={handleEditUserSubmit} className="auth-form mt-4">
                      <div className="form-group">
                        <label>Full Name</label>
                        <input type="text" value={editingUser.name} onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })} required />
                      </div>
                      <div className="form-group">
                        <label>Email Address</label>
                        <input type="email" value={editingUser.email} onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })} required />
                      </div>
                      <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                        <button type="button" className="btn-secondary" onClick={() => setEditingUser(null)}>Cancel</button>
                        <button type="submit" className="btn-primary">Save Changes</button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {/* User History drill-down logs */}
              {selectedUserHistory && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                  <div className="glass-card" style={{ width: "90%", maxWidth: "800px", background: "var(--bg-color)", maxHeight: "80vh", overflowY: "auto" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                      <h3>Historical Prediction Logs: {selectedUserHistory.user.name}</h3>
                      <button className="btn-secondary btn-small" onClick={() => setSelectedUserHistory(null)}>Close</button>
                    </div>
                    {selectedUserHistory.history.length === 0 ? (
                      <p style={{ color: "var(--text-light)" }}>No screenings logged for this patient.</p>
                    ) : (
                      <div className="table-responsive">
                        <table className="recent-table">
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Risk Outcome</th>
                              <th>Confidence</th>
                              <th>Acoustic Metrics</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedUserHistory.history.map(p => (
                              <tr key={p._id}>
                                <td>{new Date(p.createdAt).toLocaleString()}</td>
                                <td><span className={`badge ${getRiskClass(p.riskLevel)}`}>{p.riskLevel} Risk</span></td>
                                <td>{typeof p.confidence === "number" ? `${p.confidence.toFixed(2)}%` : "N/A"}</td>
                                <td style={{ fontSize: "12px" }}>
                                  fo: {p.features?.fo?.toFixed(2) || "N/A"} Hz | Jitter: {p.features?.jitter_local?.toFixed(4) || "N/A"}
                                </td>
                                <td>
                                  <button 
                                    className="btn-secondary btn-small" 
                                    onClick={() => {
                                      setReviewingPrediction(p);
                                      setSelectedUserHistory(null);
                                    }}
                                  >
                                    Review
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PREDICTION REPORTS */}
          {activeTab === "records" && (
            <div className="section-card">
              <div className="section-header" style={{ marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
                <h2 className="section-title">Acoustic Screening Prediction Logs</h2>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ position: "relative", width: "250px" }}>
                    <FaSearch style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-light)" }} />
                    <input
                      type="text"
                      placeholder="Search ID or Patient..."
                      value={recordsSearch}
                      onChange={(e) => setRecordsSearch(e.target.value)}
                      style={{ paddingLeft: "36px", height: "40px", width: "100%" }}
                    />
                  </div>
                  <select 
                    value={recordsFilter} 
                    onChange={(e) => setRecordsFilter(e.target.value)}
                    style={{ height: "40px", padding: "0 12px", border: "1.5px solid var(--border-color)", borderRadius: "10px", background: "var(--card-bg)" }}
                  >
                    <option value="All">All Risks</option>
                    <option value="Low">Low Risk</option>
                    <option value="Medium">Medium Risk</option>
                    <option value="High">High Risk</option>
                  </select>
                  <button onClick={handleExportCSV} className="btn-secondary" style={{ height: "40px" }}><FaFileCsv /> Export CSV</button>
                </div>
              </div>

              <div className="table-responsive">
                <table className="recent-table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Patient Name</th>
                      <th>Patient Email</th>
                      <th>Outcome</th>
                      <th>Confidence</th>
                      <th>Doctor Review</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRecords.map((pred) => (
                      <tr key={pred._id}>
                        <td>{new Date(pred.createdAt).toLocaleString()}</td>
                        <td className="font-bold">{pred.user?.name || "Deleted Patient"}</td>
                        <td>{pred.user?.email || "N/A"}</td>
                        <td>
                          <span className={`badge ${getRiskClass(pred.riskLevel)}`}>
                            {pred.riskLevel} Risk
                          </span>
                        </td>
                        <td className="font-bold">{typeof pred.confidence === "number" ? `${pred.confidence.toFixed(2)}%` : "N/A"}</td>
                        <td>
                          {pred.doctorNotes || pred.recommendations ? (
                            <span className="badge badge-low" style={{ textTransform: "capitalize" }}>Reviewed</span>
                          ) : (
                            <span className="badge badge-high" style={{ textTransform: "capitalize" }}>Awaiting Review</span>
                          )}
                        </td>
                        <td>
                          <div className="actions-cell">
                            <button className="btn-secondary btn-small" onClick={() => setReviewingPrediction(pred)}>
                              <FaEye /> Review & Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadPDF(pred._id)}
                              disabled={downloadingReportId === pred._id}
                              className="btn-success btn-small font-semibold"
                            >
                              <FaFilePdf /> {downloadingReportId === pred._id ? "..." : "PDF"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {recordsTotalPages > 1 && (
                <div className="pagination-container">
                  <button disabled={recordsPage === 1} onClick={() => setRecordsPage(prev => prev - 1)} className="btn-pagination">&larr; Previous</button>
                  <span className="pagination-text">Page {recordsPage} of {recordsTotalPages}</span>
                  <button disabled={recordsPage === recordsTotalPages} onClick={() => setRecordsPage(prev => prev + 1)} className="btn-pagination">Next &rarr;</button>
                </div>
              )}

              {/* Review Report & Doctor Notes Modal */}
              {reviewingPrediction && (
                <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                  <div className="glass-card" style={{ width: "90%", maxWidth: "700px", background: "var(--bg-color)", maxHeight: "90vh", overflowY: "auto" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                      <h3>Clinical Report Review</h3>
                      <button className="btn-secondary btn-small" onClick={() => setReviewingPrediction(null)}>Close</button>
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "20px" }}>
                      <div>
                        <h4 style={{ color: "var(--primary-color)", marginBottom: "10px" }}>Patient Information</h4>
                        <p style={{ fontSize: "14px" }}>Name: <strong>{reviewingPrediction.user?.name || "Deleted"}</strong></p>
                        <p style={{ fontSize: "14px" }}>Email: <strong>{reviewingPrediction.user?.email || "N/A"}</strong></p>
                        <p style={{ fontSize: "14px" }}>Date: {new Date(reviewingPrediction.createdAt).toLocaleString()}</p>
                        
                        <h4 style={{ color: "var(--primary-color)", margin: "20px 0 10px" }}>Diagnostics</h4>
                        <p style={{ fontSize: "14px" }}>Model prediction: <strong>Label {reviewingPrediction.label} ({reviewingPrediction.riskLevel} Risk)</strong></p>
                        <p style={{ fontSize: "14px" }}>Confidence: <strong>{typeof reviewingPrediction.confidence === "number" ? `${reviewingPrediction.confidence.toFixed(2)}%` : "N/A (Screening)"}</strong></p>
                      </div>

                      <div style={{ borderLeft: "1px solid var(--border-color)", paddingLeft: "20px" }}>
                        <h4 style={{ color: "var(--secondary-color)", marginBottom: "10px" }}>Vocal Biomarkers</h4>
                        <div style={{ maxHeight: "150px", overflowY: "auto", fontSize: "12px", background: "rgba(148,163,184,0.05)", padding: "10px", borderRadius: "8px" }}>
                          <p>fo: {reviewingPrediction.features?.fo?.toFixed(2)} Hz</p>
                          <p>fhi: {reviewingPrediction.features?.fhi?.toFixed(2)} Hz</p>
                          <p>flo: {reviewingPrediction.features?.flo?.toFixed(2)} Hz</p>
                          <p>jitter_local: {reviewingPrediction.features?.jitter_local?.toFixed(5)}%</p>
                          <p>shimmer_local: {reviewingPrediction.features?.shimmer_local?.toFixed(5)}%</p>
                          <p>hnr: {reviewingPrediction.features?.hnr?.toFixed(2)} dB</p>
                        </div>
                      </div>
                    </div>

                    {/* Report actions form */}
                    <form onSubmit={handleSaveReview} className="profile-form mt-6" style={{ borderTop: "1px solid var(--border-color)", paddingTop: "20px" }}>
                      <div className="form-group">
                        <label>Doctor's Remarks (Notes)</label>
                        <textarea
                          placeholder="e.g. Schedule follow-up after 30 days. Recommend neurological consultation."
                          value={reviewingPrediction.doctorNotes || ""}
                          onChange={(e) => setReviewingPrediction({ ...reviewingPrediction, doctorNotes: e.target.value })}
                          style={{ height: "80px" }}
                        />
                      </div>
                      
                      <div className="form-group" style={{ marginTop: "12px" }}>
                        <label>Clinical Action Recommendation</label>
                        <select
                          value={reviewingPrediction.recommendations || ""}
                          onChange={(e) => setReviewingPrediction({ ...reviewingPrediction, recommendations: e.target.value })}
                        >
                          <option value="">No action needed</option>
                          <option value="Consult Neurologist">Consult Neurologist</option>
                          <option value="Daily Exercise">Daily Exercise</option>
                          <option value="Voice Therapy">Voice Therapy</option>
                          <option value="Physiotherapy">Physiotherapy</option>
                          <option value="Medication Reminder">Medication Reminder</option>
                          <option value="Lifestyle Improvements">Lifestyle Improvements</option>
                        </select>
                      </div>

                      <div style={{ display: "flex", gap: "10px", marginTop: "20px" }}>
                        <button type="button" className="btn-secondary" onClick={() => setReviewingPrediction(null)}>Cancel</button>
                        <button
                          type="button"
                          onClick={() => handleDownloadPDF(reviewingPrediction._id)}
                          disabled={downloadingReportId === reviewingPrediction._id}
                          className="btn-success font-semibold"
                        >
                          <FaFilePdf /> {downloadingReportId === reviewingPrediction._id ? "Downloading..." : "PDF Report"}
                        </button>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          onClick={() => window.print()}
                        >
                          Print Report
                        </button>
                        <button type="submit" className="btn-primary" disabled={savingReview}>
                          {savingReview ? "Saving..." : "Save Review"}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: RISK ANALYSIS */}
          {activeTab === "risks" && (
            <div className="section-card">
              <div className="section-header" style={{ marginBottom: "20px", flexWrap: "wrap", gap: "16px" }}>
                <h2 className="section-title">Risk Level Analysis</h2>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <div style={{ position: "relative", width: "250px" }}>
                    <FaSearch style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-light)" }} />
                    <input
                      type="text"
                      placeholder="Search patient, email, date..."
                      value={risksSearch}
                      onChange={(e) => setRisksSearch(e.target.value)}
                      style={{ paddingLeft: "36px", height: "40px", width: "100%" }}
                    />
                  </div>
                  <select 
                    value={risksFilter} 
                    onChange={(e) => setRisksFilter(e.target.value)}
                    style={{ height: "40px", padding: "0 12px", border: "1.5px solid var(--border-color)", borderRadius: "10px", background: "var(--card-bg)" }}
                  >
                    <option value="All">All Risks</option>
                    <option value="Low">Low Risk Only</option>
                    <option value="Medium">Medium Risk Only</option>
                    <option value="High">High Risk Only</option>
                  </select>
                  <select 
                    value={risksSort} 
                    onChange={(e) => setRisksSort(e.target.value)}
                    style={{ height: "40px", padding: "0 12px", border: "1.5px solid var(--border-color)", borderRadius: "10px", background: "var(--card-bg)" }}
                  >
                    <option value="HighestRisk">Highest Risk first</option>
                    <option value="LowestRisk">Lowest Risk first</option>
                    <option value="HighestConfidence">Highest Confidence</option>
                    <option value="LowestConfidence">Lowest Confidence</option>
                    <option value="Newest">Newest Prediction</option>
                    <option value="Oldest">Oldest Prediction</option>
                  </select>
                </div>
              </div>

              <div className="table-responsive">
                <table className="recent-table">
                  <thead>
                    <tr>
                      <th>Prediction Date</th>
                      <th>Patient Name</th>
                      <th>Email</th>
                      <th>Risk Classification</th>
                      <th>Confidence Score</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedRisks.map(p => (
                      <tr key={p._id}>
                        <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                        <td className="font-bold">{p.user?.name || "Deleted"}</td>
                        <td>{p.user?.email || "N/A"}</td>
                        <td><span className={`badge ${getRiskClass(p.riskLevel)}`}>{p.riskLevel} Risk</span></td>
                        <td className="font-bold" style={{ color: getRiskColor(p.riskLevel) }}>{typeof p.confidence === "number" ? `${p.confidence.toFixed(2)}%` : "N/A"}</td>
                        <td>
                          <button className="btn-secondary btn-small" onClick={() => setReviewingPrediction(p)}><FaEye /> Review Report</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {risksTotalPages > 1 && (
                <div className="pagination-container">
                  <button disabled={risksPage === 1} onClick={() => setRisksPage(prev => prev - 1)} className="btn-pagination">&larr; Previous</button>
                  <span className="pagination-text">Page {risksPage} of {risksTotalPages}</span>
                  <button disabled={risksPage === risksTotalPages} onClick={() => setRisksPage(prev => prev + 1)} className="btn-pagination">Next &rarr;</button>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DOCTOR NOTES */}
          {activeTab === "notes" && (
            <div className="section-card">
              <div className="section-header" style={{ marginBottom: "20px" }}>
                <h2 className="section-title">Medical Remarks & Notes</h2>
                <div style={{ position: "relative", width: "280px" }}>
                  <FaSearch style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-light)" }} />
                  <input
                    type="text"
                    placeholder="Search patient or notes..."
                    value={notesSearch}
                    onChange={(e) => setNotesSearch(e.target.value)}
                    style={{ paddingLeft: "36px", height: "40px", width: "100%" }}
                  />
                </div>
              </div>

              <div className="table-responsive">
                <table className="recent-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Risk Level</th>
                      <th>Last Assessment Date</th>
                      <th>Medical Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPredictions
                      .filter(p => !notesSearch || (p.user?.name || "").toLowerCase().includes(notesSearch.toLowerCase()) || (p.doctorNotes || "").toLowerCase().includes(notesSearch.toLowerCase()))
                      .map(p => (
                        <tr key={p._id}>
                          <td className="font-bold">{p.user?.name || "Deleted"}</td>
                          <td><span className={`badge ${getRiskClass(p.riskLevel)}`}>{p.riskLevel}</span></td>
                          <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                          <td style={{ color: p.doctorNotes ? "var(--text-main)" : "var(--text-light)" }}>
                            {p.doctorNotes || "No medical remarks entered yet."}
                          </td>
                          <td>
                            <button className="btn-secondary btn-small" onClick={() => setReviewingPrediction(p)}>
                              <FaUserEdit /> Edit Notes
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 6: RECOMMENDATIONS */}
          {activeTab === "recommendations" && (
            <div className="section-card">
              <div className="section-header" style={{ marginBottom: "20px" }}>
                <h2 className="section-title">Personalized Recommendations Management</h2>
                <div style={{ position: "relative", width: "280px" }}>
                  <FaSearch style={{ position: "absolute", left: "12px", top: "14px", color: "var(--text-light)" }} />
                  <input
                    type="text"
                    placeholder="Search patient or action..."
                    value={recsSearch}
                    onChange={(e) => setRecsSearch(e.target.value)}
                    style={{ paddingLeft: "36px", height: "40px", width: "100%" }}
                  />
                </div>
              </div>

              <div className="table-responsive">
                <table className="recent-table">
                  <thead>
                    <tr>
                      <th>Patient Name</th>
                      <th>Last Assessment Date</th>
                      <th>Recommendation Action</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allPredictions
                      .filter(p => !recsSearch || (p.user?.name || "").toLowerCase().includes(recsSearch.toLowerCase()) || (p.recommendations || "").toLowerCase().includes(recsSearch.toLowerCase()))
                      .map(p => (
                        <tr key={p._id}>
                          <td className="font-bold">{p.user?.name || "Deleted"}</td>
                          <td>{new Date(p.createdAt).toLocaleDateString()}</td>
                          <td>
                            {p.recommendations ? (
                              <span className="badge badge-low" style={{ textTransform: "capitalize" }}>{p.recommendations}</span>
                            ) : (
                              <span className="badge badge-high" style={{ textTransform: "capitalize" }}>None set</span>
                            )}
                          </td>
                          <td>
                            <button className="btn-secondary btn-small" onClick={() => setReviewingPrediction(p)}>
                              <FaUserEdit /> Change Action
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 7: ANALYTICS */}
          {activeTab === "analytics" && (
            <div>
              {/* Charts grid */}
              <div className="charts-grid">
                <div className="chart-card">
                  <h3 className="chart-title">Risk Proportion Analytics</h3>
                  <div className="chart-container-wrapper">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={riskPieData}
                          cx="50%"
                          cy="45%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, value }) => `${name} (${value})`}
                        >
                          {riskPieData.map((entry, idx) => (
                            <Cell key={`cell-${idx}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend verticalAlign="bottom" height={36} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="chart-card">
                  <h3 className="chart-title">Prediction Monthly Counts</h3>
                  <div className="chart-container-wrapper">
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={barChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="month" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Bar dataKey="count" fill="var(--secondary-color)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="chart-card">
                  <h3 className="chart-title">Patient Registrations Trend</h3>
                  <div className="chart-container-wrapper">
                    <ResponsiveContainer width="100%" height={260}>
                      <AreaChart data={areaChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Area type="monotone" dataKey="registrations" stroke="var(--primary-color)" fill="rgba(2, 132, 199, 0.15)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="chart-card">
                  <h3 className="chart-title">High vs Low Risk Trend</h3>
                  <div className="chart-container-wrapper">
                    <ResponsiveContainer width="100%" height={260}>
                      <LineChart data={lineChartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="day" />
                        <YAxis allowDecimals={false} />
                        <Tooltip />
                        <Line type="monotone" dataKey="predictions" stroke="var(--red)" strokeWidth={3} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 8: AI INSIGHTS */}
          {activeTab === "insights" && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "24px", marginBottom: "30px" }}>
                <div className="stats-card">
                  <span className="stats-title">Avg Prediction Confidence</span>
                  <div className="stats-value">
                    {(() => { const valid = allPredictions.filter(p => typeof p.confidence === "number"); return valid.length > 0 ? (valid.reduce((acc, curr) => acc + curr.confidence, 0) / valid.length).toFixed(2) : "0.00"; })()}%
                  </div>
                  <div className="stats-footer">Across all voice recordings</div>
                </div>

                <div className="stats-card">
                  <span className="stats-title">Avg Predictions Per Patient</span>
                  <div className="stats-value">
                    {(totalPredictions / (totalPatients || 1)).toFixed(1)}
                  </div>
                  <div className="stats-footer">Frequency of vocal tracking</div>
                </div>

                <div className="stats-card">
                  <span className="stats-title">High Risk Proportion</span>
                  <div className="stats-value text-red">
                    {((highRiskPredictions.length / (totalPredictions || 1)) * 100).toFixed(1)}%
                  </div>
                  <div className="stats-footer">Out of total computed predictions</div>
                </div>

                <div className="stats-card">
                  <span className="stats-title">Low Risk Proportion</span>
                  <div className="stats-value text-green">
                    {((lowRiskPredictions.length / (totalPredictions || 1)) * 100).toFixed(1)}%
                  </div>
                  <div className="stats-footer">Out of total computed predictions</div>
                </div>
              </div>

              {/* Critical Patients List */}
              <div className="profile-grid">
                <div className="section-card">
                  <h3 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--red)" }}>
                    <FaExclamationTriangle /> Critical Patients (Consecutive High Risks)
                  </h3>
                  <p className="section-subtitle">Patients showing consecutive positive Parkinsonian tremors during latest voice logs.</p>
                  
                  {criticalPatients.length === 0 ? (
                    <p style={{ color: "var(--text-light)", marginTop: "20px" }}>No critical patient sequences detected.</p>
                  ) : (
                    <div className="table-responsive" style={{ marginTop: "14px" }}>
                      <table className="recent-table">
                        <thead>
                          <tr>
                            <th>Patient Name</th>
                            <th>High Risk Sequence Count</th>
                            <th>Last Score</th>
                          </tr>
                        </thead>
                        <tbody>
                          {criticalPatients.map(item => (
                            <tr key={item.user._id}>
                              <td className="font-bold">{item.user.name}</td>
                              <td className="font-bold text-red" style={{ textAlign: "center" }}>{item.consecutiveHighCount} times</td>
                              <td className="font-mono">{typeof item.lastPrediction?.confidence === "number" ? `${item.lastPrediction.confidence.toFixed(2)}%` : "N/A"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Most Active Patients */}
                <div className="section-card">
                  <h3 className="section-title">Most Active Patients</h3>
                  <p className="section-subtitle">Patients logged most frequently on the platform.</p>
                  <div className="table-responsive" style={{ marginTop: "14px" }}>
                    <table className="recent-table">
                      <thead>
                        <tr>
                          <th>Patient Name</th>
                          <th>Patient Email</th>
                          <th>Logs Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {allUsers
                          .filter(u => u.role !== "admin")
                          .map(u => {
                            const count = allPredictions.filter(p => (p.user?._id || p.user) === u._id).length;
                            return { user: u, count };
                          })
                          .sort((a, b) => b.count - a.count)
                          .slice(0, 5)
                          .map(item => (
                            <tr key={item.user._id}>
                              <td className="font-bold">{item.user.name}</td>
                              <td>{item.user.email}</td>
                              <td className="font-bold" style={{ textAlign: "center" }}>{item.count} logs</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 9: EMAIL CENTER */}
          {activeTab === "emails" && (
            <div className="section-card" style={{ maxWidth: "700px", margin: "0 auto" }}>
              <h2 className="section-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}><FaEnvelope style={{ color: "var(--primary-color)" }} /> Email Center</h2>
              <p className="section-subtitle">Simulate clinical appointment notifications and health advisories.</p>

              <form onSubmit={handleSendEmails} className="profile-form mt-6">
                <div className="form-group">
                  <label>Target Audience Recipients</label>
                  <select value={emailTarget} onChange={(e) => setEmailTarget(e.target.value)}>
                    <option value="selected">Selected Patients ({selectedUserIds.length} checked in Patient tab)</option>
                    <option value="high_risk">All High Risk Patients ({highRiskPatientsCount})</option>
                    <option value="low_risk">All Low Risk Patients ({lowRiskPatientsCount})</option>
                    <option value="all">All Registered Patients ({totalPatients})</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Email Notification Template</label>
                  <div style={{ display: "flex", gap: "16px", marginTop: "4px" }}>
                    <label className="checkbox-label">
                      <input 
                        type="radio" 
                        name="template" 
                        checked={emailTemplate === "reminder"} 
                        onChange={() => setEmailTemplate("reminder")} 
                      />
                      Appointment Reminder
                    </label>
                    <label className="checkbox-label">
                      <input 
                        type="radio" 
                        name="template" 
                        checked={emailTemplate === "advisory"} 
                        onChange={() => setEmailTemplate("advisory")} 
                      />
                      Health Advisory Email
                    </label>
                  </div>
                </div>

                <div className="form-group">
                  <label>Subject</label>
                  <input 
                    type="text" 
                    value={emailSubject} 
                    onChange={(e) => setEmailSubject(e.target.value)} 
                    required 
                  />
                </div>

                <div className="form-group">
                  <label>Email Body Message</label>
                  <textarea 
                    value={emailBody} 
                    onChange={(e) => setEmailBody(e.target.value)} 
                    style={{ height: "150px" }}
                    required 
                  />
                </div>

                <button type="submit" className="btn-primary font-bold">
                  Send Outbreak Email Campaign
                </button>
              </form>
            </div>
          )}

          {/* TAB 10: SETTINGS */}
          {activeTab === "settings" && (
            <div className="profile-grid">
              <div className="section-card">
                <h3 className="section-title">Threshold Parameters Settings</h3>
                <form className="profile-form mt-4" onSubmit={(e) => { e.preventDefault(); setToastMessage("Model limits synchronized."); }}>
                  <div className="form-group">
                    <label>Acoustic Model Microservice URL</label>
                    <input type="text" defaultValue="http://127.0.0.1:8000" />
                  </div>
                  <div className="form-group">
                    <label>Risk warning Medium threshold</label>
                    <input type="number" defaultValue="0.35" step="0.05" />
                  </div>
                  <div className="form-group">
                    <label>Risk warning High threshold</label>
                    <input type="number" defaultValue="0.65" step="0.05" />
                  </div>
                  <button type="submit" className="btn-primary">Update Thresholds</button>
                </form>
              </div>

              <div className="section-card">
                <h3 className="section-title">Clinical Systems Config</h3>
                <form className="profile-form mt-4" onSubmit={(e) => { e.preventDefault(); setToastMessage("Clinical settings saved."); }}>
                  <div className="form-group">
                    <label>Hospital Header Title</label>
                    <input type="text" defaultValue="PARKINSON'S RISK ASSESSMENT REPORT" />
                  </div>
                  <div className="form-group">
                    <label>Diagnostic Notice Disclaimer</label>
                    <textarea style={{ height: "80px" }} defaultValue="This assessment is driven by automated machine learning models based solely on acoustic voice recordings and does not constitute a clinical medical diagnosis." />
                  </div>
                  <button type="submit" className="btn-primary" style={{ background: "linear-gradient(135deg, var(--secondary-color) 0%, #0d766e 100%)", boxShadow: "0 4px 14px 0 rgba(13, 148, 136, 0.3)" }}>Update Settings</button>
                </form>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
