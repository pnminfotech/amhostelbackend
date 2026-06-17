const MSG91_FLOW_URL = "https://api.msg91.com/api/v5/flow/";

function resolveConfig() {
  return {
    authKey: String(
      process.env.MSG91_AUTHKEY || process.env.MSG91_AUTH_KEY || ""
    ).trim(),
    flowId: String(
      process.env.MSG91_RENT_REMINDER_FLOW_ID ||
        process.env.MSG91_PAYMENT_REMINDER_FLOW_ID ||
        ""
    ).trim(),
    daysBefore: Number(process.env.MSG91_RENT_REMINDER_DAYS_BEFORE || 3),
  };
}

function normalizeIndianMobile(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

function formatMonthKey(y, m) {
  const mon = new Date(y, m, 1).toLocaleString("en-US", { month: "short" });
  return `${mon}-${String(y).slice(-2)}`;
}

function formatDueDate(year, monthIndex, dueDay) {
  const date = new Date(year, monthIndex, dueDay);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const yearText = String(date.getFullYear());
  return `${day}-${month}-${yearText}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getDaysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function clampDueDay(year, monthIndex, anchorDay) {
  return Math.min(Math.max(Number(anchorDay) || 1, 1), getDaysInMonth(year, monthIndex));
}

function getUpcomingDueContext(tenant, now = new Date()) {
  const joinDate = tenant?.joiningDate ? new Date(tenant.joiningDate) : null;
  if (!joinDate || Number.isNaN(joinDate.getTime())) return null;

  const anchorDay = joinDate.getDate();
  const today = startOfDay(now);

  let year = today.getFullYear();
  let monthIndex = today.getMonth();
  let dueDay = clampDueDay(year, monthIndex, anchorDay);
  let dueDate = startOfDay(new Date(year, monthIndex, dueDay));

  if (dueDate < today) {
    monthIndex += 1;
    if (monthIndex > 11) {
      monthIndex = 0;
      year += 1;
    }
    dueDay = clampDueDay(year, monthIndex, anchorDay);
    dueDate = startOfDay(new Date(year, monthIndex, dueDay));
  }

  return {
    dueDate,
    dueDay,
    monthKey: formatMonthKey(year, monthIndex),
    displayDate: formatDueDate(year, monthIndex, dueDay),
  };
}

function shouldSendReminderForTenant(tenant, now = new Date()) {
  const { daysBefore } = resolveConfig();
  const context = getUpcomingDueContext(tenant, now);
  if (!context || !Number.isFinite(daysBefore)) return null;

  const today = startOfDay(now);
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysUntilDue = Math.round((context.dueDate.getTime() - today.getTime()) / msPerDay);

  if (daysUntilDue !== daysBefore) {
    return null;
  }

  return context;
}

async function sendRentReminderMessage({ tenant, amount, month, dueDate }) {
  const config = resolveConfig();

  if (!config.authKey || !config.flowId) {
    return { skipped: true, reason: "MSG91 rent reminder not configured" };
  }

  const mobiles = normalizeIndianMobile(tenant?.phoneNo);
  if (!mobiles) {
    return { skipped: true, reason: "Missing phone number" };
  }

  const recipient = {
    mobiles,
    name: String(tenant?.name || "").trim(),
    number: String(amount || "").trim(),
    month: String(month || "").trim(),
    Date: String(dueDate || "").trim(),
  };

  Object.keys(recipient).forEach((key) => {
    if (recipient[key] == null || recipient[key] === "") delete recipient[key];
  });

  const payload = {
    flow_id: config.flowId,
    recipients: [recipient],
  };

  console.log("MSG91 rent reminder request:", {
    flow_id: payload.flow_id,
    mobiles: recipient.mobiles,
    keys: Object.keys(recipient),
  });

  const response = await fetch(MSG91_FLOW_URL, {
    method: "POST",
    headers: {
      authkey: config.authKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data = null;
  try {
    data = await response.json();
  } catch (_error) {
    data = null;
  }

  console.log("MSG91 rent reminder response:", {
    status: response.status,
    ok: response.ok,
    data,
  });

  if (!response.ok) {
    const error = new Error(
      data?.message || data?.type || `MSG91 request failed with ${response.status}`
    );
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return { ok: true, data };
}

module.exports = {
  formatDueDate,
  formatMonthKey,
  getUpcomingDueContext,
  sendRentReminderMessage,
  shouldSendReminderForTenant,
};
