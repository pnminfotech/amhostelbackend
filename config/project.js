const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const projectDB = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "Project",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

projectDB.on("connected", () =>
  console.log("✅ Connected to Project Database")
);
projectDB.on("error", (err) =>
  console.error("❌ Project Database Error:", err)
);

// Export connection object
module.exports = { projectDB } ;
