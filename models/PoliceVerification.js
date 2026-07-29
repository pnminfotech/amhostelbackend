// models/PoliceVerification.js
const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    action: String,  // init | ack-update | submit
    note: String
  },
  { _id: false }
);

const policeVerificationSchema = new mongoose.Schema(
  {
    tenant: { type: mongoose.Schema.Types.ObjectId, ref: "Tenant", index: true, required: true },
    ackNumber: String,
    ackDate: Date,
    status: { type: String, enum: ["DRAFT", "SUBMITTED"], default: "DRAFT", index: true },
    history: [eventSchema],
  },
  { timestamps: true }
);

// helpful index if you search by ack number
policeVerificationSchema.index({ ackNumber: 1 });

module.exports = mongoose.model("PoliceVerification", policeVerificationSchema);




