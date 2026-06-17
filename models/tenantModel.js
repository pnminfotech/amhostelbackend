const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    // You can adjust these fields to match what you use in your app
    srNo: { type: Number },        // tenant serial number
    name: { type: String, required: true },
    roomNo: { type: String },
    bedNo: { type: String },
    mobile: { type: String },
    email: { type: String },
    address: { type: String },
    aadhaarNo: { type: String },
    joinDate: { type: Date },
    leaveDate: { type: Date },
    status: {
      type: String,
      enum: ["active", "left"],
      default: "active",
    },
    canteen: {
      type: String,
      enum: ["yes", "no"],
      default: "no",
    },
  },
  { timestamps: true }
);

// Model name "Tenant" (this is what other files will use)
module.exports = mongoose.model("Tenant", tenantSchema);
