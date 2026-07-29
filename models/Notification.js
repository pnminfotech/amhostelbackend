// // models/Notification.js
// const mongoose = require("mongoose");

// const notificationSchema = new mongoose.Schema(
//   {
//     // 👇 add "system" so admin->tenant messages are valid
//     type: { type: String, enum: ["payment_report", "leave_request", "system"], required: true },

//     tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true },
//     tenantName: String,
//     roomNo: String,
//     bedNo: String,

//     // payment fields
//     amount: Number,
//     month: Number, // 1..12
//     year: Number,
//     utr: String,
//     note: String,
//     receiptUrl: String,

//     // leave fields
//     leaveDate: Date,

//     // 👇 add "sent" so system messages don't violate enum
//     status: { type: String, enum: ["pending", "approved", "rejected", "sent"], default: "pending" },
//     read: { type: Boolean, default: false },
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model("Notification", notificationSchema);



// models/Notification.js
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  type: { type: String, enum: ["payment_report", "leave_request", "system"], required: true },

  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true },
  tenantName: String,
  roomNo: String,
  bedNo: String,

  // payment fields (existing)
  amount: Number,
  month: Number,
  year: Number,
  utr: String,
  note: String,
  receiptUrl: String,

  // leave (existing)
  leaveDate: Date,

  // ✅ NEW: free-form payload for attendance/system messages
  payload: mongoose.Schema.Types.Mixed,   // { kind, whenISO, where:{lat,lng,accuracy}, reason, dateKey }

  status: { type: String, enum: ["pending", "approved", "rejected", "sent"], default: "pending" },
  read: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
