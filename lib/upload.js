const path = require('path');
const multer = require('multer');
const fs = require('fs');

function ensure(dir) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }

const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

function isAllowedImageFile(file) {
  if (!file) return false;

  const mime = String(file.mimetype || '').toLowerCase();
  const ext = path.extname(String(file.originalname || '')).toLowerCase();

  return ALLOWED_IMAGE_MIME_TYPES.has(mime) && ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

function imageOnlyFileFilter(req, file, cb) {
  if (isAllowedImageFile(file)) {
    cb(null, true);
    return;
  }

  req.fileValidationError = 'Only JPG, JPEG, and PNG files are allowed.';
  cb(null, false);
}

// docs
const docsDir = path.join(__dirname, '..', 'uploads', 'docs');
ensure(docsDir);
const docsStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, docsDir),
  filename   : (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/\s+/g,'_');
    cb(null, `${ts}_${safe}`);
  }
});
const docsUpload = multer({ storage: docsStorage, fileFilter: imageOnlyFileFilter });

// avatars
const avatarDir = path.join(__dirname, '..', 'uploads', 'avatars');
ensure(avatarDir);
const avatarStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, avatarDir),
  filename   : (_req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `${ts}${ext}`);
  }
});
const avatarUpload = multer({ storage: avatarStorage, fileFilter: imageOnlyFileFilter });

// eKYC
const ekycDir = path.join(__dirname, '..', 'uploads', 'ekyc');
ensure(ekycDir);
const ekycStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, ekycDir),
  filename   : (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/\s+/g,'_');
    cb(null, `${ts}_${safe}`);
  }
});
const ekycUpload = multer({ storage: ekycStorage, fileFilter: imageOnlyFileFilter });

module.exports = { docsUpload, avatarUpload, ekycUpload };
