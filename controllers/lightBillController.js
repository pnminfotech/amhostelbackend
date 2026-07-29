
// const LightBillEntry = require("../models/LightBillEntry");

// exports.createLightBill = async (req, res) => {
//   try {
//     const { roomNo, meterNo, totalReading, amount,status, date } = req.body;

//     const bill = new LightBillEntry({ roomNo, meterNo, totalReading, amount,status, date });
//     await bill.save();

//     res.status(201).json({ message: "Light bill saved successfully." });
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to save light bill." });
//   }
// };

// exports.getAllLightBills = async (req, res) => {
//   try {
//     const bills = await LightBillEntry.find().sort({ date: -1 });
//     res.json(bills);
//   } catch (error) {
//     console.error(error);
//     res.status(500).json({ message: "Failed to fetch light bills." });
//   }
// };






// const LightBillEntry = require("../models/LightBillEntry");

const LightBillEntry = require("../models/LightBillEntry");

exports.createLightBill = async (req, res) => {
  try {
    const {
      name,
      type,
      propertyType,
      roomNo,
      meterNo,
      totalReading,
      amount,
      salary,
      customLabel,
      status,
      date
    } = req.body;

    const entryDate = new Date(date);
    const startOfMonth = new Date(entryDate.getFullYear(), entryDate.getMonth(), 1);
    const endOfMonth = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 1);

    const filter = {
      name,
      propertyType: propertyType || "bed",
      roomNo: roomNo || "",
      date: { $gte: startOfMonth, $lt: endOfMonth }
    };

    const update = {
      name,
      type,
      propertyType: propertyType || "bed",
      roomNo,
      meterNo,
      totalReading,
      amount,
      salary,
      customLabel,
      status,
      date
    };

    const result = await LightBillEntry.findOneAndUpdate(
      filter,
      update,
      { upsert: true, new: true }
    );

    res.status(201).json({
      message: "Light bill entry saved successfully.",
      entry: result
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to save light bill entry." });
  }
};

exports.getAllLightBills = async (req, res) => {
  try {
    const bills = await LightBillEntry.find().sort({ date: -1 });
    res.json(bills);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to fetch light bill entries." });
  }
};
