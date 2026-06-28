// config/db.js  (COMMONJS VERSION)
const mongoose = require("mongoose");
const Form = require("../models/formModels");
const { getMongoOptions, getMongoUri } = require("./mongoOptions");

async function dropObsoleteBedUniqueIndexes() {
  try {
    const indexes = await Form.collection.indexes();
    const obsolete = indexes.filter((idx) => {
      if (!idx.unique || !idx.key) return false;

      const keys = Object.keys(idx.key).sort();
      const isRoomBed = keys.length === 2 && keys[0] === "bedNo" && keys[1] === "roomNo";
      const isCategoryRoomBed =
        keys.length === 3 &&
        keys[0] === "bedNo" &&
        keys[1] === "category" &&
        keys[2] === "roomNo";

      return isRoomBed || isCategoryRoomBed;
    });

    for (const idx of obsolete) {
      await Form.collection.dropIndex(idx.name);
      console.log(`Dropped obsolete Form bed unique index: ${idx.name}`);
    }
  } catch (err) {
    console.error("Failed to clean obsolete Form bed indexes:", err.message);
  }
}

async function connectDB() {
  const uri = getMongoUri();
  if (!uri) {
    console.error("MONGO_URI missing in .env");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, getMongoOptions());
    console.log("DB Connected");
    await dropObsoleteBedUniqueIndexes();
  } catch (err) {
    // Do NOT crash the process; log and keep server running
    console.error("DB connect failed:", err.message);
    if (err?.code === "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR" || /SSL|TLS/i.test(err?.message || "")) {
      console.error(
        "Mongo TLS hint: check Atlas Network Access IP whitelist, cluster status, and MONGO_URI credentials."
      );
    }
  }
}

module.exports = { connectDB };
