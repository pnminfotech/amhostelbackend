const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { getMongoOptions, getMongoUri } = require("./mongoOptions");

dotenv.config();

const projectDB = mongoose.createConnection(getMongoUri(), getMongoOptions({
  dbName: "Project",
}));

projectDB.on("connected", () =>
  console.log("✅ Connected to Project Database")
);
projectDB.on("error", (err) =>
  console.error("❌ Project Database Error:", err)
);

// Export connection object
module.exports = { projectDB } ;
