const MSG91_FLOW_URL = "https://api.msg91.com/api/v5/flow/";

function resolveConfig() {
  return {
    authKey: String(
      process.env.MSG91_AUTHKEY || process.env.MSG91_AUTH_KEY || ""
    ).trim(),
    flowId: String(
      process.env.MSG91_RENT_RECEIPT_FLOW_ID ||
        process.env.MSG91_PAYMENT_RECEIPT_FLOW_ID ||
        ""
    ).trim(),
  };
}

function normalizeIndianMobile(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

async function sendRentReceiptMessage({ tenant, amount, month }) {
  const config = resolveConfig();
  if (!config.authKey || !config.flowId) {
    return { skipped: true, reason: "MSG91 rent receipt not configured" };
  }

  const mobiles = normalizeIndianMobile(tenant?.phoneNo);
  if (!mobiles) {
    return { skipped: true, reason: "Missing phone number" };
  }

  const recipient = {
    mobiles,
    NAME: String(tenant?.name || "").trim(),
    AMOUNT: String(amount || "").trim(),
    DATE: String(month || "").trim(),
  };

  Object.keys(recipient).forEach((key) => {
    if (recipient[key] == null || recipient[key] === "") delete recipient[key];
  });

  const payload = {
    flow_id: config.flowId,
    recipients: [recipient],
  };

  console.log("MSG91 rent receipt request:", {
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

  console.log("MSG91 rent receipt response:", {
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
  sendRentReceiptMessage,
};
