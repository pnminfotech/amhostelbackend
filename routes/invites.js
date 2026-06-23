const express = require("express");
const crypto = require("crypto");
const Invite = require("../models/Invite");
const Form = require("../models/formModels");
const Counter = require("../models/counterModel");
const { sendAdmissionMessage } = require("../lib/msg91Admission");

const router = express.Router();

function normalizeTrackerType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "bed" || raw === "room" || raw === "shop") return raw;
  return "";
}

function inferTrackerType(source = {}) {
  const explicit =
    normalizeTrackerType(source.propertyType) ||
    normalizeTrackerType(source.trackerType);
  if (explicit) return explicit;

  const bedNo = String(source.bedNo || "").trim().toUpperCase();
  if (bedNo === "ROOM-1") return "room";
  if (bedNo === "SHOP-1") return "shop";
  return "bed";
}

function tenantIntakePath() {
  return "/kpshevkaripg/tenant-intake";
}

async function assignNextSrNoAndUpdateCounter() {
  const [counterDoc, lastForm] = await Promise.all([
    Counter.findOne({ name: "form_srno" }).lean(),
    Form.findOne().sort({ srNo: -1 }).select("srNo").lean(),
  ]);

  const counterSeq = Number(counterDoc?.seq || 0);
  const maxFormSrNo = Number(lastForm?.srNo || 0);
  const next = Math.max(counterSeq, maxFormSrNo) + 1;

  const updated = await Counter.findOneAndUpdate(
    { name: "form_srno" },
    { $set: { name: "form_srno", seq: next } },
    { new: true, upsert: true }
  );

  return updated.seq;
}

function toTrimmedString(value) {
  if (value === "" || value == null) return undefined;
  const trimmed = String(value).trim();
  return trimmed || undefined;
}

function toTrimmedPhone(value) {
  if (value === "" || value == null) return undefined;
  const digits = String(value).replace(/\D/g, "").slice(0, 10);
  return digits || undefined;
}

function toNumberOrUndefined(value) {
  if (value === "" || value == null) return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function toDateOrUndefined(value) {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildInvitePrefill(source = {}) {
  const trackerType = inferTrackerType(source);
  const bedNo =
    toTrimmedString(source.bedNo) ||
    (trackerType === "room" ? "ROOM-1" : trackerType === "shop" ? "SHOP-1" : undefined);
  const baseRentValue =
    source.baseRent !== "" && source.baseRent != null ? source.baseRent : source.rentAmount;
  const monthlyRent = toNumberOrUndefined(baseRentValue);
  const depositAmount = toNumberOrUndefined(source.depositAmount) ?? 0;

  const prefill = {
    trackerType,
    propertyType: trackerType,
    category: toTrimmedString(source.category),
    roomId: toTrimmedString(source.roomId),
    roomNo: toTrimmedString(source.roomNo),
    bedNo,
    wingName: trackerType === "room" ? toTrimmedString(source.wingName) : undefined,
    floorNo: trackerType === "room" ? toTrimmedString(source.floorNo) : undefined,
    name: toTrimmedString(source.name),
    phoneNo: toTrimmedPhone(source.phoneNo),
    address: toTrimmedString(source.address),
    pincode: toTrimmedString(source.pincode),
    city: toTrimmedString(source.city),
    state: toTrimmedString(source.state),
    houseNo: toTrimmedString(source.houseNo),
    nearbyPlace: toTrimmedString(source.nearbyPlace),
    relativeAddress:
      trackerType === "bed" ? toTrimmedString(source.relativeAddress) : undefined,
    relative1Relation: trackerType === "bed" ? toTrimmedString(source.relative1Relation) : undefined,
    relative1Name: trackerType === "bed" ? toTrimmedString(source.relative1Name) : undefined,
    relative1Phone: trackerType === "bed" ? toTrimmedPhone(source.relative1Phone) : undefined,
    relative2Relation: trackerType === "bed" ? toTrimmedString(source.relative2Relation) : undefined,
    relative2Name: trackerType === "bed" ? toTrimmedString(source.relative2Name) : undefined,
    relative2Phone: trackerType === "bed" ? toTrimmedPhone(source.relative2Phone) : undefined,
    companyAddress:
      trackerType !== "shop" ? toTrimmedString(source.companyAddress) : undefined,
    familyMembers:
      trackerType === "room" ? toNumberOrUndefined(source.familyMembers) : undefined,
    shopName: trackerType === "shop" ? toTrimmedString(source.shopName) : undefined,
    shopBusiness:
      trackerType === "shop" ? toTrimmedString(source.shopBusiness) : undefined,
    dateOfJoiningCollege:
      trackerType !== "shop" ? toTrimmedString(source.dateOfJoiningCollege) : undefined,
    dob: toTrimmedString(source.dob),
    joiningDate: toTrimmedString(source.joiningDate),
    baseRent: monthlyRent,
    rentAmount: monthlyRent,
    depositAmount,
    firstRentStatus: toTrimmedString(source.firstRentStatus) || "NOT_PAID",
    firstRentMonth: toTrimmedString(source.firstRentMonth),
  };

  return Object.fromEntries(
    Object.entries(prefill).filter(([, value]) => value !== undefined && value !== null && value !== "")
  );
}

function applyInviteQueryParams(url, prefill) {
  url.searchParams.set("tenant", "true");
  url.searchParams.set("lock", "1");
  if (prefill.trackerType) url.searchParams.set("trackerType", String(prefill.trackerType));
  if (prefill.propertyType) url.searchParams.set("propertyType", String(prefill.propertyType));
  if (prefill.name) url.searchParams.set("name", String(prefill.name));
  if (prefill.phoneNo) url.searchParams.set("phoneNo", String(prefill.phoneNo));
  if (prefill.category) url.searchParams.set("category", String(prefill.category));
  if (prefill.roomNo) url.searchParams.set("roomNo", String(prefill.roomNo));
  if (prefill.bedNo) url.searchParams.set("bedNo", String(prefill.bedNo));
  if (prefill.shopName) url.searchParams.set("shopName", String(prefill.shopName));
  if (prefill.shopBusiness) url.searchParams.set("shopBusiness", String(prefill.shopBusiness));
  if (prefill.familyMembers != null) {
    url.searchParams.set("familyMembers", String(prefill.familyMembers));
  }
  if (prefill.joiningDate) url.searchParams.set("joiningDate", String(prefill.joiningDate));
  if (prefill.baseRent != null) url.searchParams.set("baseRent", String(prefill.baseRent));
  if (prefill.rentAmount != null) url.searchParams.set("rentAmount", String(prefill.rentAmount));
  if (prefill.depositAmount != null) {
    url.searchParams.set("depositAmount", String(prefill.depositAmount));
  }
}

router.post("/", async (req, res) => {
  try {
    const prefill = buildInvitePrefill(req.body || {});

    if (!prefill.name) {
      return res.status(400).json({ ok: false, message: "Name is required" });
    }
    if (!prefill.joiningDate) {
      return res.status(400).json({ ok: false, message: "Joining Date is required" });
    }
    if (!prefill.roomNo) {
      return res.status(400).json({ ok: false, message: "Room/Shop No is required" });
    }
    if (prefill.trackerType === "bed" && !prefill.bedNo) {
      return res.status(400).json({ ok: false, message: "Bed No is required" });
    }
    if (!Number.isFinite(prefill.rentAmount) || prefill.rentAmount <= 0) {
      return res.status(400).json({ ok: false, message: "Rent amount is required" });
    }

    const srNo = await assignNextSrNoAndUpdateCounter();
    const createdForm = await Form.create({
      srNo,
      name: prefill.name,
      phoneNo: prefill.phoneNo ? Number(prefill.phoneNo) : undefined,
      category: prefill.category,
      propertyType: prefill.propertyType,
      roomId: prefill.roomId,
      roomNo: prefill.roomNo,
      bedNo: prefill.bedNo,
      wingName: prefill.wingName,
      floorNo: prefill.floorNo,
      joiningDate: toDateOrUndefined(prefill.joiningDate),
      address: prefill.address,
      pincode: prefill.pincode,
      city: prefill.city,
      state: prefill.state,
      houseNo: prefill.houseNo,
      nearbyPlace: prefill.nearbyPlace,
      relativeAddress: prefill.relativeAddress,
      relative1Relation: prefill.relative1Relation,
      relative1Name: prefill.relative1Name,
      relative1Phone: prefill.relative1Phone,
      relative2Relation: prefill.relative2Relation,
      relative2Name: prefill.relative2Name,
      relative2Phone: prefill.relative2Phone,
      companyAddress: prefill.companyAddress,
      familyMembers: prefill.familyMembers,
      shopName: prefill.shopName,
      shopBusiness: prefill.shopBusiness,
      dateOfJoiningCollege: toDateOrUndefined(prefill.dateOfJoiningCollege),
      dob: toDateOrUndefined(prefill.dob),
      depositAmount: prefill.depositAmount ?? 0,
      baseRent: prefill.rentAmount,
      rentAmount: prefill.rentAmount,
      firstRentStatus: prefill.firstRentStatus || "NOT_PAID",
      firstRentMonth: prefill.firstRentMonth,
      rents: [],
    });

    const token = crypto.randomUUID();
    await Invite.create({
      token,
      usedByFormId: createdForm._id,
      prefill,
    });

    const origin =
      req.headers["x-origin"] || `${req.protocol}://${req.get("host")}`;

    const url = new URL(tenantIntakePath(), origin);
    url.searchParams.set("inv", token);
    applyInviteQueryParams(url, prefill);

    res.json({ ok: true, token, url: url.toString(), formId: createdForm._id });
  } catch (err) {
    console.error("Create invite failed:", err);
    res.status(500).json({ ok: false, message: "Failed to create invite" });
  }
});

router.post("/for-form/:formId", async (req, res) => {
  try {
    const { formId } = req.params;
    const existing = await Form.findById(formId).lean();
    if (!existing) {
      return res.status(404).json({ ok: false, message: "Form not found" });
    }

    const prefill = buildInvitePrefill({ ...existing, ...(req.body || {}) });
    const token = crypto.randomUUID();

    const inv = await Invite.create({
      token,
      usedByFormId: existing._id,
      prefill,
      usedAt: null,
    });

    const origin =
      req.headers["x-origin"] || `${req.protocol}://${req.get("host")}`;

    const url = new URL(tenantIntakePath(), origin);
    url.searchParams.set("inv", token);
    applyInviteQueryParams(url, prefill);

    res.json({ ok: true, token, url: url.toString(), formId: existing._id, inviteId: inv._id });
  } catch (err) {
    console.error("Create invite for form failed:", err);
    res.status(500).json({ ok: false, message: "Failed to create invite" });
  }
});

router.get("/:token", async (req, res) => {
  try {
    const invDoc = await Invite.findOne({ token: req.params.token })
      .populate("usedByFormId", "srNo");

    if (!invDoc) {
      return res.status(404).json({ ok: false, message: "Invite not found" });
    }

    const now = new Date();
    if (invDoc.expiresAt && invDoc.expiresAt <= now) {
      return res.status(410).json({ ok: false, message: "Invite expired" });
    }

    if (!invDoc.usedByFormId) {
      return res.status(400).json({
        ok: false,
        message: "Invite not linked to a draft form (usedByFormId missing).",
      });
    }

    const formId = String(invDoc.usedByFormId?._id || invDoc.usedByFormId);
    const srNo = invDoc.usedByFormId?.srNo;
    const prefill = { ...(invDoc.prefill || {}) };
    if (prefill.baseRent !== "" && prefill.baseRent != null) {
      prefill.rentAmount = prefill.baseRent;
    }

    return res.json({
      ok: true,
      formId,
      srNo,
      prefill: { ...prefill, ...(srNo ? { srNo } : {}) },
      alreadyLinked: !!invDoc.usedAt,
    });
  } catch (err) {
    console.error("Validate invite failed:", err);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.put("/:token/submit", async (req, res) => {
  try {
    const token = req.params.token;
    const now = new Date();

    const inv = await Invite.findOneAndUpdate(
      {
        token,
        usedAt: null,
        $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
      },
      { $set: { usedAt: now } },
      { new: true }
    );

    if (!inv) {
      const exists = await Invite.findOne({ token }).lean();
      if (!exists) return res.status(404).json({ ok: false, message: "Invalid link" });
      if (exists.expiresAt && exists.expiresAt <= now) {
        return res.status(410).json({ ok: false, message: "Link expired" });
      }
      return res.status(409).json({ ok: false, message: "Link already used" });
    }

    const formId = inv.usedByFormId;
    if (!formId) return res.status(400).json({ ok: false, message: "Draft form missing" });

    const lockedValues = Object.fromEntries(
      Object.entries(inv.prefill || {}).filter(([, value]) => value !== "" && value != null)
    );
    const lockedKeys = new Set(Object.keys(lockedValues));
    const incoming = { ...(req.body || {}) };

    for (const key of lockedKeys) {
      delete incoming[key];
    }

    const updated = await Form.findByIdAndUpdate(
      formId,
      { $set: { ...lockedValues, ...incoming } },
      { new: true }
    );

    let messageStatus = { ok: false, skipped: true, reason: "Not attempted" };
    try {
      messageStatus = await sendAdmissionMessage(updated);
    } catch (error) {
      console.error("MSG91 admission message failed:", error?.data || error?.message || error);
      messageStatus = {
        ok: false,
        skipped: false,
        reason: error?.message || "MSG91 send failed",
        data: error?.data || null,
        status: error?.status || null,
      };
    }

    return res.json({
      ok: true,
      message: "Saved",
      form: updated,
      messageStatus,
    });
  } catch (err) {
    console.error("Invite submit failed:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
