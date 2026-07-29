const OtherExpense = require('../models/OtherExpense');

// POST: Create new expense
const createOtherExpense = async (req, res) => {
  try {
    const { roomNo, propertyType, mainAmount, expenses, date, status } = req.body;

    const newExpense = new OtherExpense({ roomNo, propertyType, mainAmount, expenses, date, status });
    await newExpense.save();

    res.status(201).json({ message: "Other expense saved successfully", data: newExpense });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// GET: Fetch all other expenses
const getAllOtherExpenses = async (req, res) => {
  try {
    const expenses = await OtherExpense.find().sort({ date: -1 });
    res.status(200).json(expenses);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch other expenses", details: error.message });
  }
};

module.exports = {
  createOtherExpense,
  getAllOtherExpenses,
};
