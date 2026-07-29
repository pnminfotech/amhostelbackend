// // models/Invite.js  (CJS)
// const mongoose = require("mongoose");

// const InviteSchema = new mongoose.Schema(
//   {
//     token: { type: String, unique: true, index: true, required: true },

//     // optional prefill/lock data
//     name: String,
//     phoneNo: String,
//     roomNo: String,
//     bedNo: String,
//     baseRent: Number,
//     rentAmount: Number,
//     depositAmount: Number,

//     // bookkeeping
//     createdBy: { type: String }, // optional
//     expiresAt: {
//       type: Date,
//       default: () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
//     },
//     usedAt: { type: Date, default: null },
//     usedByFormId: { type: mongoose.Schema.Types.ObjectId, ref: "Form" },
//   },
//   { timestamps: true }
// );

// // TTL for unused expired invites (usedAt=null)
// InviteSchema.index(
//   { expiresAt: 1 },
//   { expireAfterSeconds: 0, partialFilterExpression: { usedAt: null } }
// );

// module.exports = mongoose.model("Invite", InviteSchema);

const mongoose = require("mongoose");

const InviteSchema = new mongoose.Schema(
  {
    token: { type: String, unique: true, index: true, required: true },

    // Prefilled fields (optional)
    prefill: { type: mongoose.Schema.Types.Mixed, default: {} },

    usedAt: { type: Date, default: null },
    usedByFormId: { type: mongoose.Schema.Types.ObjectId, ref: "Form" },

    // No expiry by default (link valid until used)
    expiresAt: {
      type: Date,
      default: null,
      required: false,
    },
  },
  { timestamps: true }
);

// Auto delete expired, unused invites (only when expiresAt is set)
InviteSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { usedAt: null, expiresAt: { $type: "date" } },
  }
);

module.exports = mongoose.model("Invite", InviteSchema);
