// // controllers/notifications.js
// import mongoose from "mongoose";
// import Leave from "../models/Leave.js";
// import Notification from "../models/Notification.js";

// export const approveLeave = async (req, res) => {
//   try {
//     if (mongoose.connection.readyState !== 1) {
//       return res.status(503).json({ error: "Database unavailable" });
//     }
//     const { id } = req.params; // leave id
//     const leave = await Leave.findByIdAndUpdate(
//       id,
//       { status: "approved" },
//       { new: true }
//     );
//     if (!leave) return res.status(404).json({ error: "Leave not found" });

//     await Notification.create({
//       type: "leave",
//       refId: id,
//       status: "approved",
//       title: "Leave approved",
//     });

//     return res.json({ ok: true, leave });
//   } catch (e) {
//     console.error("approveLeave:", e);
//     return res.status(500).json({ error: "Server error" });
//   }
// };

// export const rejectLeave = async (req, res) => {
//   try {
//     if (mongoose.connection.readyState !== 1) {
//       return res.status(503).json({ error: "Database unavailable" });
//     }
//     const { id } = req.params;
//     const leave = await Leave.findByIdAndUpdate(
//       id,
//       { status: "rejected" },
//       { new: true }
//     );
//     if (!leave) return res.status(404).json({ error: "Leave not found" });

//     await Notification.create({
//       type: "leave",
//       refId: id,
//       status: "rejected",
//       title: "Leave rejected",
//     });

//     return res.json({ ok: true, leave });
//   } catch (e) {
//     console.error("rejectLeave:", e);
//     return res.status(500).json({ error: "Server error" });
//   }
// };




// controllers/notifications.js
const mongoose = require("mongoose");
const LeaveRequest = require("../models/LeaveRequest"); // make sure path matches
const Notification = require("../models/Notification");
const Form = require("../models/formModels");

exports.approveLeave = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const { id } = req.params; // LeaveRequest _id
    const leave = await LeaveRequest.findByIdAndUpdate(
      id,
      { status: "approved" },
      { new: true }
    );
    if (!leave) return res.status(404).json({ error: "Leave not found" });

    // ✅ Apply to tenant so it shows in your Actions column
    await Form.findByIdAndUpdate(
      leave.tenant,
      { leaveDate: leave.date },
      { new: true }
    );

    // ✅ Flip ALL related notifications (if multiple were created)
    await Notification.updateMany(
      {
        type: "leave_request",
        tenantId: leave.tenant,
        leaveDate: leave.date,          // helps target the right ones
        status: "pending",
      },
      { status: "approved", read: true }
    );

    res.json({ ok: true, leave });
  } catch (e) {
    console.error("approveLeave:", e);
    res.status(500).json({ error: "Server error" });
  }
};

exports.rejectLeave = async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: "Database unavailable" });
    }

    const { id } = req.params;
    const leave = await LeaveRequest.findByIdAndUpdate(
      id,
      { status: "rejected" },
      { new: true }
    );
    if (!leave) return res.status(404).json({ error: "Leave not found" });

    await Notification.updateMany(
      {
        type: "leave_request",
        tenantId: leave.tenant,
        leaveDate: leave.date,
        status: "pending",
      },
      { status: "rejected", read: true }
    );

    res.json({ ok: true, leave });
  } catch (e) {
    console.error("rejectLeave:", e);
    res.status(500).json({ error: "Server error" });
  }
};
