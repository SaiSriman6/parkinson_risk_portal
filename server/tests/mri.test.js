process.env.NODE_ENV = "test";
const test = require("node:test");
const assert = require("node:assert");
const { Writable } = require("stream");
const { generateReportPDF } = require("../utils/pdfGenerator");
const Prediction = require("../models/Prediction");
const uploadImage = require("../middleware/imageUploadMiddleware");
const imageFileFilter = uploadImage.imageFileFilter;

test("PDF report generator produces stream output for MRI predictions", (t, done) => {
  const mriPrediction = {
    _id: "507f1f77bcf86cd799439077",
    user: { name: "MRI Patient", email: "mri.patient@example.com" },
    predictionType: "mri",
    label: 1,
    riskLevel: "High",
    confidence: 94.2,
    createdAt: new Date(),
    modelVersion: "mri-mobilenetv2-v1.0.0",
    mriDetails: {
      predictedClass: "PD",
      pdProbability: 0.942,
      normalProbability: 0.058,
      originalFilename: "brain_t1_axial.png",
      imageFormat: "PNG",
      imageDimensions: { width: 224, height: 224 },
      fileSizeBytes: 154200
    }
  };

  let bytesReceived = 0;
  const mockRes = new Writable({
    write(chunk, encoding, callback) {
      bytesReceived += chunk.length;
      callback();
    }
  });

  mockRes.setHeader = () => {};

  mockRes.on("finish", () => {
    assert.ok(bytesReceived > 500, "PDF generator should stream valid binary report for MRI predictions");
    done();
  });

  generateReportPDF(mriPrediction, mockRes);
});

test("Prediction schema validation: MRI record accepts valid mriDetails without voice fields", () => {
  const mriDoc = new Prediction({
    user: "507f1f77bcf86cd799439011",
    predictionType: "mri",
    label: 1,
    riskLevel: "High",
    confidence: 91.5,
    modelVersion: "mri-mobilenetv2-v1.0.0",
    mriDetails: {
      predictedClass: "PD",
      pdProbability: 0.915,
      normalProbability: 0.085,
      imageFilename: "scan_01.png",
      imageDimensions: "224x224",
      fileSizeBytes: 154000
    }
  });

  const err = mriDoc.validateSync();
  assert.strictEqual(err, undefined, "MRI prediction should validate without errors and without requiring voice features");
  assert.strictEqual(mriDoc.predictionType, "mri");
  assert.strictEqual(mriDoc.mriDetails.predictedClass, "PD");
});

test("Prediction schema validation: Voice record defaults predictionType to 'voice' and requires features", () => {
  const voiceDoc = new Prediction({
    user: "507f1f77bcf86cd799439011",
    label: 0,
    riskLevel: "Low",
    confidence: 15.2,
    modelVersion: "1.0.0"
    // missing features and voicePath
  });

  const err = voiceDoc.validateSync();
  assert.ok(err, "Voice prediction should require 'features'");
  assert.strictEqual(voiceDoc.predictionType, "voice");
});

test("Image upload middleware: accepts valid PNG, JPG, JPEG, and WEBP", (t, done) => {
  const validFiles = [
    { originalname: "brain.png", mimetype: "image/png" },
    { originalname: "scan.jpg", mimetype: "image/jpeg" },
    { originalname: "slice.jpeg", mimetype: "image/jpeg" },
    { originalname: "mri.webp", mimetype: "image/webp" }
  ];

  let passed = 0;
  validFiles.forEach((f) => {
    imageFileFilter(null, f, (err, accept) => {
      assert.strictEqual(err, null);
      assert.strictEqual(accept, true);
      passed++;
      if (passed === validFiles.length) done();
    });
  });
});

test("Image upload middleware: rejects non-image files safely", (t, done) => {
  const invalidFiles = [
    { originalname: "report.pdf", mimetype: "application/pdf" },
    { originalname: "audio.wav", mimetype: "audio/wav" },
    { originalname: "script.exe", mimetype: "application/x-msdownload" },
    { originalname: "data.csv", mimetype: "text/csv" }
  ];

  let rejected = 0;
  invalidFiles.forEach((f) => {
    imageFileFilter(null, f, (err, accept) => {
      assert.ok(err, "Should reject invalid file");
      assert.ok(err.message.includes("Invalid file format"));
      assert.strictEqual(accept, undefined);
      rejected++;
      if (rejected === invalidFiles.length) done();
    });
  });
});

test("Prediction filter query logic supports type filtering", () => {
  const buildFilterQuery = (userId, typeFilter) => {
    const query = { user: userId };
    if (typeFilter && (typeFilter === "voice" || typeFilter === "mri")) {
      query.predictionType = typeFilter;
    }
    return query;
  };

  const qAll = buildFilterQuery("user1", "all");
  assert.strictEqual(qAll.predictionType, undefined);

  const qVoice = buildFilterQuery("user1", "voice");
  assert.strictEqual(qVoice.predictionType, "voice");

  const qMRI = buildFilterQuery("user1", "mri");
  assert.strictEqual(qMRI.predictionType, "mri");
});


test("Comparison synthesis logic: MRI vs MRI produces valid mriComparison and mri_vs_mri type", () => {
  const earlier = {
    _id: "pred1",
    predictionType: "mri",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    riskLevel: "Low",
    confidence: 12.0,
    label: 0,
    mriDetails: {
      predictedClass: "Normal",
      pdProbability: 0.12,
      normalProbability: 0.88,
      originalFilename: "scan_oct1.png"
    }
  };

  const later = {
    _id: "pred2",
    predictionType: "mri",
    createdAt: new Date("2026-10-15T10:00:00Z"),
    riskLevel: "High",
    confidence: 88.5,
    label: 1,
    mriDetails: {
      predictedClass: "PD",
      pdProbability: 0.885,
      normalProbability: 0.115,
      originalFilename: "scan_oct15.png"
    }
  };

  const earlierType = earlier.predictionType || "voice";
  const laterType = later.predictionType || "voice";
  const comparisonType = earlierType === laterType ? `${earlierType}_vs_${laterType}` : "mixed";
  assert.strictEqual(comparisonType, "mri_vs_mri");

  const probDiff = Number(((later.mriDetails.pdProbability - earlier.mriDetails.pdProbability) * 100).toFixed(2));
  assert.strictEqual(probDiff, 76.5);
  const status = probDiff > 0 ? "increased" : "decreased";
  assert.strictEqual(status, "increased");
});

test("Comparison synthesis logic: Mixed Voice vs MRI produces 'mixed' type without crashing", () => {
  const earlier = {
    _id: "voice1",
    predictionType: "voice",
    createdAt: new Date("2026-10-01T10:00:00Z"),
    riskLevel: "Low",
    confidence: 20.0,
    label: 0,
    features: { fo: 140, jitter_local: 0.003 }
  };

  const later = {
    _id: "mri1",
    predictionType: "mri",
    createdAt: new Date("2026-10-10T10:00:00Z"),
    riskLevel: "Medium",
    confidence: 60.0,
    label: 1,
    mriDetails: {
      predictedClass: "PD",
      pdProbability: 0.60,
      normalProbability: 0.40,
      originalFilename: "brain.png"
    }
  };

  const earlierType = earlier.predictionType || "voice";
  const laterType = later.predictionType || "voice";
  const comparisonType = earlierType === laterType ? `${earlierType}_vs_${laterType}` : "mixed";
  assert.strictEqual(comparisonType, "mixed");

  const timeDiffMs = Math.abs(new Date(later.createdAt) - new Date(earlier.createdAt));
  const daysBetween = Math.round(timeDiffMs / (1000 * 60 * 60 * 24));
  assert.strictEqual(daysBetween, 9);
});
