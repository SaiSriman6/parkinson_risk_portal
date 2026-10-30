import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useContext } from "react";
import { AuthProvider, AuthContext } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Prediction from "./pages/Prediction";
import History from "./pages/History";
import Result from "./pages/Result";
import AdminDashboard from "./pages/AdminDashboard";
import AssessmentComparison from "./pages/AssessmentComparison";
import MRIAnalysis from "./pages/MRIAnalysis";
import VideoGaitAnalysis from "./pages/VideoGaitAnalysis";


// Protected route wrapper

function ProtectedRoute({ children }) {
  const { user, loading } = useContext(AuthContext);

  if (loading) {
    return (
      <div className="full-screen-loader">
        <div className="spinner"></div>
        <p>Validating user credentials...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

// Admin route wrapper
function AdminRoute({ children }) {
  const { user } = useContext(AuthContext);
  if (user && user.role !== "admin") {
    return <Navigate to="/" replace />;
  }
  return children;
}

function DashboardOrLanding() {
  const { user } = useContext(AuthContext);
  if (user) {
    return user.role === "admin" ? <Navigate to="/admin" replace /> : <Dashboard />;
  }
  return <Landing />;
}

function MainLayout() {
  const { user } = useContext(AuthContext);
  return (
    <div className="app-layout">
      <Navbar />
      <div className={user ? "dashboard-layout" : ""}>
        {user && <Sidebar />}
        <main className="main-content">
          <Routes>
            <Route path="/" element={<DashboardOrLanding />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            
            <Route
              path="/admin"
              element={
                <ProtectedRoute>
                  <AdminRoute>
                    <AdminDashboard />
                  </AdminRoute>
                </ProtectedRoute>
              }
            />
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <Profile />
                </ProtectedRoute>
              }
            />
            <Route
              path="/predict"
              element={
                <ProtectedRoute>
                  <Prediction />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mri-analysis"
              element={
                <ProtectedRoute>
                  <MRIAnalysis />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mri"
              element={
                <ProtectedRoute>
                  <MRIAnalysis />
                </ProtectedRoute>
              }
            />
            <Route
              path="/video-gait-analysis"
              element={
                <ProtectedRoute>
                  <VideoGaitAnalysis />
                </ProtectedRoute>
              }
            />
            <Route
              path="/gait"
              element={
                <ProtectedRoute>
                  <VideoGaitAnalysis />
                </ProtectedRoute>
              }
            />
            <Route
              path="/history"
              element={
                <ProtectedRoute>
                  <History />
                </ProtectedRoute>
              }
            />
            <Route
              path="/compare"
              element={
                <ProtectedRoute>
                  <AssessmentComparison />
                </ProtectedRoute>
              }
            />
            <Route
              path="/result/:id"
              element={
                <ProtectedRoute>
                  <Result />
                </ProtectedRoute>
              }
            />

            
            {/* Catch-all route redirects to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <MainLayout />
      </Router>
    </AuthProvider>
  );
}
