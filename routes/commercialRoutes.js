const express = require("express");
const router = express.Router();

const CommercialUnit = require("../models/CommercialUnit");
const Form = require("../models/Form");

function normalizeUnitType(value) {
  return String(value || "").trim().toLowerCase() === "shop" ? "shop" : "room";
}

router.get("/", async (_req, res) => {
  try {
    const units = await CommercialUnit.find().sort({
      category: 1,
      buildingName: 1,
      floorNo: 1,
      unitNo: 1,
    });
    res.json(units);
  } catch (err) {
    console.error("get commercial units error:", err);
    res.status(500).json({ message: "Failed to fetch commercial units" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { category, buildingName, floorNo, unitNo, unitType, price } = req.body || {};

    if (!category || !buildingName || !unitNo) {
      return res
        .status(400)
        .json({ message: "category, buildingName and unitNo are required" });
    }

    const payload = {
      category: String(category).trim(),
      buildingName: String(buildingName).trim(),
      floorNo: String(floorNo || "").trim(),
      unitNo: String(unitNo).trim(),
      unitType: normalizeUnitType(unitType),
      price:
        price === "" || price == null || Number.isNaN(Number(price))
          ? null
          : Number(price),
    };

    const created = await CommercialUnit.create(payload);
    res.status(201).json(created);
  } catch (err) {
    console.error("create commercial unit error:", err);
    if (err?.code === 11000) {
      return res
        .status(400)
        .json({ message: "This room/shop already exists in that building" });
    }
    res.status(500).json({ message: "Failed to create commercial unit" });
  }
});

router.put("/:unitId", async (req, res) => {
  try {
    const { unitId } = req.params;
    const { category, buildingName, floorNo, unitNo, unitType, price } = req.body || {};

    const update = {};
    if (category != null) update.category = String(category).trim();
    if (buildingName != null) update.buildingName = String(buildingName).trim();
    if (floorNo != null) update.floorNo = String(floorNo).trim();
    if (unitNo != null) update.unitNo = String(unitNo).trim();
    if (unitType != null) update.unitType = normalizeUnitType(unitType);
    if (price !== undefined) {
      update.price =
        price === "" || price == null || Number.isNaN(Number(price))
          ? null
          : Number(price);
    }

    const updated = await CommercialUnit.findByIdAndUpdate(
      unitId,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Commercial unit not found" });
    }

    res.json(updated);
  } catch (err) {
    console.error("update commercial unit error:", err);
    if (err?.code === 11000) {
      return res
        .status(400)
        .json({ message: "This room/shop already exists in that building" });
    }
    res.status(500).json({ message: "Failed to update commercial unit" });
  }
});

router.delete("/:unitId", async (req, res) => {
  try {
    const { unitId } = req.params;
    const unit = await CommercialUnit.findById(unitId);

    if (!unit) {
      return res.status(404).json({ message: "Commercial unit not found" });
    }

    const activeTenant = await Form.findOne({
      roomId: String(unit._id),
      leaveDate: { $in: [null, ""] },
    }).lean();

    if (activeTenant) {
      return res.status(400).json({
        message: "Cannot delete this room/shop because a tenant is assigned to it",
      });
    }

    await CommercialUnit.findByIdAndDelete(unitId);
    res.json({ message: "Commercial unit deleted successfully" });
  } catch (err) {
    console.error("delete commercial unit error:", err);
    res.status(500).json({ message: "Failed to delete commercial unit" });
  }
});

module.exports = router;
