// routes/tenantActions.js
const express = require("express");
const router = express.Router();
const Form = require("../models/formModels");
const { createNotification } = require("./notifications");


   
// tenant reports a payment
router.post("/tenant/payments/report", async (req, res) => {
  const { tenantId, amount, month, year, utr, note, receiptUrl } = req.body;
  if (!tenantId || !amount) return res.status(400).json({ error: "tenantId and amount are required" });

  const tenant = await Form.findById(tenantId);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  const n = await createNotification({
    type: "payment_report",
    tenantId,
    title: "Payment reported",
    message: `${tenant.name} reported a payment of ₹${Number(amount).toLocaleString("en-IN")}.`,
    meta: { amount, month, year, utr, note, receiptUrl }
  });

  res.status(201).json(n);
});

// tenant requests leave
router.post("/tenant/leave/request", async (req, res) => {
  const { tenantId, leaveDate, note } = req.body;
  if (!tenantId || !leaveDate) return res.status(400).json({ error: "tenantId and leaveDate are required" });

  const tenant = await Form.findById(tenantId);
  if (!tenant) return res.status(404).json({ error: "Tenant not found" });

  // store “requested” date (optional)
  tenant.leaveRequestDate = leaveDate;
  await tenant.save();

  const n = await createNotification({
    type: "leave_request",
    tenantId,
    title: "Leave request",
    message: `${tenant.name} requested to leave on ${leaveDate}.`,
    meta: { leaveDate, note }
  });

  res.status(201).json(n);
});

module.exports = router;
