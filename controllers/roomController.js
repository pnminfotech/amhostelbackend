// controllers/roomController.js
import Room from "../models/Room.js";

// GET /api/rooms
export const getRooms = async (req, res) => {
  try {
    const rooms = await Room.find().sort({ floorNo: 1, roomNo: 1 });
    res.json(rooms);
  } catch (err) {
    console.error("getRooms error:", err);
    res.status(500).json({ message: "Failed to fetch rooms" });
  }
};

// POST /api/rooms
// body: { category, floorNo, roomNo }
export const createRoom = async (req, res) => {
  try {
    const { category, floorNo, roomNo } = req.body;

    if (!category || !floorNo || !roomNo) {
      return res.status(400).json({ message: "category, floorNo, roomNo are required" });
    }

    // prevent duplicate roomNo
    const existing = await Room.findOne({ roomNo });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Room with this roomNo already exists" });
    }

    const room = await Room.create({
      category,
      floorNo,
      roomNo,
      beds: [],
    });

    res.status(201).json(room);
  } catch (err) {
    console.error("createRoom error:", err);
    res.status(500).json({ message: "Failed to create room" });
  }
};

// POST /api/rooms/:roomNo/bed
// body: { bedNo, bedCategory?, price? }
export const addBedToRoom = async (req, res) => {
  try {
    const { roomNo } = req.params;
    const { bedNo, bedCategory, price } = req.body;

    if (!bedNo) {
      return res.status(400).json({ message: "bedNo is required" });
    }

    const room = await Room.findOne({ roomNo });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const dup = room.beds.some(
      (b) => String(b.bedNo).trim().toLowerCase() === bedNo.trim().toLowerCase()
    );
    if (dup) {
      return res
        .status(400)
        .json({ message: "Bed with this bedNo already exists in this room" });
    }

    room.beds.push({
      bedNo,
      bedCategory: bedCategory || "",
      price: price != null ? Number(price) : undefined,
    });

    await room.save();
    res.status(201).json(room);
  } catch (err) {
    console.error("addBedToRoom error:", err);
    res.status(500).json({ message: "Failed to add bed" });
  }
};

// PUT /api/rooms/:roomNo/bed/:bedNo
// body: { price }
export const updateBedPrice = async (req, res) => {
  try {
    const { roomNo, bedNo } = req.params;
    const { price } = req.body;

    const room = await Room.findOne({ roomNo });
    if (!room) {
      return res.status(404).json({ message: "Room not found" });
    }

    const bed = room.beds.find(
      (b) =>
        String(b.bedNo).trim().toLowerCase() === bedNo.trim().toLowerCase()
    );
    if (!bed) {
      return res.status(404).json({ message: "Bed not found" });
    }

    bed.price = price != null ? Number(price) : null;
    await room.save();
    res.json(room);
  } catch (err) {
    console.error("updateBedPrice error:", err);
    res.status(500).json({ message: "Failed to update bed price" });
  }
};
