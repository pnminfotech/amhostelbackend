const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  phone: { type: String, required: true, index: true },
  code:  { type: String, required: true },
  // Make it optional OR give a default:
  // purpose: { type: String }, // optional
  purpose: { type: String, default: 'tenant_login' }, // with default
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true });

module.exports = mongoose.model('OtpSession', otpSchema);
