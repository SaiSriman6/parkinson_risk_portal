import { useContext } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AuthContext } from "../context/AuthContext";
import { 
  FaHeartbeat, FaMicrophone, FaHistory, FaUser, 
  FaUsers, FaFileMedicalAlt, FaExclamationTriangle, 
  FaStickyNote, FaMedkit, FaChartPie, FaBrain, FaEnvelope, FaCog, FaSignOutAlt, FaExchangeAlt, FaWalking 
} from "react-icons/fa";


export default function Sidebar() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  if (!user) return null;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const isDoctor = user.role === "admin";

  return (
    <aside className="sidebar">
      <div className="sidebar-links">
        {isDoctor ? (
          <>
            {/* DOCTOR SIDEBAR MENU */}
            <NavLink 
              to="/admin?tab=overview" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaHeartbeat />
              <span>Dashboard</span>
            </NavLink>

            <NavLink 
              to="/admin?tab=users" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaUsers />
              <span>Patients</span>
            </NavLink>

            <NavLink 
              to="/admin?tab=records" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaFileMedicalAlt />
              <span>Prediction Reports</span>
            </NavLink>

            <NavLink 
              to="/admin?tab=risks" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaExclamationTriangle />
              <span>Risk Analysis</span>
            </NavLink>

            <NavLink 
              to="/admin?tab=notes" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaStickyNote />
              <span>Doctor Notes</span>
            </NavLink>

            <NavLink 
              to="/admin?tab=recommendations" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaMedkit />
              <span>Recommendations</span>
            </NavLink>

            <NavLink 
              to="/admin?tab=analytics" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaChartPie />
              <span>Analytics</span>
            </NavLink>

            <NavLink 
              to="/admin?tab=insights" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaBrain />
              <span>AI Insights</span>
            </NavLink>

            <NavLink 
              to="/admin?tab=emails" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaEnvelope />
              <span>Email Center</span>
            </NavLink>

            <NavLink 
              to="/admin?tab=settings" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaCog />
              <span>Settings</span>
            </NavLink>

            <button 
              onClick={handleLogout} 
              className="sidebar-link" 
              style={{ background: "transparent", border: "none", width: "100%", textAlign: "left", cursor: "pointer", marginTop: "auto", borderTop: "1px solid var(--border-color)", paddingTop: "20px" }}
            >
              <FaSignOutAlt />
              <span>Logout</span>
            </button>
          </>
        ) : (
          <>
            {/* PATIENT SIDEBAR MENU */}
            <NavLink 
              to="/" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaHeartbeat />
              <span>Dashboard</span>
            </NavLink>
            
            <NavLink 
              to="/predict" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaMicrophone />
              <span>Voice Assessment</span>
            </NavLink>

            <NavLink 
              to="/mri-analysis" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaBrain />
              <span>MRI Image Analysis</span>
            </NavLink>

            <NavLink 
              to="/video-gait-analysis" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaWalking />
              <span>Video Gait Analysis</span>
            </NavLink>

            <NavLink 
              to="/history" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaHistory />
              <span>History Logs</span>
            </NavLink>

            <NavLink 
              to="/compare" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaExchangeAlt />
              <span>Compare Screenings</span>
            </NavLink>

            <NavLink 
              to="/profile" 
              className={({ isActive }) => `sidebar-link ${isActive ? "active" : ""}`}
            >
              <FaUser />
              <span>Profile Settings</span>
            </NavLink>

          </>
        )}
      </div>
    </aside>
  );
}
