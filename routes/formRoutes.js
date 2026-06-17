// routes/formRoutes.js
const express = require("express");
const router = express.Router();

// Models (used by a couple of inline routes)
const Form = require("../models/formModels");
const Room = require("../models/Room");

// Controllers
const {
  getNextSrNo,
  rentAmountDel,
  processLeave,
  getFormById,
  getForms,
  updateFormById,
  updateProfile,
  getArchivedForms,
  saveLeaveDate,
  restoreForm,
  archiveForm,
  getDuplicateForms,
  deleteForm,
  updateForm,
  saveForm, // kept/exported for legacy use (NOT bound to POST /forms)
  getAllForms,
} = require("../controllers/formController");

const {
  createWithOptionalInvite,
} = require("../controllers/forms/createWithOptionalInvite");

// NEW: invite controller routes
const { createInvite, validateInvite } = require("../controllers/invites");

// ───────────────────────────────────────────────────────────────────────────────
// CREATE: must be the ONLY creator for /forms
// NOTE: Inside createWithOptionalInvite, you should also use
//       assignNextSrNoAndUpdateCounter() from formController
//       instead of trusting srNo from frontend.
// ───────────────────────────────────────────────────────────────────────────────
router.post("/forms", createWithOptionalInvite);

// For UI to show next SrNo (server still assigns the real one)
router.get("/forms/count", getNextSrNo);

// ───────────────────────────────────────────────────────────────────────────────
// INVITES (create + validate)
// ───────────────────────────────────────────────────────────────────────────────
router.post("/invites", createInvite);
router.get("/invites/:token", validateInvite);

// ───────────────────────────────────────────────────────────────────────────────
// READ / UPDATE / DELETE
// ───────────────────────────────────────────────────────────────────────────────
router.get("/", getAllForms);

router.delete("/form/:id", deleteForm);
router.get("/duplicateforms", getDuplicateForms);

router.post("/forms/leave", saveLeaveDate);
router.post("/forms/archive", archiveForm);
router.post("/forms/restore", restoreForm);

router.put("/update/:id", updateProfile);
router.get("/forms", getForms);
router.post("/leave", processLeave);

router.get("/forms/archived", getArchivedForms);
router.get("/form/:id", getFormById);
// ✅ UPDATE full form record (tenant intake update)
// router.patch("/forms/:id", updateFormById);
router.put("/forms/:id", updateFormById);

router.post("/forms/:id/canteen", async (req, res) => {
  try {
    const { id } = req.params;
    const form = await Form.findById(id);

    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    const month = String(req.body?.month || "").trim();
    const mealCount = Number(req.body?.mealCount || 0);
    const rate = 75;
    const status = String(req.body?.status || "due").trim().toLowerCase() === "paid" ? "paid" : "due";

    if (!month) {
      return res.status(400).json({ message: "Month is required" });
    }

    if (!Number.isFinite(mealCount) || mealCount < 0) {
      return res.status(400).json({ message: "Valid meal count is required" });
    }

    const amount = mealCount * rate;
    const history = Array.isArray(form.canteenHistory) ? [...form.canteenHistory] : [];
    const existingIndex = history.findIndex((entry) => String(entry?.month || "").trim() === month);

    const nextEntry = {
      month,
      mealCount,
      rate,
      amount,
      status,
      createdAt: existingIndex >= 0 ? history[existingIndex]?.createdAt || new Date() : new Date(),
    };

    if (existingIndex >= 0) {
      history[existingIndex] = nextEntry;
    } else {
      history.push(nextEntry);
    }

    history.sort((a, b) => String(b?.month || "").localeCompare(String(a?.month || "")));

    form.canteenHistory = history;
    form.canteen = "yes";
    await form.save();

    return res.json({ ok: true, form });
  } catch (error) {
    console.error("save canteen error:", error);
    return res.status(500).json({
      message: "Failed to save canteen entry",
      error: error.message,
    });
  }
});

// rent entry delete by monthKey
router.delete("/form/:formId/rent/:monthYear", rentAmountDel);

// rent create/update
router.put("/form/:id", updateForm);

function parseLeaveDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isActiveTenant(tenant) {
  const leaveDate = parseLeaveDate(tenant?.leaveDate);
  if (!leaveDate) return true;

  leaveDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return leaveDate > today;
}

function isSameCategory(tenant, category) {
  const tenantCategory = String(tenant?.category || "").trim();
  return !tenantCategory || !category || tenantCategory === category;
}

function normalizePropertyType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "room" || raw === "shop") return raw;
  return "bed";
}

async function getVacantBeds(excludeTenantId) {
  const [rooms, forms] = await Promise.all([
    Room.find({}).lean(),
    Form.find({}).select("_id roomNo bedNo category leaveDate").lean(),
  ]);

  const roomTypeMap = new Map(
    rooms.map((room) => [String(room.roomNo || "").trim(), normalizePropertyType(room.propertyType)])
  );

  const occupiedBeds = new Set();
  const occupiedRooms = new Set();
  forms.forEach((tenant) => {
    if (excludeTenantId && String(tenant._id) === String(excludeTenantId)) return;
    if (!isActiveTenant(tenant)) return;

    const roomNo = String(tenant.roomNo || "").trim();
    const bedNo = String(tenant.bedNo || "").trim();
    const propertyType = roomTypeMap.get(roomNo) || "bed";

    if (!roomNo) return;

    if (propertyType === "bed") {
      if (bedNo) occupiedBeds.add(`${roomNo}__${bedNo}`);
      return;
    }

    occupiedRooms.add(roomNo);
  });

  const vacantBeds = [];
  rooms.forEach((room) => {
    const roomNo = String(room.roomNo || "").trim();
    const propertyType = normalizePropertyType(room.propertyType);
    const roomBeds = Array.isArray(room.beds) ? room.beds : [];

    if (!roomNo || !roomBeds.length) return;

    if (propertyType !== "bed") {
      if (occupiedRooms.has(roomNo)) return;

      const primaryBed = roomBeds[0];
      const bedNo = String(primaryBed?.bedNo || "").trim();
      if (!bedNo) return;

      vacantBeds.push({
        category: room.category || "",
        floorNo: room.floorNo || "",
        roomNo,
        bedNo,
        bedCategory: primaryBed?.bedCategory || "",
        price: primaryBed?.price ?? null,
      });
      return;
    }

    roomBeds.forEach((bed) => {
      const bedNo = String(bed.bedNo || "").trim();
      if (!bedNo || occupiedBeds.has(`${roomNo}__${bedNo}`)) return;
      vacantBeds.push({
        category: room.category || "",
        floorNo: room.floorNo || "",
        roomNo,
        bedNo,
        bedCategory: bed.bedCategory || "",
        price: bed.price ?? null,
      });
    });
  });

  return vacantBeds.sort((a, b) => {
    const roomCmp = String(a.roomNo).localeCompare(String(b.roomNo), undefined, { numeric: true });
    if (roomCmp !== 0) return roomCmp;
    return String(a.bedNo).localeCompare(String(b.bedNo), undefined, { numeric: true });
  });
}

// cancel leave inline route
router.post("/cancel-leave", async (req, res) => {
  const { id, roomNo: requestedRoomNo, bedNo: requestedBedNo, category: requestedCategory } = req.body || {};
  try {
    const tenant = await Form.findById(id);
    if (!tenant) {
      return res.status(404).json({ success: false, message: "Form not found" });
    }

    const roomNo = String(requestedRoomNo || tenant.roomNo || "").trim();
    const room = roomNo ? await Room.findOne({ roomNo }).lean() : null;
    const propertyType = normalizePropertyType(room?.propertyType);
    const fallbackBedNo = String(room?.beds?.[0]?.bedNo || "").trim();
    const bedNo = String(requestedBedNo || tenant.bedNo || fallbackBedNo || "").trim();
    const category = String(requestedCategory || tenant.category || "").trim();

    if (!roomNo || (propertyType === "bed" && !bedNo)) {
      const vacantBeds = await getVacantBeds(id);
      return res.status(409).json({
        success: false,
        code: "BED_REQUIRED",
        message:
          propertyType === "shop"
            ? "Please select a shop before undoing leave."
            : propertyType === "room"
            ? "Please select a room before undoing leave."
            : "Please select a room and bed before undoing leave.",
        vacantBeds,
      });
    }

    const conflictQuery =
      propertyType === "bed" ? { roomNo, bedNo, _id: { $ne: id } } : { roomNo, _id: { $ne: id } };

    const candidates = await Form.find(conflictQuery)
      .select("_id name roomNo bedNo category leaveDate")
      .lean();
    const activeConflict = candidates.find((candidate) =>
      isActiveTenant(candidate) && isSameCategory(candidate, category)
    );

    if (activeConflict) {
      const vacantBeds = await getVacantBeds(id);
      const conflictLabel =
        propertyType === "shop"
          ? `Old shop ${roomNo} is already occupied by ${activeConflict.name || "another tenant"}. Select another vacant shop to undo leave.`
          : propertyType === "room"
          ? `Old room ${roomNo} is already occupied by ${activeConflict.name || "another tenant"}. Select another vacant room to undo leave.`
          : `Old bed Room ${roomNo}, Bed ${bedNo} is already occupied by ${activeConflict.name || "another tenant"}. Select another vacant bed to undo leave.`;
      return res.status(409).json({
        success: false,
        code: "BED_OCCUPIED",
        message: conflictLabel,
        occupant: {
          id: activeConflict._id,
          name: activeConflict.name || "",
          roomNo: activeConflict.roomNo || "",
          bedNo: activeConflict.bedNo || "",
        },
        vacantBeds,
      });
    }

    const updated = await Form.findByIdAndUpdate(
      id,
      {
        $set: {
          roomNo,
          bedNo,
          ...(category ? { category } : {}),
        },
        $unset: {
          leaveDate: "",
          isOnLeave: "",
          leaveSettlement: "",
        },
      },
      { new: true }
    );

    res.json({ success: true, form: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: "Error cancelling leave" });
  }
});

module.exports = router;
