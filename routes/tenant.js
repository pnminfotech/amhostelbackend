// // routes/tenantRoutes.js
// const express = require('express');
// const router = express.Router();
// const jwt = require('jsonwebtoken');
// const QRCode = require('qrcode');

// const Form = require('../models/formModels');
// const OtpSession = require('../models/OtpSession');
// const authTenant = require('../middleware/tenantAuth');
// const { docsUpload, avatarUpload, ekycUpload } = require('../lib/upload');
// const Payment = require('../models/Payment');

// // Debug ping (optional)
// router.get('/auth/ping', (req, res) => res.json({ ok: true, at: '/api/tenant/auth/ping' }));

// // ---------- AUTH (OTP) ----------
// router.post('/auth/request-otp', async (req, res) => {
//   const { phone } = req.body;
//   if (!phone) return res.status(400).json({ message: "phone required" });

//   const code = process.env.NODE_ENV === 'production'
//     ? String(Math.floor(100000 + Math.random() * 900000))
//     : '123456';

//   await OtpSession.deleteMany({ phone });
//   await OtpSession.create({ phone, code, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });

//   res.json({ ok: true, devCode: process.env.NODE_ENV === 'production' ? undefined : code });
// });

// router.post('/auth/verify', async (req, res) => {
//   const { phone, code } = req.body;
//   if (!phone || !code) return res.status(400).json({ message: "phone & code required" });

//   const sess = await OtpSession.findOne({ phone, code });
//   if (!sess || new Date(sess.expiresAt) < new Date()) {
//     return res.status(400).json({ message: "Invalid/expired code" });
//   }

//   const me = await Form.findOne({ phoneNo: Number(phone) });
//   if (!me) return res.status(404).json({ message: "Tenant not found" });

//   await OtpSession.deleteMany({ phone });

//   // inside POST /auth/verify
// const token = jwt.sign(
//   { id: me._id.toString() },   // role not required since middleware doesn’t check it
//   'dev_secret',                // <— MUST MATCH middleware
//   { expiresIn: '30d' }
// );
// //
//   res.json({ token });
// });

// // ---------- ME ----------
// router.get('/me', authTenant, async (req, res) => res.json(req.tenant));

// // ---------- PROFILE ----------
// router.put('/profile', authTenant, async (req, res) => {
//   const up = {};
//   ['name','email','address','companyAddress','emergencyContact','dob'].forEach(k => {
//     if (req.body[k] != null) up[k] = req.body[k];
//   });
//   Object.assign(req.tenant, up);
//   await req.tenant.save();
//   res.json(req.tenant);
// });

// router.post('/profile/avatar', authTenant, avatarUpload.single('avatar'), async (req, res) => {
//   if (!req.file) return res.status(400).json({ message: "no file" });
//   const url = `/uploads/avatars/${req.file.filename}`;
//   req.tenant.avatarUrl = url;
//   await req.tenant.save();
//   res.json({ avatarUrl: url });
// });

// // ---------- DOCS ----------
// router.post('/docs', authTenant, docsUpload.array('documents'), async (req, res) => {
//   const files = req.files || [];
//   const mapped = files.map((f) => ({
//     fileName: f.originalname,
//     url: `/uploads/docs/${f.filename}`,
//     contentType: f.mimetype,
//     size: f.size,
//     relation: "Self",
//   }));
//   req.tenant.documents = [...(req.tenant.documents || []), ...mapped];
//   await req.tenant.save();
//   res.json({ ok: true, added: mapped.length });
// });

// // ---------- RENTS ----------
// router.get('/rents', authTenant, async (req, res) => {
//   const t = req.tenant;
//   const now = new Date();
//   const y = now.getFullYear();
//   const paidSet = new Set(
//     (t.rents || [])
//       .filter(r => r?.date && Number(r.rentAmount) > 0)
//       .map(r => { const d = new Date(r.date); return `${d.getFullYear()}-${d.getMonth()}`; })
//   );

//  // start counting from the later of: Jan 1st this year OR month after joining
//  const base = Number(t.baseRent || 0);
//  let totalDue = 0;
//  const join = t.joiningDate ? new Date(t.joiningDate) : null;
//  const startOfYear = new Date(y, 0, 1);
//  // month after joining
//  const startAfterJoin = join ? new Date(join.getFullYear(), join.getMonth() + 1, 1) : startOfYear;
//  const start = startAfterJoin > startOfYear ? startAfterJoin : startOfYear;

//  const cursor = new Date(start);
//  while (cursor.getFullYear() === y && cursor <= now) {
//    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
//    if (!paidSet.has(key)) totalDue += base;
//    cursor.setMonth(cursor.getMonth() + 1);
//  }
//   res.json({ currentYear: y, totalDue, rents: t.rents || [] });
// });

// // ---------- LEAVE ----------
// router.post('/leave', authTenant, async (req, res) => {
//   const { leaveDate } = req.body;
//   if (!leaveDate) return res.status(400).json({ message: "leaveDate required" });
//   req.tenant.leaveRequestDate = new Date(leaveDate);
//   await req.tenant.save();
//   res.json({ ok: true, leaveRequestDate: req.tenant.leaveRequestDate });
// });

// // ---------- ANNOUNCEMENTS ----------
// router.get('/announcements', authTenant, async (_req, res) => {
//   res.json([]); // replace with real announcements
// });

// // ---------- eKYC ----------
// router.get('/ekyc', authTenant, async (req, res) => res.json(req.tenant.ekyc || { status: "not_started" }));

// router.post('/ekyc', authTenant, ekycUpload.fields([
//   { name: 'docs', maxCount: 10 },
//   { name: 'selfie', maxCount: 1 },
// ]), async (req, res) => {
//   const { aadhaarLast4, panLast4 } = req.body;
//   const docs = (req.files?.docs || []).map(f => ({
//     fileName: f.originalname,
//     url: `/uploads/ekyc/${f.filename}`,
//     contentType: f.mimetype,
//     size: f.size,
//     relation: "Self",
//   }));
//   const selfie = (req.files?.selfie || [])[0];
//   const selfieUrl = selfie ? `/uploads/ekyc/${selfie.filename}` : undefined;

//   req.tenant.ekyc = {
//     ...(req.tenant.ekyc || {}),
//     status: "pending",
//     aadhaarLast4,
//     panLast4,
//     selfieUrl: selfieUrl || req.tenant.ekyc?.selfieUrl,
//     docs: [ ...(req.tenant.ekyc?.docs || []), ...docs ],
//   };
//   await req.tenant.save();
//   res.json({ ok: true, ekyc: req.tenant.ekyc });
// });

// // ---------- UPI ----------
// router.get('/upi-qr', async (req, res) => {
//   const amount = Number(req.query.amount || 0);
//   const note = String(req.query.note || 'Rent');
//   const payeeVPA  = process.env.UPI_VPA  || 'demo@upi';
//   const payeeName = process.env.UPI_NAME || 'Hostel Owner';
//   const url = `upi://pay?pa=${encodeURIComponent(payeeVPA)}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
//   try {
//     const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 256 });
//     res.setHeader('Content-Type','image/svg+xml'); res.send(svg);
//   } catch { res.status(500).send('QR error'); }
// });

// router.get('/upi-intent', (req, res) => {
//   const amount = Number(req.query.amount || 0);
//   const note = String(req.query.note || 'Rent');
//   const payeeVPA  = process.env.UPI_VPA  || 'demo@upi';
//   const payeeName = process.env.UPI_NAME || 'Hostel Owner';
//   const url = `upi://pay?pa=${encodeURIComponent(payeeVPA)}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
//   res.redirect(url);
// });

// // ---------- PAYMENTS ----------
// router.get('/payments/my', authTenant, async (req, res) => {
//   const list = await Payment.find({ tenant: req.tenant._id }).sort({ createdAt: -1 });
//   res.json(list);
// });

// // router.post('/payments/report', authTenant, async (req, res) => {
// //   const { amount, utr, note, month, year } = req.body;
// //   if (!amount) return res.status(400).json({ message: 'amount required' });

// //  const p = await Payment.create({
// //     tenant: req.tenant._id,
// //     amount: Number(amount),
// //     utr: (utr || '').trim(),
// //     note: (note || '').trim(),
// //     month: (month ?? null),
// //     year:  (year ?? null),
// //     status: 'reported',
// //   });
// //  // 🔔 ALSO create a PaymentNotification so the admin can see/act
// //   try {
// //     const PaymentNotification = require('../models/PaymentNotification');
// //     await PaymentNotification.create({
// //       tenantId: req.tenant._id,
// //       paymentId: p._id,
// //       amount: p.amount,
// //       month: p.month,
// //       year: p.year,
// //       utr: p.utr,
// //       note: p.note,
// //       status: 'pending',
// //       read: false,
// //     });
// //   } catch (e) {
// //     console.error('Failed to create PaymentNotification:', e);
// //     // not fatal for the tenant flow
// //   }
// //   res.json({ ok: true, payment: p });
// // });
// // routes/tenantRoutes.js
// router.post('/payments/report', authTenant, async (req, res) => {
//   const { amount, utr, note, month, year } = req.body;
//   if (!amount) return res.status(400).json({ message: 'amount required' });

//   const p = await Payment.create({
//     tenant: req.tenant._id,
//     amount: Number(amount),
//     utr: (utr || '').trim(),
//     note: (note || '').trim(),
//     month: (month ?? null),
//     year:  (year ?? null),
//     status: 'reported',
//   });

//  // 🔔 Create an admin-facing notification
//  try {
//    const PaymentNotification = require('../models/PaymentNotification');
//    const payload = {
//      tenantId: req.tenant._id,
//      paymentId: p._id,
//      amount: p.amount,
//      month: p.month,
//      year: p.year,
//      utr: p.utr,
//      note: p.note,
//      status: 'pending',
//      read: false,
//    };
//    console.log('[notif] creating PaymentNotification =>', payload);
//    const created = await PaymentNotification.create(payload);
//    console.log('[notif] created id:', created._id);
//  } catch (e) {
//    console.error('[notif] FAILED to create PaymentNotification:', e);
//  }
//   res.json({ ok: true, payment: p });
// });


// module.exports = router;




// routes/tenantRoutes.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

const Form = require('../models/formModels');
const OtpSession = require('../models/OtpSession');
const authTenant = require('../middleware/tenantAuth');
const { docsUpload, avatarUpload, ekycUpload } = require('../lib/upload');
const Payment = require('../models/Payment');
const path = require('path');
const fs = require('fs');

/* ------------------------------------------------------------------ */
/* Helpers kept in this file (no new files created)                    */
/* ------------------------------------------------------------------ */
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png']);

function isAllowedImageFile(file) {
  if (!file) return false;

  const mime = String(file.mimetype || '').toLowerCase();
  const ext = path.extname(String(file.originalname || '')).toLowerCase();

  return ALLOWED_IMAGE_MIME_TYPES.has(mime) && ALLOWED_IMAGE_EXTENSIONS.has(ext);
}

function normalizePhone(raw) {
  // Keep only digits, take last 10 (adapt to your country if needed)
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.slice(-10);
}

const TENANT_JWT_SECRET = process.env.TENANT_JWT_SECRET || 'dev_secret';
const DEV_SHOW_OTP = process.env.DEV_SHOW_OTP === '1'; // set to 1 on Render to return devCode in prod

// Debug ping (optional)
router.get('/auth/ping', (req, res) => res.json({ ok: true, at: '/api/tenant/auth/ping' }));

/* ------------------------------------------------------------------ */
/* AUTH (OTP)                                                          */
/* ------------------------------------------------------------------ */
// router.post('/auth/request-otp', async (req, res) => {
//   try {
//     const phoneNorm = normalizePhone(req.body?.phone);
//     if (!phoneNorm) return res.status(400).json({ message: "phone required" });

//     const code =
//       (process.env.NODE_ENV === 'production' && !DEV_SHOW_OTP)
//         ? String(Math.floor(100000 + Math.random() * 900000))
//         : '123456';

//     await OtpSession.deleteMany({ phone: phoneNorm });
//     await OtpSession.create({
//       phone: phoneNorm,
//       code,
//       expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
//     });

//     // Return devCode only if DEV_SHOW_OTP=1 (safe for live testing)
//     res.json({
//       ok: true,
//       expiresIn: 300,
//       devCode: DEV_SHOW_OTP ? code : undefined
//     });
//   } catch (e) {
//     console.error('request-otp error:', e);
//     res.status(500).json({ message: 'request-otp failed' });
//   }
// });

// router.post('/auth/verify', async (req, res) => {
//   try {
//     const phoneNorm = normalizePhone(req.body?.phone);
//     const code = String(req.body?.code || req.body?.otp || '').trim();

//     if (!phoneNorm || !code) {
//       return res.status(400).json({ message: "phone & code required" });
//     }

//     const sess = await OtpSession.findOne({ phone: phoneNorm, code });
//     if (!sess || new Date(sess.expiresAt) < new Date()) {
//       return res.status(400).json({ message: "Invalid/expired code" });
//     }

//     // Try to find tenant with phoneNo stored either as string (normalized) OR legacy numeric
//     let me = await Form.findOne({
//       $or: [
//         { phoneNo: phoneNorm },
//         { phoneNo: Number(phoneNorm) }
//       ]
//     });

//     if (!me) {
//       return res.status(404).json({ message: "Tenant not found" });
//     }

//     await OtpSession.deleteMany({ phone: phoneNorm });

//     const token = jwt.sign(
//       { id: me._id.toString() },
//       TENANT_JWT_SECRET, // must match middleware
//       { expiresIn: '30d' }
//     );

//     res.json({ token });
//   } catch (e) {
//     console.error('verify error:', e);
//     res.status(500).json({ message: 'verify failed' });
//   }
// });

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/* AUTH (OTP) – always echo code back for frontend (DEV-only)         */
/* ------------------------------------------------------------------ */
router.post('/auth/request-otp', async (req, res) => {
  try {
    const phoneNorm = normalizePhone(req.body?.phone);
    if (!phoneNorm) return res.status(400).json({ message: "phone required" });

    // Always random 6-digit
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // 1 OTP row per phone (simplest). If you want multiple, remove deleteMany.
    await OtpSession.deleteMany({ phone: phoneNorm });
    const sess = await OtpSession.create({
      phone: phoneNorm,
      code,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    });

    // 👇 Echo back code + otpId so frontend can display
    res.json({
      ok: true,
      otpId: String(sess._id),
      code,              // <-- visible to client
      expiresIn: 300
    });
  } catch (e) {
    console.error('request-otp error:', e);
    res.status(500).json({ message: 'request-otp failed' });
  }
});

router.post('/auth/verify', async (req, res) => {
  try {
    const phoneNorm = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || req.body?.otp || '').trim();
    const otpId = req.body?.otpId ? String(req.body.otpId) : null;

    if (!phoneNorm || !code) {
      return res.status(400).json({ message: "phone & code required" });
    }

    // Prefer otpId when provided, else fall back to (phone+code)
    let sess = null;
    if (otpId) {
      sess = await OtpSession.findOne({ _id: otpId, phone: phoneNorm, code });
    } else {
      sess = await OtpSession.findOne({ phone: phoneNorm, code }).sort({ _id: -1 });
    }

    if (!sess || new Date(sess.expiresAt) < new Date()) {
      return res.status(400).json({ message: "Invalid/expired code" });
    }

    // Find tenant by phone (string last10 or legacy number)
    const me = await Form.findOne({
      $or: [
        { phoneNo: phoneNorm },
        { phoneNo: Number(phoneNorm) }
      ]
    });
    if (!me) return res.status(404).json({ message: "Tenant not found" });

    // One-time OTP
    await OtpSession.deleteMany({ phone: phoneNorm });

    const token = jwt.sign(
      { id: me._id.toString() },
      TENANT_JWT_SECRET,       // must match your authTenant middleware
      { expiresIn: '30d' }
    );

    res.json({ token });
  } catch (e) {
    console.error('verify error:', e);
    res.status(500).json({ message: 'verify failed' });
  }
});
/* ------------------------------------------------------------------ */
/* AUTH (OTP) – always echo code back for frontend (DEV-only)         */
/* ------------------------------------------------------------------ */
router.post('/auth/request-otp', async (req, res) => {
  try {
    const phoneNorm = normalizePhone(req.body?.phone);
    if (!phoneNorm) return res.status(400).json({ message: "phone required" });

    // Always random 6-digit
    const code = String(Math.floor(100000 + Math.random() * 900000));

    // 1 OTP row per phone (simplest). If you want multiple, remove deleteMany.
    await OtpSession.deleteMany({ phone: phoneNorm });
    const sess = await OtpSession.create({
      phone: phoneNorm,
      code,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
    });

    // 👇 Echo back code + otpId so frontend can display
    res.json({
      ok: true,
      otpId: String(sess._id),
      code,              // <-- visible to client
      expiresIn: 300
    });
  } catch (e) {
    console.error('request-otp error:', e);
    res.status(500).json({ message: 'request-otp failed' });
  }
});

router.post('/auth/verify', async (req, res) => {
  try {
    const phoneNorm = normalizePhone(req.body?.phone);
    const code = String(req.body?.code || req.body?.otp || '').trim();
    const otpId = req.body?.otpId ? String(req.body.otpId) : null;

    if (!phoneNorm || !code) {
      return res.status(400).json({ message: "phone & code required" });
    }

    // Prefer otpId when provided, else fall back to (phone+code)
    let sess = null;
    if (otpId) {
      sess = await OtpSession.findOne({ _id: otpId, phone: phoneNorm, code });
    } else {
      sess = await OtpSession.findOne({ phone: phoneNorm, code }).sort({ _id: -1 });
    }

    if (!sess || new Date(sess.expiresAt) < new Date()) {
      return res.status(400).json({ message: "Invalid/expired code" });
    }

    // Find tenant by phone (string last10 or legacy number)
    const me = await Form.findOne({
      $or: [
        { phoneNo: phoneNorm },
        { phoneNo: Number(phoneNorm) }
      ]
    });
    if (!me) return res.status(404).json({ message: "Tenant not found" });

    // One-time OTP
    await OtpSession.deleteMany({ phone: phoneNorm });

    const token = jwt.sign(
      { id: me._id.toString() },
      TENANT_JWT_SECRET,       // must match your authTenant middleware
      { expiresIn: '30d' }
    );

    res.json({ token });
  } catch (e) {
    console.error('verify error:', e);
    res.status(500).json({ message: 'verify failed' });
  }
});

/* ME                                                                  */
/* ------------------------------------------------------------------ */
router.get('/me', authTenant, async (req, res) => res.json(req.tenant));

/* ------------------------------------------------------------------ */
/* PROFILE                                                             */
/* ------------------------------------------------------------------ */
router.put('/profile', authTenant, async (req, res) => {
  const up = {};
  ['name','email','address','companyAddress','emergencyContact','dob'].forEach(k => {
    if (req.body[k] != null) up[k] = req.body[k];
  });
  Object.assign(req.tenant, up);
  await req.tenant.save();
  res.json(req.tenant);
});

router.post('/profile/avatar', authTenant, avatarUpload.single('avatar'), async (req, res) => {
  if (req.fileValidationError) {
    return res.status(400).json({ message: req.fileValidationError });
  }
  if (!req.file) return res.status(400).json({ message: "no file" });
  const url = `/uploads/avatars/${req.file.filename}`;
  req.tenant.avatarUrl = url;
  await req.tenant.save();
  res.json({ avatarUrl: url });
});

/* ------------------------------------------------------------------ */
/* DOCS                                                                */
/* ------------------------------------------------------------------ */
router.post('/docs', authTenant, docsUpload.array('documents'), async (req, res) => {
  if (req.fileValidationError) {
    (req.files || []).forEach((file) => {
      try {
        if (file?.path) fs.unlinkSync(file.path);
      } catch (_) {}
    });
    return res.status(400).json({ message: req.fileValidationError });
  }
  const files = req.files || [];
  const mapped = files.map((f) => ({
    fileName: f.originalname,
    url: `/uploads/docs/${f.filename}`,
    contentType: f.mimetype,
    size: f.size,
    relation: "Self",
  }));
  req.tenant.documents = [...(req.tenant.documents || []), ...mapped];
  await req.tenant.save();
  res.json({ ok: true, added: mapped.length });
});

/* ------------------------------------------------------------------ */
/* RENTS                                                               */
/* ------------------------------------------------------------------ */
router.get('/rents', authTenant, async (req, res) => {
  const t = req.tenant;
  const now = new Date();
  const y = now.getFullYear();
  const paidSet = new Set(
    (t.rents || [])
      .filter(r => r?.date && Number(r.rentAmount) > 0)
      .map(r => { const d = new Date(r.date); return `${d.getFullYear()}-${d.getMonth()}`; })
  );

  const base = Number(t.baseRent || 0);
  let totalDue = 0;
  const join = t.joiningDate ? new Date(t.joiningDate) : null;
  const startOfYear = new Date(y, 0, 1);
  const startAfterJoin = join ? new Date(join.getFullYear(), join.getMonth() + 1, 1) : startOfYear;
  const start = startAfterJoin > startOfYear ? startAfterJoin : startOfYear;

  const cursor = new Date(start);
  while (cursor.getFullYear() === y && cursor <= now) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    if (!paidSet.has(key)) totalDue += base;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  res.json({ currentYear: y, totalDue, rents: t.rents || [] });
});

/* ------------------------------------------------------------------ */
/* LEAVE                                                               */
/* ------------------------------------------------------------------ */
router.post('/leave', authTenant, async (req, res) => {
  const { leaveDate } = req.body;
  if (!leaveDate) return res.status(400).json({ message: "leaveDate required" });
  req.tenant.leaveRequestDate = new Date(leaveDate);
  await req.tenant.save();
  res.json({ ok: true, leaveRequestDate: req.tenant.leaveRequestDate });
});

/* ------------------------------------------------------------------ */
/* ANNOUNCEMENTS                                                       */
/* ------------------------------------------------------------------ */
router.get('/announcements', authTenant, async (_req, res) => {
  res.json([]); // replace with real announcements
});

/* ------------------------------------------------------------------ */
/* eKYC                                                                */
/* ------------------------------------------------------------------ */
router.get('/ekyc', authTenant, async (req, res) => res.json(req.tenant.ekyc || { status: "not_started" }));

router.post('/ekyc', authTenant, ekycUpload.fields([
  { name: 'docs', maxCount: 10 },
  { name: 'selfie', maxCount: 1 },
]), async (req, res) => {
  if (req.fileValidationError) {
    [...(req.files?.docs || []), ...(req.files?.selfie || [])].forEach((file) => {
      try {
        if (file?.path) fs.unlinkSync(file.path);
      } catch (_) {}
    });
    return res.status(400).json({ message: req.fileValidationError });
  }

  const invalidFiles = [
    ...(req.files?.docs || []),
    ...(req.files?.selfie || []),
  ].filter((file) => !isAllowedImageFile(file));

  if (invalidFiles.length) {
    return res.status(400).json({ message: "Only JPG, JPEG, and PNG files are allowed." });
  }

  const { aadhaarLast4, panLast4 } = req.body;
  const docs = (req.files?.docs || []).map(f => ({
    fileName: f.originalname,
    url: `/uploads/ekyc/${f.filename}`,
    contentType: f.mimetype,
    size: f.size,
    relation: "Self",
  }));
  const selfie = (req.files?.selfie || [])[0];
  const selfieUrl = selfie ? `/uploads/ekyc/${selfie.filename}` : undefined;

  req.tenant.ekyc = {
    ...(req.tenant.ekyc || {}),
    status: "pending",
    aadhaarLast4,
    panLast4,
    selfieUrl: selfieUrl || req.tenant.ekyc?.selfieUrl,
    docs: [ ...(req.tenant.ekyc?.docs || []), ...docs ],
  };
  await req.tenant.save();
  res.json({ ok: true, ekyc: req.tenant.ekyc });
});

/* ------------------------------------------------------------------ */
/* UPI                                                                 */
/* ------------------------------------------------------------------ */
router.get('/upi-qr', async (req, res) => {
  const amount = Number(req.query.amount || 0);
  const note = String(req.query.note || 'Rent');
  const payeeVPA  = process.env.UPI_VPA  || 'demo@upi';
  const payeeName = process.env.UPI_NAME || 'Hostel Owner';
  const url = `upi://pay?pa=${encodeURIComponent(payeeVPA)}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
  try {
    const svg = await QRCode.toString(url, { type: 'svg', margin: 1, width: 256 });
    res.setHeader('Content-Type','image/svg+xml'); res.send(svg);
  } catch { res.status(500).send('QR error'); }
});

router.get('/upi-intent', (req, res) => {
  const amount = Number(req.query.amount || 0);
  const note = String(req.query.note || 'Rent');
  const payeeVPA  = process.env.UPI_VPA  || 'demo@upi';
  const payeeName = process.env.UPI_NAME || 'Hostel Owner';
  const url = `upi://pay?pa=${encodeURIComponent(payeeVPA)}&pn=${encodeURIComponent(payeeName)}&am=${amount.toFixed(2)}&cu=INR&tn=${encodeURIComponent(note)}`;
  res.redirect(url);
});

/* ------------------------------------------------------------------ */
/* PAYMENTS                                                            */
/* ------------------------------------------------------------------ */
router.get('/payments/my', authTenant, async (req, res) => {
  const list = await Payment.find({ tenant: req.tenant._id }).sort({ createdAt: -1 });
  res.json(list);
});

router.post('/payments/report', authTenant, async (req, res) => {
  const { amount, utr, note, month, year } = req.body;
  if (!amount) return res.status(400).json({ message: 'amount required' });

  const p = await Payment.create({
    tenant: req.tenant._id,
    amount: Number(amount),
    utr: (utr || '').trim(),
    note: (note || '').trim(),
    month: (month ?? null),
    year:  (year ?? null),
    status: 'reported',
  });

  // Admin-facing notification
  try {
    const PaymentNotification = require('../models/PaymentNotification');
    const payload = {
      tenantId: req.tenant._id,
      paymentId: p._id,
      amount: p.amount,
      month: p.month,
      year: p.year,
      utr: p.utr,
      note: p.note,
      status: 'pending',
      read: false,
    };
    console.log('[notif] creating PaymentNotification =>', payload);
    const created = await PaymentNotification.create(payload);
    console.log('[notif] created id:', created._id);
  } catch (e) {
    console.error('[notif] FAILED to create PaymentNotification:', e);
    // not fatal for tenant flow
  }
  res.json({ ok: true, payment: p });
});

module.exports = router;
