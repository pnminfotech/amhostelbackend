const LeaveRequest = require("../models/LeaveRequest");

// 🟢 Create a new leave request
const createLeaveRequest = async (req, res) => {
  try {
    const tenantId = req.user?._id || req.headers["x-tenant-id"];
    if (!tenantId) return res.status(401).json({ message: "Unauthorized" });

    const { leaveDate, note } = req.body;
    if (!leaveDate)
      return res.status(400).json({ message: "Leave date is required." });

   const newLeave = new LeaveRequest({ tenantId, leaveDate, note });


    await newLeave.save();
    res.status(201).json({ message: "Leave request submitted.", leave: newLeave });
  } catch (err) {
    console.error("Error creating leave:", err);
    res.status(500).json({ message: "Server error while submitting leave." });
  }
};

// 🟣 Get all leave requests for a specific tenant
const getTenantLeaves = async (req, res) => {
  try {
    const tenantId = req.user?._id || req.headers["x-tenant-id"];
    if (!tenantId) return res.status(401).json({ message: "Unauthorized" });

    const leaves = await LeaveRequest.find({ tenant: tenantId })
      .sort({ requestedAt: -1 });

    res.json(leaves);
  } catch (err) {
    console.error("Error fetching leaves:", err);
    res.status(500).json({ message: "Failed to fetch leave requests." });
  }
};

module.exports = { createLeaveRequest, getTenantLeaves };
