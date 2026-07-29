const express = require('express');
const router = express.Router();
const { createOtherExpense, getAllOtherExpenses } = require('../controllers/otherExpenseController');
const OtherExpense = require('../models/OtherExpense')
// POST /api/other-expense/
router.post('/', createOtherExpense);

// GET /api/other-expense/
router.get('/all', getAllOtherExpenses);


// Update Other Expense
router.put('/:id', async (req, res) => {
  try {
    const otherExpense = await OtherExpense.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!otherExpense) return res.status(404).json({ message: 'Other Expense not found' });
    res.json(otherExpense);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete Other Expense
router.delete('/:id', async (req, res) => {
  try {
    const otherExpense = await OtherExpense.findByIdAndDelete(req.params.id);
    if (!otherExpense) return res.status(404).json({ message: 'Other Expense not found' });
    res.json({ message: 'Other Expense deleted successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
