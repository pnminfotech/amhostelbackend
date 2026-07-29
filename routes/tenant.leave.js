const router = require("express").Router();
const authTenant = require("../middleware/tenantAuth");
const Leave = require("../models/LeaveRequest");

// GET /api/tenant/leave  -> list my leaves (newest first)
router.get("/leave", authTenant, async (req, res) => {
  const id = req.tenant._id;
  // Support both new (tenantId) and any legacy docs (tenant)
  const items = await Leave.find({ $or: [{ tenantId: id }, { tenant: id }] })
    .sort({ requestedAt: -1 })
    .lean();
  res.json(items);
});

// POST /api/tenant/leave  -> create a leave request (>=30 days ahead)
router.post("/leave", authTenant, async (req, res) => {
  try {
    const { leaveDate, note } = req.body || {};
    if (!leaveDate) return res.status(400).json({ message: "leaveDate required" });

    const d = new Date(leaveDate);
    if (isNaN(d.getTime())) return res.status(400).json({ message: "Invalid leaveDate" });

    const today = new Date(); today.setHours(0,0,0,0);
    const diff = d.getTime() - today.getTime();
    if (diff <= 0) return res.status(400).json({ message: "Leave date must be in the future" });
    if (diff < 30 * 24 * 60 * 60 * 1000)
      return res.status(400).json({ message: "Leave date must be at least 30 days from today" });

    const created = await Leave.create({
      tenantId: req.tenant._id,                   // ✅ consistent field
      leaveDate: d,
      note: String(note || "").trim(),
      status: "pending",
      requestedAt: new Date(),
    });

    res.status(201).json(created);
  } catch (err) {
    console.error("tenant leave create error:", err);
    res.status(500).json({ message: "Failed to submit leave request" });
  }
});

module.exports = router;
