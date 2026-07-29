const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  fileName: String,
  contentType: String,
  size: Number,
  data: Buffer,
}, { timestamps: true });
module.exports = mongoose.model("DocumentFile", schema);
