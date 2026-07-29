// models/Attendance.js
const mongoose = require("mongoose");

const point = new mongoose.Schema({
  lat: Number,
  lng: Number,
  accuracy: Number,
  address: String,
}, { _id: false });

const schema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true, index: true },
  dateKey: { type: String, required: true, index: true }, // "YYYY-MM-DD"

  status: { type: String, enum: ["pending", "checked_in", "checked_out"], default: "pending" },

  isLate: { type: Boolean, default: false },
  lateReason: String,
  lateReportedAt: Date,
  scheduledAt: Date, // user-entered expected date/time

  checkIn: { at: Date, where: point },
  checkOut: { at: Date, where: point },
}, { timestamps: true });


// const schema = new mongoose.Schema({
//   tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true, index: true },
//   dateKey: { type: String, required: true, index: true }, // "YYYY-MM-DD"

//   isLate: { type: Boolean, default: false },
//   lateReason: String,
//   lateReportedAt: Date,

//   checkIn: { at: Date, where: point },
//   checkOut: { at: Date, where: point },
// }, { timestamps: true });

schema.index({ tenantId: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", schema);
