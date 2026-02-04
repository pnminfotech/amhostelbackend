// const mongoose = require('mongoose');

// const formSchema = new mongoose.Schema(
//   {
//     // Sr No (Unique)
//     srNo: { type: Number, unique: true, required: true },

//     // Basic info
//     name: { type: String, required: true },
//     joiningDate: { type: Date, required: true },
//     roomNo: { type: String },
//     depositAmount: { type: Number, required: true },

//     // Main address
//     address: { type: String, required: true },

//     // Phone as string (keeps leading zeros)
//     phoneNo: { type: String, required: true },

//     // Relative 1
//     relative1Name: { type: String, default: "" },
//     relative1Address: { type: String, default: "" },
//     relative1Phone: { type: String, default: "" },

//     // Relative 2
//     relative2Name: { type: String, default: "" },
//     relative2Address: { type: String, default: "" },
//     relative2Phone: { type: String, default: "" },

//     floorNo: { type: String },
//     bedNo: { type: String },
//     companyAddress: { type: String },

//     baseRent: { type: Number },

//     // ✅ Rents array — FIXED: month is now optional (was required)
//     rents: {
//       type: [
//         {
//           rentAmount: { type: Number, default: 0 }, // paid amount
//           date: { type: Date },                     // actual payment date

//           // IMPORTANT FIX ↓↓↓
//           month: { type: String, default: null },   // Was required:true → now safe

//           paymentMode: {
//             type: String,
//             enum: ["Cash", "Online"],
//             default: "Cash",
//           },
//         },
//       ],
//       default: [],
//     },

//     // Leave date (string used by your frontend logic)
//     leaveDate: { type: String },

//     // Documents
//     documents: [
//       {
//         fileName: { type: String },

//         // Legacy disk link
//         url: { type: String },

//         // New DB fields
//         fileId: { type: mongoose.Schema.Types.ObjectId, ref: "DocumentFile" },
//         contentType: { type: String },
//         size: { type: Number },
//         relation: {
//           type: String,
//           enum: ["Self", "Father", "Mother", "Husband", "Sister", "Brother"],
//           default: "Self",
//         },
//       },
//     ],
//   },
//   { timestamps: true }
// );

// module.exports = mongoose.model('Form', formSchema);


const mongoose = require("mongoose");

const formSchema = new mongoose.Schema(
  {
    srNo: { type: Number, unique: true, required: true },

    name: { type: String, required: true },
    joiningDate: { type: Date, required: true },
    roomNo: { type: String },
    depositAmount: { type: Number, required: true },

    // main address stays
    address: { type: String, required: false },

    phoneNo: { type: Number, required: true },

    // ⛔ removed address text fields for relatives as per your request
    // relativeAddress1: { type: String },
    // relativeAddress2: { type: String },

    // ✅ relative contact triplets (relation + name + phone)
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
    dateOfJoiningCollege: { type: Date, required: false },
    dob: { type: Date, required: false },

    baseRent: { type: Number },
    firstRentStatus: {
  type: String,
  enum: ["ADVANCE_PAID", "NOT_PAID"],
  default: "NOT_PAID",
},
firstRentMonth: { type: String }, // e.g. "Jan-26"

    rents: [
      {
        rentAmount: { type: Number, required: true },
        date: { type: Date, required: true }, // payment date
        month: { type: String, required: true }, // "Dec-25"
        paymentMode: {
          type: String,
          enum: ["Cash", "Online"],
          // default: "Cash",
          required: true,
        },
        default: [],
      },
      
    ],

    leaveDate: { type: String },

    // ✅ Updated: supports both legacy disk URLs and DB-backed files
  documents: [
  {
    fileName: { type: String },

    // ✅ ImageKit direct URL
    url: { type: String },

    // ✅ ImageKit fileId is STRING (not ObjectId)
    fileId: { type: String },

    // ✅ Optional but useful (ImageKit filePath)
    filePath: { type: String },

    contentType: { type: String },
    size: { type: Number },

    // keep relation simple (or keep your enum if you want)
    relation: { type: String, default: "Document" },
  },
],

  },
  { timestamps: true }
);

module.exports = mongoose.model("Form", formSchema);
