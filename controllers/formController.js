// controllers/formController.js
const Form = require("../models/formModels");
const Archive = require("../models/archiveSchema");
const DuplicateForm = require("../models/DuplicateForm");
const cron = require("node-cron");
const Counter = require("../models/counterModel");

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
    const { tenantId, leaveDate } = req.body;

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

/* ============================================================================
   Legacy saveForm (NOT used by /api/forms – but kept for compatibility)
   Uses assignNextSrNoAndUpdateCounter so no duplicates.
   ==========================================================================*/

const saveForm = async (req, res) => {
  try {
    const nextSrNo = await assignNextSrNoAndUpdateCounter();
    req.body.srNo = String(nextSrNo);

    console.log(
      "📥 Incoming payload to saveForm:",
      JSON.stringify(req.body, null, 2)
    );
    console.log("📂 Documents received:", req.body.documents);

    const newForm = new Form(req.body);
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

/* ============================================================================
   RENT helpers
   ==========================================================================*/

const getMonthYear = (date) => {
  const d = new Date(date);
  return `${d.toLocaleString("default", {
    month: "short",
  })}-${d.getFullYear().toString().slice(-2)}`;
};

const updateForm = async (req, res) => {
  const { id } = req.params;
  const { rentAmount, date, month, paymentMode } = req.body;

  try {
    const form = await Form.findById(id);
    if (!form) return res.status(404).json({ message: "Form not found" });

    const rentIndex = form.rents.findIndex((rent) => rent.month === month);

    if (rentIndex !== -1) {
      form.rents[rentIndex] = {
        rentAmount: Number(rentAmount),
        date: new Date(date),
        month,
        paymentMode,
      };
    } else {
      form.rents.push({
        rentAmount: Number(rentAmount),
        date: new Date(date),
        month,
        paymentMode,
      });
    }

    await form.save({ validateModifiedOnly: true });

    res.status(200).json(form);
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
    const updateData = req.body;

    const updatedForm = await Form.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedForm) {
      return res.status(404).json({ message: "Entity not found" });
    }

    res.status(200).json(updatedForm);
  } catch (error) {
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
      "companyAddress","dateOfJoiningCollege","rentAmount","depositAmount",
      "relative1Relation","relative1Name","relative1Phone",
      "relative2Relation","relative2Name","relative2Phone",
      "pincode","city","state","houseNo","nearbyPlace",
      "documents","status","source",
    ];

    const body = (req.body && typeof req.body === "object") ? req.body : {}; // ✅ safe
    const update = {};

    for (const k of allowed) {
      if (body[k] !== undefined) update[k] = body[k];
    }

    const updated = await Form.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Form not found" });

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
  updateForm,
  deleteForm,
  getDuplicateForms,
};
