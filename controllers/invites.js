// // // controllers/invites.js
// // const crypto = require("crypto");
// // const Invite = require("../models/Invite");

// // // ===============================
// // // CREATE INVITE
// // // ===============================
// // exports.createInvite = async (req, res) => {
// //   const token = crypto.randomUUID();
// //   const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3); // 3 days

// //   const prefill = req.body || {};

// //   const origin =
// //     req.get("X-Origin") ||
// //     req.get("Origin") ||
// //     "   https://mutakegirlshostel-0ko7.onrender.com";

// //   const url = new URL("/sismarketing/tenant-intake", origin);

// //   url.searchParams.set("tenant", "true");
// //   url.searchParams.set("lock", "1");
// //   url.searchParams.set("inv", token);

// //   if (prefill.name) url.searchParams.set("name", prefill.name);
// //   if (prefill.phoneNo)
// //     url.searchParams.set("phoneNo", String(prefill.phoneNo));
// //   if (prefill.roomNo) url.searchParams.set("roomNo", String(prefill.roomNo));
// //   if (prefill.bedNo) url.searchParams.set("bedNo", String(prefill.bedNo));
// //   if (prefill.rentAmount != null)
// //     url.searchParams.set("rentAmount", String(prefill.rentAmount));
// //   if (prefill.depositAmount != null)
// //     url.searchParams.set("depositAmount", String(prefill.depositAmount));

// //   const doc = await Invite.create({
// //     token,
// //     prefill,
// //     expiresAt,
// //     usedAt: null,
// //   });

// //   res.json({
// //     ok: true,
// //     token,
// //     url: url.toString(),
// //     inviteId: doc._id,
// //   });
// // };

// // // ===============================
// // // VALIDATE INVITE  (UPDATED)
// // // ===============================
// // exports.validateInvite = async (req, res) => {
// //   const { token } = req.params;
// //   const now = new Date();

// //   // ⭐ MUST MATCH createWithOptionalInvite QUERY ⭐
// //   const invite = await Invite.findOne({
// //     token,
// //     usedAt: null,
// //     expiresAt: { $gt: now },
// //   });

// //   if (!invite) {
// //     return res.status(409).json({
// //       ok: false,
// //       message: "Invalid, expired, or already used link",
// //     });
// //   }

// //   // valid
// //   return res.json({
// //     ok: true,
// //     prefill: invite.prefill || {},
// //   });
// // };



// // controllers/invites.js
// const crypto = require("crypto");
// const Invite = require("../models/Invite");
// const Form = require("../models/formModels");

// // helper: generate next srNo (simple approach)
// async function getNextSrNo() {
//   const last = await Form.findOne().sort({ srNo: -1 }).select("srNo").lean();
//   return (last?.srNo || 0) + 1;
// }

// // ===============================
// // CREATE INVITE  ✅ FIXED (creates draft Form + links invite)
// // ===============================
// exports.createInvite = async (req, res) => {
//   try {
//     const token = crypto.randomUUID();

//     // keep your 3 day expiry
//     const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 3);

//     const prefill = req.body || {};

//     // ✅ minimal required (same as your flow)
//     const name = String(prefill.name || "").trim();
//     const joiningDate = prefill.joiningDate;

//     if (!name) {
//       return res.status(400).json({ ok: false, message: "Name is required" });
//     }
//     if (!joiningDate) {
//       return res
//         .status(400)
//         .json({ ok: false, message: "Joining Date is required" });
//     }

//     // rent (use rentAmount OR baseRent)
//     const monthlyRent = Number(prefill.rentAmount ?? prefill.baseRent ?? 0);
//     if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
//       return res
//         .status(400)
//         .json({ ok: false, message: "Rent amount is required" });
//     }

//     const dep = Number(prefill.depositAmount ?? 0);

//     // ✅ 1) Create DRAFT FORM first (admin-filled data)
//     // (simple srNo generation + retry once for duplicates)
//     let srNo = await getNextSrNo();
//     let createdForm;
//     try {
//       createdForm = await Form.create({
//         srNo,
//         name,
//         phoneNo: prefill.phoneNo ? String(prefill.phoneNo).replace(/\D/g, "").slice(0, 10) : undefined,
//         roomNo: prefill.roomNo || "",
//         bedNo: prefill.bedNo || "",
//         joiningDate: new Date(joiningDate),
//         depositAmount: dep,
//         baseRent: monthlyRent,
//         rentAmount: monthlyRent,
//         rents: [], // ✅ DO NOT create rent entry now
//       });
//     } catch (e) {
//       // duplicate srNo retry
//       if (e?.code === 11000) {
//         srNo = await getNextSrNo();
//         createdForm = await Form.create({
//           srNo,
//           name,
//           phoneNo: prefill.phoneNo ? String(prefill.phoneNo).replace(/\D/g, "").slice(0, 10) : undefined,
//           roomNo: prefill.roomNo || "",
//           bedNo: prefill.bedNo || "",
//           joiningDate: new Date(joiningDate),
//           depositAmount: dep,
//           baseRent: monthlyRent,
//           rentAmount: monthlyRent,
//           rents: [],
//         });
//       } else {
//         throw e;
//       }
//     }

//     // ✅ 2) Create INVITE linked to that draft form
//     const doc = await Invite.create({
//       token,
//       prefill: {
//         ...prefill,
//         name,
//         rentAmount: monthlyRent,
//         baseRent: monthlyRent,
//         depositAmount: dep,
//         srNo, // helpful
//       },
//       usedByFormId: createdForm._id, // ✅ THIS IS THE MAIN FIX
//       usedAt: null,
//       expiresAt,
//     });

//     // build tenant link
//     const origin =
//       req.get("X-Origin") ||
//       req.get("Origin") ||
//       "   https://mutakegirlshostel-0ko7.onrender.com";

//     // ✅ make sure this path matches your React route
//     const url = new URL("/sismarketing/tenant-intake", origin);

//     url.searchParams.set("tenant", "true");
//     url.searchParams.set("lock", "1");
//     url.searchParams.set("inv", token);

//     // NOTE: no need to put name/phone in query now (prefill comes from API)
//     // but harmless if you want to keep

//     return res.json({
//       ok: true,
//       token,
//       url: url.toString(),
//       inviteId: doc._id,
//       formId: createdForm._id,
//       srNo,
//     });
//   } catch (err) {
//     console.error("Create invite failed:", err);
//     return res.status(500).json({ ok: false, message: "Failed to create invite" });
//   }
// };

// // ===============================
// // VALIDATE INVITE  ✅ FIXED (returns formId + srNo + prefill)
// // ===============================
// exports.validateInvite = async (req, res) => {
//   try {
//     const { token } = req.params;
//     const now = new Date();

//     const invDoc = await Invite.findOne({ token }).populate("usedByFormId", "srNo");

//     if (!invDoc) {
//       return res.status(404).json({ ok: false, message: "Invite not found" });
//     }

//     if (invDoc.expiresAt && invDoc.expiresAt <= now) {
//       return res.status(410).json({ ok: false, message: "Invite expired" });
//     }

//     // ✅ If you want one-time link, keep this:
//     if (invDoc.usedAt) {
//       return res.status(409).json({ ok: false, message: "Link already used" });
//     }

//     if (!invDoc.usedByFormId) {
//       return res.status(400).json({
//         ok: false,
//         message: "Invite not linked to a draft form (usedByFormId missing).",
//       });
//     }

//     const formId = String(invDoc.usedByFormId?._id || invDoc.usedByFormId);
//     const srNo = invDoc.usedByFormId?.srNo;

//     return res.json({
//       ok: true,
//       formId,
//       srNo,
//       prefill: { ...(invDoc.prefill || {}), ...(srNo ? { srNo } : {}) },
//     });
//   } catch (err) {
//     console.error("Validate invite failed:", err);
//     return res.status(500).json({ ok: false, message: "Server error" });
//   }
// };




// controllers/invites.js
const crypto = require("crypto");
const Invite = require("../models/Invite");
const Form = require("../models/formModels");
const Counter = require("../models/counterModel"); // ✅ same counter you already use

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];
function fmtMonthKey(y, m) {
  const d = new Date(y, m, 1);
  if (isNaN(d)) return undefined;
  return `${MONTHS[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
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

// ✅ use Counter-based srNo so duplicates don't happen
async function assignNextSrNoAndUpdateCounter() {
  const [counter, lastForm] = await Promise.all([
    Counter.findOne({ name: "form_srno" }).lean(),
    Form.findOne().sort({ srNo: -1 }).select("srNo").lean(),
  ]);

  const maxExisting = lastForm ? Number(lastForm.srNo) || 0 : 0;
  const currentSeq = counter ? Number(counter.seq) || 0 : 0;

  const base = Math.max(maxExisting, currentSeq);
  const next = base + 1;

  const updated = await Counter.findOneAndUpdate(
    { name: "form_srno" },
    { $set: { name: "form_srno", seq: next } },
    { new: true, upsert: true }
  );

  return updated.seq; // NEXT srNo
}

// ===============================
// CREATE INVITE ✅ (creates draft form + links invite)
// ===============================
exports.createInvite = async (req, res) => {
  try {
    const token = crypto.randomUUID();

    const prefill = req.body || {};
    const toDate = (v) => (v ? new Date(v) : undefined);
    const toStr = (v) => (v === "" || v == null ? undefined : String(v));
    const toNumOrFallback = (...vals) => {
      for (const v of vals) {
        if (v === "" || v == null) continue;
        const n = Number(v);
        if (Number.isFinite(n)) return n;
      }
      return undefined;
    };

    // ✅ required (to prevent null category / missing allocation)
    const category = String(prefill.category || "").trim();
    const roomNo = String(prefill.roomNo || "").trim();
    const bedNo = String(prefill.bedNo || "").trim();

    const name = String(prefill.name || "").trim();
    const joiningDate = prefill.joiningDate;

    if (!category) return res.status(400).json({ ok: false, message: "Category is required" });
    if (!roomNo) return res.status(400).json({ ok: false, message: "Room No is required" });
    if (!bedNo) return res.status(400).json({ ok: false, message: "Bed No is required" });

    if (!name) return res.status(400).json({ ok: false, message: "Name is required" });
    if (!joiningDate) return res.status(400).json({ ok: false, message: "Joining Date is required" });

    const monthlyRent = toNumOrFallback(prefill.baseRent, prefill.rentAmount);
    if (!Number.isFinite(monthlyRent) || monthlyRent <= 0) {
      return res.status(400).json({ ok: false, message: "Rent amount is required" });
    }

    const dep = Number(prefill.depositAmount ?? 0);

    const firstRentStatus = String(prefill.firstRentStatus || "NOT_PAID").trim();
    const jd = new Date(joiningDate);
    const firstRentMonth =
      firstRentStatus === "ADVANCE_PAID"
        ? fmtMonthKey(jd.getFullYear(), jd.getMonth())
        : fmtMonthKey(jd.getFullYear(), jd.getMonth() + 1);

    // ✅ Optional: pre-check bed occupancy (faster error)
    const bedCandidates = await Form.find({ roomNo, bedNo })
      .select("_id name category leaveDate")
      .lean();
    const existing = bedCandidates.find((tenant) => isActiveBedTenant(tenant, category));
    if (existing) {
      return res.status(409).json({
        ok: false,
        message: `Bed already occupied by "${existing.name || "tenant"}": Category "${category}", Room "${roomNo}", Bed "${bedNo}".`,
      });
    }

    // ✅ 1) Create draft Form
    let createdForm;
    try {
      const srNo = await assignNextSrNoAndUpdateCounter();

      const initialRents =
        firstRentStatus === "ADVANCE_PAID"
          ? [
              {
                rentAmount: monthlyRent,
                date: new Date(joiningDate),
                month: firstRentMonth,
                paymentMode: "Cash",
              },
            ]
          : [];

      createdForm = await Form.create({
        srNo,
        category,          // ✅ IMPORTANT (fix null category)
        roomNo,
        bedNo,
        name,
        phoneNo: prefill.phoneNo
          ? String(prefill.phoneNo).replace(/\D/g, "").slice(0, 10)
          : undefined,
        address: toStr(prefill.address),
        pincode: prefill.pincode || undefined,
        city: prefill.city || undefined,
        state: prefill.state || undefined,
        houseNo: prefill.houseNo || undefined,
        nearbyPlace: prefill.nearbyPlace || undefined,
        relative1Relation: prefill.relative1Relation || undefined,
        relative1Name: prefill.relative1Name || undefined,
        relative1Phone: prefill.relative1Phone || undefined,
        relative2Relation: prefill.relative2Relation || undefined,
        relative2Name: prefill.relative2Name || undefined,
        relative2Phone: prefill.relative2Phone || undefined,
        companyAddress: toStr(prefill.companyAddress),
        dateOfJoiningCollege: toDate(prefill.dateOfJoiningCollege),
        dob: toDate(prefill.dob),
        joiningDate: new Date(joiningDate),
        depositAmount: dep,
        baseRent: monthlyRent,
        rentAmount: monthlyRent,
        firstRentStatus,
        firstRentMonth,
        rents: initialRents,
      });
    } catch (e) {
      // ✅ if bed unique index hits (category+roomNo+bedNo)
      if (e?.code === 11000 && e?.keyPattern?.category && e?.keyPattern?.roomNo && e?.keyPattern?.bedNo) {
        const activeConflict = (await Form.find({ roomNo, bedNo })
          .select("_id name category leaveDate")
          .lean()).find((tenant) => isActiveBedTenant(tenant, category));

        if (!activeConflict) {
          return res.status(409).json({
            ok: false,
            message: `Bed is vacant, but MongoDB still has a unique index blocking reuse for Category "${category}", Room "${roomNo}", Bed "${bedNo}". Drop the old category_roomNo_bedNo unique index or make it partial for active tenants.`,
          });
        }

        return res.status(409).json({
          ok: false,
          message: `Bed already occupied by "${activeConflict.name || "tenant"}": Category "${category}", Room "${roomNo}", Bed "${bedNo}".`,
        });
      }
      throw e;
    }

    // ✅ 2) Create invite linked to that draft form
    const doc = await Invite.create({
      token,
      prefill: {
        ...prefill,
        category,
        roomNo,
        bedNo,
        name,
        rentAmount: monthlyRent,
        baseRent: monthlyRent,
        depositAmount: dep,
        srNo: createdForm.srNo,
        firstRentStatus,
        firstRentMonth,
      },
      usedByFormId: createdForm._id, // ✅ link to draft form id
      usedAt: null,
    });

    const origin =
      req.get("X-Origin") ||
      req.get("Origin") ||
      "   https://mutakegirlshostel-0ko7.onrender.com";

    const url = new URL("/mutakegirlshostel/tenant-intake", origin);
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

    return res.json({
      ok: true,
      token,
      url: url.toString(),
      inviteId: doc._id,
      formId: createdForm._id,
      srNo: createdForm.srNo,
    });
  } catch (err) {
    console.error("Create invite failed:", err);
    return res.status(500).json({
      ok: false,
      message: err?.message || "Failed to create invite",
    });
  }
};

// ===============================
// VALIDATE INVITE ✅ (returns formId + srNo + prefill)
// ===============================
exports.validateInvite = async (req, res) => {
  try {
    const { token } = req.params;
    const now = new Date();

    const invDoc = await Invite.findOne({ token }).populate("usedByFormId", "srNo");
    if (!invDoc) return res.status(404).json({ ok: false, message: "Invite not found" });

    if (invDoc.expiresAt && invDoc.expiresAt <= now) {
      return res.status(410).json({ ok: false, message: "Invite expired" });
    }

    if (invDoc.usedAt) {
      return res.status(409).json({ ok: false, message: "Link already used" });
    }

    if (!invDoc.usedByFormId) {
      return res.status(400).json({ ok: false, message: "Invite not linked to draft form" });
    }

    const formId = String(invDoc.usedByFormId?._id || invDoc.usedByFormId);
    const srNo = invDoc.usedByFormId?.srNo;
    const prefill = { ...(invDoc.prefill || {}) };
    if (prefill.baseRent !== "" && prefill.baseRent != null) {
      prefill.rentAmount = prefill.baseRent;
    }
    const lockedFields = Object.entries(invDoc.prefill || {})
      .filter(([, value]) => value !== "" && value != null)
      .map(([key]) => key);

    return res.json({
      ok: true,
      formId,
      srNo,
      prefill: { ...prefill, ...(srNo ? { srNo } : {}) },
      lockedFields,
    });
  } catch (err) {
    console.error("Validate invite failed:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
};
