const mongoose = require("mongoose");

const TransactionSchema = new mongoose.Schema({
    dateName : { type: Date, required: true },
    personName: { type: String, required: true },
    amount: { type: Number, required: true },
    phoneNo: { type: String, required: true }, // Changed from Number to String
    work: { type: String, required: true },
    tAmt: { type: Number}, // Total amount (sum of all transactions)
    gAmt: { type: Number}, // Given amount (amount paid)
    rAmt: { type: Number}  // Remaining amount
});

const MaintenanceSchema = new mongoose.Schema({
    schemaName: { type: String, required: true, unique: true },
    month: { type: String, required: true },
    transactions: [TransactionSchema]
});

module.exports =  MaintenanceSchema;
