const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const path = require("path");

const router = express.Router();

const Form = require("../models/formModels");
const Counter = require("../models/counterModel");
const { normalizeFirstRentCycle } = require("./_helpers/firstRentCycle");
const {
  appendRentHistorySnapshot,
  getCurrentMonthlyRent,
} = require("./_helpers/rentHistory");
const { sendAdmissionMessage } = require("../lib/msg91Admission");

const ImageKit = require("imagekit");

function hasImageKitConfig() {
  return (
    !!process.env.IMAGEKIT_PUBLIC_KEY &&
    !!process.env.IMAGEKIT_PRIVATE_KEY &&
    !!process.env.IMAGEKIT_URL_ENDPOINT
  );
}

function getImageKit() {
  if (!hasImageKitConfig()) return null;

  return new ImageKit({
    publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
    privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
  });
}

const upload = multer({ storage: multer.memoryStorage() });
const TARGET = 300 * 1024; // 300 KB target for faster uploads
const MIN_WIDTH = 1200; // keep text readable for IDs
const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png"]);

function isAllowedImageFile(file) {
  if (!file) return false;

  const mime = String(file.mimetype || "").toLowerCase();
  const ext = path.extname(String(file.originalname || "")).toLowerCase();

  return ALLOWED_IMAGE_MIME_TYPES.has(mime) && ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

// ✅ helper: compress image under TARGET (best effort)
async function compressUnderTarget(buf, mime) {
  let q = 80,
    w = null;

  const meta = await sharp(buf).metadata();
  const origW = meta.width || null;
  const shouldKeepMinWidth = origW && origW >= MIN_WIDTH;

  let out = await sharp(buf).webp({ quality: q }).toBuffer();

  while (out.length > TARGET && (q > 30 || w === null || w > MIN_WIDTH)) {
    if (q > 30) q -= 10;
    else {
      w = w || origW || 1600;
      w = Math.floor(w * 0.9);
      if (shouldKeepMinWidth) w = Math.max(MIN_WIDTH, w);
    }

    const p = sharp(buf);
    if (w) p.resize({ width: w, withoutEnlargement: true });
    out = await p.webp({ quality: q }).toBuffer();
  }

  if (out.length > TARGET) {
    // final attempt: reduce quality but keep width if possible
    const p = sharp(buf);
    if (w) p.resize({ width: w, withoutEnlargement: true });
    out = await p.webp({ quality: 35 }).toBuffer();
  }

  return out;
}

/* =========================
   ✅ RENT REQUIRED FIELDS HELPERS
========================= */
const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

function fmtMonthKey(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  return `${MONTHS[dt.getMonth()]}-${String(dt.getFullYear()).slice(-2)}`; // "Jan-26"
}

function parseLeaveDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isActiveBedTenant(tenant, category) {
  const tenantCategory = String(tenant?.category || "").trim();
  if (tenantCategory && category && tenantCategory !== category) return false;

  const leaveDate = parseLeaveDate(tenant?.leaveDate);
  if (!leaveDate) return true;

  leaveDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return leaveDate > today;
}

router.post("/forms-with-docs", upload.array("documents", 10), async (req, res) => {
  try {
    const body = req.body || {};
    const formId = body.formId ? String(body.formId).trim() : null;
    console.log("[forms-with-docs] firstRentStatus:", body.firstRentStatus, "firstRentMonth:", body.firstRentMonth);

    const toDate = (v) => (v ? new Date(v) : undefined);
    const toNum = (v) => (v !== undefined && v !== "" ? Number(v) : undefined);

    const joiningDate = toDate(body.joiningDate);
    const rentAmount = toNum(body.baseRent ?? body.rentAmount);

    if (!rentAmount) {
      return res.status(400).json({ ok: false, message: "rentAmount is required" });
    }

    // ✅ required fields in rents schema
    const paymentMode = String(body.paymentMode || "Cash").trim() || "Cash";
    const rentMonth =
      String(body.month || "").trim() || fmtMonthKey(joiningDate || new Date());
const firstRentStatus = String(body.firstRentStatus || "NOT_PAID").trim();
const firstRentMonth = String(body.firstRentMonth || rentMonth).trim();

    // ✅ ImageKit STRICT (ImageKit-only)
    const canUseImagekit = hasImageKitConfig();

    if (!canUseImagekit) {
      return res.status(500).json({
        ok: false,
        message: "ImageKit not configured. Cannot upload documents.",
      });
    }

    const imagekit = getImageKit();

    const formPayload = {
      name: body.name,
      joiningDate,
      roomId: body.roomId ? String(body.roomId).trim() : undefined,
      roomNo: body.roomNo,
      wingName: body.wingName ? String(body.wingName).trim() : undefined,
      depositAmount: toNum(body.depositAmount),
      address: body.address,
      pincode: body.pincode,
      city: body.city,
      state: body.state,
      houseNo: body.houseNo,
      nearbyPlace: body.nearbyPlace,
      phoneNo: body.phoneNo ? String(body.phoneNo).trim() : "", // ✅ string
      floorNo: body.floorNo,
      bedNo: body.bedNo,
      shopName: String(body.shopName || "").trim(),
      shopBusiness: String(body.shopBusiness || "").trim(),
      companyAddress: String(body.companyAddress || "").trim(),
      familyMembers:
        body.familyMembers === "" || body.familyMembers == null
          ? undefined
          : toNum(body.familyMembers),
      dateOfJoiningCollege: toDate(body.dateOfJoiningCollege),
      dob: toDate(body.dob),
      baseRent: toNum(body.baseRent ?? body.rentAmount),
      firstRentStatus: body.firstRentStatus,
firstRentMonth: body.firstRentMonth,

      leaveDate: body.leaveDate || undefined,
      category: body.category || undefined,
      canteen: String(body.canteen || "no").trim().toLowerCase() === "yes" ? "yes" : "no",

      // ✅ relatives (if you are sending these)
      relative1Relation: body.relative1Relation,
      relative1Name: body.relative1Name,
      relative1Phone: body.relative1Phone,
      relative2Relation: body.relative2Relation,
      relative2Name: body.relative2Name,
      relative2Phone: body.relative2Phone,
    };
    const currentRentAmount = getCurrentMonthlyRent(formPayload);

    const selectedRoomId = String(formPayload.roomId || "").trim();
    const selectedRoomNo = String(formPayload.roomNo || "").trim();
    const selectedBedNo = String(formPayload.bedNo || "").trim();
    if ((selectedRoomId || selectedRoomNo) && selectedBedNo) {
      const roomFilter = selectedRoomId ? { roomId: selectedRoomId } : { roomNo: selectedRoomNo };
      const bedCandidates = await Form.find({
        ...roomFilter,
        bedNo: selectedBedNo,
        ...(formId ? { _id: { $ne: formId } } : {}),
      })
        .select("_id name category leaveDate")
        .lean();
      const occupied = bedCandidates.find((tenant) =>
        isActiveBedTenant(tenant, String(formPayload.category || "").trim())
      );

      if (occupied) {
        return res.status(409).json({
          ok: false,
          message: `Bed already occupied: Room "${selectedRoomNo || selectedRoomId}", Bed "${selectedBedNo}".`,
        });
      }
    }

    const files = req.files || [];
    const relations = Array.isArray(body.relations)
      ? body.relations
      : body.relations
      ? [body.relations]
      : [];

    const invalidFiles = files.filter((file) => !isAllowedImageFile(file));
    if (invalidFiles.length) {
      return res.status(400).json({
        ok: false,
        message: "Only JPG, JPEG, and PNG files are allowed.",
        invalidFiles: invalidFiles.map((file) => file.originalname || "unknown"),
      });
    }

    const docs = await Promise.all(files.map(async (f, i) => {
      const relation = (relations[i] || "Document").toString().trim() || "Document";
      const safeBaseName = (f.originalname || "doc").replace(/[^\w.\-]/g, "_");

      let uploadBuffer = f.buffer;
      let contentType = f.mimetype;
      let uploadName = `${Date.now()}_${safeBaseName}`;

      // ✅ If image => compress to webp (skip if already small)
      if (/^image\//i.test(f.mimetype)) {
        const alreadySmall = f.buffer?.length && f.buffer.length <= TARGET;
        const alreadyWebp = /image\/webp/i.test(f.mimetype);
        if (!alreadySmall || !alreadyWebp) {
          uploadBuffer = await compressUnderTarget(f.buffer, f.mimetype);
          contentType = "image/webp";
          uploadName = `${Date.now()}_${safeBaseName}.webp`;
        }
      }

      const uploadRes = await imagekit.upload({
        file: uploadBuffer,
        fileName: uploadName,
        folder: "/amhostel/docs",
        useUniqueFileName: true,
      });

      return {
        fileName: f.originalname,
        relation,
        fileId: uploadRes.fileId,     // string
        filePath: uploadRes.filePath, // optional
        contentType,
        size: uploadBuffer.length,
        url: uploadRes.url,           // ✅ always present
      };
    }));

    // ✅ Update existing draft
    if (formId) {
      const existing = await Form.findById(formId);
      if (!existing) {
        return res.status(404).json({ ok: false, message: "Draft form not found" });
      }

      const existingSnapshot = existing.toObject();
      Object.assign(existing, formPayload);
      Object.assign(existing, normalizeFirstRentCycle(existingSnapshot, formPayload));
      Object.assign(existing, appendRentHistorySnapshot(existingSnapshot, formPayload));

      // ✅ patch rents for old data safety
      existing.rents = (Array.isArray(existing.rents) ? existing.rents : []).map((r) => ({
        ...r,
        month: r.month || rentMonth,
        paymentMode: r.paymentMode || paymentMode,
      }));

      if (existing.firstRentStatus === "ADVANCE_PAID" && existing.rents.length === 0) {
      existing.rents = [
          {
            rentAmount: currentRentAmount,
            date: joiningDate || new Date(),
            month: existing.firstRentMonth || firstRentMonth,
            paymentMode,
          },
        ];
      }

      if (docs.length) {
        // Replace docs by relation on edit to avoid duplicates/wrong labels
        const incomingRelations = new Set(
          docs.map((d) => String(d?.relation || "Document").trim())
        );
        const filteredExisting = (existing.documents || []).filter((d) => {
          const rel = String(d?.relation || "Document").trim();
          return !incomingRelations.has(rel);
        });
        existing.documents = [...filteredExisting, ...docs];
      }

      await existing.save();

      return res.json({ ok: true, form: existing, mode: "updated", imagekit: true });
    }

    // ✅ Create new tenant
    const counter = await Counter.findOneAndUpdate(
      { name: "form_srno" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true }
    );

    const srNo = counter.seq;

    const rents =
  firstRentStatus === "ADVANCE_PAID"
    ? [{ rentAmount: currentRentAmount, date: joiningDate || new Date(), month: firstRentMonth, paymentMode }]
    : [];

const created = await Form.create({
  srNo,
  ...formPayload,
  firstRentStatus,
  firstRentMonth,
  rentHistory: currentRentAmount
    ? [
        {
          effectiveFrom: joiningDate || new Date(),
          roomNo: formPayload.roomNo,
          bedNo: formPayload.bedNo,
          baseRent: currentRentAmount,
          rentAmount: currentRentAmount,
          source: "initial",
        },
      ]
    : [],
  rents,
  documents: docs,
});

    let messageStatus = { ok: false, skipped: true, reason: "Not attempted" };
    try {
      messageStatus = await sendAdmissionMessage(created);
    } catch (error) {
      console.error("MSG91 admission message failed:", error?.data || error?.message || error);
      messageStatus = {
        ok: false,
        skipped: false,
        reason: error?.message || "MSG91 send failed",
        data: error?.data || null,
        status: error?.status || null,
      };
    }

    return res.status(201).json({
      ok: true,
      form: created,
      mode: "created",
      imagekit: true,
      messageStatus,
    });
  } catch (e) {
    console.error("forms-with-docs error:", e);
    return res.status(400).json({ ok: false, message: e.message || "Failed" });
  }
});

module.exports = router;
