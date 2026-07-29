

// routes/policeVerification.js
const express = require("express");
const PoliceVerificationGuide = require("../models/PoliceVerificationGuide");
const PoliceVerification = require("../models/PoliceVerification");

// IMPORTANT: import single-function middlewares without {}
const auth = require("../middleware/tenantAuth");     // your tenant JWT auth (sets req.tenant)
const isAdmin = require("../middleware/adminAuth");   // must export a function

const router = express.Router();

/* ---------------- GUIDE (display config) ---------------- */

// Fetch guide (tenant-friendly; no auth needed)
router.get("/guide", async (_req, res) => {
  try {
    const g = await PoliceVerificationGuide.findOne();
    return res.json(g || null);
  } catch (e) {
    console.error("GET /guide error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Upsert guide (admin)
router.put("/guide", auth, isAdmin, async (req, res) => {
  try {
    const exists = await PoliceVerificationGuide.findOne();
    if (exists) {
      // If your admin middleware sets req.admin, you can record it; otherwise omit updatedBy
      exists.set({ ...req.body /*, updatedBy: req.admin?._id */ });
      await exists.save();
      return res.json(exists);
    }
    const created = await PoliceVerificationGuide.create({ ...req.body /*, updatedBy: req.admin?._id */ });
    return res.json(created);
  } catch (e) {
    console.error("PUT /guide error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Seed default guide once (admin, optional)
router.post("/guide/seed", auth, isAdmin, async (_req, res) => {
  try {
    const exists = await PoliceVerificationGuide.findOne();
    if (exists) return res.status(400).json({ error: "Guide already exists" });

    const seed = await PoliceVerificationGuide.create({
      portalUrl: "https://police.example.gov.in/tenant-verification",
      header: "Police Verification (Online)",
      intro: "Open the official portal, finish the form there, then save your acknowledgement below.",
      steps: [
        { title: "Open official portal", detail: "Use Aadhaar-linked mobile number to sign in." },
        { title: "Fill tenant details", detail: "Match exactly as on ID (name, DOB, address)." },
        { title: "Submit on portal", detail: "Note the acknowledgement number and date." }
      ],
      documents: [
        { key: "age_proof", label: "Age Proof (any one)", required: true, options: [
          { key: "age_school_leaving", label: "School leaving certificate" },
          { key: "age_ssc_board", label: "SSC board certificate" },
          { key: "age_birth_certificate", label: "Birth certificate (municipal/local body)" }
        ]},
        { key: "id_proof", label: "Identity Proof (any one)", required: true, options: [
          { key: "id_pan", label: "PAN Card" },
          { key: "id_voter", label: "Election Card (Voter ID)" },
          { key: "id_dl", label: "Driving Licence" },
          { key: "id_student", label: "Student Card" }
        ]},
        { key: "addr_proof", label: "Address Proof (any one)", required: true, options: [
          { key: "addr_passport", label: "Passport" },
          { key: "addr_ration", label: "Ration Card (name & address)" },
          { key: "addr_bill", label: "Current Electric/Telephone bill (with name & address)" },
          { key: "addr_leave_license", label: "Registered Leave & License" },
          { key: "addr_aadhaar", label: "Aadhaar Card (UID)" }
        ]},
        { key: "compulsory_letter", label: "Compulsory: Company Letter / Application to Commissioner/SP for NOC", required: true }
      ],
      helpText: "Accepted formats and rules may vary by state police portal.",
    });

    return res.status(201).json(seed);
  } catch (e) {
    console.error("POST /guide/seed error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Optional: track clicks for metrics (no-op)
router.post("/guide/track-click", auth, async (_req, res) => res.json({ ok: true }));

/* ---------------- TENANT RECORD (uses req.tenant) ---------------- */

// Get my PV record
router.get("/me", auth, async (req, res) => {
  try {
    const pv = await PoliceVerification.findOne({ tenant: req.tenant._id });
    return res.json(pv || null);
  } catch (e) {
    console.error("GET /me error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Ensure/init my PV record (creates DRAFT once)
router.post("/me/init", auth, async (req, res) => {
  try {
    let pv = await PoliceVerification.findOne({ tenant: req.tenant._id });
    if (!pv) {
      pv = await PoliceVerification.create({
        tenant: req.tenant._id,
        history: [{ by: req.tenant._id, action: "init", note: "PV draft created" }],
      });
    }
    return res.status(201).json(pv);
  } catch (e) {
    console.error("POST /me/init error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Save acknowledgement info
router.put("/me/ack", auth, async (req, res) => {
  try {
    const { ackNumber, ackDate } = req.body || {};
    const pv = await PoliceVerification.findOne({ tenant: req.tenant._id });
    if (!pv) return res.status(404).json({ error: "Initialize first" });

    if (typeof ackNumber !== "undefined") pv.ackNumber = ackNumber;
    if (ackDate) pv.ackDate = new Date(ackDate);
    pv.history.push({ by: req.tenant._id, action: "ack-update", note: ackNumber || "" });

    await pv.save();
    return res.json(pv);
  } catch (e) {
    console.error("PUT /me/ack error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

// Submit to admin
router.post("/me/submit", auth, async (req, res) => {
  try {
    const pv = await PoliceVerification.findOne({ tenant: req.tenant._id });
    if (!pv) return res.status(404).json({ error: "Initialize first" });

    pv.status = "SUBMITTED";
    pv.history.push({ by: req.tenant._id, action: "submit" });

    await pv.save();
    return res.json(pv);
  } catch (e) {
    console.error("POST /me/submit error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

/* ---------------- ADMIN LISTING (basic) ---------------- */

router.get("/", auth, isAdmin, async (req, res) => {
  try {
    const { status, q } = req.query;
    const filt = {};
    if (status) filt.status = status;

    const items = await PoliceVerification.find(filt).sort({ createdAt: -1 }).limit(300);

    // naive filter by ack number if q provided
    const out = q ? items.filter(i => (i.ackNumber || "").toLowerCase().includes(String(q).toLowerCase())) : items;
    return res.json(out);
  } catch (e) {
    console.error("GET / (admin list) error:", e);
    return res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;


