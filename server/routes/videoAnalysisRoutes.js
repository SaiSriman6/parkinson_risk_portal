const express = require("express");
const router = express.Router();
const { createVideoGaitPrediction } = require("../controllers/predictionController");
const { protect } = require("../middleware/authMiddleware");
const uploadVideo = require("../middleware/videoUploadMiddleware");

// @route   POST /api/video-analysis/predict
// @desc    Accept walking video upload (multipart/form-data), process gait kinematics, and produce assessment
// @access  Private (JWT protected)
router.post("/predict", protect, uploadVideo.single("file"), createVideoGaitPrediction);

module.exports = router;
