// // models/LeaveNotification.js
// const mongoose = require("mongoose");

// const LeaveNotificationSchema = new mongoose.Schema(
//   {
//     kind: { type: String, enum: ["leave_request"], default: "leave_request" },
//     requestId: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "LeaveRequest",
//       required: true,
//       index: true,
//     },
//     tenant: {
//       type: mongoose.Schema.Types.ObjectId,
//       ref: "Form",        // ✅ matches your main tenant model
//       required: true,
//       index: true,
//     },
//     tenantName: { type: String, default: "" },
//     leaveDate: { type: Date, required: true },
//     isRead: { type: Boolean, default: false, index: true },
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.models.LeaveNotification
//   || mongoose.model("LeaveNotification", LeaveNotificationSchema);



// routes/leaveRoutes.js
const Notification = require("../models/Notification");

router.post("/", authTenant, async (req, res) => {
  try {
    const { date, reason } = req.body;
    if (!date || !reason) {
      return res.status(400).json({ message: "date and reason are required" });
    }

    const doc = await LeaveRequest.create({
      tenant: req.tenant._id,
      date: new Date(date),
      reason: String(reason).trim(),
      status: "pending",           // make sure LeaveRequest has a status field
    });

    // 🔔 push a unified notification to the same feed used by payments
    await Notification.create({
      type: "leave_request",
      status: "pending",
      tenantId: req.tenant._id,
      tenantName: req.tenant.name || "",
      roomNo: String(req.tenant.roomNo || ""),
      bedNo: String(req.tenant.bedNo || ""),
      leaveDate: doc.date,
      // note: reason isn’t a field in Notification schema; if you want it, use "note"
      note: String(reason).trim(),
    });

    res.status(201).json(doc);
  } catch (e) {
    console.error("Create leave error:", e);
    res.status(500).json({ message: "Failed to create leave" });
  }
});
