const express = require("express");
const StaffExpense = require("../models/StaffExpense");

const router = express.Router();

// GET ALL
router.get("/all", async (req, res) => {
  try {
    const list = await StaffExpense.find().sort({ date: -1, createdAt: -1 });
    res.json(list);
  } catch (e) {
    res.status(500).json({ message: "Failed to load staff expenses", error: e.message });
  }
});

// CREATE
router.post("/", async (req, res) => {
  try {
    const { type, name, amount, notes, status, date } = req.body;

    if (!type || !name || amount === undefined || !date) {
      return res.status(400).json({ message: "type, name, amount, date are required" });
    }

    const doc = await StaffExpense.create({
      type,
      name: String(name).trim(),
      amount: Number(amount),
      notes: notes || "",
      status: status || "pending",
      date: new Date(date),
    });

    res.status(201).json(doc);
  } catch (e) {
    res.status(500).json({ message: "Failed to save staff expense", error: e.message });
  }
});

// UPDATE
router.put("/:id", async (req, res) => {
  try {
    const updated = await StaffExpense.findByIdAndUpdate(
      req.params.id,
      { ...req.body, date: new Date(req.body.date) },
      { new: true }
    );
    if (!updated) return res.status(404).json({ message: "Expense not found" });
    res.json(updated);
  } catch (e) {
    res.status(500).json({ message: "Failed to update staff expense", error: e.message });
  }
});

// DELETE
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await StaffExpense.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: "Expense not found" });
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: "Failed to delete staff expense", error: e.message });
  }
});

module.exports = router;
