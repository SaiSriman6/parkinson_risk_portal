const mongoose = require("mongoose");

const PredictionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    predictionType: {
      type: String,
      enum: ["voice", "mri", "video_gait", "video"],
      default: "voice"
    },
    label: {
      type: Number,
      required: function() {
        return this.predictionType === "voice" || this.predictionType === "mri";
      },
      default: function() {
        return (this.predictionType === "voice" || this.predictionType === "mri") ? 0 : null;
      }
    },
    confidence: {
      type: Number,
      required: function() {
        return this.predictionType === "voice" || this.predictionType === "mri";
      },
      default: function() {
        return (this.predictionType === "voice" || this.predictionType === "mri") ? 0 : null;
      }
    },
    riskLevel: {
      type: String,
      required: true,
      enum: ["Low", "Medium", "High", "Indeterminate"],
      default: "Low"
    },
    features: {
      type: Map,
      of: Number,
      required: function() {
        return this.predictionType === "voice";
      }
    },
    voicePath: {
      type: String,
      required: function() {
        return this.predictionType === "voice";
      }
    },
    mriDetails: {
      predictedClass: { type: String },
      pdProbability: { type: Number },
      normalProbability: { type: Number },
      imageFilename: { type: String },
      imageDimensions: { type: String },
      fileSizeBytes: { type: Number },
      disclaimer: { type: String }
    },
    videoGaitDetails: {
      cadenceStepsPerMin: { type: Number },
      meanStepTimeSec: { type: Number },
      stepTimeStdSec: { type: Number },
      strideVariabilityCvPercent: { type: Number },
      overallSymmetryIndex: { type: Number },
      leftStepCount: { type: Number },
      rightStepCount: { type: Number },
      totalStepsDetected: { type: Number },
      leftKneeRomDeg: { type: Number },
      rightKneeRomDeg: { type: Number },
      leftHipRomDeg: { type: Number },
      rightHipRomDeg: { type: Number },
      usableFrameRatio: { type: Number },
      totalFrames: { type: Number },
      usableFrames: { type: Number },
      fps: { type: Number },
      durationSec: { type: Number },
      effectiveDurationSec: { type: Number },
      meanPoseTrackingConfidence: { type: Number },
      dimensions: { type: String },
      predictionAvailable: { type: Boolean, default: false },
      predictionLabel: { type: Number },
      predictionScore: { type: Number },
      predictionStatus: { type: String },
      limitations: [{ type: String }],
      disclaimer: { type: String }
    },
    modelVersion: {
      type: String,
      default: "1.0.0"
    },
    doctorNotes: {
      type: String,
      default: ""
    },
    recommendations: {
      type: String,
      default: ""
    },
    globalFeatureImportances: {
      type: Map,
      of: Number,
      default: {}
    },
    featureDeviations: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Prediction", PredictionSchema);
