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

async function getVacantBeds(excludeTenantId) {
  const [rooms, forms] = await Promise.all([
    Room.find({}).lean(),
    Form.find({}).select("_id roomNo bedNo category leaveDate").lean(),
  ]);

  const occupied = new Set();
  forms.forEach((tenant) => {
    if (excludeTenantId && String(tenant._id) === String(excludeTenantId)) return;
    if (!isActiveTenant(tenant)) return;
    const roomNo = String(tenant.roomNo || "").trim();
    const bedNo = String(tenant.bedNo || "").trim();
    if (roomNo && bedNo) occupied.add(`${roomNo}__${bedNo}`);
  });

  const vacantBeds = [];
  rooms.forEach((room) => {
    const roomNo = String(room.roomNo || "").trim();
    (room.beds || []).forEach((bed) => {
      const bedNo = String(bed.bedNo || "").trim();
      if (!roomNo || !bedNo || occupied.has(`${roomNo}__${bedNo}`)) return;
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
    const bedNo = String(requestedBedNo || tenant.bedNo || "").trim();
    const category = String(requestedCategory || tenant.category || "").trim();

    if (!roomNo || !bedNo) {
      const vacantBeds = await getVacantBeds(id);
      return res.status(409).json({
        success: false,
        code: "BED_REQUIRED",
        message: "Please select a room and bed before undoing leave.",
        vacantBeds,
      });
    }

    const candidates = await Form.find({ roomNo, bedNo, _id: { $ne: id } })
      .select("_id name roomNo bedNo category leaveDate")
      .lean();
    const activeConflict = candidates.find((candidate) =>
      isActiveTenant(candidate) && isSameCategory(candidate, category)
    );

    if (activeConflict) {
      const vacantBeds = await getVacantBeds(id);
      return res.status(409).json({
        success: false,
        code: "BED_OCCUPIED",
        message: `Old bed Room ${roomNo}, Bed ${bedNo} is already occupied by ${activeConflict.name || "another tenant"}. Select another vacant bed to undo leave.`,
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
