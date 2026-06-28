const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { getMongoOptions, getMongoUri } = require("./mongoOptions");

dotenv.config();

const khataBookDB = mongoose.createConnection(getMongoUri(), getMongoOptions({
  dbName: "khataBook",
}));

khataBookDB.on("connected", () =>
  console.log("✅ Connected to khataBook Database")
);
khataBookDB.on("error", (err) =>
  console.error("❌ khataBook Database Error:", err)
);


module.exports = { khataBookDB };
