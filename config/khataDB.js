const mongoose = require("mongoose");
const dotenv = require("dotenv");

dotenv.config();

const khataBookDB = mongoose.createConnection(process.env.MONGO_URI, {
  dbName: "khataBook",
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

khataBookDB.on("connected", () =>
  console.log("✅ Connected to khataBook Database")
);
khataBookDB.on("error", (err) =>
  console.error("❌ khataBook Database Error:", err)
);


module.exports = { khataBookDB };
