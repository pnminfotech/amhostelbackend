const router = require("express").Router();
const Leave = require("../models/LeaveRequest");
const authAdmin = require("../middleware/adminAuth"); // make sure this exists

// GET /api/admin/leave?status=...
router.get("/leave", authAdmin, async (req, res) => {
  const q = {};
  if (req.query.status) q.status = req.query.status;
  const items = await Leave.find(q)
    .sort({ requestedAt: -1 })
    .populate("tenantId", "name phone roomNo bedNo")
    .lean();
  res.json(items);
});

router.post("/leave/:id/approve", authAdmin, async (req, res) => {
  const doc = await Leave.findByIdAndUpdate(
    req.params.id,
    { status: "approved", decidedAt: new Date(), decidedBy: req.admin.id },
    { new: true }
  );
  if (!doc) return res.status(404).json({ message: "Not found" });
  res.json(doc);
});

router.post("/leave/:id/reject", authAdmin, async (req, res) => {
  const doc = await Leave.findByIdAndUpdate(
    req.params.id,
    { status: "rejected", decidedAt: new Date(), decidedBy: req.admin.id },
    { new: true }
  );
  if (!doc) return res.status(404).json({ message: "Not found" });
  res.json(doc);
});

// optional (for cleanups)
router.post("/leave/:id/cancel", authAdmin, async (req, res) => {
  const doc = await Leave.findByIdAndUpdate(
    req.params.id,
    { status: "cancelled", decidedAt: new Date(), decidedBy: req.admin.id },
    { new: true }
  );
  if (!doc) return res.status(404).json({ message: "Not found" });
  res.json(doc);
});

module.exports = router;
