const multer = require("multer");
const path = require("path");

// Use memory storage for medical images to avoid persisting PII image data on disk
const storage = multer.memoryStorage();

// Validate image mime types and extensions
const imageFileFilter = (req, file, cb) => {
  const allowedExtensions = /png|jpg|jpeg|webp|bmp/;
  const ext = path.extname(file.originalname).toLowerCase().replace(".", "");
  const mimeTypeMatch = /^image\/(png|jpeg|jpg|webp|bmp)$/.test(file.mimetype);

  if (allowedExtensions.test(ext) || mimeTypeMatch) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file format. Only PNG, JPG, JPEG, and WEBP image files are allowed."));
  }
};

const uploadImage = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10 MB maximum
  },
  fileFilter: imageFileFilter
});

uploadImage.imageFileFilter = imageFileFilter;

module.exports = uploadImage;
