// // routes/invites.js  (CJS)
// const express = require("express");
// const crypto = require("crypto");
// const Invite = require("../models/Invite"); // CJS model

// const router = express.Router();

// /** Create a one-time invite */
// router.post("/", async (req, res) => {
//   try {
//     const {
//       name,
//       phoneNo,
//       roomNo,
//       bedNo,
//       baseRent,
//       rentAmount,
//       depositAmount,
//        joiningDate
//       // expiresInDays // optional if you want
//     } = req.body;

//     const token = crypto.randomUUID();
//     const inv = await Invite.create({
//       token,
//       name,
//       phoneNo,
//       roomNo,
//       bedNo,
//       baseRent,
//       rentAmount,
//       depositAmount,
//        joiningDate,
//       // createdBy: req.user?.id,
//       // expiresAt: new Date(Date.now() + (expiresInDays ?? 7) * 864e5),
//     });

//     const origin =
//       req.headers["x-origin"] ||
//       `${req.protocol}://${req.get("host")}`;

//     const url = new URL("/HostelManager/tenant-intake", origin);
//     url.searchParams.set("tenant", "true");
//     url.searchParams.set("lock", "1");
//     url.searchParams.set("inv", token);

//     // (optional) include prefill in the URL too
//     if (name) url.searchParams.set("name", name);
//     if (phoneNo) url.searchParams.set("phoneNo", phoneNo);
//     if (roomNo) url.searchParams.set("roomNo", roomNo);
//     if (bedNo) url.searchParams.set("bedNo", bedNo);
//     if (baseRent != null) url.searchParams.set("baseRent", String(baseRent));
//     if (rentAmount != null) url.searchParams.set("rentAmount", String(rentAmount));
//     if (depositAmount != null) url.searchParams.set("depositAmount", String(depositAmount));
// if (joiningDate) url.searchParams.set("joiningDate", String(joiningDate));

//     res.json({ ok: true, token, url: url.toString() });
//   } catch (err) {
//     console.error("Create invite failed:", err);
//     res.status(500).json({ ok: false, message: "Failed to create invite" });
//   }
// });

// /** Validate invite and return prefill data */
// router.get("/:token", async (req, res) => {
//   try {
//     const inv = await Invite.findOne({ token: req.params.token });
//     if (!inv) return res.status(404).json({ ok: false, reason: "not_found" });

//     const now = new Date();
//     if (inv.usedAt) return res.status(409).json({ ok: false, reason: "used" });
//     if (inv.expiresAt && inv.expiresAt <= now)
//       return res.status(410).json({ ok: false, reason: "expired" });

//     res.json({
//       ok: true,
//     prefill: {
//   name: inv.name || "",
//   phoneNo: inv.phoneNo || "",
//   roomNo: inv.roomNo || "",
//   bedNo: inv.bedNo || "",
//   joiningDate: inv.joiningDate ? inv.joiningDate.toISOString().slice(0,10) : "",
//   baseRent: inv.baseRent ?? "",
//   rentAmount: inv.rentAmount ?? inv.baseRent ?? "",
//   depositAmount: inv.depositAmount ?? "",
// },

//     });
//   } catch (err) {
//     console.error("Validate invite failed:", err);
//     res.status(500).json({ ok: false, message: "Server error" });
//   }
// });

// module.exports = router;



const express = require("express");
const crypto = require("crypto");
const Invite = require("../models/Invite");
const Form = require("../models/formModels");

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const {
      name,
      phoneNo,
      roomNo,
      bedNo,
      joiningDate,
      baseRent,
      rentAmount,
      depositAmount,
      // any other fields you want to prefill
    } = req.body;

    // ✅ Validate minimal required fields to create tenant
    if (!name || !String(name).trim()) {
      return res.status(400).json({ ok: false, message: "Name is required" });
    }
    if (!joiningDate) {
      return res.status(400).json({ ok: false, message: "Joining Date is required" });
    }

    const monthlyRentSource =
      baseRent !== "" && baseRent != null ? baseRent : rentAmount;
    const monthlyRent = Number(monthlyRentSource ?? 0);
    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      return res.status(400).json({ ok: false, message: "Rent amount is required" });
    }

    const dep = Number(depositAmount ?? 0);

    // ✅ 1) Create Form right now (save admin filled data)
    const createdForm = await Form.create({
      name: String(name).trim(),
      phoneNo: phoneNo ? Number(phoneNo) : undefined,
      roomNo,
      bedNo,
      joiningDate: new Date(joiningDate),
      depositAmount: dep,
      baseRent: monthlyRent,

      // ✅ IMPORTANT: do NOT create payment at share time
      rents: [],
    });

    // ✅ 2) Create Invite linked to that Form
    const token = crypto.randomUUID();

    const inv = await Invite.create({
      token,
      usedByFormId: createdForm._id,  // ✅ link
      prefill: {
        name: String(name).trim(),
        phoneNo: phoneNo || "",
        roomNo: roomNo || "",
        bedNo: bedNo || "",
        joiningDate,
        baseRent: monthlyRent,
        rentAmount: monthlyRent,
        depositAmount: dep,
      },
      // expiresAt auto by schema
    });

    const origin =
      req.headers["x-origin"] || `${req.protocol}://${req.get("host")}`;

    const url = new URL("/hosteldemo/tenant-intake", origin);
    url.searchParams.set("tenant", "true");
    url.searchParams.set("lock", "1");
    url.searchParams.set("inv", token);
    if (prefill.name) url.searchParams.set("name", String(prefill.name));
    if (prefill.phoneNo) url.searchParams.set("phoneNo", String(prefill.phoneNo));
    if (category) url.searchParams.set("category", category);
    if (roomNo) url.searchParams.set("roomNo", roomNo);
    if (bedNo) url.searchParams.set("bedNo", bedNo);
    if (joiningDate) url.searchParams.set("joiningDate", String(joiningDate));
    if (monthlyRent != null) {
      url.searchParams.set("baseRent", String(monthlyRent));
      url.searchParams.set("rentAmount", String(monthlyRent));
    }
    if (dep != null) url.searchParams.set("depositAmount", String(dep));

    res.json({ ok: true, token, url: url.toString(), formId: createdForm._id });
  } catch (err) {
    console.error("Create invite failed:", err);
    res.status(500).json({ ok: false, message: "Failed to create invite" });
  }
});

// Create invite for an existing tenant form (edit/share again)
router.post("/for-form/:formId", async (req, res) => {
  try {
    const { formId } = req.params;
    const existing = await Form.findById(formId).lean();
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Form not found" });
    }

    const token = crypto.randomUUID();

    const prefillBase = {
      name: existing.name,
      phoneNo: existing.phoneNo,
      roomNo: existing.roomNo,
      bedNo: existing.bedNo,
      joiningDate: existing.joiningDate,
      baseRent: existing.baseRent,
      rentAmount: existing.rentAmount ?? existing.baseRent,
      depositAmount: existing.depositAmount,
      category: existing.category,
      firstRentStatus: existing.firstRentStatus,
      firstRentMonth: existing.firstRentMonth,
    };

    const monthlyRentSource =
      prefillBase.baseRent !== "" && prefillBase.baseRent != null
        ? prefillBase.baseRent
        : prefillBase.rentAmount;
    const monthlyRent = Number(monthlyRentSource ?? 0);
    const dep = Number(existing.depositAmount ?? 0);

    const merged = { ...prefillBase, ...(req.body || {}) };
    const prefill = {};
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === null || v === "") continue;
      prefill[k] = v;
    }

    const inv = await Invite.create({
      token,
      usedByFormId: existing._id,
      prefill,
      usedAt: null,
      // expiresAt stays null by default (never expires until used)
    });

    const origin =
      req.headers["x-origin"] || `${req.protocol}://${req.get("host")}`;

    const url = new URL("/hosteldemo/tenant-intake", origin);
    url.searchParams.set("tenant", "true");
    url.searchParams.set("lock", "1");
    url.searchParams.set("inv", token);
    if (existing.name) url.searchParams.set("name", String(existing.name));
    if (existing.phoneNo) url.searchParams.set("phoneNo", String(existing.phoneNo));
    if (existing.category) url.searchParams.set("category", String(existing.category));
    if (existing.roomNo) url.searchParams.set("roomNo", String(existing.roomNo));
    if (existing.bedNo) url.searchParams.set("bedNo", String(existing.bedNo));
    if (existing.joiningDate) url.searchParams.set("joiningDate", String(existing.joiningDate));
    if (Number.isFinite(monthlyRent) && monthlyRent > 0) {
      url.searchParams.set("baseRent", String(monthlyRent));
      url.searchParams.set("rentAmount", String(monthlyRent));
    }
    if (dep != null) url.searchParams.set("depositAmount", String(dep));

    res.json({ ok: true, token, url: url.toString(), formId: existing._id, inviteId: inv._id });
  } catch (err) {
    console.error("Create invite for form failed:", err);
    res.status(500).json({ ok: false, message: "Failed to create invite" });
  }
});




router.get("/:token", async (req, res) => {
  try {
    const invDoc = await Invite.findOne({ token: req.params.token })
      .populate("usedByFormId", "srNo");

    if (!invDoc)
      return res.status(404).json({ ok: false, message: "Invite not found" });

    const now = new Date();
    if (invDoc.expiresAt && invDoc.expiresAt <= now)
      return res.status(410).json({ ok: false, message: "Invite expired" });

    if (!invDoc.usedByFormId) {
      return res.status(400).json({
        ok: false,
        message: "Invite not linked to a draft form (usedByFormId missing).",
      });
    }

    // ✅ IMPORTANT: populate may fail sometimes, so support both cases
    const formId = String(invDoc.usedByFormId?._id || invDoc.usedByFormId);
    const srNo = invDoc.usedByFormId?.srNo;

    const prefill = { ...(invDoc.prefill || {}) };
    if (prefill.baseRent !== "" && prefill.baseRent != null) {
      prefill.rentAmount = prefill.baseRent;
    }

    return res.json({
      ok: true,
      formId,
      srNo,
      prefill: { ...prefill, ...(srNo ? { srNo } : {}) },
      // optional info
      alreadyLinked: !!invDoc.usedAt,
    });
  } catch (err) {
    console.error("Validate invite failed:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});






// ✅ SUBMIT INVITE FORM (UPDATE SAME DOC, NO NEW INSERT)
router.put("/:token/submit", async (req, res) => {
  try {
    const token = req.params.token;
    const now = new Date();

    // ✅ claim token (atomic): only one request wins
    const inv = await Invite.findOneAndUpdate(
      {
        token,
        usedAt: null,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      { $set: { usedAt: now } },
      { new: true }
    );

    if (!inv) {
      // either invalid / expired / already used
      const exists = await Invite.findOne({ token }).lean();
      if (!exists) return res.status(404).json({ ok: false, message: "Invalid link" });
      if (exists.expiresAt && exists.expiresAt <= now) return res.status(410).json({ ok: false, message: "Link expired" });
      return res.status(409).json({ ok: false, message: "Link already used" });
    }

    const formId = inv.usedByFormId;
    if (!formId) return res.status(400).json({ ok: false, message: "Draft form missing" });

    const lockedValues = Object.fromEntries(
      Object.entries(inv.prefill || {}).filter(([, value]) => value !== "" && value != null)
    );
    const lockedKeys = new Set(Object.keys(lockedValues));
    const incoming = { ...(req.body || {}) };

    for (const key of lockedKeys) {
      delete incoming[key];
    }

    const updated = await Form.findByIdAndUpdate(
      formId,
      { $set: { ...lockedValues, ...incoming } },
      { new: true }
    );

    return res.json({ ok: true, message: "Saved", form: updated });
  } catch (err) {
    console.error("Invite submit failed:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});


module.exports = router;
