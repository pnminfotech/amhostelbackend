const mongoose = require("mongoose");

// const LightBillEntrySchema = new mongoose.Schema({
//   roomNo: { type: String, required: true },
//   meterNo: { type: String, required: true },
//   totalReading: { type: Number, required: true },
//   amount: { type: Number, required: true },
//    status: {
//     type: String,
//     enum: ['paid', 'pending'],
//     default: 'pending'
//   },
//   date: { type: Date, required: true },
// });

// module.exports = mongoose.model("LightBillEntry", LightBillEntrySchema);




const LightBillEntrySchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., "Meter 101" or "Maushi"
  type: { type: String, enum: ['meter', 'maushi', 'custom'], required: true },
  propertyType: {
    type: String,
    enum: ["bed", "room", "shop"],
    default: "bed",
  },
  roomNo: { type: String },
  meterNo: { type: String },
  totalReading: { type: Number },
  amount: { type: Number },
  salary: { type: Number },
  customLabel: { type: String },
  status: { type: String, enum: ['paid', 'pending'], default: 'pending' },
  date: { type: Date, required: true }
});
module.exports = mongoose.model("LightBillEntry", LightBillEntrySchema);
