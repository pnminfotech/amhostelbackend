// routes/_helpers/payments.js
const dayjs = require("dayjs");

/**
 * Add/merge a rent record into a tenant doc for the given month/year.
 * - tenantDoc: mongoose doc from your "Form" collection
 * - payload: { amount, month, year, utr, note }
 */
function addOrUpdateMonthlyRent(tenantDoc, payload) {
  const { amount = 0, month, year, utr, note } = payload;
  if (!tenantDoc.rents) tenantDoc.rents = [];

  const idx = tenantDoc.rents.findIndex((r) => {
    if (!r.date) return false;
    const d = dayjs(r.date);
    return d.month() + 1 === Number(month) && d.year() === Number(year);
  });

  const paymentDate = dayjs().toDate();
  const monthDate = dayjs(`${year}-${String(month).padStart(2, "0")}-01`).toDate();

  if (idx >= 0) {
    // merge if exists (you can tweak if you prefer “replace”)
    const r = tenantDoc.rents[idx];
    r.rentAmount = Number(r.rentAmount || 0) + Number(amount || 0);
    r.paymentDate = paymentDate;
    r.utr = utr || r.utr;
    r.note = note || r.note;
  } else {
    tenantDoc.rents.push({
      rentAmount: Number(amount || 0),
      date: monthDate,
      paymentDate,
      utr,
      note,
    });
  }
}

module.exports = { addOrUpdateMonthlyRent };  