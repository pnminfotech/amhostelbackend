// // routes/roomRoutes.js
// const express = require("express");
// const router = express.Router();
// const Room = require("../models/Room");

// // 🔔 Log when this router file is loaded by server.js
// console.log("✅ roomRoutes.js loaded");

// /* ------------------- GET all rooms ------------------- */
// // GET /api/rooms
// router.get("/", async (req, res) => {
//   try {
//     const rooms = await Room.find().sort({ floorNo: 1, roomNo: 1 });
//     res.json(rooms);
//   } catch (err) {
//     console.error("Error fetching rooms:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

// /* ------------------- Create room --------------------- */
// // POST /api/rooms
// // body: { category, floorNo, roomNo }
// router.post("/", async (req, res) => {
//   try {
//     const { category, floorNo, roomNo } = req.body || {};

//     if (!category || !floorNo || !roomNo) {
//       return res
//         .status(400)
//         .json({ message: "category, floorNo and roomNo are required" });
//     }

//     // avoid duplicate roomNo
//     const existing = await Room.findOne({ roomNo });
//     if (existing) {
//       return res
//         .status(400)
//         .json({ message: "Room with this roomNo already exists" });
//     }

//     const room = new Room({
//       category: String(category).trim(),
//       floorNo: String(floorNo).trim(),
//       roomNo: String(roomNo).trim(),
//       beds: [], // first bed will be added via /:roomNo/bed
//     });

//     await room.save();
//     res.status(201).json(room);
//   } catch (err) {
//     console.error("Error adding room:", err);
//     if (err && err.code === 11000) {
//       return res
//         .status(400)
//         .json({ message: "Room with this roomNo already exists" });
//     }
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

// /* ------------------ Add bed to room ------------------ */
// // POST /api/rooms/:roomNo/bed
// // body: { bedNo, bedCategory?, price? }
// router.post("/:roomNo/bed", async (req, res) => {
//   const { roomNo } = req.params;
//   let { bedNo, bedCategory, price } = req.body || {};

//   console.log("🔹 ADD BED request body:", req.body);

//   try {
//     if (!bedNo) {
//       return res.status(400).json({ message: "Missing bedNo" });
//     }

//     const room = await Room.findOne({ roomNo });
//     if (!room) return res.status(404).json({ message: "Room not found" });

//     // duplicate bedNo check (case-insensitive)
//     const exists = room.beds.some(
//       (bed) =>
//         String(bed.bedNo).trim().toLowerCase() ===
//         String(bedNo).trim().toLowerCase()
//     );
//     if (exists) {
//       return res
//         .status(400)
//         .json({ message: "Bed number already exists in this room" });
//     }

//     // normalise values
//     bedNo = String(bedNo).trim();
//     bedCategory = bedCategory ? String(bedCategory).trim() : "";

//     if (price === undefined || price === "") {
//       price = null;
//     } else {
//       price = Number(price);
//       if (Number.isNaN(price)) price = null;
//     }

//     console.log("🔹 Pushing bed:", { bedNo, bedCategory, price });
//     room.beds.push({ bedNo, bedCategory, price });
//     await room.save();

//     res.json({ message: "Bed added successfully", room });
//   } catch (err) {
//     console.error("Error adding bed:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

// /* ----------------- Update bed price ------------------ */
// // PUT /api/rooms/:roomNo/bed/:bedNo
// router.put("/:roomNo/bed/:bedNo", async (req, res) => {
//   const { roomNo, bedNo } = req.params;
//   const { price } = req.body || {};

//   try {
//     const room = await Room.findOne({ roomNo });
//     if (!room) return res.status(404).json({ message: "Room not found" });

//     const bed = room.beds.find(
//       (b) =>
//         String(b.bedNo).trim().toLowerCase() ===
//         String(bedNo).trim().toLowerCase()
//     );
//     if (!bed) return res.status(404).json({ message: "Bed not found" });

//     if (price === undefined || price === "") {
//       bed.price = null;
//     } else {
//       const num = Number(price);
//       if (Number.isNaN(num)) {
//         return res.status(400).json({ message: "Invalid price" });
//       }
//       bed.price = num;
//     }

//     await room.save();
//     res.json(bed);
//   } catch (err) {
//     console.error("Error updating bed price:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

// /* ------------------ Delete bed from room ------------- */
// // DELETE /api/rooms/:roomNo/bed/:bedNo
// router.delete("/:roomNo/bed/:bedNo", async (req, res) => {
//   const { roomNo, bedNo } = req.params;
//   console.log("🔥 DELETE BED hit:", { roomNo, bedNo });

//   try {
//     const room = await Room.findOne({ roomNo });
//     if (!room) {
//       console.log("  ❌ Room not found");
//       return res.status(404).json({ message: "Room not found" });
//     }

//     const beforeCount = room.beds.length;

//     room.beds = room.beds.filter(
//       (b) =>
//         String(b.bedNo).trim().toLowerCase() !==
//         String(bedNo).trim().toLowerCase()
//     );

//     if (room.beds.length === beforeCount) {
//       console.log("  ❌ Bed not found");
//       return res.status(404).json({ message: "Bed not found" });
//     }

//     await room.save();
//     console.log("  ✅ Bed deleted successfully");
//     return res.json({ message: "Bed deleted successfully", room });
//   } catch (err) {
//     console.error("Error deleting bed:", err);
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

// module.exports = router;







const express = require("express");
const router = express.Router();
const Room = require("../models/Room");
const Form = require("../models/Form");

function normalizePropertyType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "room" || raw === "shop") return raw;
  return "bed";
}

router.get("/", async (req, res) => {
  try {
    const rooms = await Room.find().sort({ floorNo: 1, roomNo: 1 });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Create room: check duplicate only inside same category
router.post("/", async (req, res) => {
  try {
    const {
      category,
      floorNo,
      roomNo,
      propertyType,
      hasWing,
      wingName,
      flatType,
    } = req.body || {};
    if (!category || !floorNo || !roomNo) {
      return res.status(400).json({ message: "category, floorNo and roomNo are required" });
    }

    const cat = String(category).trim();
    const flr = String(floorNo).trim();
    const rno = String(roomNo).trim();
    const normalizedPropertyType = normalizePropertyType(propertyType);
    const normalizedHasWing = Boolean(hasWing);
    const normalizedWingName = normalizedHasWing ? String(wingName || "").trim() : "";
    const normalizedFlatType =
      normalizedPropertyType === "room" ? String(flatType || "").trim() : "";

    if ((normalizedPropertyType === "room" || normalizedPropertyType === "shop") && normalizedHasWing && !normalizedWingName) {
      return res.status(400).json({ message: "wingName is required when hasWing is enabled" });
    }

    if (normalizedPropertyType === "room" && !normalizedFlatType) {
      return res.status(400).json({ message: "flatType is required for residential rooms" });
    }

    const existing = await Room.findOne({
      propertyType: normalizedPropertyType,
      category: cat,
      floorNo: flr,
      roomNo: rno,
      wingName: normalizedWingName,
    });

    if (existing) {
      return res.status(400).json({ message: "Unit already exists in this location" });
    }

    const beds =
      normalizedPropertyType === "bed"
        ? []
        : [
            {
              bedNo: normalizedPropertyType === "shop" ? "SHOP-1" : "ROOM-1",
              bedCategory: "Primary",
              price: null,
            },
          ];

    const room = await Room.create({
      propertyType: normalizedPropertyType,
      category: cat,
      hasWing: normalizedHasWing,
      wingName: normalizedWingName,
      floorNo: flr,
      flatType: normalizedFlatType,
      roomNo: rno,
      beds,
    });
    return res.status(201).json(room);
  } catch (err) {
    // duplicate key error for compound index
    if (err?.code === 11000) {
      return res.status(400).json({ message: "Unit already exists in this location" });
    }
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Add bed by roomId
router.post("/:roomId/bed", async (req, res) => {
  const { roomId } = req.params;
  let { bedNo, bedCategory, price } = req.body || {};

  try {
    if (!bedNo) return res.status(400).json({ message: "Missing bedNo" });

    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });
    if (normalizePropertyType(room.propertyType) !== "bed") {
      return res.status(400).json({ message: "Additional beds are allowed only for bed-wise properties" });
    }

    const exists = room.beds.some(
      (b) => String(b.bedNo).trim().toLowerCase() === String(bedNo).trim().toLowerCase()
    );
    if (exists) return res.status(400).json({ message: "Bed already exists in this room" });

    bedNo = String(bedNo).trim();
    bedCategory = bedCategory ? String(bedCategory).trim() : "";

    if (price === undefined || price === "") price = null;
    else {
      price = Number(price);
      if (Number.isNaN(price)) price = null;
    }

    room.beds.push({ bedNo, bedCategory, price });
    await room.save();

    res.json({ message: "Bed added successfully", room });
  } catch (err) {
    res.status(500).json({ message: "Internal server error" });
  }
});

// ✅ Update bed price by roomId
// router.put("/:roomId/bed/:bedNo", async (req, res) => {
//   const { roomId, bedNo } = req.params;
//   const { price } = req.body || {};

//   try {
//     const room = await Room.findById(roomId);
//     if (!room) return res.status(404).json({ message: "Room not found" });

//     const bed = room.beds.find(
//       (b) => String(b.bedNo).trim().toLowerCase() === String(bedNo).trim().toLowerCase()
//     );
//     if (!bed) return res.status(404).json({ message: "Bed not found" });

//     if (price === undefined || price === "") bed.price = null;
//     else {
//       const num = Number(price);
//       if (Number.isNaN(num)) return res.status(400).json({ message: "Invalid price" });
//       bed.price = num;
//     }

//     await room.save();
//     res.json(bed);
//   } catch (err) {
//     res.status(500).json({ message: "Internal server error" });
//   }
// });

router.put("/:roomId/bed/:bedNo", async (req, res) => {
  const { roomId, bedNo } = req.params;
  const { price, bedCategory } = req.body || {};

  try {
    const room = await Room.findById(roomId);
    if (!room) return res.status(404).json({ message: "Room not found" });

    const bed = room.beds.find(
      (b) =>
        String(b.bedNo).trim().toLowerCase() ===
        String(bedNo).trim().toLowerCase()
    );
    if (!bed) return res.status(404).json({ message: "Bed not found" });

    // ✅ Update price (allow clearing)
    if (price !== undefined) {
      if (price === "") bed.price = null;
      else {
        const num = Number(price);
        if (Number.isNaN(num))
          return res.status(400).json({ message: "Invalid price" });
        bed.price = num;
      }
    }

    // ✅ Update bedCategory (allow clearing)
    if (bedCategory !== undefined) {
      bed.bedCategory = String(bedCategory).trim(); // "" allowed to clear
    }

    await room.save();
    res.json(bed);
  } catch (err) {
    console.error("Update bed error:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
});

// ✅ Delete bed by roomId
router.delete("/:roomNo/bed/:bedNo", async (req, res) => {
  const { roomNo, bedNo } = req.params;

  try {
    const room = await Room.findOne({ roomNo: String(roomNo) });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }
    if (normalizePropertyType(room.propertyType) !== "bed" && (room.beds || []).length <= 1) {
      return res.status(400).json({ message: "Primary room/shop slot cannot be deleted" });
    }

    const result = await Room.updateOne(
      { roomNo: String(roomNo) },
      {
        $pull: {
          beds: { bedNo: String(bedNo) } // if bedNo stored as string
          // beds: { bedNo: Number(bedNo) } // if bedNo stored as number
        },
      }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ message: "Room not found" });

    if (result.modifiedCount === 0)
      return res.status(404).json({ message: "Bed not found" });

    const updatedRoom = await Room.findOne({ roomNo: String(roomNo) });
    return res.json({ message: "Bed deleted successfully", room: updatedRoom });
  } catch (err) {
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
});

router.delete("/:roomId", async (req, res) => {
  const { roomId } = req.params;

  try {
    const room = await Room.findById(roomId);
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const activeTenant = await Form.findOne({
      roomNo: String(room.roomNo || "").trim(),
      leaveDate: { $in: [null, ""] },
    }).lean();

    if (activeTenant) {
      return res.status(400).json({
        message: "Cannot delete this room/shop because a tenant is assigned to it",
      });
    }

    await Room.findByIdAndDelete(roomId);
    return res.json({ message: "Room deleted successfully" });
  } catch (err) {
    console.error("Delete room error:", err);
    return res.status(500).json({ message: "Internal server error", error: err.message });
  }
});


// ✅ PUT /api/rooms/:roomId  -> update room category (and optionally floorNo/roomNo later)
router.put("/:roomId", async (req, res) => {
  const { roomId } = req.params;
  const { category, propertyType, floorNo, roomNo, hasWing, wingName, flatType } = req.body || {};

  try {
    if (
      !category &&
      propertyType === undefined &&
      floorNo === undefined &&
      roomNo === undefined &&
      hasWing === undefined &&
      wingName === undefined &&
      flatType === undefined
    ) {
      return res.status(400).json({ message: "At least one room field is required" });
    }

    const update = {};
    if (category && String(category).trim()) {
      update.category = String(category).trim();
    }
    if (propertyType !== undefined) {
      update.propertyType = normalizePropertyType(propertyType);
    }
    if (floorNo !== undefined && String(floorNo).trim()) {
      update.floorNo = String(floorNo).trim();
    }
    if (roomNo !== undefined && String(roomNo).trim()) {
      update.roomNo = String(roomNo).trim();
    }
    if (hasWing !== undefined) {
      update.hasWing = Boolean(hasWing);
      if (!update.hasWing && wingName === undefined) {
        update.wingName = "";
      }
    }
    if (wingName !== undefined) {
      update.wingName = String(wingName || "").trim();
    }
    if (flatType !== undefined) {
      update.flatType = String(flatType || "").trim();
    }

    const updated = await Room.findByIdAndUpdate(
      roomId,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Room not found" });

    res.json(updated);
  } catch (err) {
    console.error("Update room category error:", err);
    res.status(500).json({ message: "Internal server error", error: err.message });
  }
});
// PATCH /api/rooms/:roomId/bed/:bedNo  -> update bed price (and/or bedCategory)
router.patch("/:roomId/bed/:bedNo", async (req, res) => {
  try {
    const { roomId, bedNo } = req.params;
    const { price, bedCategory } = req.body;

    if (price !== undefined && (Number(price) < 0 || Number.isNaN(Number(price)))) {
      return res.status(400).json({ message: "Invalid price" });
    }

    const update = {};
    if (price !== undefined) update["beds.$.price"] = Number(price);
    if (bedCategory !== undefined) update["beds.$.bedCategory"] = String(bedCategory);

    if (!Object.keys(update).length) {
      return res.status(400).json({ message: "Nothing to update" });
    }

    const room = await Room.findOneAndUpdate(
      { _id: roomId, "beds.bedNo": String(bedNo) },
      { $set: update },
      { new: true }
    );

    if (!room) {
      return res.status(404).json({ message: "Room/Bed not found" });
    }

    res.json({ message: "Bed updated", room });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
