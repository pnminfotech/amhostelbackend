// // routes/notifications.js
// const express = require("express");
// const router = express.Router();

// // IMPORTANT: use the correct model path you actually have
// const Form = require("../models/formModels");

// // Optional: in-memory list of SSE clients
// const sseClients = new Set();

// // tiny helper to push SSE event to all clients
// function pushSSE(event, payload) {
//   const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
//   for (const res of sseClients) {
//     try { res.write(data); } catch {}
//   }
// }

// // ---- Example simple notification storage (Mongo model) ----
// // If you already have a Notification model, use it instead.
// const mongoose = require("mongoose");
// const NotificationSchema = new mongoose.Schema(
//   {
//     type: { type: String, enum: ["payment_report", "leave_request"], required: true },
//     tenantId: { type: mongoose.Schema.Types.ObjectId, ref: "Form", required: true },
//     title: String,
//     message: String,
//     status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
//     read: { type: Boolean, default: false },
//     meta: mongoose.Schema.Types.Mixed,
//   },
//   { timestamps: true }
// );
// const Notification = mongoose.models.Notification || mongoose.model("Notification", NotificationSchema);

// // ====== SSE endpoint ======
// router.get("/notifications/stream", (req, res) => {
//   // SSE headers
//   res.setHeader("Content-Type", "text/event-stream");
//   res.setHeader("Cache-Control", "no-cache");
//   res.setHeader("Connection", "keep-alive");
//   // CORS (adjust for your origin if needed)
//   res.setHeader("Access-Control-Allow-Origin", "*");

//   res.flushHeaders?.(); // in case compression is enabled

//   // keep alive pings
//   const keepAlive = setInterval(() => {
//     res.write("event: ping\ndata: {}\n\n");
//   }, 25000);

//   // remember this client
//   sseClients.add(res);

//   // initial hello
//   res.write(`event: hello\ndata: {"ok":true}\n\n`);

//   req.on("close", () => {
//     clearInterval(keepAlive);
//     sseClients.delete(res);
//     try { res.end(); } catch {}
//   });
// });

// // ====== Basic REST endpoints the UI may call ======

// // list notifications (admin)
// router.get("/notifications", async (req, res) => {
//   const { status = "pending", limit = 50 } = req.query;
//   const q = status === "all" ? {} : { status };
//   const items = await Notification.find(q).sort({ createdAt: -1 }).limit(Number(limit));
//   res.json(items);
// });

// // mark as read
// router.patch("/notifications/:id/read", async (req, res) => {
//   await Notification.findByIdAndUpdate(req.params.id, { $set: { read: true } });
//   res.sendStatus(204);
// });

// // approve/reject payment (this is just an example update)
// router.post("/notifications/:id/approve-payment", async (req, res) => {
//   const n = await Notification.findById(req.params.id);
//   if (!n) return res.status(404).json({ error: "Not found" });
//   if (n.type !== "payment_report") return res.status(400).json({ error: "Not a payment notification" });

//   // mark approved
//   n.status = "approved";
//   await n.save();

//   // Update tenant rents here if you want (n.meta should have amount, month, year, utr)
//   // ... your existing rent merge logic ...

//   // push SSE update to all admins
//   pushSSE("updated", { _id: n._id, status: "approved" });

//   res.json({ ok: true });
// });

// router.post("/notifications/:id/reject-payment", async (req, res) => {
//   const n = await Notification.findById(req.params.id);
//   if (!n) return res.status(404).json({ error: "Not found" });
//   if (n.type !== "payment_report") return res.status(400).json({ error: "Not a payment notification" });

//   n.status = "rejected";
//   await n.save();
//   pushSSE("updated", { _id: n._id, status: "rejected" });
//   res.json({ ok: true });
// });

// // approve/reject leave
// router.post("/notifications/:id/approve-leave", async (req, res) => {
//   const n = await Notification.findById(req.params.id);
//   if (!n) return res.status(404).json({ error: "Not found" });
//   if (n.type !== "leave_request") return res.status(400).json({ error: "Not a leave notification" });

//   n.status = "approved";
//   await n.save();
//   // update tenant leaveDate if meta.leaveDate exists
//   if (n.tenantId && n.meta?.leaveDate) {
//     await Form.findByIdAndUpdate(n.tenantId, { $set: { leaveDate: n.meta.leaveDate } });
//   }
//   pushSSE("updated", { _id: n._id, status: "approved" });
//   res.json({ ok: true });
// });

// router.post("/notifications/:id/reject-leave", async (req, res) => {
//   const n = await Notification.findById(req.params.id);
//   if (!n) return res.status(404).json({ error: "Not found" });
//   if (n.type !== "leave_request") return res.status(400).json({ error: "Not a leave notification" });

//   n.status = "rejected";
//   await n.save();
//   pushSSE("updated", { _id: n._id, status: "rejected" });
//   res.json({ ok: true });
// });

// // ===== Helper to create a notification (call this from your other routers) =====
// async function createNotification({ type, tenantId, title, message, meta }) {
//   const n = await Notification.create({ type, tenantId, title, message, meta, status: "pending" });
//   // send SSE "created" to all clients
//   pushSSE("created", n);
//   return n;
// }

// module.exports = { router, createNotification };





// routes/notifications.js
const express = require("express");
const router = express.Router();

const Form = require("../models/formModels");
const LeaveRequest = require("../models/LeaveRequest");

// ---- (OPTIONAL) admin auth; swap with your real middleware if you have one
const adminOnly = (req, res, next) => next();

// =======================
// ADMIN: Leave notifications
// =======================

// GET /api/admin/notifications/leave?status=pending&limit=50
router.get("/admin/notifications/leave", adminOnly, async (req, res) => {
  const { status = "pending", limit = 50 } = req.query;
  const q = status === "all" ? {} : { status };

  const docs = await LeaveRequest.find(q)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .populate({ path: "tenant", select: "name roomNo bedNo" })
    .lean();

  const items = docs.map((d) => ({
    _id: String(d._id),
    type: "leave_request",
    tenantId: d.tenant?._id || null,
    tenantName: d.tenantName || d.tenant?.name || "Tenant",
    roomNo: d.tenant?.roomNo,
    bedNo: d.tenant?.bedNo,
    leaveDate: d.leaveDate,
    note: d.note,
    status: d.status,
    createdAt: d.createdAt,
    requestId: String(d._id),
  }));

  res.json(items);
});

// POST /api/admin/leave/:id/approve
router.post("/admin/leave/:id/approve", adminOnly, async (req, res) => {
  const lr = await LeaveRequest.findById(req.params.id);
  if (!lr) return res.status(404).json({ message: "Leave request not found" });
  if (lr.status !== "pending") return res.status(400).json({ message: "Already processed" });

  lr.status = "approved";
  await lr.save();

  if (lr.tenant && lr.leaveDate) {
    await Form.findByIdAndUpdate(lr.tenant, { $set: { leaveDate: lr.leaveDate } });
  }

  res.json({ ok: true });
});

// POST /api/admin/leave/:id/reject
router.post("/admin/leave/:id/reject", adminOnly, async (req, res) => {
  const lr = await LeaveRequest.findById(req.params.id);
  if (!lr) return res.status(404).json({ message: "Leave request not found" });
  if (lr.status !== "pending") return res.status(400).json({ message: "Already processed" });

  lr.status = "rejected";
  await lr.save();

  res.json({ ok: true });
});

// DEV-ONLY: seed one pending leave so the bell can see something
// POST or GET /api/admin/notifications/leave/_seed
router.post("/admin/notifications/leave/_seed", async (req, res) => {
  try {
    const anyTenant = await Form.findOne().lean();
    if (!anyTenant) return res.status(400).json({ message: "No tenant to attach" });

    const doc = await LeaveRequest.create({
      tenant: anyTenant._id,
      tenantName: anyTenant.name,
      leaveDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      note: "Family function",
      status: "pending",
    });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});
router.get("/admin/notifications/leave/_seed", async (req, res) => {
  try {
    const anyTenant = await Form.findOne().lean();
    if (!anyTenant) return res.status(400).json({ message: "No tenant to attach" });

    const doc = await LeaveRequest.create({
      tenant: anyTenant._id,
      tenantName: anyTenant.name,
      leaveDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      note: "Family function",
      status: "pending",
    });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
});

module.exports = router;
