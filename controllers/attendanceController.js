// controllers/attendanceController.js
const Attendance = require("../models/Attendance");
const Notification = require("../models/Notification");  // 🔔 new
const dayjs = require("dayjs");

// ========================
// Helper: pushAttendanceNotif
// ========================
// async function pushAttendanceNotif(tenant, payload = {}) {
//   try {
//     await Notification.create({
      
//       tenantId: tenant._id,
//       type: "system",   // distinguish from payment / leave
//       payload,          // { kind, whenISO, where, reason, ... }
//       title:
//         payload.kind === "attendance_late"
//           ? "Late arrival reported"
//           : payload.kind === "attendance_checkin"
//           ? "Tenant reached hostel"
//           : "Attendance update",
//     });
//   } catch (err) {
//     console.error("pushAttendanceNotif failed:", err.message);
//   }
// }

async function pushAttendanceNotif(tenant, payload = {}) {
  try {
    console.log("🔔 pushAttendanceNotif called with payload:", payload); // <-- log outside

    await Notification.create({
      tenantId: tenant._id,
      tenantName: tenant.name,
      roomNo: tenant.roomNo,
      bedNo: tenant.bedNo,
      type: "system", // distinguish from payment / leave
      payload,        // { kind, whenISO, where, reason, ... }
      status: "sent", // mark as sent so it appears for admin
    });

    console.log("✅ Attendance notification created successfully.");
  } catch (err) {
    console.error("pushAttendanceNotif failed:", err.message);
  }
}

// ========================
// Controller: Late Request
// ========================
const handleLateRequest = async (req, res, next) => {
  try {
    const { date, time, reason } = req.body || {};
    if (!date || !time)
      return res.status(400).json({ message: "Date and time required." });

    // Prevent multiple pending requests
    const pending = await Attendance.findOne({
      tenantId: req.tenant._id,
      status: "pending",
    });
    if (pending)
      return res.status(400).json({
        message: "You already have a pending late request.",
      });

    const key = dayjs(date).format("YYYY-MM-DD");
    const scheduledAt = dayjs(`${date}T${time}`).toDate();
    const now = new Date();

    // const doc = await Attendance.create({
    //   tenantId: req.tenant._id,
    //   dateKey: key,
    //   scheduledAt,
    //   lateReason: reason || "",
    //   status: "pending",
    // });
const doc = await Attendance.findOneAndUpdate(
  { tenantId: req.tenant._id, dateKey: key },
  {
    $setOnInsert: { tenantId: req.tenant._id, dateKey: key },
    $set: {
      scheduledAt,
      lateReason: reason || "",
      status: "pending",
      isLate: true,
      lateReportedAt: new Date(),
    },
  },
  { new: true, upsert: true }
);

    // 🔔 Push notification for admin
    await pushAttendanceNotif(req.tenant, {
      
      kind: "attendance_late",
      dateKey: key,
      whenISO: now.toISOString(),
      reason,
      scheduledAt,
      status: "pending",
    });

    res.json({ ok: true, attendance: doc });
  } catch (e) {
    next(e);
  }
};

// ========================
// Controller: Check-In
// ========================
const handleCheckIn = async (req, res, next) => {
  try {
    const { lat, lng, accuracy, address } = req.body || {};
    const now = new Date();

    // Find the latest pending record
    const doc = await Attendance.findOneAndUpdate(
      { tenantId: req.tenant._id, status: "pending" },
      {
        $set: {
          checkIn: { at: now, where: { lat, lng, accuracy, address } },
          status: "checked_in",
        },
      },
      { new: true }
    );

    if (!doc)
      return res.status(404).json({ message: "No pending request to check in." });

    // 🔔 Push notification for admin
    console.log("📨 About to call pushAttendanceNotif");
    await pushAttendanceNotif(req.tenant, {
      kind: "attendance_checkin",
      dateKey: doc.dateKey,
      whenISO: now.toISOString(),
      where: { lat, lng, accuracy, address },
      status: "checked_in",
    });

    res.json({ ok: true, attendance: doc });
  } catch (e) {
    next(e);
  }
};
const handleCheckOut = async (req, res, next) => {
  try {
    const { lat, lng, accuracy, address } = req.body || {};
    const now = new Date();

    const doc = await Attendance.findOneAndUpdate(
      { tenantId: req.tenant._id, status: "checked_in" },
      {
        $set: {
          checkOut: { at: now, where: { lat, lng, accuracy, address } },
          status: "checked_out",
        },
      },
      { new: true }
    );

    if (!doc)
      return res.status(404).json({ message: "No active check-in found." });

    await pushAttendanceNotif(req.tenant, {
      kind: "attendance_checkout",
      dateKey: doc.dateKey,
      whenISO: now.toISOString(),
      where: { lat, lng, accuracy, address },
      status: "checked_out",
    });

    res.json({ ok: true, attendance: doc });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  handleLateRequest,
  handleCheckIn,
  handleCheckOut, // ✅ add this
};

// ========================
// Export
// ========================
// module.exports = {
//   handleLateRequest,
//   handleCheckIn,
// };
