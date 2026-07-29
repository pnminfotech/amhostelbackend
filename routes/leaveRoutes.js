// const express = require("express");
// const { createLeaveRequest, getTenantLeaves } = require("../controllers/leaveController");
// const authTenant = require("../middleware/tenantAuth");

// const router = express.Router();

// router.post("/tenant/leave", authTenant, createLeaveRequest);
// router.get("/tenant/leave", authTenant, getTenantLeaves);

// module.exports = router;


// routes/leaveRoutes.js
const express = require("express");
const router = express.Router();
const LeaveRequest = require("../models/LeaveRequest");
const authTenant = require("../middleware/tenantAuth");

// Create a new leave (Tenant)
router.post("/", authTenant, async (req, res) => {
  try {
    // accept both styles
  const { leaveDate, note, date, reason } = req.body;
  const when = leaveDate || date;
  const why  = note ?? reason;
  if (!when || !why) {
    return res.status(400).json({ message: "leaveDate/date and note/reason are required" });
  }

    const doc = await LeaveRequest.create({
      tenant: req.tenant._id,         // <-- from your middleware
      leaveDate: new Date(when),
    note: String(why).trim(),
    });

    res.status(201).json(doc);
  } catch (e) {
    console.error("Create leave error:", e);
    res.status(500).json({ message: "Failed to create leave" });
  }
});

// List my leaves (Tenant)
router.get("/", authTenant, async (req, res) => {
  try {
    const list = await LeaveRequest.find({ tenant: req.tenant._id })
      .sort({ createdAt: -1 });
    res.json(list);
  } catch (e) {
    console.error("List leave error:", e);
    res.status(500).json({ message: "Failed to fetch leaves" });
  }
});

module.exports = router;
