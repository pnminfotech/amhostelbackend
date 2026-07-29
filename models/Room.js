// models/Room.js
const mongoose = require("mongoose");

const BedSchema = new mongoose.Schema(
  {
    bedNo: { type: String, required: true },
    bedCategory: { type: String, default: "" }, // ✅ NEW field
    price: { type: Number, default: null },     // optional
  },
  { _id: false }
);

const RoomSchema = new mongoose.Schema(
  {
    propertyType: {
      type: String,
      enum: ["bed", "room", "shop"],
      default: "bed",
    },
    category: { type: String, required: true }, // e.g. Fuge Building, Boys, Girls
    hasWing: { type: Boolean, default: false },
    wingName: { type: String, default: "" },
    floorNo: { type: String, required: true },  // e.g. Ground, 1, 2nd, Basement
    flatType: { type: String, default: "" },
    roomNo: { type: String, required: true },
    beds: { type: [BedSchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Room", RoomSchema);
