function toNum(v) {
  if (v === null || v === undefined || v === "") return 0;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toValidDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function firstDayOfNextMonth(date = new Date()) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  return d;
}

function firstDayOfMonth(date = new Date()) {
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
}

function startOfDayTime(date) {
  const d = toValidDate(date);
  if (!d) return 0;
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function parseMonthKey(month) {
  if (typeof month !== "string" || !month.trim()) return null;
  const match = month.trim().match(/^([A-Za-z]+)-(\d{2}|\d{4})$/);
  if (!match) return null;

  const m = new Date(`${match[1]} 1, 2000`).getMonth();
  if (!Number.isFinite(m) || Number.isNaN(m)) return null;

  const rawYear = Number(match[2]);
  if (!Number.isFinite(rawYear)) return null;

  return {
    y: match[2].length === 2 ? 2000 + rawYear : rawYear,
    m,
  };
}

function formatMonthKey(y, m) {
  const mon = new Date(y, m, 1).toLocaleString("en-US", { month: "short" });
  return `${mon}-${String(y).slice(-2)}`;
}

function normalizeSnapshot(entry = {}, fallbackDate = null) {
  const effectiveFrom =
    toValidDate(entry.effectiveFrom) ||
    toValidDate(entry.from) ||
    toValidDate(entry.changedAt) ||
    toValidDate(entry.date) ||
    toValidDate(fallbackDate);

  if (!effectiveFrom) return null;

  const amount = toNum(
    entry.baseRent ??
      entry.rentAmount ??
      entry.amount ??
      entry.price ??
      entry.monthlyRent
  );

  if (!amount) return null;

  return {
    effectiveFrom,
    roomNo: entry.roomNo != null ? String(entry.roomNo) : "",
    bedNo: entry.bedNo != null ? String(entry.bedNo) : "",
    baseRent: amount,
    rentAmount: amount,
    previousBaseRent: toNum(entry.previousBaseRent ?? entry.previousRentAmount),
    previousRoomNo: entry.previousRoomNo != null ? String(entry.previousRoomNo) : "",
    previousBedNo: entry.previousBedNo != null ? String(entry.previousBedNo) : "",
    source: entry.source || "history",
  };
}

function pruneConflictingFutureSnapshots(snapshots = [], tenant = {}) {
  const currentRoomNo = tenant?.roomNo != null ? String(tenant.roomNo) : "";
  const currentBedNo = tenant?.bedNo != null ? String(tenant.bedNo) : "";
  if (!currentRoomNo || !currentBedNo || !Array.isArray(snapshots) || !snapshots.length) {
    return snapshots;
  }

  let anchorIndex = -1;
  snapshots.forEach((snap, index) => {
    if (
      String(snap?.roomNo || "") === currentRoomNo &&
      String(snap?.bedNo || "") === currentBedNo
    ) {
      anchorIndex = index;
    }
  });

  if (anchorIndex === -1) return snapshots;

  return snapshots.filter((snap, index) => {
    if (index <= anchorIndex) return true;
    return (
      String(snap?.roomNo || "") === currentRoomNo &&
      String(snap?.bedNo || "") === currentBedNo
    );
  });
}

function getCurrentMonthlyRent(tenant = {}, roomsData = []) {
  if (roomsData && tenant?.roomNo && tenant?.bedNo) {
    const room = roomsData.find((r) => String(r.roomNo) === String(tenant.roomNo));
    const bed = room?.beds?.find((b) => String(b.bedNo) === String(tenant.bedNo));
    const bedRent = toNum(bed?.price) || toNum(bed?.baseRent) || toNum(bed?.monthlyRent);
    if (bedRent) return bedRent;
  }

  const currentFromTenant =
    toNum(tenant?.baseRent) ||
    toNum(tenant?.rentAmount) ||
    toNum(tenant?.rent) ||
    toNum(tenant?.expectedRent) ||
    toNum(tenant?.defaultRent) ||
    toNum(tenant?.monthlyRent);
  if (currentFromTenant) return currentFromTenant;

  return 0;
}

function getLatestPaidRentAmount(tenant = {}) {
  const paidRents = (Array.isArray(tenant.rents) ? tenant.rents : [])
    .filter((r) => toNum(r?.rentAmount) > 0)
    .map((r) => ({
      amount: toNum(r.rentAmount),
      time: (() => {
        const date = toValidDate(r.date);
        if (date) return date.getTime();
        const ym = parseMonthKey(r.month);
        return ym ? new Date(ym.y, ym.m, 1).getTime() : 0;
      })(),
    }))
    .sort((a, b) => a.time - b.time);

  return paidRents.length ? paidRents[paidRents.length - 1].amount : 0;
}

function getShiftPreservedRent(tenant = {}) {
  const history = Array.isArray(tenant.rentHistory) ? tenant.rentHistory : [];
  const hasShiftHistory = history.some((entry) => entry?.source === "shift");
  const hasShiftFlag = Boolean(
    tenant.shiftEffectiveFrom || tenant.shiftDate || tenant.effectiveFrom
  );
  const canUsePaidRent =
    hasShiftHistory ||
    hasShiftFlag ||
    String(tenant.firstRentStatus || "").trim() === "ADVANCE_PAID";

  const latestPaid = getLatestPaidRentAmount(tenant);
  const storedRent = toNum(
    tenant?.baseRent ??
      tenant?.rentAmount ??
      tenant?.rent ??
      tenant?.expectedRent ??
      tenant?.defaultRent ??
      tenant?.monthlyRent
  );

  return canUsePaidRent && latestPaid > 0 && storedRent > 0 && latestPaid < storedRent
    ? latestPaid
    : 0;
}

function getLatestShiftCutoffDate(tenant = {}) {
  const direct =
    toValidDate(tenant.shiftEffectiveFrom) ||
    toValidDate(tenant.shiftDate) ||
    toValidDate(tenant.effectiveFrom);
  if (direct) return direct;

  const history = Array.isArray(tenant.rentHistory) ? tenant.rentHistory : [];
  const latestShift = history
    .map((entry) => normalizeSnapshot(entry))
    .filter((entry) => entry && entry.source === "shift")
    .sort((a, b) => b.effectiveFrom - a.effectiveFrom)[0];

  return latestShift?.effectiveFrom || null;
}

function getCycleStartForMonth(tenant = {}, y, m) {
  if (!tenant?.joiningDate) return null;

  const joinDate = toValidDate(tenant.joiningDate);
  if (!joinDate) return null;

  let firstBillYM;
  if (tenant.firstRentMonth) {
    const parsed = parseMonthKey(tenant.firstRentMonth);
    if (!parsed) return null;
    firstBillYM = parsed.y * 12 + parsed.m;
  } else {
    const isAdvance = String(tenant.firstRentStatus || "").trim() === "ADVANCE_PAID";
    firstBillYM = joinDate.getFullYear() * 12 + joinDate.getMonth() + (isAdvance ? 0 : 1);
  }

  const cellYM = y * 12 + m;
  if (cellYM < firstBillYM) return null;

  const cycleIndex = cellYM - firstBillYM;
  const cycleStart = new Date(joinDate);
  cycleStart.setHours(0, 0, 0, 0);
  cycleStart.setMonth(cycleStart.getMonth() + cycleIndex);
  return cycleStart;
}

function buildRentTimeline(tenant = {}, roomsData = []) {
  const history = Array.isArray(tenant.rentHistory) ? tenant.rentHistory : [];
  const payments = Array.isArray(tenant.rents) ? tenant.rents : [];
  const snapshots = [];
  const paidRents = payments
    .filter((r) => toNum(r?.rentAmount) > 0)
    .map((r) => ({
      amount: toNum(r.rentAmount),
      ym: getPaymentMonth(r),
      date: toValidDate(r.date) || new Date(),
    }))
    .filter((r) => r.ym)
    .sort((a, b) => (a.ym.y * 12 + a.ym.m) - (b.ym.y * 12 + b.ym.m));

  history
    .map((entry) => normalizeSnapshot(entry))
    .filter(Boolean)
    .sort((a, b) => a.effectiveFrom - b.effectiveFrom)
    .forEach((snap) => snapshots.push(snap));

  const selectedShiftDate =
    toValidDate(tenant.shiftEffectiveFrom) ||
    toValidDate(tenant.shiftDate) ||
    toValidDate(tenant.effectiveFrom);
  if (selectedShiftDate) {
    selectedShiftDate.setHours(0, 0, 0, 0);
    const latestShift = snapshots
      .map((snap, index) => ({ snap, index }))
      .filter(({ snap }) => snap.source === "shift")
      .sort((a, b) => b.snap.effectiveFrom - a.snap.effectiveFrom)[0];

    if (latestShift) {
      snapshots[latestShift.index] = {
        ...snapshots[latestShift.index],
        effectiveFrom: selectedShiftDate,
      };
    }
  }

  const joinDate = toValidDate(tenant.joiningDate);
  if (snapshots.length && joinDate && snapshots[0].effectiveFrom > joinDate) {
    const first = snapshots[0];
    const paidBeforeFirstShift = paidRents
      .filter((rent) => rent.date < first.effectiveFrom)
      .sort((a, b) => b.date - a.date)[0];
    const previousAmount = toNum(first.previousBaseRent) || toNum(paidBeforeFirstShift?.amount);
    if (previousAmount > 0) {
      snapshots.unshift({
        effectiveFrom: joinDate,
        roomNo: first.previousRoomNo || "",
        bedNo: first.previousBedNo || "",
        baseRent: previousAmount,
        rentAmount: previousAmount,
        source: "previous-before-shift",
      });
    }
  }

  if (!snapshots.length) {
    const fallback = getCurrentMonthlyRent(tenant, roomsData);
    if (fallback > 0) {
      snapshots.push({
        effectiveFrom: toValidDate(tenant.joiningDate) || new Date(),
        roomNo: tenant?.roomNo != null ? String(tenant.roomNo) : "",
        bedNo: tenant?.bedNo != null ? String(tenant.bedNo) : "",
        baseRent: fallback,
        rentAmount: fallback,
        source: "current",
      });
    }
  }

  const currentAmount = getCurrentMonthlyRent(tenant, roomsData);
  const lastSnapshot = snapshots[snapshots.length - 1];
  if (currentAmount > 0 && (!lastSnapshot || toNum(lastSnapshot.baseRent) !== currentAmount)) {
    snapshots.push({
      effectiveFrom: new Date(),
      roomNo: tenant?.roomNo != null ? String(tenant.roomNo) : "",
      bedNo: tenant?.bedNo != null ? String(tenant.bedNo) : "",
      baseRent: currentAmount,
      rentAmount: currentAmount,
      source: "current",
    });
  }

  const sorted = snapshots.sort((a, b) => a.effectiveFrom - b.effectiveFrom);
  return pruneConflictingFutureSnapshots(sorted, tenant);
}

function getExpectedRentForMonth(tenant = {}, y, m, roomsData = []) {
  const snapshots = buildRentTimeline(tenant, roomsData);
  if (!snapshots.length) return getCurrentMonthlyRent(tenant, roomsData);

  const cycleStart = getCycleStartForMonth(tenant, y, m);
  if (!cycleStart) return getCurrentMonthlyRent(tenant, roomsData);

  const cycleEnd = new Date(cycleStart);
  cycleEnd.setMonth(cycleEnd.getMonth() + 1);
  let expected = 0;
  const cycleStartTime = startOfDayTime(cycleStart);
  const cycleEndTime = startOfDayTime(cycleEnd);
  const hasSelectedShiftDate = Boolean(
    tenant.shiftEffectiveFrom || tenant.shiftDate || tenant.effectiveFrom
  );

  for (const snap of snapshots) {
    const isLegacyMonthStartShift =
      !hasSelectedShiftDate &&
      snap.source === "shift" &&
      snap.effectiveFrom instanceof Date &&
      snap.effectiveFrom.getDate() === 1;
    const appliesToCycle = isLegacyMonthStartShift
      ? startOfDayTime(snap.effectiveFrom) <= cycleStartTime
      : startOfDayTime(snap.effectiveFrom) < cycleEndTime;

    if (appliesToCycle) {
      expected = toNum(snap.baseRent || snap.rentAmount);
    } else {
      break;
    }
  }

  let resolved = expected || getCurrentMonthlyRent(tenant, roomsData);
  const shiftCutoff = getLatestShiftCutoffDate(tenant);
  const paidAmount = getPaidAmountForMonth(tenant.rents, y, m);

  // Do not retroactively raise older paid cycles after a later bed shift.
  if (shiftCutoff && cycleEnd <= shiftCutoff && paidAmount > 0 && paidAmount < resolved) {
    resolved = paidAmount;
  }

  return resolved;
}

function getPaymentMonth(rent = {}) {
  const fromMonth = parseMonthKey(rent.month);
  if (fromMonth) return fromMonth;

  const date = toValidDate(rent.date);
  if (!date) return null;

  return { y: date.getFullYear(), m: date.getMonth() };
}

function getPaidAmountForMonth(rents = [], y, m) {
  return (Array.isArray(rents) ? rents : []).reduce((sum, rent) => {
    const paidMonth = getPaymentMonth(rent);
    if (!paidMonth || paidMonth.y !== y || paidMonth.m !== m) return sum;
    return sum + toNum(rent?.rentAmount);
  }, 0);
}

function getUnpaidRentBeforeDate(tenant = {}, cutoffDate, roomsData = []) {
  const cutoff = toValidDate(cutoffDate);
  if (!cutoff || !tenant?.joiningDate) return [];

  cutoff.setHours(23, 59, 59, 999);

  const joinDate = toValidDate(tenant.joiningDate);
  if (!joinDate) return [];

  const firstBill = tenant.firstRentMonth
    ? parseMonthKey(tenant.firstRentMonth)
    : null;

  let cursorYM;
  if (firstBill) {
    cursorYM = firstBill.y * 12 + firstBill.m;
  } else {
    const isAdvance = String(tenant.firstRentStatus || "").trim() === "ADVANCE_PAID";
    cursorYM = joinDate.getFullYear() * 12 + joinDate.getMonth() + (isAdvance ? 0 : 1);
  }

  const cutoffYM = cutoff.getFullYear() * 12 + cutoff.getMonth();
  const maxYM = cutoffYM + 1;
  const unpaid = [];

  while (cursorYM <= maxYM) {
    const y = Math.floor(cursorYM / 12);
    const m = cursorYM % 12;
    const cycleStart = getCycleStartForMonth(tenant, y, m);
    if (!cycleStart) {
      cursorYM += 1;
      continue;
    }

    const cycleEnd = new Date(cycleStart);
    cycleEnd.setMonth(cycleEnd.getMonth() + 1);
    if (cycleEnd > cutoff) break;

    const expected = getExpectedRentForMonth(tenant, y, m, roomsData);

    if (expected > 0) {
      const paid = getPaidAmountForMonth(tenant.rents, y, m);
      const outstanding = Math.max(0, expected - paid);

      if (outstanding > 0) {
        unpaid.push({
          month: formatMonthKey(y, m),
          expected,
          paid,
          outstanding,
        });
      }
    }

    cursorYM += 1;
  }

  return unpaid;
}

function appendRentHistorySnapshot(existing = {}, incoming = {}) {
  const trackedKeys = ["roomNo", "bedNo", "baseRent", "rentAmount"];
  const hasShiftLikeChange = trackedKeys.some((key) =>
    Object.prototype.hasOwnProperty.call(incoming, key) &&
    String(incoming[key] ?? "") !== String(existing[key] ?? "")
  );

  if (!hasShiftLikeChange) return {};

  const mergedTenant = { ...existing, ...incoming };
  const amount =
    toNum(incoming.baseRent) ||
    toNum(incoming.rentAmount) ||
    getCurrentMonthlyRent(mergedTenant) ||
    getLatestPaidRentAmount(existing);
  if (!amount) return {};

  const history = Array.isArray(existing.rentHistory) ? [...existing.rentHistory] : [];
  const last = history[history.length - 1];
  const requestedStart =
    toValidDate(incoming.shiftEffectiveFrom) ||
    toValidDate(incoming.shiftDate) ||
    toValidDate(incoming.effectiveFrom) ||
    new Date();
  requestedStart.setHours(0, 0, 0, 0);
  const previousAmount =
    getCurrentMonthlyRent(existing) || getLatestPaidRentAmount(existing);

  if (!history.length && previousAmount > 0) {
    history.push({
      effectiveFrom: toValidDate(existing.joiningDate) || toValidDate(existing.createdAt) || new Date(),
      roomNo: existing.roomNo != null ? String(existing.roomNo) : "",
      bedNo: existing.bedNo != null ? String(existing.bedNo) : "",
      baseRent: previousAmount,
      rentAmount: previousAmount,
      source: "initial-before-shift",
    });
  }

  const nextSnapshot = {
    effectiveFrom: requestedStart,
    roomNo: incoming.roomNo != null ? String(incoming.roomNo) : String(existing.roomNo || ""),
    bedNo: incoming.bedNo != null ? String(incoming.bedNo) : String(existing.bedNo || ""),
    baseRent: amount,
    rentAmount: amount,
    previousRoomNo: existing.roomNo != null ? String(existing.roomNo) : "",
    previousBedNo: existing.bedNo != null ? String(existing.bedNo) : "",
    previousBaseRent: previousAmount,
    previousRentAmount: previousAmount,
    source: "shift",
  };

  if (
    last &&
    String(last.roomNo || "") === String(nextSnapshot.roomNo || "") &&
    String(last.bedNo || "") === String(nextSnapshot.bedNo || "") &&
    toNum(last.baseRent || last.rentAmount) === amount
  ) {
    return {};
  }

  history.push(nextSnapshot);
  return { rentHistory: history };
}

module.exports = {
  appendRentHistorySnapshot,
  buildRentTimeline,
  getExpectedRentForMonth,
  getCurrentMonthlyRent,
  getCycleStartForMonth,
  getUnpaidRentBeforeDate,
  firstDayOfMonth,
  firstDayOfNextMonth,
};
