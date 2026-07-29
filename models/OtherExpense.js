const mongoose = require('mongoose');

const otherExpenseSchema = new mongoose.Schema({
  roomNo: { type: String, default: "" },
  propertyType: {
    type: String,
    enum: ["bed", "room", "shop"],
    default: "bed",
  },
    mainAmount: {
    type: Number,
    required: true,
  },
  expenses: {
    type: [String],
    required: true,
  },
  date: {
    type: Date,
    required: true,
  },
   status: {
    type: String,
    enum: ['paid', 'pending'],
    default: 'pending'
  },
}, {
  timestamps: true
});

module.exports = mongoose.model('OtherExpense', otherExpenseSchema);
