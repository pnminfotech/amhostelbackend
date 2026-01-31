// payment-Backend/routes/uploadRoutes.js
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const ImageKit = require("imagekit");

const router = express.Router();

// ✅ Multer memory (not disk)
const upload = multer({ storage: multer.memoryStorage() });

// ✅ ImageKit init
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || "",
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || "",
});

// compress images under 10KB (same idea as your other route)
const TARGET = 10 * 1024;

async function compressUnder10KB(buf) {
  let q = 80,
    w = null;

  let out = await sharp(buf).webp({ quality: q }).toBuffer();

  while (out.length > TARGET && (q > 30 || w === null || w > 200)) {
    if (q > 30) q -= 10;
    else {
      const meta = await sharp(buf).metadata();
      w = w || meta.width || 800;
      w = Math.max(200, Math.floor(w * 0.8));
    }

    const p = sharp(buf);
    if (w) p.resize({ width: w, withoutEnlargement: true });
    out = await p.webp({ quality: q }).toBuffer();
  }

  if (out.length > TARGET) {
    out = await sharp(buf)
      .resize({ width: 200, withoutEnlargement: true })
      .webp({ quality: 25 })
      .toBuffer();
  }

  return out;
}

// POST /api/uploads/docs  ✅ ImageKit-only
router.post("/docs", upload.array("documents", 10), async (req, res) => {
  try {
    const canUseImagekit =
      !!process.env.IMAGEKIT_PUBLIC_KEY &&
      !!process.env.IMAGEKIT_PRIVATE_KEY &&
      !!process.env.IMAGEKIT_URL_ENDPOINT;

    if (!canUseImagekit) {
      return res.status(500).json({
        ok: false,
        message: "ImageKit not configured. Cannot upload documents.",
      });
    }

    const files = req.files || [];
    const out = [];

    for (const f of files) {
      const safeBaseName = (f.originalname || "doc").replace(/[^\w.\-]/g, "_");

      let uploadBuffer = f.buffer;
      let contentType = f.mimetype;
      let uploadName = `${Date.now()}_${safeBaseName}`;

      // ✅ images -> compress + convert to webp
      if (/^image\//i.test(f.mimetype)) {
        uploadBuffer = await compressUnder10KB(f.buffer);
        contentType = "image/webp";
        uploadName = `${Date.now()}_${safeBaseName}.webp`;
      }

      const ik = await imagekit.upload({
        file: uploadBuffer,
        fileName: uploadName,
        folder: "/mutakegirlshostel/docs",
        useUniqueFileName: true,
      });

      out.push({
        // ✅ ImageKit CDN URL (works on localhost + live)
        url: ik.url,
        fileId: ik.fileId,
        filePath: ik.filePath,

        // meta
        filename: f.originalname,
        storedName: ik.name, // ImageKit stored name
        mimetype: contentType,
        size: uploadBuffer.length,
      });
    }

    return res.json({ ok: true, files: out });
  } catch (e) {
    console.error("upload docs error:", e);
    return res.status(400).json({ ok: false, message: e.message || "Upload failed" });
  }
});

module.exports = router;
