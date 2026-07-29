const mongoose = require("mongoose");

const staffExpenseSchema = new mongoose.Schema(
  {
    type: { type: String, required: true },   // Employee, Cleaning Lady...
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    notes: { type: String, default: "" },
    status: { type: String, enum: ["pending", "paid"], default: "pending" },
    date: { type: Date, required: true },     // store YYYY-MM-01
  },
  { timestamps: true }
);

staffExpenseSchema.index({ date: 1, type: 1, name: 1 });

module.exports = mongoose.model("StaffExpense", staffExpenseSchema);
