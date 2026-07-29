// routes/adminLeave.js
const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

// --- MODELS ---
// Adjust paths to match your project:
const Form = require("../models/formModels");

// If you already have a LeaveRequest model, reuse it and DELETE this schema:
const LeaveRequestSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true },
    leaveDate: { type: Date, required: true },
    note: String,
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);
const LeaveRequest =
  mongoose.models.LeaveRequest || mongoose.model("LeaveRequest", LeaveRequestSchema);

/**
 * GET /api/admin/notifications/leave
 * Query params:
 *   status = pending|approved|rejected|all  (default: pending)
 *   limit  = number (default 50, max 200)
 */
router.get("/notifications/leave", async (req, res) => {
  try {
    const status = req.query.status || "pending";
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const q = status === "all" ? {} : { status };
    const docs = await LeaveRequest.find(q)
      .populate("tenant", "name roomNo bedNo")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    // Normalize to bell-friendly shape
    const out = docs.map((r) => ({
      _id: r._id,                       // “notification” id = request id
      type: "leave_request",
      tenant: r.tenant,                 // populated doc
      tenantName: r.tenant?.name,
      roomNo: r.tenant?.roomNo,
      bedNo: r.tenant?.bedNo,
      leaveDate: r.leaveDate,
      note: r.note,
      status: r.status,
      createdAt: r.createdAt,
      requestId: r._id,                 // keep explicit
    }));

    res.json(out);
  } catch (e) {
    console.error("leave list error:", e);
    res.status(500).json({ message: "Failed to load leave notifications" });
  }
});

/** POST /api/admin/leave/:id/approve */
router.post("/leave/:id/approve", async (req, res) => {
  try {
    const r = await LeaveRequest.findById(req.params.id).populate("tenant", "_id");
    if (!r) return res.status(404).json({ message: "Leave request not found" });

    r.status = "approved";
    await r.save();

    // Also stamp tenant’s leaveDate for downstream UI
    if (r.tenant?._id && r.leaveDate) {
      await Form.findByIdAndUpdate(r.tenant._id, { $set: { leaveDate: r.leaveDate } });
    }

    res.json({ ok: true, request: r });
  } catch (e) {
    console.error("approve leave error:", e);
    res.status(500).json({ message: "Approval failed" });
  }
});

/** POST /api/admin/leave/:id/reject */
router.post("/leave/:id/reject", async (req, res) => {
  try {
    const r = await LeaveRequest.findById(req.params.id);
    if (!r) return res.status(404).json({ message: "Leave request not found" });
    r.status = "rejected";
    await r.save();
    res.json({ ok: true, request: r });
  } catch (e) {
    console.error("reject leave error:", e);
    res.status(500).json({ message: "Reject failed" });
  }
});

/** (Optional) mark one as read so it disappears from “unread” views later */
router.patch("/leave/:id/read", async (req, res) => {
  await LeaveRequest.findByIdAndUpdate(req.params.id, { $set: { read: true } });
  res.sendStatus(204);
});

module.exports = router;
