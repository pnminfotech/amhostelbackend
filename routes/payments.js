// const express = require("express");
// const router = express.Router();
// // const PaymentNotification = require("../models/PaymentNotification");
// const PaymentNotification = require('../models/PaymentNotification');

// // list notifications for the bell
// router.get("/notifications", async (req, res) => {
//   const { status = "all", limit = 30 } = req.query;
//   const q = status === "all" ? {} : { status };
//   const items = await PaymentNotification.find(q).sort({ createdAt: -1 }).limit(Number(limit));
//   res.json(items);
// });

// // mark all read (filter optional)
// router.post("/notifications/read-all", async (req, res) => {
//   const { status = "all" } = req.body || {};
//   const q = status === "all" ? {} : { status };
//   await PaymentNotification.updateMany(q, { $set: { read: true } });
//   res.sendStatus(204);
// });

// // mark single read
// router.patch("/notifications/:id/read", async (req, res) => {
//   await PaymentNotification.findByIdAndUpdate(req.params.id, { $set: { read: true } });
//   res.sendStatus(204);
// });

// // approve / reject
// router.post("/approve/:id", async (req, res) => {
//   const n = await PaymentNotification.findByIdAndUpdate(
//     req.params.id,
//     { $set: { status: "approved", read: true } },
//     { new: true }
//   );
//   if (!n) return res.sendStatus(404);
//   res.json(n);
// });

// router.post("/reject/:id", async (req, res) => {
//   const n = await PaymentNotification.findByIdAndUpdate(
//     req.params.id,
//     { $set: { status: "rejected", read: true } },
//     { new: true }
//   );
//   if (!n) return res.sendStatus(404);
//   res.json(n);
// });

// // (optional) a broader “reports” list the UI might call
// router.get("/reports", async (req, res) => {
//   const { status = "all", limit = 50 } = req.query;
//   const q = status === "all" ? {} : { status };
//   const items = await PaymentNotification.find(q).sort({ createdAt: -1 }).limit(Number(limit));
//   res.json(items);
// });

// module.exports = router;



// routes/paymentRouter.js
const express = require("express");
const router = express.Router();

const PaymentNotification = require("../models/PaymentNotification");
const Payment = require("../models/Payment");
const Form = require("../models/formModels"); // your tenant collection ("Form")

// --- helpers ---
/** Convert (year, month 1..12) -> Date at first of that month. Falls back to "now". */
function monthToFirstDate(year, month1to12) {
  const now = new Date();
  const y = Number(year) || now.getFullYear();
  const mIdx = (Number(month1to12) || (now.getMonth() + 1)) - 1; // 0..11
  return new Date(y, mIdx, 1);
}

/* =========================
 * LIST / READ NOTIFICATIONS
 * ========================= */
router.get("/notifications", async (req, res) => {
  try {
    const { status = "all", limit = 30 } = req.query;
    const q = status === "all" ? {} : { status };
    const items = await PaymentNotification.find(q)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate("paymentId", "status amount month year utr note createdAt")
      .populate("tenantId", "name roomNo bedNo");
    res.json(items);
  } catch (err) {
    console.error("GET /payments/notifications error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/notifications/read-all", async (req, res) => {
  try {
    const { status = "all" } = req.body || {};
    const q = status === "all" ? {} : { status };
    await PaymentNotification.updateMany(q, { $set: { read: true } });
    res.sendStatus(204);
  } catch (err) {
    console.error("POST /payments/notifications/read-all error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

router.patch("/notifications/:id/read", async (req, res) => {
  try {
    await PaymentNotification.findByIdAndUpdate(req.params.id, { $set: { read: true } });
    res.sendStatus(204);
  } catch (err) {
    console.error("PATCH /payments/notifications/:id/read error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========
 * APPROVE
 * ===========
 * - Flip Payment.status -> confirmed
 * - Upsert into Form.rents[] for that (month,year)
 * - Flip Notification.status -> approved + read
 */
router.post("/approve/:id", async (req, res) => {
  try {
    const notif = await PaymentNotification.findById(req.params.id);
    if (!notif) return res.status(404).json({ message: "notification not found" });

    // Load payment (by linked id; fall back to search)
    let pay = notif.paymentId ? await Payment.findById(notif.paymentId) : null;
    if (!pay) {
      pay = await Payment.findOne({
        tenant: notif.tenantId,
        status: "reported",
        amount: notif.amount,
        month: notif.month,
        year: notif.year,
        utr: notif.utr || undefined,
      }).sort({ createdAt: -1 });
    }
    if (!pay) return res.status(404).json({ message: "linked payment not found" });

    if (pay.status !== "reported") {
      return res.status(400).json({ message: `payment already ${pay.status}` });
    }

    // Upsert a rent record into the tenant form for that month
    const tenant = await Form.findById(notif.tenantId);
    if (!tenant) return res.status(404).json({ message: "tenant not found" });

    const rentDate = monthToFirstDate(pay.year, pay.month);
    const y = rentDate.getFullYear();
    const m = rentDate.getMonth();

    // const existing = (tenant.rents || []).find((r) => {
    //   if (!r?.date) return false;
    //   const d = new Date(r.date);
    //   return d.getFullYear() === y && d.getMonth() === m;
    // });
// ⬇️ add near the top of the file if you like (helper)
function toMonthKey(y, m /* 0..11 */) {
  return `${new Date(y, m, 1).toLocaleString("en-US",{ month:"short" })}-${String(y).slice(-2)}`;
}

// ... inside /approve/:id AFTER you computed `rentDate`, `y`, `m`
const monthKey = toMonthKey(y, m);

// ✅ rent payload always includes a canonical month key
const rentPayload = {
  month: monthKey,
  rentAmount: Number(pay.amount) || 0,
  date: rentDate,                               // keep date as the payment date
  paymentMode: pay.paymentMode || "Online",
  utr: pay.utr || "",
  note: pay.note || "",
};

// 🔎 find existing by month key OR by year-month of date (back-compat)
const existing = (tenant.rents || []).find((r) => {
  if (r?.month && r.month === monthKey) return true;
  if (r?.date) {
    const d = new Date(r.date);
    return d.getFullYear() === y && d.getMonth() === m;
  }
  return false;
});

if (existing) {
  existing.month = monthKey; // normalize
  existing.rentAmount = rentPayload.rentAmount;
  existing.date = rentPayload.date;
  existing.paymentMode = rentPayload.paymentMode;
  existing.utr = rentPayload.utr;
  existing.note = rentPayload.note;
} else {
  tenant.rents = [...(tenant.rents || []), rentPayload];
}
await tenant.save();

// Flip payment + notification
pay.status = "confirmed";
await pay.save();

    notif.status = "approved";
    notif.read = true;
    await notif.save();

    res.json({ ok: true, notification: notif });
  } catch (err) {
    console.error("POST /payments/approve/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ===========
 * REJECT
 * ===========
 * - Flip Payment.status -> rejected
 * - Flip Notification.status -> rejected + read
 */
router.post("/reject/:id", async (req, res) => {
  try {
    const notif = await PaymentNotification.findById(req.params.id);
    if (!notif) return res.status(404).json({ message: "notification not found" });

    let pay = notif.paymentId ? await Payment.findById(notif.paymentId) : null;
    if (!pay) {
      pay = await Payment.findOne({
        tenant: notif.tenantId,
        status: "reported",
        amount: notif.amount,
        month: notif.month,
        year: notif.year,
        utr: notif.utr || undefined,
      }).sort({ createdAt: -1 });
    }
    if (!pay) return res.status(404).json({ message: "linked payment not found" });

    if (pay.status !== "reported") {
      return res.status(400).json({ message: `payment already ${pay.status}` });
    }

    pay.status = "rejected";
    await pay.save();

    notif.status = "rejected";
    notif.read = true;
    await notif.save();

    res.json({ ok: true, notification: notif });
  } catch (err) {
    console.error("POST /payments/reject/:id error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

/* ============================
 * OPTIONAL: payments "reports"
 * ============================ */
router.get("/reports", async (req, res) => {
  try {
    const { status = "all", limit = 50 } = req.query;
    const q = status === "all" ? {} : { status };
    const items = await Payment.find(q)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .populate("tenant", "name roomNo bedNo");
    res.json(items);
  } catch (err) {
    console.error("GET /payments/reports error:", err);
    res.status(500).json({ message: "Server error" });
  }
});
// One-off: backfill missing notifications for reported payments
router.post('/bootstrap-notifs', async (req, res) => {
  try {
    const PaymentNotification = require('../models/PaymentNotification');
    const Form = require('../models/formModels');
    const reported = await Payment.find({ status: 'reported' }).lean();
    const made = [];

    for (const pay of reported) {
      const exists = await PaymentNotification.findOne({ paymentId: pay._id });
      if (exists) continue;

      if (!pay.tenant) continue; // safety

      const doc = await PaymentNotification.create({
        tenantId: pay.tenant,
        paymentId: pay._id,
        amount: pay.amount,
        month: pay.month,
        year: pay.year,
        utr: pay.utr,
        note: pay.note,
        status: 'pending',
        read: false,
      });
      made.push(doc._id);
    }

    res.json({ ok: true, created: made.length, ids: made });
  } catch (e) {
    console.error('bootstrap-notifs error:', e);
    res.status(500).json({ message: 'bootstrap-notifs failed', error: String(e) });
  }
});

module.exports = router;
