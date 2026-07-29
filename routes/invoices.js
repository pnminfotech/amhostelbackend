const express = require('express');
const router = express.Router();
const dayjs = require('dayjs');

const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Form = require('../models/formModels');

const authTenant = require('../middleware/tenantAuth');
// If you have an admin auth middleware, use it. For now, reuse tenant-safe guard or add your own.
const authAdmin = require('../middleware/adminAuth') || ((_req,_res,next)=>next()); 




// routes/invoices.js


// add this near the top
router.get('/invoices/ping', (_req, res) => res.json({ ok: true, where: 'invoices' }));
// ---------- ADMIN: Generate invoices for a month (baseRent only) ----------
router.post('/admin/invoices/generate', authAdmin, async (req, res) => {
  try {
    const { period } = req.query; // 'YYYY-MM', default: current
    const p = period || dayjs().format('YYYY-MM');
    const dueDate = dayjs(p + '-07').toDate(); // 7th of the month by default

    // Active tenants; (customize if you store tenancy state)
    const tenants = await Form.find({}); // filter state if you add tenancy.state === 'active'

    let created = 0, skipped = 0;
    for (const t of tenants) {
      const base = Number(t.baseRent || 0);
      if (!base) { skipped++; continue; }

      const exists = await Invoice.findOne({ tenantId: t._id, period: p });
      if (exists) { skipped++; continue; }

      const inv = new Invoice({
        tenantId: t._id,
        period: p,
        dueDate,
        amount: base,
        items: [{ label: `Base Rent ${p}`, amount: base }],
        note: `Hostel Rent ${p}`
      });
      await inv.save();
      created++;
    }
    res.json({ ok: true, period: p, created, skipped });
  } catch (e) {
    console.error(e);
    res.status(500).json({ ok: false, message: 'Failed to generate' });
  }
});

// ---------- TENANT: List my invoices ----------
router.get('/tenant/invoices', authTenant, async (req, res) => {
  const list = await Invoice.find({ tenantId: req.tenant._id }).sort({ period: -1, createdAt: -1 });
  res.json(list);
});

// ---------- TENANT: Invoice detail ----------
router.get('/tenant/invoices/:id', authTenant, async (req, res) => {
  const inv = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!inv) return res.status(404).json({ message: 'Not found' });
  const payments = await Payment.find({ invoiceId: inv._id }).sort({ at: 1 });
  res.json({ invoice: inv, payments });
});

// ---------- TENANT: UPI Pay intent for an invoice ----------
router.get('/tenant/pay/:invoiceId/intent', authTenant, async (req, res) => {
  const inv = await Invoice.findOne({ _id: req.params.invoiceId, tenantId: req.tenant._id });
  if (!inv) return res.status(404).send('Invoice not found');
  if (inv.status === 'paid') return res.redirect(`/tenant/invoices/${inv._id}/receipt`);

  // Reuse your existing deep-link endpoint:
  const note = `Invoice ${inv.period} #${String(inv._id).slice(-6)}`;
  const url = `/tenant/upi-intent?amount=${encodeURIComponent(inv.amount)}&note=${encodeURIComponent(note)}`;
  res.redirect(url);
});

// ---------- TENANT: Confirm payment (enter UTR after paying UPI) ----------
router.post('/tenant/invoices/:id/confirm', authTenant, async (req, res) => {
  const { utr, amount } = req.body;
  const inv = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });

  const amt = Number(amount || inv.amount);
  await Payment.create({
    tenantId: req.tenant._id,
    invoiceId: inv._id,
    amount: amt,
    method: 'UPI',
    utr: utr || undefined
  });

  inv.status = 'paid';
  inv.lastPaidAt = new Date();
  await inv.save();

  res.json({ ok: true, message: 'Payment recorded', invoice: inv });
});

// ---------- TENANT: Simple HTML receipt ----------
router.get('/tenant/invoices/:id/receipt', authTenant, async (req, res) => {
  const inv = await Invoice.findOne({ _id: req.params.id, tenantId: req.tenant._id });
  if (!inv) return res.status(404).send('Invoice not found');
  const payments = await Payment.find({ invoiceId: inv._id }).sort({ at: 1 });
  if (inv.status !== 'paid' || !payments.length) return res.status(400).send('Not paid yet');

  const t = req.tenant;
  const paid = payments.reduce((s,p)=>s+Number(p.amount||0),0);

  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.send(`
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${inv.period}</title>
<style>
  body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px; color: #111827; }
  .card { border:1px solid #e5e7eb; border-radius:12px; padding:16px; max-width:700px; margin:auto; }
  .row { display:flex; justify-content:space-between; gap:16px; }
  .muted { color:#6b7280; font-size:12px; }
  h2 { margin:0 0 8px 0; }
  table{ width:100%; border-collapse:collapse; margin-top:12px; }
  th,td{ border-bottom:1px solid #f3f4f6; padding:8px; text-align:left;}
  .right{ text-align:right }
  .total{ font-weight:700 }
</style>
</head>
<body>
  <div class="card">
    <div class="row">
      <div>
        <h2>Payment Receipt</h2>
        <div class="muted">Invoice: ${inv.period}</div>
      </div>
      <div>
        <div><b>${t.name || 'Tenant'}</b></div>
        <div class="muted">Room ${t.roomNo||'-'} / Bed ${t.bedNo||'-'}</div>
        <div class="muted">Phone ${t.phoneNo||''}</div>
      </div>
    </div>

    <table>
      <thead><tr><th>Description</th><th class="right">Amount (₹)</th></tr></thead>
      <tbody>
        ${inv.items.map(i=>`<tr><td>${i.label}</td><td class="right">${Number(i.amount||0).toFixed(2)}</td></tr>`).join('')}
        <tr><td class="total">Total</td><td class="right total">₹${Number(inv.amount).toFixed(2)}</td></tr>
      </tbody>
    </table>

    <h4>Payments</h4>
    <table>
      <thead><tr><th>Date</th><th>Method</th><th>UTR/Txn</th><th class="right">Amount (₹)</th></tr></thead>
      <tbody>
        ${payments.map(p=>`<tr>
          <td>${new Date(p.at).toLocaleString()}</td>
          <td>${p.method}</td>
          <td>${p.utr||'-'}</td>
          <td class="right">${Number(p.amount).toFixed(2)}</td></tr>`).join('')}
        <tr><td colspan="3" class="total">Paid</td><td class="right total">₹${paid.toFixed(2)}</td></tr>
      </tbody>
    </table>

    <p class="muted">This is a system-generated receipt.</p>
  </div>
</body>
</html>`);
});

// ---------- ADMIN: Record offline payment (cash/bank) ----------
router.post('/admin/payments/record', authAdmin, async (req, res) => {
  const { tenantId, invoiceId, amount, method='Cash', utr, at } = req.body;
  const inv = await Invoice.findOne({ _id: invoiceId, tenantId });
  if (!inv) return res.status(404).json({ message: 'Invoice not found' });

  await Payment.create({ tenantId, invoiceId, amount, method, utr, at: at ? new Date(at) : new Date() });
  inv.status = 'paid'; inv.lastPaidAt = new Date(); await inv.save();

  res.json({ ok: true });
});

module.exports = router;
