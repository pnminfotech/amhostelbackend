// routes/_helpers/rentMerge.js
/**
 * Merge (add to) monthly rent on a tenant doc.
 * - tenantDoc: mongoose doc from "Form" collection
 * - payload: { amount, month (1..12), year, utr?, note? }
 */
function addOrUpdateMonthlyRent(tenantDoc, payload) {
  const { amount = 0, month, year, utr, note } = payload;
  if (!tenantDoc.rents) tenantDoc.rents = [];

  const idx = tenantDoc.rents.findIndex(r => {
    if (!r?.date) return false;
    const d = new Date(r.date);
    return d.getFullYear() === Number(year) && d.getMonth() + 1 === Number(month);
  });

  const paymentDate = new Date();
  const monthDate = new Date(Number(year), Number(month) - 1, 1);

  if (idx >= 0) {
    tenantDoc.rents[idx].rentAmount = Number(tenantDoc.rents[idx].rentAmount || 0) + Number(amount || 0);
    tenantDoc.rents[idx].paymentDate = paymentDate;
    if (utr)  tenantDoc.rents[idx].utr  = utr;
    if (note) tenantDoc.rents[idx].note = note;
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
