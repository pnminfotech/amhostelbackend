const MSG91_FLOW_URL = "https://api.msg91.com/api/v5/flow/";

function resolveConfig() {
  const authKey = String(
    process.env.MSG91_AUTHKEY || process.env.MSG91_AUTH_KEY || ""
  ).trim();
  const flowId = String(
    process.env.MSG91_ADMISSION_FLOW_ID || process.env.MSG91_FLOW_ID || ""
  ).trim();
  const templateId = String(
    process.env.MSG91_ADMISSION_TEMPLATE_ID || process.env.MSG91_TEMPLATE_ID || ""
  ).trim();
  const sender = String(process.env.MSG91_SENDER || "").trim() || undefined;
  const hostelName =
    String(process.env.MSG91_HOSTEL_NAME || process.env.UPI_PNAME || "Hostel").trim() ||
    "Hostel";

  return {
    authKey,
    flowId,
    templateId,
    sender,
    hostelName,
  };
}

function normalizeIndianMobile(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

function isConfigured() {
  const config = resolveConfig();
  return !!(config.authKey && (config.flowId || config.templateId));
}

async function sendAdmissionMessage(tenant) {
  if (!isConfigured()) {
    console.warn("MSG91 admission skipped: missing MSG91_AUTH_KEY or flow/template id.");
    return { skipped: true, reason: "MSG91 not configured" };
  }

  const config = resolveConfig();
  if (!config.flowId) {
    console.warn("MSG91 admission skipped: template id is configured, but flow id is missing.");
    return {
      skipped: true,
      reason: "MSG91 flow id missing",
    };
  }

  const mobiles = normalizeIndianMobile(tenant?.phoneNo);
  if (!mobiles) {
    console.warn("MSG91 admission skipped: tenant phone number missing or invalid.");
    return { skipped: true, reason: "Missing phone number" };
  }

  const recipient = {
    mobiles,
    name: String(tenant?.name || "").trim(),
    amount: String(tenant?.depositAmount ?? tenant?.deposit ?? "").trim(),
    number1: String(tenant?.depositAmount ?? tenant?.deposit ?? "").trim(),
  };

  Object.keys(recipient).forEach((key) => {
    if (recipient[key] == null || recipient[key] === "") {
      delete recipient[key];
    }
  });

  const payload = {
    flow_id: config.flowId,
    recipients: [recipient],
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] == null || payload[key] === "") {
      delete payload[key];
    }
  });

  console.log("MSG91 admission request:", {
    flow_id: payload.flow_id,
    mobiles: payload.recipients?.[0]?.mobiles,
    keys: Object.keys(payload.recipients?.[0] || {}),
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

  console.log("MSG91 admission response:", {
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
  sendAdmissionMessage,
};
