// routes/tenantDocs.js
const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const ImageKit = require("imagekit");

const Form = require("../models/Form"); // ✅ confirm correct model path
const Invite = require("../models/Invite");

const router = express.Router();

/* ================== ImageKit ================== */
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY || "",
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY || "",
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || "",
});

const canUseImagekit =
  !!process.env.IMAGEKIT_PUBLIC_KEY &&
  !!process.env.IMAGEKIT_PRIVATE_KEY &&
  !!process.env.IMAGEKIT_URL_ENDPOINT;

/* ================== Multer (memory) ================== */
const upload = multer({ storage: multer.memoryStorage() });

/* ================== Helpers ================== */
const TARGET = 10 * 1024; // 10 KB (your choice)

async function compressUnder10KB(buf) {
  let q = 80, w = null;
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

function cleanMoney(v) {
  const n = Number(String(v ?? "").replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

function cleanPhone(v) {
  const s = String(v ?? "").replace(/\D/g, "").slice(0, 10);
  return s || undefined;
}

// ✅ ignore empty fields + disallow rents edits here
function buildPatch(body) {
  const patch = {};

  for (const [k, v] of Object.entries(body || {})) {
    if (["formId", "inv", "srNo"].includes(k)) continue;
    if (v === undefined || v === null) continue;
    if (v === "" || v === "undefined") continue;
    patch[k] = v;
  }

  delete patch.rents;
  delete patch.rentPaid;
  delete patch.month;
  delete patch.date;

  // money
  ["baseRent", "rentAmount", "depositAmount"].forEach((f) => {
    if (patch[f] !== undefined) {
      const n = cleanMoney(patch[f]);
      if (n === undefined) delete patch[f];
      else patch[f] = n;
    }
  });

  // phone
  ["phoneNo", "relative1Phone", "relative2Phone"].forEach((f) => {
    if (patch[f] !== undefined) {
      const p = cleanPhone(patch[f]);
      if (!p) delete patch[f];
      else patch[f] = p;
    }
  });

  return patch;
}

/* ================== Route ================== */
router.post(
  "/with-docs",
  upload.fields([
    { name: "selfAadhar", maxCount: 1 },
    { name: "parentAadhar", maxCount: 1 },
    { name: "photo", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log("REQ BODY:", req.body);

      let { formId, inv } = req.body;

      // ✅ If formId missing but invite token present → fetch usedByFormId
      let inviteDoc = null;
      if ((!formId || formId === "undefined") && inv) {
        const now = new Date();
        inviteDoc = await Invite.findOne({
          token: inv,
          expiresAt: { $gt: now },
        });

        if (!inviteDoc?.usedByFormId) {
          return res.status(400).json({ message: "Invalid/expired invite link" });
        }

        formId = String(inviteDoc.usedByFormId);
      }

      const updateData = buildPatch(req.body);

      // ✅ If invite exists → lock prefilled fields
      if (inv) {
        if (!inviteDoc) {
          const now = new Date();
          inviteDoc = await Invite.findOne({ token: inv, expiresAt: { $gt: now } });
        }
        const lockedKeys = Object.keys(inviteDoc?.prefill || {});
        lockedKeys.forEach((k) => delete updateData[k]);
      }

      if (inv && (!formId || formId === "undefined")) {
        return res.status(400).json({ message: "Invalid/expired invite link" });
      }

      // ✅ Upload files to ImageKit and push into documents[]
      const docsToAdd = [];

      async function uploadOne(file, relationLabel) {
        if (!file) return;

        if (!canUseImagekit) {
          docsToAdd.push({
            fileName: file.originalname,
            relation: relationLabel,
            url: null,
            fileId: null,
            filePath: null,
            contentType: file.mimetype,
            size: file.size,
            note: "ImageKit not configured",
          });
          return;
        }

        const safeBase = (file.originalname || "doc").replace(/[^\w.\-]/g, "_");

        // if image -> compress to webp
        let uploadBuffer = file.buffer;
        let contentType = file.mimetype;
        let uploadName = `${Date.now()}_${safeBase}`;

        if (/^image\//i.test(file.mimetype)) {
          uploadBuffer = await compressUnder10KB(file.buffer);
          contentType = "image/webp";
          uploadName = `${Date.now()}_${safeBase}.webp`;
        }

        const up = await imagekit.upload({
          file: uploadBuffer,
          fileName: uploadName,
          folder: "/mutakegirlshostel/tenant_docs",
          useUniqueFileName: true,
        });

        // ✅ EXACTLY HERE your doc.url becomes:
        // "https://ik.imagekit.io/<id>/mutakegirlshostel/tenant_docs/....webp"
        docsToAdd.push({
          fileName: file.originalname,
          relation: relationLabel,
          url: up.url,           // ✅ ImageKit direct URL
          fileId: up.fileId,     // ✅ ImageKit fileId (string)
          filePath: up.filePath, // ✅ ImageKit filePath (string)
          contentType,
          size: uploadBuffer.length,
        });
      }

      await uploadOne(req.files?.selfAadhar?.[0], "Self Aadhaar Card");
      await uploadOne(req.files?.parentAadhar?.[0], "Parent Aadhaar Card");
      await uploadOne(req.files?.photo?.[0], "Tenant Photo");

      let savedForm;

      // ✅ UPDATE
      if (formId && formId !== "undefined") {
        savedForm = await Form.findByIdAndUpdate(
          formId,
          {
            $set: updateData,
            ...(docsToAdd.length ? { $push: { documents: { $each: docsToAdd } } } : {}),
          },
          { new: true, runValidators: true }
        );

        if (!savedForm) return res.status(404).json({ message: "Form not found" });

        if (inv) {
          await Invite.updateOne(
            { token: inv, usedAt: null },
            { $set: { usedAt: new Date(), usedByFormId: savedForm._id } }
          );
        }

        return res.status(200).json({
          message: "Tenant details updated successfully",
          formId: savedForm._id,
          data: savedForm,
          imagekit: canUseImagekit,
        });
      }

      // ✅ CREATE (admin direct)
      const lastForm = await Form.findOne().sort({ srNo: -1 });
      const srNo = lastForm ? lastForm.srNo + 1 : 1;

      savedForm = await Form.create({
        ...updateData,
        srNo,
        documents: docsToAdd,
      });

      return res.status(201).json({
        message: "Form saved successfully",
        formId: savedForm._id,
        data: savedForm,
        imagekit: canUseImagekit,
      });
    } catch (error) {
      console.error("Error in /with-docs:", error);
      res.status(500).json({ message: error.message });
    }
  }
);

module.exports = router;
