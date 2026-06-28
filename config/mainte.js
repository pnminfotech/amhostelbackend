const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { getMongoOptions, getMongoUri } = require("./mongoOptions");

dotenv.config();

const suppliersDB = mongoose.createConnection(getMongoUri(), getMongoOptions({
  dbName: "Suppliers",
}));

suppliersDB.on("connected", () =>
  console.log("✅ Connected to Suppliers Database")
);
suppliersDB.on("error", (err) =>
  console.error("❌ Suppliers Database Error:", err)
);

// Export connection object
module.exports = { suppliersDB };
