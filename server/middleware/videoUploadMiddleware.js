const multer = require("multer");
const path = require("path");

// Use memory storage for medical gait videos to prevent unencrypted PII videos on disk
const storage = multer.memoryStorage();

// Validate video mime types and file extensions
const videoFileFilter = (req, file, cb) => {
  const allowedExtensions = /mp4|webm|mov|avi/;
  const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
  const mimeTypeMatch = /^video\/(mp4|webm|quicktime|x-msvideo|avi|x-matroska)$/.test(file.mimetype);

  if (allowedExtensions.test(ext) || mimeTypeMatch) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file format. Only MP4, WEBM, MOV, and AVI walking video files are allowed."));
  }
};

const maxVideoSizeMb = parseInt(process.env.MAX_VIDEO_SIZE_MB, 10) || 50;

const uploadVideo = multer({
  storage: storage,
  limits: {
    fileSize: maxVideoSizeMb * 1024 * 1024 // default 50 MB
  },
  fileFilter: videoFileFilter
});

uploadVideo.videoFileFilter = videoFileFilter;

module.exports = uploadVideo;
