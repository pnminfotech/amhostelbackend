const express = require("express");
const router = express.Router();
const { khataBookDB } = require("../config/khataDB");
const Maintenance = khataBookDB.model("Maintainance", require("../models/Maintainance"));
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
    const { schemaName } = req.params;
    let {dateName, personName, amount, phoneNo, work, gAmt, rAmt } = req.body;

    try {
        // Convert values to numbers
        amount = parseFloat(amount);
        gAmt = gAmt ? parseFloat(gAmt) : null;
        rAmt = rAmt ? parseFloat(rAmt) : null;

        // Calculate missing value
        if (gAmt !== null && rAmt === null) {
            rAmt = amount - gAmt;  // Remaining amount calculation
        } else if (rAmt !== null && gAmt === null) {
            gAmt = amount - rAmt;  // Given amount calculation
        }

        const newTransaction = { dateName ,personName, amount, phoneNo, work, tAmt: amount, gAmt, rAmt };

        const updatedSchema = await Maintenance.findOneAndUpdate(
            { schemaName },
            { $push: { transactions: newTransaction } },
            { new: true }
        );

        if (!updatedSchema) {
            return res.status(404).json({ message: "Schema not found" });
        }

        res.status(200).json({ message: "Transaction added successfully", updatedSchema });
    } catch (error) {
        res.status(500).json({ error: "Error adding transaction", details: error.message });
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

router.put("/transactions/update/:id", async (req, res) => {
    console.log("Received update request for ID:", req.params.id);
    console.log("Request body:", req.body);

    try {
        const { id } = req.params;
        const { dateName, personName, phoneNo, work, tAmt, gAmt, rAmt } = req.body;

        let newGAmt = gAmt !== undefined ? gAmt : tAmt - rAmt;
        let newRAmt = rAmt !== undefined ? rAmt : tAmt - gAmt;

        // Find the maintenance document that contains the transaction
        const maintenance = await Maintenance.findOne({ "transactions._id": id });

        if (!maintenance) {
            return res.status(404).json({ success: false, message: "Transaction not found" });
        }

        // Find and update the specific transaction in the array
        const transaction = maintenance.transactions.id(id);
        if (!transaction) {
            return res.status(404).json({ success: false, message: "Transaction not found in maintenance" });
        }

        transaction.dateName = dateName;
        transaction.personName = personName;
        transaction.phoneNo = phoneNo;
        transaction.work = work;
        transaction.tAmt = tAmt;
        transaction.gAmt = newGAmt;
        transaction.rAmt = newRAmt;

        await maintenance.save(); // Save the updated document

        res.json({ success: true, data: transaction });
    } catch (error) {
        console.error("Error updating transaction:", error);
        res.status(500).json({ success: false, message: "Server Error", error });
    }
});




module.exports = router;
