const fs = require("fs");
const path = require("path");
const axios = require("axios");
const Prediction = require("../models/Prediction");
const { generateReportPDF } = require("../utils/pdfGenerator");
const { createNotification } = require("../utils/notificationHelper");
const { sendAssessmentCompletedEmail, sendReportEmail } = require("../utils/emailService");

// @desc    Upload voice file and get ML prediction
// @route   POST /api/predictions/upload
// @access  Private
const createPrediction = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No audio file uploaded" });
    }

    const filePath = req.file.path;
    const rawPythonUrl = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";
    const pythonServiceUrl = rawPythonUrl.replace(/\/+$/, "");

    // Read file and prepare multipart form-data for Python ML service
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], { type: req.file.mimetype });
    const formData = new FormData();
    formData.append("file", blob, req.file.originalname);

    // Call Python ML microservice (60s timeout accommodates Render free-tier cold starts)
    let mlResponse;
    try {
      mlResponse = await axios.post(`${pythonServiceUrl}/predict`, formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        },
        timeout: 60000
      });
    } catch (mlErr) {
      console.error("ML service communication failed:", mlErr.message);
      // Clean up uploaded file on processing error
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      const statusCode = mlErr.response?.status || 502;
      const detailMsg = mlErr.response?.data?.detail || "Machine learning microservice unavailable or returned an error";
      return res.status(statusCode).json({
        message: detailMsg,
        error: mlErr.message
      });
    }

    const { features, label, probability, confidence, riskLevel, modelVersion, globalFeatureImportances, featureDeviations } = mlResponse.data;

    // Save prediction record to Database
    const relativeVoicePath = path.join("uploads", req.file.filename).replace(/\\/g, "/");

    const prediction = new Prediction({
      user: req.user.id,
      label,
      confidence,
      riskLevel,
      features,
      voicePath: relativeVoicePath,
      modelVersion: modelVersion || "1.0.0",
      globalFeatureImportances: globalFeatureImportances || {},
      featureDeviations: featureDeviations || {}
    });

    await prediction.save();

    // Trigger notification for assessment completion
    await createNotification(
      req.user.id,
      "Voice Assessment Completed",
      `Acoustic evaluation processed: ${riskLevel} Risk Classification (${confidence.toFixed(1)}% confidence).`,
      "assessment",
      `/result/${prediction._id}`
    );

    // Non-blocking email dispatch for assessment completion
    sendAssessmentCompletedEmail(req.user, prediction._id).catch((err) => console.error("Assessment email notice:", err));

    res.status(201).json(prediction);
  } catch (error) {
    console.error("Prediction creation error:", error);
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Upload MRI image file and get ML prediction
// @route   POST /api/predictions/upload-mri
// @access  Private
const createMRIPrediction = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No MRI image file uploaded. Please select a valid PNG, JPG, or WEBP image." });
    }

    const rawPythonUrl = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";
    const pythonServiceUrl = rawPythonUrl.replace(/\/+$/, "");

    // Prepare multipart form-data for Python ML service using memory buffer
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "image/png" });
    const formData = new FormData();
    formData.append("file", blob, req.file.originalname || "mri_scan.png");

    // Call Python ML microservice
    let mlResponse;
    try {
      mlResponse = await axios.post(`${pythonServiceUrl}/predict_mri`, formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        },
        timeout: 60000
      });
    } catch (mlErr) {
      console.error("ML service MRI communication failed:", mlErr.message);
      const statusCode = mlErr.response?.status || 502;
      const detailMsg = mlErr.response?.data?.detail || "Machine learning microservice unavailable or returned an error";
      return res.status(statusCode).json({
        message: detailMsg,
        error: mlErr.message
      });
    }

    const {
      label,
      predictedClass,
      riskLevel,
      confidence,
      pdProbability,
      normalProbability,
      modelVersion,
      imageMetadata,
      disclaimer
    } = mlResponse.data;

    // Save prediction record to Database with predictionType: "mri"
    const prediction = new Prediction({
      user: req.user.id,
      predictionType: "mri",
      label,
      confidence,
      riskLevel,
      modelVersion: modelVersion || "mri-mobilenetv2-v1.0.0",
      mriDetails: {
        predictedClass,
        pdProbability,
        normalProbability,
        imageFilename: req.file.originalname,
        imageDimensions: imageMetadata?.dimensions || `${imageMetadata?.width}x${imageMetadata?.height}`,
        fileSizeBytes: req.file.size || req.file.buffer.length,
        disclaimer
      }
    });

    await prediction.save();

    // Trigger notification for assessment completion
    await createNotification(
      req.user.id,
      "MRI Assessment Completed",
      `Neuroimaging scan evaluated: ${predictedClass} (${confidence.toFixed(1)}% confidence, ${riskLevel} Risk).`,
      "assessment",
      `/result/${prediction._id}`
    );

    res.status(201).json(prediction);
  } catch (error) {
    console.error("MRI Prediction creation error:", error);
    res.status(500).json({ message: "Server error processing MRI image", error: error.message });
  }
};

// @desc    Upload walking video file and get video gait analysis
// @route   POST /api/predictions/upload-video OR POST /api/video-analysis/predict
// @access  Private
const createVideoGaitPrediction = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        message: "No video file uploaded. Please upload an MP4, WEBM, MOV, or AVI walking video."
      });
    }

    const rawPythonUrl = process.env.PYTHON_SERVICE_URL || "http://127.0.0.1:8000";
    const pythonServiceUrl = rawPythonUrl.replace(/\/+$/, "");

    // Prepare multipart form-data for Python ML service using memory buffer
    const blob = new Blob([req.file.buffer], { type: req.file.mimetype || "video/mp4" });
    const formData = new FormData();
    formData.append("file", blob, req.file.originalname || "walking_video.mp4");

    // Call Python ML microservice (120s timeout for video processing)
    let mlResponse;
    try {
      mlResponse = await axios.post(`${pythonServiceUrl}/predict_gait`, formData, {
        headers: {
          "Content-Type": "multipart/form-data"
        },
        timeout: parseInt(process.env.VIDEO_ANALYSIS_TIMEOUT_MS, 10) || 120000
      });
    } catch (mlErr) {
      console.error("ML service Video Gait communication failed:", mlErr.message);
      const statusCode = mlErr.response?.status || 502;
      const detailMsg = mlErr.response?.data?.detail || "Video gait analysis service unavailable or returned an error";
      return res.status(statusCode).json({
        message: detailMsg,
        error: mlErr.message
      });
    }

    const {
      analysisType,
      videoMetadata,
      gaitAnalysis,
      prediction: mlPrediction,
      limitations,
      disclaimer
    } = mlResponse.data;

    const isModelAvailable = Boolean(mlPrediction?.available);

    const riskLevel = isModelAvailable && mlPrediction.riskLevel
      ? mlPrediction.riskLevel
      : "Indeterminate";

    const confidenceVal = (isModelAvailable && typeof mlPrediction?.confidence === "number")
      ? mlPrediction.confidence
      : null;

    const labelVal = (isModelAvailable && typeof mlPrediction?.label === "number")
      ? mlPrediction.label
      : null;

    const modelVersionStr = mlPrediction?.modelVersion || "video-gait-v1.0.0";

    // Save prediction record to Database with predictionType: "video_gait"
    const prediction = new Prediction({
      user: req.user.id,
      predictionType: "video_gait",
      label: labelVal,
      confidence: confidenceVal,
      riskLevel: riskLevel,
      modelVersion: modelVersionStr,
      videoGaitDetails: {
        cadenceStepsPerMin: gaitAnalysis?.cadenceStepsPerMin,
        meanStepTimeSec: gaitAnalysis?.meanStepTimeSec,
        stepTimeStdSec: gaitAnalysis?.stepTimeStdSec,
        strideVariabilityCvPercent: gaitAnalysis?.strideVariabilityCvPercent,
        overallSymmetryIndex: gaitAnalysis?.overallSymmetryIndex,
        leftStepCount: gaitAnalysis?.leftStepCount,
        rightStepCount: gaitAnalysis?.rightStepCount,
        totalStepsDetected: gaitAnalysis?.totalStepsDetected,
        leftKneeRomDeg: gaitAnalysis?.leftKneeRomDeg,
        rightKneeRomDeg: gaitAnalysis?.rightKneeRomDeg,
        leftHipRomDeg: gaitAnalysis?.leftHipRomDeg,
        rightHipRomDeg: gaitAnalysis?.rightHipRomDeg,
        usableFrameRatio: videoMetadata?.usableFrameRatio,
        totalFrames: videoMetadata?.totalFrames,
        usableFrames: videoMetadata?.usableFrames,
        fps: videoMetadata?.fps,
        durationSec: videoMetadata?.durationSec,
        effectiveDurationSec: videoMetadata?.effectiveDurationSec,
        meanPoseTrackingConfidence: videoMetadata?.meanPoseTrackingConfidence,
        dimensions: videoMetadata?.dimensions,
        predictionAvailable: Boolean(mlPrediction?.available),
        predictionLabel: mlPrediction?.label,
        predictionScore: mlPrediction?.score,
        predictionStatus: mlPrediction?.status,
        limitations: limitations || [],
        disclaimer: disclaimer || ""
      }
    });

    await prediction.save();

    // Trigger notification for assessment completion
    await createNotification(
      req.user.id,
      "Video Gait Assessment Completed",
      `Walking video evaluated: Cadence ${gaitAnalysis?.cadenceStepsPerMin || "N/A"} steps/min, Symmetry ${gaitAnalysis?.overallSymmetryIndex || "N/A"}%.`,
      "assessment",
      `/result/${prediction._id}`
    );

    // Non-blocking email dispatch if user has email notifications configured
    if (typeof sendAssessmentCompletedEmail === "function") {
      sendAssessmentCompletedEmail(req.user, prediction._id).catch((err) =>
        console.error("Assessment email notice:", err)
      );
    }

    // Return structured JSON response adhering to Phase 7 contract
    res.status(201).json({
      success: true,
      _id: prediction._id,
      analysisType: "video_gait",
      riskLevel: prediction.riskLevel,
      confidence: prediction.confidence,
      createdAt: prediction.createdAt,
      videoMetadata,
      gaitAnalysis,
      prediction: mlPrediction,
      limitations,
      disclaimer,
      predictionRecord: prediction
    });
  } catch (error) {
    console.error("Video Gait prediction error:", error);
    res.status(500).json({ message: "Server error during video gait analysis", error: error.message });
  }
  }
;

// @desc    Get user predictions (paginated, filtered)
// @route   GET /api/predictions
// @access  Private
const getPredictions = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  const query = req.user.role === "admin" ? {} : { user: req.user.id };

  if (req.query.type && req.query.type !== "All") {
    query.predictionType = req.query.type;
  }

  if (req.query.riskLevel && req.query.riskLevel !== "All") {
    query.riskLevel = req.query.riskLevel;
  }

  if (req.query.startDate || req.query.endDate) {
    query.createdAt = {};
    if (req.query.startDate) {
      const start = new Date(req.query.startDate);
      if (!isNaN(start.getTime())) {
        query.createdAt.$gte = start;
      }
    }
    if (req.query.endDate) {
      const end = new Date(req.query.endDate);
      if (!isNaN(end.getTime())) {
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }
  }

  try {
    const count = await Prediction.countDocuments(query);
    const predictions = await Prediction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      predictions,
      page,
      pages: Math.ceil(count / limit) || 1,
      total: count
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get single prediction by ID
// @route   GET /api/predictions/:id
// @access  Private
const getPredictionById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid assessment ID format." });
    }

    const query = req.user.role === "admin" ? { _id: id } : { _id: id, user: req.user.id };
    const prediction = await Prediction.findOne(query);

    if (!prediction) {
      return res.status(404).json({ message: "Assessment record not found or access denied." });
    }

    res.json(prediction);
  } catch (error) {
    console.error("getPredictionById error:", error);
    res.status(500).json({ message: "Server error retrieving assessment record.", error: error.message });
  }
};

// @desc    Compare two prediction assessments
// @route   GET /api/predictions/compare
// @access  Private
const getPredictionComparison = async (req, res) => {
  try {
    const { id1, id2 } = req.query;

    if (!id1 || !id2) {
      return res.status(400).json({ message: "Two prediction IDs (id1 and id2) are required for comparison." });
    }

    const objectIdPattern = /^[0-9a-fA-F]{24}$/;
    if (!id1.match(objectIdPattern) || !id2.match(objectIdPattern)) {
      return res.status(400).json({ message: "Invalid assessment ID format." });
    }

    if (id1 === id2) {
      return res.status(400).json({ message: "Cannot compare an assessment with itself. Select two different assessments." });
    }

    const query1 = req.user.role === "admin" ? { _id: id1 } : { _id: id1, user: req.user.id };
    const query2 = req.user.role === "admin" ? { _id: id2 } : { _id: id2, user: req.user.id };

    const [pred1, pred2] = await Promise.all([
      Prediction.findOne(query1),
      Prediction.findOne(query2)
    ]);

    if (!pred1 || !pred2) {
      return res.status(404).json({ message: "One or both assessment records were not found or access was denied." });
    }

    // Determine earlier vs later deterministically by createdAt
    let earlier = pred1;
    let later = pred2;
    if (new Date(pred1.createdAt) > new Date(pred2.createdAt)) {
      earlier = pred2;
      later = pred1;
    }

    const earlierType = earlier.predictionType || "voice";
    const laterType = later.predictionType || "voice";
    const comparisonType = earlierType === laterType ? `${earlierType}_vs_${laterType}` : "mixed";

    const timeDiffMs = Math.abs(new Date(later.createdAt) - new Date(earlier.createdAt));
    const daysBetween = Math.round(timeDiffMs / (1000 * 60 * 60 * 24));

    const riskRank = { Low: 1, Medium: 2, High: 3 };
    const eScore = riskRank[earlier.riskLevel] || 1;
    const lScore = riskRank[later.riskLevel] || 1;
    let riskTrend = "stable";
    if (lScore < eScore) riskTrend = "improved";
    else if (lScore > eScore) riskTrend = "elevated";

    // Extract features maps into JS objects safely
    const feat1 = typeof earlier.features?.toJSON === "function" ? earlier.features.toJSON() : (earlier.features || {});
    const feat2 = typeof later.features?.toJSON === "function" ? later.features.toJSON() : (later.features || {});

    // Canonical list of features
    const allFeatureKeys = Array.from(new Set([...Object.keys(feat1), ...Object.keys(feat2)]));

    const comparisons = {};
    allFeatureKeys.forEach((key) => {
      const val1 = typeof feat1[key] === "number" && !isNaN(feat1[key]) && isFinite(feat1[key]) ? feat1[key] : null;
      const val2 = typeof feat2[key] === "number" && !isNaN(feat2[key]) && isFinite(feat2[key]) ? feat2[key] : null;

      let absDiff = null;
      let pctDiff = null;
      let status = "unchanged";

      if (val1 !== null && val2 !== null) {
        absDiff = val2 - val1;
        if (Math.abs(absDiff) > 1e-6) {
          status = absDiff > 0 ? "increased" : "decreased";
        }
        if (val1 !== 0 && isFinite(val1)) {
          pctDiff = (absDiff / Math.abs(val1)) * 100;
          if (isNaN(pctDiff) || !isFinite(pctDiff)) {
            pctDiff = null;
          }
        }
      }

      comparisons[key] = {
        earlierValue: val1 !== null ? Number(val1.toFixed(6)) : null,
        laterValue: val2 !== null ? Number(val2.toFixed(6)) : null,
        absoluteDiff: absDiff !== null ? Number(absDiff.toFixed(6)) : null,
        percentageDiff: pctDiff !== null ? Number(pctDiff.toFixed(2)) : null,
        status
      };
    });

    let mriComparison = null;
    if (earlierType === "mri" || laterType === "mri") {
      const mri1 = earlier.mriDetails || {};
      const mri2 = later.mriDetails || {};
      const probDiff = (mri2.pdProbability != null && mri1.pdProbability != null)
        ? Number(((mri2.pdProbability - mri1.pdProbability) * 100).toFixed(2))
        : null;

      mriComparison = {
        earlier: {
          predictedClass: mri1.predictedClass || (earlier.label === 1 ? "PD" : "Normal"),
          pdProbability: mri1.pdProbability != null ? Number((mri1.pdProbability * 100).toFixed(2)) : null,
          normalProbability: mri1.normalProbability != null ? Number((mri1.normalProbability * 100).toFixed(2)) : null,
          imageFilename: mri1.imageFilename || mri1.originalFilename || "Scan",
          imageDimensions: mri1.imageDimensions || "224x224"
        },
        later: {
          predictedClass: mri2.predictedClass || (later.label === 1 ? "PD" : "Normal"),
          pdProbability: mri2.pdProbability != null ? Number((mri2.pdProbability * 100).toFixed(2)) : null,
          normalProbability: mri2.normalProbability != null ? Number((mri2.normalProbability * 100).toFixed(2)) : null,
          imageFilename: mri2.imageFilename || mri2.originalFilename || "Scan",
          imageDimensions: mri2.imageDimensions || "224x224"
        },
        pdProbabilityDiff: probDiff,
        status: probDiff !== null ? (Math.abs(probDiff) < 0.1 ? "unchanged" : (probDiff > 0 ? "increased" : "decreased")) : "unknown"
      };
    }

    res.json({
      earlierAssessment: {
        _id: earlier._id,
        createdAt: earlier.createdAt,
        riskLevel: earlier.riskLevel,
        confidence: earlier.confidence,
        label: earlier.label,
        predictionType: earlierType,
        modelVersion: earlier.modelVersion,
        mriDetails: earlier.mriDetails || null
      },
      laterAssessment: {
        _id: later._id,
        createdAt: later.createdAt,
        riskLevel: later.riskLevel,
        confidence: later.confidence,
        label: later.label,
        predictionType: laterType,
        modelVersion: later.modelVersion,
        mriDetails: later.mriDetails || null
      },
      comparisonType,
      daysBetween,
      confidenceDiff: (typeof later.confidence === "number" && typeof earlier.confidence === "number")
        ? Number((later.confidence - earlier.confidence).toFixed(2))
        : null,
      riskTrend,
      comparisons,
      mriComparison
    });
  } catch (error) {
    console.error("Comparison error:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};



// @desc    Get prediction dashboard stats
// @route   GET /api/predictions/stats
// @access  Private
const getPredictionStats = async (req, res) => {
  try {
    const predictions = await Prediction.find({ user: req.user.id }).sort({ createdAt: 1 });

    const total = predictions.length;
    if (total === 0) {
      return res.json({
        totalPredictions: 0,
        positive: 0,
        negative: 0,
        latestPrediction: null,
        riskDistribution: { Low: 0, Medium: 0, High: 0 },
        monthlyCounts: [],
        timeline: []
      });
    }

    let positive = 0;
    let negative = 0;
    const riskDistribution = { Low: 0, Medium: 0, High: 0 };
    const monthlyData = {};

    predictions.forEach((p) => {
      if (p.label === 1) positive++;
      else negative++;

      riskDistribution[p.riskLevel] = (riskDistribution[p.riskLevel] || 0) + 1;

      // Group by month (YYYY-MM)
      const date = new Date(p.createdAt);
      const monthStr = date.toLocaleString("default", { month: "short", year: "numeric" });
      monthlyData[monthStr] = (monthlyData[monthStr] || 0) + 1;
    });

    const monthlyCounts = Object.keys(monthlyData).map((month) => ({
      month,
      count: monthlyData[month]
    }));

    const timeline = predictions.map((p) => ({
      date: new Date(p.createdAt).toLocaleDateString(),
      confidence: p.confidence,
      riskLevel: p.riskLevel
    }));

    res.json({
      totalPredictions: total,
      positive,
      negative,
      latestPrediction: predictions[total - 1],
      riskDistribution,
      monthlyCounts,
      timeline
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Download PDF Report
// @route   GET /api/predictions/:id/report
// @access  Private
const getPredictionReport = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid assessment ID format." });
    }

    const query = req.user.role === "admin" ? { _id: id } : { _id: id, user: req.user.id };
    const prediction = await Prediction.findOne(query).populate("user", "name email");

    if (!prediction) {
      return res.status(404).json({ message: "Prediction not found or access denied." });
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=parkinson-report-${prediction._id}.pdf`
    );

    // Call PDF Kit generator helper and stream response
    generateReportPDF(prediction, res);
  } catch (error) {
    console.error("PDF generation failed:", error);
    res.status(500).json({ message: "Server error generating PDF report", error: error.message });
  }
};

// @desc    Get all predictions (admin-only)
// @route   GET /api/predictions/admin/all-predictions
// @access  Private/Admin
const getAllPredictionsAdmin = async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const count = await Prediction.countDocuments({});
    const predictions = await Prediction.find({})
      .populate("user", "name email role")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      predictions,
      page,
      pages: Math.ceil(count / limit),
      total: count
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get all users (admin-only)
// @route   GET /api/predictions/admin/all-users
// @access  Private/Admin
const getAllUsersAdmin = async (req, res) => {
  const User = require("../models/User");
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;

  try {
    const count = await User.countDocuments({});
    const users = await User.find({})
      .select("-passwordHash")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      users,
      page,
      pages: Math.ceil(count / limit),
      total: count
    });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updatePredictionReview = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid assessment ID format." });
    }
    const { doctorNotes, recommendations } = req.body;
    const prediction = await Prediction.findById(id);

    if (!prediction) {
      return res.status(404).json({ message: "Prediction not found" });
    }

    prediction.doctorNotes = doctorNotes !== undefined ? doctorNotes : prediction.doctorNotes;
    prediction.recommendations = recommendations !== undefined ? recommendations : prediction.recommendations;

    await prediction.save();
    res.json(prediction);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateUserAdmin = async (req, res) => {
  const User = require("../models/User");
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }
    const { name, email, role, isActive } = req.body;
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.name = name !== undefined ? name : user.name;
    user.email = email !== undefined ? email : user.email;
    user.role = role !== undefined ? role : user.role;
    if (isActive !== undefined) {
      user.isActive = isActive;
    }

    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const deleteUserAdmin = async (req, res) => {
  const User = require("../models/User");
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid user ID format." });
    }
    const user = await User.findById(id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.deleteOne({ _id: id });
    res.json({ message: "User deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

// @desc    Get audio file for prediction (authenticated & authorized)
// @route   GET /api/predictions/:id/audio
// @access  Private
const getPredictionAudio = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid assessment ID format." });
    }

    const query = req.user.role === "admin" ? { _id: id } : { _id: id, user: req.user.id };
    const prediction = await Prediction.findOne(query);

    if (!prediction) {
      return res.status(404).json({ message: "Assessment record not found or access denied." });
    }

    if (!prediction.voicePath) {
      return res.status(404).json({ message: "Audio recording file reference not found." });
    }

    // Resolve base uploads directory and target requested file path
    const uploadsDir = path.resolve(__dirname, "../uploads");
    const requestedPath = path.resolve(__dirname, "..", prediction.voicePath);

    // Strict path traversal check: ensure requested file is inside uploadsDir boundary
    const uploadsDirWithSep = uploadsDir.endsWith(path.sep) ? uploadsDir : uploadsDir + path.sep;
    if (!requestedPath.startsWith(uploadsDirWithSep)) {
      console.error(`Security Warning: Directory traversal blocked for path: ${prediction.voicePath}`);
      return res.status(403).json({ message: "Access denied." });
    }

    if (!fs.existsSync(requestedPath)) {
      return res.status(404).json({ message: "Audio recording file does not exist on disk." });
    }

    const ext = path.extname(requestedPath).toLowerCase();
    let contentType = "audio/wav";
    if (ext === ".mp3") contentType = "audio/mpeg";
    else if (ext === ".webm") contentType = "audio/webm";
    else if (ext === ".ogg") contentType = "audio/ogg";

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", "inline");

    const stream = fs.createReadStream(requestedPath);
    stream.on("error", (streamErr) => {
      console.error("Audio ReadStream error:", streamErr);
      if (!res.headersSent) {
        res.status(500).json({ message: "Server error reading audio file." });
      }
    });
    stream.pipe(res);
  } catch (error) {
    console.error("getPredictionAudio error:", error);
    res.status(500).json({ message: "Server error retrieving audio file.", error: error.message });
  }
};

// In-memory rate limiting map for report email dispatch (max 1 request per 30s per prediction ID)
const emailReportRateLimitMap = new Map();

// @desc    Email PDF report link to authenticated user
// @route   POST /api/predictions/:id/email-report
// @access  Private
const emailPredictionReport = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Invalid assessment ID format." });
    }

    const query = req.user.role === "admin" ? { _id: id } : { _id: id, user: req.user.id };
    const prediction = await Prediction.findOne(query);

    if (!prediction) {
      return res.status(404).json({ message: "Assessment record not found or access denied." });
    }

    // Rate limiting check
    const now = Date.now();
    const lastSent = emailReportRateLimitMap.get(id);
    if (lastSent && now - lastSent < 30000) {
      const waitSec = Math.ceil((30000 - (now - lastSent)) / 1000);
      return res.status(429).json({ message: `Please wait ${waitSec} seconds before requesting another email for this report.` });
    }

    emailReportRateLimitMap.set(id, now);

    // Send report access email
    const result = await sendReportEmail(req.user, prediction._id);

    res.json({
      message: "Report access email request processed.",
      status: result.success ? "sent" : (result.skipped ? "skipped" : "failed"),
      messageId: result.messageId || null
    });
  } catch (error) {
    console.error("emailPredictionReport error:", error);
    res.status(500).json({ message: "Server error dispatching report email.", error: error.message });
  }
};

module.exports = {
  createPrediction,
  createMRIPrediction,
  createVideoGaitPrediction,
  getPredictions,
  getPredictionById,
  getPredictionComparison,
  getPredictionStats,
  getPredictionReport,
  getPredictionAudio,
  emailPredictionReport,
  getAllPredictionsAdmin,
  getAllUsersAdmin,
  updatePredictionReview,
  updateUserAdmin,
  deleteUserAdmin
};

