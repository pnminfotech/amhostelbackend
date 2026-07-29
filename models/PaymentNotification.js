const mongoose = require("mongoose");
const { Schema } = mongoose;

const PaymentNotificationSchema = new Schema({
  tenantId: { type: Schema.Types.ObjectId, ref: "Form", required: true },
  paymentId:{ type: Schema.Types.ObjectId, ref: "Payment", required: true },
  amount:   { type: Number, required: true },
  month:    { type: Number },  // 1..12
  year:     { type: Number },
  utr:      { type: String },
  note:     { type: String },
  status:   { type: String, enum: ["pending","approved","rejected"], default: "pending" },
  read:     { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("PaymentNotification", PaymentNotificationSchema);
