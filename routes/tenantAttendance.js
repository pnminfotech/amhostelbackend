// // routes/tenantAttendance.js
// const router = require("express").Router();
// const Attendance = require("../models/Attendance");
// const Notification = require("../models/Notification");
// const authTenant = require("../middleware/tenantAuth");

// // ---------- Helper: format date key ----------
// const ymd = (d = new Date()) => {
//   const y = d.getFullYear();
//   const m = String(d.getMonth() + 1).padStart(2, "0");
//   const dd = String(d.getDate()).padStart(2, "0");
//   return `${y}-${m}-${dd}`;
// };

// // ---------- Internal helper: push system notification ----------
// async function pushAttendanceNotif(tenant, payload = {}) {
//   try {
//     await Notification.create({
//       tenantId: tenant._id,
//       tenantName: tenant.name,
//       roomNo: tenant.roomNo,
//       bedNo: tenant.bedNo,
//       type: "system", // distinguish from leave/payment
//       payload,        // { kind, whenISO, where?, reason?, dateKey }
//       title:
//         payload.kind === "attendance_late"
//           ? "Late arrival reported"
//           : payload.kind === "attendance_checkin"
//           ? "Tenant reached hostel"
//           : payload.kind === "attendance_checkout"
//           ? "Tenant checked out"
//           : "Attendance update",
//       status: "pending",
//     });
//   } catch (err) {
//     console.error("pushAttendanceNotif failed:", err.message);
//   }
// }

// /* ----------------------------- Routes ------------------------------ */

// // ✅ 1️⃣ Late Request (Schedule a late check-in)
// router.post("/tenant/attendance/late", authTenant, async (req, res, next) => {
//   try {
//     const { date, time, reason } = req.body || {};
//     if (!date || !time)
//       return res.status(400).json({ message: "Date and time are required." });

//     const key = ymd(new Date(date));
//     const now = new Date();
//     const scheduledAt = new Date(`${date}T${time}`);

//     // Prevent multiple pending requests
//     const existingPending = await Attendance.findOne({
//       tenantId: req.tenant._id,
//       status: "pending",
//     });
//     if (existingPending) {
//       return res.status(400).json({
//         message: `You already have a pending late request for ${existingPending.dateKey}. Please check in before submitting another.`,
//       });
//     }

//     // Create or update record
//     const doc = await Attendance.findOneAndUpdate(
//       { tenantId: req.tenant._id, dateKey: key },
//       {
//         $setOnInsert: { tenantId: req.tenant._id, dateKey: key },
//         $set: {
//           isLate: true,
//           lateReason: reason || "",
//           lateReportedAt: now,
//           scheduledAt,
//           status: "pending",
//         },
//       },
//       { new: true, upsert: true }
//     );

//     // Push admin notification
//     console.log("📨 About to call pushAttendanceNotif");
//     await pushAttendanceNotif(req.tenant, {
//       kind: "attendance_late",
//       dateKey: key,
//       whenISO: now.toISOString(),
//       reason,
//       scheduledAt,
//       status: "pending",
//     });

//     res.json({ ok: true, attendance: doc });
//   } catch (err) {
//     next(err);
//   }
// });

// // ✅ 2️⃣ List Attendance Records
// router.get("/tenant/attendance/list", authTenant, async (req, res, next) => {
//   try {
//     const tenantId = req.tenant?._id || req.tenantId;
//     if (!tenantId)
//       return res.status(401).json({ message: "Missing tenant context" });

//     const list = await Attendance.find({ tenantId })
//       .sort({ createdAt: -1 })
//       .limit(10)
//       .lean();

//     res.json({ ok: true, attendance: list });
//   } catch (err) {
//     next(err);
//   }
// });

// // ✅ 3️⃣ Check-In (Mark reached)
// const handleCheckIn = async (req, res, next) => {
//   try {
//     const { lat, lng, accuracy, address } = req.body || {};
//     const now = new Date();
//     const key = ymd();

//     // Update latest pending record first
//     let doc = await Attendance.findOneAndUpdate(
//       { tenantId: req.tenant._id, status: "pending" },
//       {
//         $set: {
//           checkIn: { at: now, where: { lat, lng, accuracy, address } },
//           status: "checked_in",
//         },
//       },
//       { new: true }
//     );

//     // If no pending record, fallback to today's record
//     if (!doc) {
//       doc = await Attendance.findOneAndUpdate(
//         { tenantId: req.tenant._id, dateKey: key },
//         {
//           $setOnInsert: { tenantId: req.tenant._id, dateKey: key },
//           $set: {
//             checkIn: { at: now, where: { lat, lng, accuracy, address } },
//             status: "checked_in",
//           },
//         },
//         { new: true, upsert: true }
//       );
//     }

//     await pushAttendanceNotif(req.tenant, {
//       kind: "attendance_checkin",
//       dateKey: doc.dateKey,
//       whenISO: now.toISOString(),
//       where: { lat, lng, accuracy, address },
//       status: "checked_in",
//     });

//     res.json({ ok: true, attendance: doc });
//   } catch (err) {
//     next(err);
//   }
// };
// router.post("/tenant/attendance/checkin", authTenant, handleCheckIn);
// router.post("/tenant/attendance/check-in", authTenant, handleCheckIn);

// // ✅ 4️⃣ Check-Out (Optional)
// const handleCheckOut = async (req, res, next) => {
//   try {
//     const { lat, lng, accuracy, address } = req.body || {};
//     const now = new Date();
//     const key = ymd();

//     const doc = await Attendance.findOneAndUpdate(
//       { tenantId: req.tenant._id, dateKey: key },
//       {
//         $setOnInsert: { tenantId: req.tenant._id, dateKey: key },
//         $set: {
//           checkOut: { at: now, where: { lat, lng, accuracy, address } },
//           status: "checked_out",
//         },
//       },
//       { new: true, upsert: true }
//     );

//     await pushAttendanceNotif(req.tenant, {
//       kind: "attendance_checkout",
//       dateKey: key,
//       whenISO: now.toISOString(),
//       where: { lat, lng, accuracy, address },
//       status: "checked_out",
//     });

//     res.json({ ok: true, attendance: doc });
//   } catch (err) {
//     next(err);
//   }
// };
// router.post("/tenant/attendance/checkout", authTenant, handleCheckOut);
// router.post("/tenant/attendance/check-out", authTenant, handleCheckOut);

// module.exports = router;




const express = require("express");
const { handleLateRequest, handleCheckIn, handleCheckOut } = require("../controllers/attendanceController");
const authTenant = require("../middleware/tenantAuth");
const router = express.Router();

router.post("/tenant/attendance/late", authTenant, handleLateRequest);
router.post("/tenant/attendance/check-in", authTenant, handleCheckIn);
router.post("/tenant/attendance/check-out", authTenant, handleCheckOut);
router.get("/tenant/attendance/list", authTenant, async (req, res, next) => {
  const Attendance = require("../models/Attendance");
  try {
    const tenantId = req.tenant?._id;
    const list = await Attendance.find({ tenantId }).sort({ createdAt: -1 }).limit(10).lean();
    res.json({ ok: true, attendance: list });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
