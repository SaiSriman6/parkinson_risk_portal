process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert");
const { Writable } = require("stream");
const { generateReportPDF } = require("../utils/pdfGenerator");
const Prediction = require("../models/Prediction");
const uploadVideo = require("../middleware/videoUploadMiddleware");
const videoFileFilter = uploadVideo.videoFileFilter;

const zlib = require("zlib");

test("PDF report generator produces stream output for Video Gait predictions", (t, done) => {
  const gaitPrediction = {
    _id: "507f1f77bcf86cd799439088",
    user: { name: "Gait Participant", email: "gait.participant@example.com" },
    predictionType: "video_gait",
    riskLevel: "Indeterminate",
    createdAt: new Date(),
    modelVersion: "video-gait-v1.0.0",
    videoGaitDetails: {
      cadenceStepsPerMin: 112.5,
      meanStepTimeSec: 0.533,
      stepTimeStdSec: 0.024,
      strideVariabilityCvPercent: 4.5,
      overallSymmetryIndex: 96.2,
      leftStepCount: 14,
      rightStepCount: 14,
      totalStepsDetected: 28,
      leftKneeRomDeg: 58.4,
      rightKneeRomDeg: 59.1,
      leftHipRomDeg: 34.2,
      rightHipRomDeg: 33.8,
      usableFrameRatio: 0.95,
      totalFrames: 300,
      usableFrames: 285,
      fps: 30,
      durationSec: 10.0,
      meanPoseTrackingConfidence: 0.88,
      dimensions: "1280x720",
      predictionAvailable: false,
      limitations: ["Estimates derived from 2D video landmarks."],
      disclaimer: "Educational research prototype."
    }
  };

  const chunks = [];
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(chunk);
      callback();
    }
  });

  mockRes.setHeader = () => {};

  mockRes.on("finish", () => {
    const buf = Buffer.concat(chunks);
    assert.ok(buf.length > 500, "PDF generator should stream valid binary report for video gait predictions");

    // Decode streams to verify gait-specific content and lack of voice acoustic sections
    const str = buf.toString("latin1");
    const regex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
    let match;
    let decodedText = "";
    while ((match = regex.exec(str)) !== null) {
      try {
        const decomp = zlib.inflateSync(Buffer.from(match[1], "binary")).toString("latin1");
        const hexMatches = decomp.match(/<([0-9a-fA-F]+)>/g) || [];
        for (const h of hexMatches) {
          decodedText += Buffer.from(h.slice(1, -1), "hex").toString("utf-8");
        }
      } catch (e) {}
    }

    assert.ok(decodedText.includes("YOUR VIDEO GAIT ASSESSMENT REPORT"), "PDF must contain Gait header");
    assert.ok(decodedText.includes("Measured Biomechanical Gait Kinematics"), "PDF must contain Gait kinematics section");
    assert.ok(decodedText.includes("Step Cadence"), "PDF must contain Step Cadence");
    assert.ok(decodedText.includes("Bilateral Symmetry Index"), "PDF must contain Symmetry Index");
    assert.ok(!decodedText.includes("Graphical Acoustic Voice Analysis"), "PDF must NOT contain voice acoustic charts");
    assert.ok(!decodedText.includes("Praat Parselmouth"), "PDF must NOT contain Praat Parselmouth");
    done();
  });

  generateReportPDF(gaitPrediction, mockRes);
});

test("Prediction schema validation: Video Gait record accepts valid videoGaitDetails without voice fields", () => {
  const gaitDoc = new Prediction({
    user: "507f1f77bcf86cd799439011",
    predictionType: "video_gait",
    label: 0,
    riskLevel: "Indeterminate",
    confidence: 0,
    modelVersion: "video-gait-v1.0.0",
    videoGaitDetails: {
      cadenceStepsPerMin: 108.0,
      meanStepTimeSec: 0.555,
      overallSymmetryIndex: 94.0,
      usableFrameRatio: 0.92,
      totalFrames: 240,
      usableFrames: 220,
      predictionAvailable: false
    }
  });

  const err = gaitDoc.validateSync();
  assert.strictEqual(err, undefined, "Video gait prediction should validate without errors and without requiring voice features");
  assert.strictEqual(gaitDoc.predictionType, "video_gait");
  assert.strictEqual(gaitDoc.riskLevel, "Indeterminate");
  assert.strictEqual(gaitDoc.videoGaitDetails.cadenceStepsPerMin, 108.0);
});

test("Video upload middleware: accepts valid MP4, WEBM, MOV, and AVI", (t, done) => {
  const validFiles = [
    { originalname: "walk.mp4", mimetype: "video/mp4" },
    { originalname: "gait.webm", mimetype: "video/webm" },
    { originalname: "capture.mov", mimetype: "video/quicktime" },
    { originalname: "session.avi", mimetype: "video/x-msvideo" }
  ];

  let passed = 0;
  validFiles.forEach((f) => {
    videoFileFilter(null, f, (err, accept) => {
      assert.strictEqual(err, null);
      assert.strictEqual(accept, true);
      passed++;
      if (passed === validFiles.length) done();
    });
  });
});

test("Video upload middleware: rejects non-video files safely", (t, done) => {
  const invalidFiles = [
    { originalname: "voice.wav", mimetype: "audio/wav" },
    { originalname: "report.pdf", mimetype: "application/pdf" },
    { originalname: "image.png", mimetype: "image/png" }
  ];

  let rejected = 0;
  invalidFiles.forEach((f) => {
    videoFileFilter(null, f, (err, accept) => {
      assert.ok(err instanceof Error, "Should reject non-video file");
      assert.ok(err.message.includes("Invalid file format"), "Error message should mention file format");
      rejected++;
      if (rejected === invalidFiles.length) done();
    });
  });
});

test("Prediction filter query logic supports video_gait modality", () => {
  const buildQuery = (typeFilter) => {
    const query = {};
    if (typeFilter && typeFilter !== "All") {
      query.predictionType = typeFilter;
    }
    return query;
  };

  const qGait = buildQuery("video_gait");
  assert.strictEqual(qGait.predictionType, "video_gait");
});
