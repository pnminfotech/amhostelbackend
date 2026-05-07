// function tryRequire(p) {
//   try { return require(p); } catch (_) { return null; }
// }

// // Put your actual file FIRST (the one you maintain):
// const candidates = [
//   './formModels',   // ✅ your real model file
//   './formModel',
//   './FormModel',
//   './forms',
//   './form',
//   './tenantForm',
//   './TenantForm',
// ];

// let mod = null;
// for (const rel of candidates) {
//   const m = tryRequire(rel);
//   if (m) { mod = m; break; }
// }

// if (!mod) {
//   throw new Error(
//     'models/Form.js shim could not find your real Form model. ' +
//     'Edit the candidates array to include the correct filename.'
//   );
// }

// module.exports = mod.default || mod; // ✅ only this export
const mongoose = require('mongoose');

const formSchema = new mongoose.Schema(
  {
    srNo: { type: Number, unique: true, required: true },

    name: { type: String, required: true },
    joiningDate: { type: Date, required: true },
    roomNo: { type: String },
    depositAmount: { type: Number, required: true },

    // main address
    address: { type: String, required: true },

    // ✅ add this – you are using relativeAddress in frontend
    relativeAddress: { type: String },

    phoneNo: { type: Number, required: true },

    // relative triplets
    relative1Relation: {
      type: String,
      enum: ["Self", "Sister", "Brother", "Father", "Husband", "Mother"],
      default: "Self",
    },
    relative1Name: { type: String, default: "" },
    relative1Phone: { type: String, default: "" },

    relative2Relation: {
      type: String,
      enum: ["Self", "Sister", "Brother", "Father", "Husband", "Mother"],
      default: "Self",
    },
    relative2Name: { type: String, default: "" },
    relative2Phone: { type: String, default: "" },

    floorNo: { type: String },
    bedNo: { type: String },
    companyAddress: { type: String },
    dateOfJoiningCollege: { type: Date, required: true },
    dob: { type: Date, required: true },

    baseRent: { type: Number },
    firstRentStatus: {
  type: String,
  enum: ["ADVANCE_PAID", "NOT_PAID"],
  default: "NOT_PAID",
},
    firstRentMonth: { type: String }, // e.g. "Jan-26"

    rentHistory: {
      type: [
        {
          effectiveFrom: { type: Date },
          roomNo: { type: String },
          bedNo: { type: String },
          baseRent: { type: Number },
          rentAmount: { type: Number },
          previousRoomNo: { type: String },
          previousBedNo: { type: String },
          previousBaseRent: { type: Number },
          previousRentAmount: { type: Number },
          source: { type: String },
        },
      ],
      default: [],
    },

 rents: {
  type: [
    {
      rentAmount: { type: Number },
      date: { type: Date },
      month: { type: String },
      paymentMode: {
        type: String,
        enum: ["Cash", "Online"],
        // default: "Cash",
      },
    },
  ],
  default: [],   // ✅ VERY IMPORTANT
},

    leaveDate: { type: String },
    leaveSettlement: {
      deductFromDeposit: { type: Boolean, default: false },
      selectedMonths: [{ type: String }],
      deductions: [
        {
          month: { type: String },
          amount: { type: Number, default: 0 },
          days: { type: Number, default: 0 },
          dailyRent: { type: Number, default: 0 },
          cycleRange: { type: String, default: "" },
        },
      ],
      grossDeposit: { type: Number, default: 0 },
      totalDeduction: { type: Number, default: 0 },
      refundableDeposit: { type: Number, default: 0 },
      amountDueFromTenant: { type: Number, default: 0 },
      note: { type: String, default: "" },
    },

    documents: [
      {
        fileName: { type: String },
        url: { type: String },
        fileId: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentFile" },
        contentType: { type: String },
        size: { type: Number },
        relation: {
          type: String,
          enum: [
            "Self",
            "Father",
            "Mother",
            "Husband",
            "Sister",
            "Brother",
            "Self Aadhaar Card",
            "Parent Aadhaar Card",
            "Tenant Photo",
          ],
          default: "Self",
        },
        photoTransform: {
          rotate: { type: Number, default: 0 },
          flipX: { type: Boolean, default: false },
          flipY: { type: Boolean, default: false },
        },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.models.Form || mongoose.model("Form", formSchema);
