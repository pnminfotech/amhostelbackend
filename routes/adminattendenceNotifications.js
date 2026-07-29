// routes/adminNotifications.js
const router = require("express").Router();
const Notification = require("../models/Notification");
const authAdmin = require("../middleware/adminAuth");


// ⚠️ TEMPORARY: disable admin auth for testing
const adminOnly = (req, res, next) => next();

// ✅ GET all attendance-related notifications
router.get("/notifications/attendance", adminOnly, async (req, res, next) => {
  try {
    const docs = await Notification.find({
      type: "system",
      "payload.kind": { $regex: "^attendance_" }
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("tenantId", "name roomNo bedNo");

    res.json(docs);
  } catch (err) {
    next(err);
  }
});


// ✅ Mark notification as seen/acknowledged
router.post("/notifications/:id/seen", authAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    const doc = await Notification.findByIdAndUpdate(
      id,
     { $set: { read: true } }
      //{ new: true }
    );
    res.json({ ok: true, updated: doc });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
