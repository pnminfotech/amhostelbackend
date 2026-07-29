const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  label: String,
  amount: Number
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Form', index: true, required: true },
  period: { type: String, required: true },           // 'YYYY-MM'
  dueDate: { type: Date, required: true },
  amount: { type: Number, required: true },           // total (sum of items)
  items: [invoiceItemSchema],
  status: { type: String, enum: ['open','paid','partial','void'], default: 'open', index: true },
  note: { type: String },                              // e.g. "Hostel Rent Sep 2025"
  lastPaidAt: { type: Date }
}, { timestamps: true });

invoiceSchema.index({ tenantId: 1, period: 1 }, { unique: true });

module.exports = mongoose.model('Invoice', invoiceSchema);
