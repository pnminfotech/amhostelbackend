// controllers/formController.js
const mongoose = require("mongoose");
const Form = require("../models/formModels");
const Archive = require("../models/archiveSchema");
const DuplicateForm = require("../models/DuplicateForm");
const cron = require("node-cron");
const Counter = require("../models/counterModel");
const { normalizeFirstRentCycle } = require("../routes/_helpers/firstRentCycle");
const {
  appendRentHistorySnapshot,
  getCurrentMonthlyRent,
  getExpectedRentForMonth,
} = require("../routes/_helpers/rentHistory");
const {
  sendRentReminderMessage,
  shouldSendReminderForTenant,
} = require("../lib/msg91RentReminder");
const { sendRentReceiptMessage } = require("../lib/msg91RentReceipt");

function normalizeCanteenValue(value) {
  return String(value || "").trim().toLowerCase() === "yes" ? "yes" : "no";
}

function parseOptionalNumber(value) {
  if (value === "" || value == null) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePhoneNumber(value) {
  if (value === "" || value == null) return undefined;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return undefined;
  const parsed = Number(digits);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseRequiredDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const parsed = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (ymd) {
    const parsed = new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    const parsed = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatMonthKey(dateValue) {
  const date = parseRequiredDate(dateValue);
  if (!date) return "";
  return `${date.toLocaleString("en-US", { month: "short" })}-${String(date.getFullYear()).slice(-2)}`;
}

function parseImportedFirstRentStatus(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "NOT_PAID";

  const compact = raw.replace(/[\s_-]+/g, " ");
  if (
    compact.includes("paid at joining") ||
    compact.includes("pay at joining") ||
    compact.includes("advance paid") ||
    compact.includes("advance") ||
    compact === "paid"
  ) {
    return "ADVANCE_PAID";
  }

  return "NOT_PAID";
}

/* ============================================================================
   SrNo HELPERS
   ==========================================================================*/

// Preview next SrNo for UI only – DOES NOT touch DB
const computeNextSrNoPreview = async () => {
  const [counter, lastForm] = await Promise.all([
    Counter.findOne({ name: "form_srno" }),
    Form.findOne().sort({ srNo: -1 }).lean(),
  ]);

  const maxExisting = lastForm ? Number(lastForm.srNo) || 0 : 0;
  const currentSeq = counter ? Number(counter.seq) || 0 : 0;

  const base = Math.max(maxExisting, currentSeq);
  return base + 1;
};

// Main helper: sets Counter.seq so it is ALWAYS >= max(srNo in forms)
// and returns the NEXT srNo to use.
const assignNextSrNoAndUpdateCounter = async () => {
  const [counter, lastForm] = await Promise.all([
    Counter.findOne({ name: "form_srno" }),
    Form.findOne().sort({ srNo: -1 }).lean(),
  ]);

  const maxExisting = lastForm ? Number(lastForm.srNo) || 0 : 0;
  const currentSeq = counter ? Number(counter.seq) || 0 : 0;

  const base = Math.max(maxExisting, currentSeq);
  const next = base + 1;

  const updatedCounter = await Counter.findOneAndUpdate(
    { name: "form_srno" },
    { $set: { name: "form_srno", seq: next } },
    { new: true, upsert: true }
  );

  return updatedCounter.seq;
};

// API: used by frontend just to **show** next SrNo
const getNextSrNo = async (req, res) => {
  try {
    const [counter, lastForm] = await Promise.all([
      Counter.findOne({ name: "form_srno" }),
      Form.findOne().sort({ srNo: -1 }).lean(),
    ]);

    const maxExisting = lastForm ? Number(lastForm.srNo) || 0 : 0;
    const currentSeq = counter ? Number(counter.seq) || 0 : 0;

    const next = Math.max(maxExisting, currentSeq) + 1;

    return res.json({ nextSrNo: next });
  } catch (err) {
    console.error("Error getting next SrNo:", err);
    return res.status(500).json({ error: "Failed to get SrNo" });
  }
};

/* ============================================================================
   LEAVE / ARCHIVE (string leaveDate variant)
   ==========================================================================*/

const processLeave = async (req, res) => {
  try {
    const { tenantId, leaveDate, leaveSettlement } = req.body;

    if (!tenantId || !leaveDate) {
      return res.status(400).json({
        message: "tenantId and leaveDate are required",
      });
    }

    const updatedTenant = await Form.findByIdAndUpdate(
      tenantId,
      {
        $set: {
          leaveDate,
          isOnLeave: true,
          ...(leaveSettlement ? { leaveSettlement } : {}),
        },
      },
      {
        new: true,          // return updated doc
        runValidators: false, // 🔑 SKIP schema validation
      }
    );

    if (!updatedTenant) {
      return res.status(404).json({
        message: "Form not found",
      });
    }

    return res.json({
      message: "Leave updated successfully",
      tenant: updatedTenant,
    });

  } catch (err) {
    console.error("❌ processLeave error:", err);
    return res.status(500).json({
      message: "Internal server error",
      error: err.message,
    });
  }
};



// CRON: archive by leaveDate once per day at midnight
cron.schedule("0 0 * * *", async () => {
  try {
    const today = new Date().toISOString().split("T")[0];
    const formsToArchive = await Form.find({ leaveDate: today });

    for (const form of formsToArchive) {
      const archivedData = new Archive({ ...form.toObject(), leaveDate: today });
      await archivedData.save();
      await Form.findByIdAndDelete(form._id);
    }

    console.log(`Archived ${formsToArchive.length} records for ${today}`);
  } catch (error) {
    console.error("Error archiving records:", error);
  }
});

cron.schedule("5 0 * * *", async () => {
  try {
    const now = new Date();
    const flowId = String(
      process.env.MSG91_RENT_REMINDER_FLOW_ID ||
        process.env.MSG91_PAYMENT_REMINDER_FLOW_ID ||
        ""
    ).trim();

    const tenants = await Form.find({
      $or: [{ leaveDate: { $exists: false } }, { leaveDate: null }, { leaveDate: "" }],
    });

    let sentCount = 0;

    for (const tenant of tenants) {
      const reminderContext = shouldSendReminderForTenant(tenant, now);
      if (!reminderContext) {
        continue;
      }

      const targetMonth = reminderContext.monthKey;
      const dueDate = reminderContext.displayDate;
      const reminderHistory = Array.isArray(tenant.smsReminderHistory)
        ? tenant.smsReminderHistory
        : [];
      const alreadySent = reminderHistory.some(
        (entry) =>
          String(entry?.type || "") === "rent_due" &&
          String(entry?.month || "") === targetMonth &&
          String(entry?.status || "") === "sent"
      );

      if (alreadySent) {
        continue;
      }

      const expected = getExpectedRentForMonth(
        tenant,
        reminderContext.dueDate.getFullYear(),
        reminderContext.dueDate.getMonth()
      );
      const paid = (Array.isArray(tenant.rents) ? tenant.rents : []).reduce((sum, rent) => {
        if (String(rent?.month || "").trim() !== targetMonth) return sum;
        return sum + (Number(rent?.rentAmount) || 0);
      }, 0);
      const outstanding = Math.max(0, Number(expected || 0) - Number(paid || 0));

      if (outstanding <= 0) {
        continue;
      }

      try {
        await sendRentReminderMessage({
          tenant,
          amount: outstanding,
          month: targetMonth,
          dueDate,
        });

        tenant.smsReminderHistory = [
          ...reminderHistory,
          {
            type: "rent_due",
            month: targetMonth,
            flowId,
            sentAt: new Date(),
            amount: outstanding,
            status: "sent",
          },
        ];
        await tenant.save({ validateModifiedOnly: true });
        sentCount += 1;
      } catch (error) {
        console.error(
          "MSG91 rent reminder failed:",
          tenant?._id,
          error?.data || error?.message || error
        );

        tenant.smsReminderHistory = [
          ...reminderHistory,
          {
            type: "rent_due",
            month: targetMonth,
            flowId,
            sentAt: new Date(),
            amount: outstanding,
            status: "failed",
            reason: String(error?.message || "MSG91 send failed"),
          },
        ];
        await tenant.save({ validateModifiedOnly: true });
      }
    }

    console.log(`Rent due reminder job completed. Sent ${sentCount} reminder(s).`);
  } catch (error) {
    console.error("Rent due reminder cron failed:", error);
  }
});

/* ============================================================================
   Legacy saveForm (NOT used by /api/forms – but kept for compatibility)
   Uses assignNextSrNoAndUpdateCounter so no duplicates.
   ==========================================================================*/

const saveForm = async (req, res) => {
  try {
    const nextSrNo = await assignNextSrNoAndUpdateCounter();
    const payload = { ...(req.body || {}), srNo: String(nextSrNo) };
    payload.canteen = normalizeCanteenValue(payload.canteen);

    if (!Array.isArray(payload.rentHistory)) {
      const currentRent = getCurrentMonthlyRent(payload);
      if (currentRent > 0) {
        payload.rentHistory = [
          {
            effectiveFrom: payload.joiningDate ? new Date(payload.joiningDate) : new Date(),
            roomNo: payload.roomNo != null ? String(payload.roomNo) : "",
            bedNo: payload.bedNo != null ? String(payload.bedNo) : "",
            baseRent: currentRent,
            rentAmount: currentRent,
            source: "initial",
          },
        ];
      }
    }

    console.log(
      "📥 Incoming payload to saveForm:",
      JSON.stringify(payload, null, 2)
    );
    console.log("📂 Documents received:", payload.documents);

    const newForm = new Form(payload);
    await newForm.save();

    res
      .status(201)
      .json({ message: "Form submitted successfully", form: newForm });
  } catch (error) {
    console.error("❌ Error in saveForm:", error);

    if (error.code === 11000 && error.keyPattern && error.keyPattern.srNo) {
      return res.status(409).json({
        message:
          "Duplicate Sr. No. detected while saving. Please try again once.",
      });
    }

    res.status(500).json({
      message: "Error submitting form",
      error: error.message,
    });
  }
};

/* ============================================================================
   READ ALL
   ==========================================================================*/

const getAllForms = async (req, res) => {
  try {
    const forms = await Form.find();
    res.status(200).json(forms);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const importForms = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];

    if (!rows.length) {
      return res.status(400).json({ message: "No rows found for import" });
    }

    const created = [];
    const errors = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index] || {};
      const rowNumber = index + 2;

      const name = String(row.name || "").trim();
      const phoneNo = parsePhoneNumber(row.phoneNo);
      const joiningDate = parseRequiredDate(row.joiningDate);
      const depositAmount = parseOptionalNumber(row.depositAmount) ?? 0;
      const canteen = normalizeCanteenValue(row.canteen);
      const roomNo = String(row.roomNo || "").trim();
      const bedNo = String(row.bedNo || "").trim();
      const baseRent = parseOptionalNumber(row.bedPrice);
      const rentCycle = String(row.rentCycle || "").trim();
      const propertyType = bedNo ? "bed" : "room";
      const firstRentStatus = parseImportedFirstRentStatus(rentCycle);
      const firstRentMonth = formatMonthKey(
        firstRentStatus === "ADVANCE_PAID"
          ? joiningDate
          : new Date(joiningDate.getFullYear(), joiningDate.getMonth() + 1, 1)
      );

      if (!name) {
        errors.push({ row: rowNumber, message: "Name is required" });
        continue;
      }
      if (!phoneNo) {
        errors.push({ row: rowNumber, message: "Phone No is required" });
        continue;
      }
      if (!joiningDate) {
        errors.push({ row: rowNumber, message: "Joining Date is invalid or missing" });
        continue;
      }

      try {
        const nextSrNo = await assignNextSrNoAndUpdateCounter();
        const payload = {
          srNo: Number(nextSrNo),
          name,
          phoneNo,
          joiningDate,
          depositAmount,
          canteen,
          roomNo,
          bedNo,
          propertyType,
          baseRent,
          rentCycle,
          firstRentStatus,
          firstRentMonth,
          rents: [],
        };

        if (baseRent && baseRent > 0) {
          payload.rentHistory = [
            {
              effectiveFrom: joiningDate,
              roomNo,
              bedNo,
              baseRent,
              rentAmount: baseRent,
              source: "excel-import",
            },
          ];

          if (firstRentStatus === "ADVANCE_PAID") {
            payload.rents = [
              {
                rentAmount: baseRent,
                date: joiningDate,
                month: firstRentMonth,
                expectedRent: baseRent,
                canteenApplied: "no",
                discountAmount: 0,
                paymentMode: "Cash",
              },
            ];
          }
        }

        const saved = await Form.create(payload);
        created.push(saved);
      } catch (error) {
        errors.push({
          row: rowNumber,
          message: error?.message || "Failed to import row",
        });
      }
    }

    return res.status(created.length ? 201 : 400).json({
      ok: created.length > 0,
      importedCount: created.length,
      failedCount: errors.length,
      created,
      errors,
    });
  } catch (error) {
    console.error("importForms error:", error);
    return res.status(500).json({
      message: "Failed to import forms",
      error: error.message,
    });
  }
};

/* ============================================================================
   RENT helpers
   ==========================================================================*/

const getMonthYear = (date) => {
  const d = new Date(date);
  return `${d.toLocaleString("default", {
    month: "short",
  })}-${d.getFullYear().toString().slice(-2)}`;
};

const normalizeRentMonth = (month, date) => {
  if (typeof month === "string" && month.trim()) {
    return month.trim();
  }

  const d = new Date(date);
  if (!Number.isNaN(d.getTime())) {
    return getMonthYear(d);
  }

  return null;
};

const normalizeRentEntry = (rent, fallbackDate) => {
  const rawDate = rent?.date ? new Date(rent.date) : new Date(fallbackDate);
  const safeDate = Number.isNaN(rawDate.getTime()) ? new Date() : rawDate;
  const safeMonth = normalizeRentMonth(rent?.month, safeDate);

  return {
    rentAmount: Number(rent?.rentAmount) || 0,
    date: safeDate,
    month: safeMonth,
    expectedRent: Number(rent?.expectedRent ?? rent?.monthRent ?? rent?.rentExpected) || 0,
    canteenApplied: normalizeCanteenValue(rent?.canteenApplied),
    discountAmount: Number(rent?.discountAmount) || 0,
    paymentMode: rent?.paymentMode || "Cash",
  };
};

const updateForm = async (req, res) => {
  const { id } = req.params;
  const { rentAmount, date, month, paymentMode, rentUpdateMode, expectedRent, canteenApplied, discountAmount } = req.body;
  const resolvedMonth = normalizeRentMonth(month, date);
  const resolvedDate = new Date(date);

  try {
    const form = await Form.findById(id);
    if (!form) return res.status(404).json({ message: "Form not found" });

    if (!resolvedMonth) {
      return res.status(400).json({
        message: "Rent month is required. Please select a valid month or date.",
      });
    }

    if (Number.isNaN(resolvedDate.getTime())) {
      return res.status(400).json({
        message: "Valid rent date is required.",
      });
    }

    const normalizedRents = (Array.isArray(form.rents) ? form.rents : []).map((rent) =>
      normalizeRentEntry(rent, resolvedDate)
    );

    const rentIndex = normalizedRents.findIndex((rent) => rent.month === resolvedMonth);
    const incomingAmount = Number(rentAmount) || 0;
    const shouldReplace = rentUpdateMode === "replace";

    if (rentIndex !== -1) {
      const existingAmount = Number(normalizedRents[rentIndex]?.rentAmount) || 0;
      normalizedRents[rentIndex] = {
        rentAmount: shouldReplace ? incomingAmount : existingAmount + incomingAmount,
        date: resolvedDate,
        month: resolvedMonth,
        expectedRent: Number(expectedRent) || Number(normalizedRents[rentIndex]?.expectedRent) || 0,
        canteenApplied: normalizeCanteenValue(canteenApplied),
        discountAmount: Number(discountAmount) || 0,
        paymentMode: paymentMode || "Cash",
      };
    } else {
      normalizedRents.push({
        rentAmount: incomingAmount,
        date: resolvedDate,
        month: resolvedMonth,
        expectedRent: Number(expectedRent) || 0,
        canteenApplied: normalizeCanteenValue(canteenApplied),
        discountAmount: Number(discountAmount) || 0,
        paymentMode: paymentMode || "Cash",
      });
    }

    form.rents = normalizedRents;
    await form.save({ validateModifiedOnly: true });

    let rentReceiptStatus = { ok: false, skipped: true, reason: "Not attempted" };
    if (incomingAmount > 0) {
      try {
        rentReceiptStatus = await sendRentReceiptMessage({
          tenant: form,
          amount: incomingAmount,
          month: resolvedMonth,
        });
      } catch (error) {
        console.error("MSG91 rent receipt failed:", error?.data || error?.message || error);
        rentReceiptStatus = {
          ok: false,
          skipped: false,
          reason: error?.message || "MSG91 rent receipt failed",
          data: error?.data || null,
          status: error?.status || null,
        };
      }
    }

    res.status(200).json({
      ...form.toObject(),
      _rentReceiptStatus: rentReceiptStatus,
    });
  } catch (error) {
    console.error("⚠ Update rent error:", error);
    res.status(500).json({ message: "Error updating rent: " + error.message });
  }
};


const deleteForm = async (req, res) => {
  const { id } = req.params;

  try {
    const formToDelete = await Form.findById(id);
    if (!formToDelete) {
      return res.status(404).json({ message: "Form not found" });
    }

    const duplicateForm = new DuplicateForm({
      originalFormId: formToDelete._id,
      formData: formToDelete,
      deletedAt: Date.now(),
    });

    await duplicateForm.save();
    await Form.findByIdAndDelete(id);

    res
      .status(200)
      .json({ message: "Form deleted and saved as a duplicate successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const getDuplicateForms = async (req, res) => {
  try {
    const duplicateForms = await DuplicateForm.find()
      .populate("originalFormId")
      .exec();
    res.status(200).json(duplicateForms);
  } catch (err) {
    console.error("Error fetching duplicate forms:", err.message);
    res.status(500).json({ message: "Error fetching duplicate forms" });
  }
};

/* ============================================================================
   LEAVE DATE SAVE + DAILY CHECK
   ==========================================================================*/

const saveLeaveDate = async (req, res) => {
  const { id, leaveDate } = req.body;

  try {
    const form = await Form.findById(id);
    if (!form) {
      return res.status(404).json({ message: "Form not found" });
    }

    form.leaveDate = new Date(leaveDate);
    await form.save();

    res.status(200).json({ form, leaveDate: form.leaveDate });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error saving leave date: " + error.message });
  }
};

const checkAndArchiveLeaves = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiredForms = await Form.find({ leaveDate: today });

    for (let form of expiredForms) {
      await archiveAndDeleteForm(form);
    }

    console.log("Checked and archived expired leave records.");
  } catch (error) {
    console.error("Error checking and archiving leaves:", error);
  }
};

setInterval(checkAndArchiveLeaves, 24 * 60 * 60 * 1000);

const archiveAndDeleteForm = async (form) => {
  const archivedData = new Archive({ ...form._doc });
  await archivedData.save();
  await Form.findByIdAndDelete(form._id);
};

/* ============================================================================
   BASIC CRUD HELPERS
   ==========================================================================*/

const getForms = async (req, res) => {
  try {
    const forms = await Form.find({});
    res.status(200).json(forms);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching forms: " + error.message });
  }
};

const archiveForm = async (req, res) => {
  const { id } = req.body;

  try {
    const formToArchive = await Form.findById(id);
    if (!formToArchive) {
      return res.status(404).json({ message: "Form not found" });
    }

    const archivedData = new Archive({
      ...formToArchive._doc,
    });

    await archivedData.save();
    await Form.findByIdAndDelete(id);

    res.status(200).json(archivedData);
  } catch (error) {
    res.status(500).json({ message: "Error archiving form: " + error.message });
  }
};

const restoreForm = async (req, res) => {
  const { id } = req.body;
  console.log("Restore Request ID:", id);

  try {
    const archivedData = await Archive.findById(id);
    console.log("Archived Data Found:", archivedData);

    if (!archivedData) {
      return res.status(404).json({ message: "Archived data not found" });
    }

    const { leaveDate, ...restoredData } = archivedData.toObject();

    const restoredForm = new Form(restoredData);
    await restoredForm.save();

    await Archive.findByIdAndDelete(id);
    console.log("Archived Data Deleted:", id);

    res.status(200).json(restoredForm);
  } catch (error) {
    console.error("Error restoring archived data:", error.message);
    res.status(500).json({ message: "Error restoring archived data" });
  }
};

const getArchivedForms = async (req, res) => {
  try {
    const archivedForms = await Archive.find();
    res.status(200).json(archivedForms);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching archived forms: " + error.message,
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Form.findById(id);

    if (!existing) {
      return res.status(404).json({ message: "Entity not found" });
    }

    const updateData = { ...(req.body || {}) };
    delete updateData._id;
    delete updateData.__v;
    delete updateData.createdAt;
    delete updateData.updatedAt;
    const optionalDateFields = ["dob", "dateOfJoiningCollege", "joiningDate", "firstRentPaidDate"];
    optionalDateFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(updateData, field) && updateData[field] === "") {
        updateData[field] = undefined;
      }
    });
    ["familyMembers", "depositAmount", "baseRent", "rentAmount"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(updateData, field)) {
        updateData[field] = parseOptionalNumber(updateData[field]);
      }
    });
    if (Object.prototype.hasOwnProperty.call(updateData, "phoneNo")) {
      updateData.phoneNo = parsePhoneNumber(updateData.phoneNo);
    }
    if (Object.prototype.hasOwnProperty.call(updateData, "canteen")) {
      updateData.canteen = normalizeCanteenValue(updateData.canteen);
    }
    Object.assign(updateData, normalizeFirstRentCycle(existing.toObject(), updateData));
    const rentHistoryUpdate = appendRentHistorySnapshot(existing.toObject(), updateData);
    if (rentHistoryUpdate.rentHistory) {
      Object.assign(updateData, rentHistoryUpdate);
    }

    const updatedForm = await Form.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json(updatedForm);
  } catch (error) {
    console.error("updateProfile error:", error);
    res.status(500).json({ message: "Server Error", error });
  }
};


const getFormById = async (req, res) => {
  try {
    const { id } = req.params;

    let form = await Form.findById(id);
    if (!form) form = await Archive.findById(id);

    if (!form) return res.status(404).json({ message: "Form not found" });

    res.json(form);
  } catch (error) {
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const rentAmountDel = async (req, res) => {
  const { formId, monthYear } = req.params;

  try {
    const form = await Form.findById(formId);
    if (!form) return res.status(404).json({ message: "Form not found" });

    form.rents = form.rents.filter((rent) => rent.month !== monthYear);
    await form.save();

    res
      .status(200)
      .json({ message: "Rent entry removed successfully", form });
  } catch (error) {
    console.error("Error removing rent entry:", error);
    res.status(500).json({ message: "Failed to remove rent", error });
  }
};

const updateFormById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid form id" });
    }

    const allowed = [
      "name","phoneNo","address","joiningDate","dob","relativeAddress1",
      "roomNo","bedNo","baseRent","rentAmount","companyAddress","shopName","shopBusiness","dateOfJoiningCollege","depositAmount","familyMembers",
      "relative1Relation","relative1Name","relative1Phone",
      "relative2Relation","relative2Name","relative2Phone",
      "pincode","city","state","houseNo","nearbyPlace",
      "documents","status","source","rentHistory","canteen","canteenHistory",
      "shiftEffectiveFrom","shiftDate","effectiveFrom","rentCycle",
    ];

    const body = (req.body && typeof req.body === "object") ? req.body : {}; // ✅ safe
    const update = {};

    for (const k of allowed) {
      if (body[k] !== undefined) update[k] = body[k];
    }

    ["dob", "dateOfJoiningCollege", "joiningDate", "firstRentPaidDate"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(update, field) && update[field] === "") {
        update[field] = undefined;
      }
    });
    ["familyMembers", "depositAmount", "baseRent", "rentAmount"].forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(update, field)) {
        update[field] = parseOptionalNumber(update[field]);
      }
    });
    if (Object.prototype.hasOwnProperty.call(update, "phoneNo")) {
      update.phoneNo = parsePhoneNumber(update.phoneNo);
    }

    if (Object.prototype.hasOwnProperty.call(update, "canteen")) {
      update.canteen = normalizeCanteenValue(update.canteen);
    }
    if (Object.prototype.hasOwnProperty.call(update, "shopBusiness")) {
      update.shopBusiness = String(update.shopBusiness || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(update, "shopName")) {
      update.shopName = String(update.shopName || "").trim();
    }
    if (Object.prototype.hasOwnProperty.call(update, "companyAddress")) {
      update.companyAddress = String(update.companyAddress || "").trim();
    }

    const existing = await Form.findById(id);
    if (!existing) return res.status(404).json({ message: "Form not found" });

    Object.assign(update, normalizeFirstRentCycle(existing.toObject(), update));
    const rentHistoryUpdate = appendRentHistorySnapshot(existing.toObject(), update);
    if (rentHistoryUpdate.rentHistory) {
      Object.assign(update, rentHistoryUpdate);
    }

    const updated = await Form.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );

    return res.json({ ok: true, form: updated });
  } catch (err) {
    console.error("updateFormById error:", err);
    return res.status(500).json({
      message: "Failed to update form",
      error: err.message,      // ✅ important
    });
  }
};


module.exports = {
  // SrNo helpers
  getNextSrNo,
  assignNextSrNoAndUpdateCounter,

  // Rent
  rentAmountDel,
  processLeave,
  // Leave / archive
  
  getFormById,
  getForms,
  checkAndArchiveLeaves,
  updateProfile,
  getArchivedForms,
  saveLeaveDate,
  restoreForm,
  archiveForm,
updateFormById,
  // Forms CRUD
  saveForm,
  getAllForms,
  importForms,
  updateForm,
  deleteForm,
  getDuplicateForms,
};
