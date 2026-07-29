const express = require("express");
const router = express.Router();
const Maintenance = require("../models/Maintenance");

// Create a new schema
router.post("/create", async (req, res) => {
    try {
        const { schemaName, month } = req.body;
        const newSchema = new Maintenance({ schemaName, month, transactions: [] });
        await newSchema.save();
        res.status(201).json({ message: "Schema created successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Fetch all schemas
router.get("/", async (req, res) => {
    try {
        const schemas = await Maintenance.find();
        res.json(schemas);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add a transaction
router.post("/add-transaction/:schemaName", async (req, res) => {
    try {
        const { personName, amount, phoneNo, work } = req.body;
        const schemaName = req.params.schemaName;
        
        const schema = await Maintenance.findOne({ schemaName });
        if (!schema) return res.status(404).json({ error: "Schema not found" });

        // Add new transaction
        schema.transactions.push({ personName, amount, phoneNo, work });
        
        // Recalculate total amounts
        schema.tAmt = schema.transactions.reduce((acc, t) => acc + t.amount, 0);
        schema.rAmt = schema.tAmt - schema.gAmt;

        await schema.save();
        res.json({ message: "Transaction added successfully", schema });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get total amount for a schema
router.get("/total/:schemaName", async (req, res) => {
    try {
        const schema = await Maintenance.findOne({ schemaName: req.params.schemaName });
        if (!schema) return res.status(404).json({ error: "Schema not found" });

        const total = schema.transactions.reduce((acc, t) => acc + t.amount, 0);
        res.json({ total });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a schema
router.delete("/delete/:schemaName", async (req, res) => {
    try {
        await Maintenance.findOneAndDelete({ schemaName: req.params.schemaName });
        res.json({ message: "Schema deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete a transaction
router.delete("/delete-transaction/:schemaName/:transactionId", async (req, res) => {
    try {
        const { schemaName, transactionId } = req.params;
        const schema = await Maintenance.findOne({ schemaName });

        if (!schema) return res.status(404).json({ error: "Schema not found" });

        schema.transactions = schema.transactions.filter(t => t._id.toString() !== transactionId);

        // Recalculate total amounts
        schema.tAmt = schema.transactions.reduce((acc, t) => acc + t.amount, 0);
        schema.rAmt = schema.tAmt - schema.gAmt;

        await schema.save();
        res.json({ message: "Transaction deleted successfully" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
