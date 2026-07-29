// routes/adminNotificationRoutes.js
const express = require("express");
const router = express.Router();
const LeaveNotification = require("../models/LeaveNotification");

// TODO: swap for your real admin middleware
const requireAdmin = (req, _res, next) => {
  req.admin = { id: "admin1" };
  next();
};

// List recent notifications (unread first because of sort by createdAt)
router.get("/notifications", requireAdmin, async (_req, res) => {
  const list = await LeaveNotification.find().sort({ createdAt: -1 }).limit(100).lean();
  res.json(list);
});

// Mark as read
router.patch("/notifications/:id/read", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const doc = await LeaveNotification.findByIdAndUpdate(id, { isRead: true }, { new: true });
  if (!doc) return res.status(404).json({ message: "Not found" });
  res.json(doc);
});

// Unread badge count
router.get("/notifications/unread-count", requireAdmin, async (_req, res) => {
  const count = await LeaveNotification.countDocuments({ isRead: false });
  res.json({ count });
});

module.exports = router;
