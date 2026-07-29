const mongoose = require("mongoose");

const LeaveRequestSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true },
    tenantName: String,            // denormalized optional
    leaveDate: { type: Date, required: true },
    note: String,
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  },
  { timestamps: true }
);

module.exports = mongoose.models.LeaveRequest || mongoose.model("LeaveRequest", LeaveRequestSchema, "leaverequests");
