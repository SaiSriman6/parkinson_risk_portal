const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");
const { getJwtSecret } = require("./config/jwtConfig");

// Load Environment Variables (server/.env followed by root .env fallback)
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Ensure JWT Secret configuration is valid
getJwtSecret();

const app = express();

// Build CORS Allowed Origins allowlist
const defaultOrigins = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "https://parkinsons-prediction-phi.vercel.app"
];

const allowedOrigins = [...defaultOrigins];

// Add configured frontend origins from environment variables (comma-separated or single)
const configuredOrigins = [process.env.FRONTEND_URL, process.env.APP_BASE_URL].filter(Boolean);
configuredOrigins.forEach((val) => {
  val.split(",").forEach((origin) => {
    const trimmed = origin.trim().replace(/\/+$/, "");
    if (trimmed && !allowedOrigins.includes(trimmed)) {
      allowedOrigins.push(trimmed);
    }
  });
});

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (such as mobile apps, curl, Postman, or server-to-server)
    if (!origin) return callback(null, true);

    // Check exact match in allowedOrigins list
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Allow Vercel preview/production deployments (*.vercel.app)
    const isVercelDomain = /^https:\/\/[a-zA-Z0-9_-]+\.vercel\.app$/.test(origin);
    if (isVercelDomain) {
      return callback(null, true);
    }

    console.warn(`[CORS Blocked] Origin not allowed: ${origin}`);
    return callback(new Error("Origin not allowed by CORS policy."));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false, // JWT is transmitted via Bearer Authorization header, no cross-origin cookies required
  optionsSuccessStatus: 204
};

// Middlewares
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure uploads directory exists (private storage accessed only via authenticated endpoint)
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/parkinson";

if (process.env.NODE_ENV !== "test") {
  mongoose
    .connect(mongoUri, {
      dbName: "Parkinsons",
    })
    .then(() => {
      console.log("MongoDB connected successfully");
      console.log("Database:", mongoose.connection.name);
    })
    .catch((err) => {
      console.error("MongoDB connection failed:", err.message);
    });
}

// Health check endpoints
app.get(["/health", "/api/health"], (req, res) => {
  res.json({
    status: "UP",
    service: "parkinson-express-server",
    timestamp: new Date().toISOString()
  });
});

// Diagnostic endpoint to verify downstream Python ML service connectivity
app.get("/api/health/ml", async (req, res) => {
  const axios = require("axios");
  const rawPythonUrl = process.env.PYTHON_SERVICE_URL;
  if (!rawPythonUrl || !rawPythonUrl.trim()) {
    return res.status(503).json({
      status: "DOWN",
      configured: false,
      message: "PYTHON_SERVICE_URL is not configured in environment",
      pythonServiceUrl: null
    });
  }
  const pythonServiceUrl = rawPythonUrl.trim().replace(/\/+$/, "");
  try {
    const timeoutMs = parseInt(process.env.PYTHON_HEALTH_TIMEOUT_MS, 10) || 10000;
    const mlRes = await axios.get(`${pythonServiceUrl}/health`, { timeout: timeoutMs });
    res.json({
      status: "UP",
      configured: true,
      pythonServiceUrl,
      mlService: mlRes.data
    });
  } catch (err) {
    const isTimeout = err.code === "ECONNABORTED" || (err.message && err.message.toLowerCase().includes("timeout"));
    res.status(502).json({
      status: "DOWN",
      configured: true,
      pythonServiceUrl,
      timeout: Boolean(isTimeout),
      error: err.message
    });
  }
});

// Routes configuration
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/predictions", require("./routes/predictionRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/video-analysis", require("./routes/videoAnalysisRoutes"));

// Error handling middleware
app.use((err, req, res, next) => {
  if (err.message === "Origin not allowed by CORS policy.") {
    return res.status(403).json({ message: "Origin not allowed by CORS policy." });
  }
  console.error("Unhandled Server Error:", err.stack);
  res.status(500).json({
    message: err.message || "An unexpected server error occurred",
    error: process.env.NODE_ENV === "production" ? {} : err.stack
  });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} (bound to 0.0.0.0)`);
  });
}

module.exports = app;
