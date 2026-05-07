const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function toValidDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fmtMonthKey(dateValue) {
  const date = toValidDate(dateValue);
  if (!date) return "";
  return `${MONTHS[date.getMonth()]}-${String(date.getFullYear()).slice(-2)}`;
}

function deriveFirstRentMonth(joiningDate, firstRentStatus) {
  const joinDate = toValidDate(joiningDate);
  if (!joinDate) return "";

  const status = String(firstRentStatus || "NOT_PAID").trim();
  const monthOffset = status === "ADVANCE_PAID" ? 0 : 1;
  return fmtMonthKey(new Date(joinDate.getFullYear(), joinDate.getMonth() + monthOffset, 1));
}

function isFirstRentCycleEditable(existing = {}) {
  const createdAt = toValidDate(existing.createdAt) || toValidDate(existing.joiningDate);
  const joinDate = toValidDate(existing.joiningDate);
  if (!createdAt || !joinDate) return false;

  const now = new Date();
  const start = new Date(createdAt);
  const end = new Date(joinDate);
  end.setMonth(end.getMonth() + 1);

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  now.setHours(0, 0, 0, 0);

  return now >= start && now <= end;
}

function getRentAmountSnapshot(existing = {}, incoming = {}, rents = []) {
  const candidates = [
    incoming.rentAmount,
    incoming.baseRent,
    existing.rentAmount,
    existing.baseRent,
    rents.find((r) => Number(r?.rentAmount) > 0)?.rentAmount,
  ];

  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value) && value > 0) return value;
  }

  return 0;
}

function getPaymentModeSnapshot(existing = {}, incoming = {}, rents = [], oldMonth = "") {
  const oldRent = rents.find((r) => String(r?.month || "").trim() === String(oldMonth || "").trim());
  const candidates = [
    incoming.paymentMode,
    oldRent?.paymentMode,
    rents.find((r) => r?.paymentMode)?.paymentMode,
  ];

  for (const candidate of candidates) {
    const value = String(candidate || "").trim();
    if (value) return value;
  }

  return "Cash";
}

function moveRentMonth(rents = [], fromMonth = "", toMonth = "", paymentDate = new Date(), paymentMode = "Cash") {
  const fromKey = String(fromMonth || "").trim();
  const toKey = String(toMonth || "").trim();
  if (!fromKey || !toKey) return Array.isArray(rents) ? [...rents] : [];
  if (fromKey === toKey) return Array.isArray(rents) ? [...rents] : [];

  const list = Array.isArray(rents) ? [...rents] : [];
  const fromRent = list.find((r) => String(r?.month || "").trim() === fromKey);
  if (!fromRent) return list;

  const movedRent = {
    ...fromRent,
    month: toKey,
    date: fromRent.date || paymentDate,
    paymentMode: fromRent.paymentMode || paymentMode,
  };

  const withoutSource = list.filter((r) => String(r?.month || "").trim() !== fromKey);
  const targetIndex = withoutSource.findIndex((r) => String(r?.month || "").trim() === toKey);

  if (targetIndex >= 0) {
    const target = { ...withoutSource[targetIndex] };
    target.rentAmount = Number(target.rentAmount || 0) + Number(movedRent.rentAmount || 0);
    target.date = target.date || movedRent.date;
    target.paymentMode = target.paymentMode || movedRent.paymentMode;
    withoutSource[targetIndex] = target;
  } else {
    withoutSource.unshift(movedRent);
  }

  return withoutSource;
}

function normalizeFirstRentCycle(existing = {}, incoming = {}) {
  const cycleTouched =
    Object.prototype.hasOwnProperty.call(incoming, "firstRentStatus") ||
    Object.prototype.hasOwnProperty.call(incoming, "joiningDate") ||
    Object.prototype.hasOwnProperty.call(incoming, "firstRentMonth");

  if (!cycleTouched) return {};

  if (!isFirstRentCycleEditable(existing)) {
    return {
      firstRentStatus: existing.firstRentStatus || "NOT_PAID",
      firstRentMonth:
        existing.firstRentMonth ||
        deriveFirstRentMonth(existing.joiningDate, existing.firstRentStatus),
    };
  }

  const rents = Array.isArray(existing.rents) ? [...existing.rents] : [];
  const oldStatus = String(existing.firstRentStatus || "NOT_PAID").trim();
  const oldMonth =
    String(existing.firstRentMonth || "").trim() ||
    deriveFirstRentMonth(existing.joiningDate, oldStatus);

  const joinDateValue =
    Object.prototype.hasOwnProperty.call(incoming, "joiningDate")
      ? incoming.joiningDate
      : existing.joiningDate;

  const nextStatus = String(
    Object.prototype.hasOwnProperty.call(incoming, "firstRentStatus")
      ? incoming.firstRentStatus
      : oldStatus
  ).trim() || "NOT_PAID";

  const nextMonth = deriveFirstRentMonth(joinDateValue, nextStatus) || oldMonth;
  const shouldReconcileRents = Boolean(nextMonth && nextMonth !== oldMonth);

  const patch = {
    firstRentStatus: nextStatus,
    firstRentMonth: nextMonth || undefined,
  };

  if (!shouldReconcileRents) {
    return patch;
  }

  const rentAmount = getRentAmountSnapshot(existing, incoming, rents);
  const paymentMode = getPaymentModeSnapshot(existing, incoming, rents, oldMonth);
  const paymentDate = toValidDate(joinDateValue) || toValidDate(existing.joiningDate) || new Date();

  const movedRents = moveRentMonth(rents, oldMonth, nextMonth, paymentDate, paymentMode);
  patch.rents = movedRents;

  return patch;
}

module.exports = {
  deriveFirstRentMonth,
  isFirstRentCycleEditable,
  normalizeFirstRentCycle,
};
