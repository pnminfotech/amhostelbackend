// const express = require("express");
// const router = express.Router();
// const { createLightBill, getAllLightBills } = require("../controllers/lightBillController");
// const User = require('../models/userModel');
// // const jwt = require('jsonwebtoken');
// const bcrypt = require('bcryptjs');
// const LightBillEntry = require("../models/LightBillEntry");
// router.post("/", createLightBill);
// router.get("/all", getAllLightBills);


// // Update Light Bill
// router.put('/:id', async (req, res) => {
//   try {
//     const lightBill = await LightBillEntry.findByIdAndUpdate(req.params.id, req.body, { new: true });
//     if (!lightBill) return res.status(404).json({ message: 'Light Bill not found' });
//     res.json(lightBill);
//   } catch (err) {
//     res.status(400).json({ message: err.message });
//   }
// });

// // Delete Light Bill
// router.delete('/:id', async (req, res) => {
//   try {
//     const lightBill = await LightBillEntry.findByIdAndDelete(req.params.id);
//     if (!lightBill) return res.status(404).json({ message: 'Light Bill not found' });
//     res.json({ message: 'Light Bill deleted successfully' });
//   } catch (err) {
//     res.status(400).json({ message: err.message });
//   }
// });




// // Example Express route in your backend
// router.get('/all-bills', async (req, res) => {
//   try {
//     const { month, year } = req.query;

//     const query = {};
//     if (month && year) {
//       const startDate = new Date(year, month - 1, 1); // month is 0-indexed
//       const endDate = new Date(year, month, 0, 23, 59, 59, 999);
//       query.date = { $gte: startDate, $lte: endDate };
//     }

//     const bills = await LightBillEntry.find(query).sort({ date: -1 });
//     res.json(bills);
//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Server Error");
//   }
// });

// module.exports = router;






const express = require("express");
const router = express.Router();
const {
  createLightBill,
  getAllLightBills
} = require("../controllers/lightBillController");
const LightBillEntry = require("../models/LightBillEntry");

// Routes
router.post("/", createLightBill);
router.get("/all", getAllLightBills);

// Update
router.put('/:id', async (req, res) => {
  try {
    const lightBill = await LightBillEntry.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!lightBill) return res.status(404).json({ message: 'Light Bill not found' });
    res.json(lightBill);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete
router.delete('/:id', async (req, res) => {
  try {
    const lightBill = await LightBillEntry.findByIdAndDelete(req.params.id);
    if (!lightBill) return res.status(404).json({ message: 'Light Bill not found' });
    res.json({ message: 'Light Bill deleted successfully' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Get by month & year (optional)
router.get('/all-bills', async (req, res) => {
  try {
    const { month, year } = req.query;
    const query = {};
    if (month && year) {
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59, 999);
      query.date = { $gte: startDate, $lte: endDate };
    }

    const bills = await LightBillEntry.find(query).sort({ date: -1 });
    res.json(bills);
  } catch (error) {
    console.error(error);
    res.status(500).send("Server Error");
  }
});

module.exports = router;
