// routes/adminLeaveActions.js
const express = require("express");
const router = express.Router();
const { approveLeave, rejectLeave } = require("../controllers/notifications");
// TODO: add admin auth middleware if you have it
router.post("/leave/approve/:id", approveLeave);
router.post("/leave/reject/:id", rejectLeave);
module.exports = router;

// server.js
app.use("/api", require("./routes/adminLeaveActions"));
