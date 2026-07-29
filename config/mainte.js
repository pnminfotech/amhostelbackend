const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const suppliersDB = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Suppliers",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

suppliersDB.on("connected", () =>
  console.log("✅ Connected to Suppliers Database")
);
suppliersDB.on("error", (err) =>
  console.error("❌ Suppliers Database Error:", err)
);

// Export connection object
module.exports = { suppliersDB };
