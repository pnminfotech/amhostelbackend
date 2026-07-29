// controllers/payments.js
import Payment from "../models/Payment.js";
import Notification from "../models/Notification.js";

export const reportPayment = async (req, res) => {
  try {
    const { tenantId, amount, method, note } = req.body;
    if (!tenantId || !amount) {
      return res.status(400).json({ error: "tenantId and amount required" });
    }
    const p = await Payment.create({
      tenant: tenantId,
      amount,
      method: method || "cash",
      note: note || "",
      status: "reported",
      date: new Date(),
    });

    // fire a notification for admins
    await Notification.create({
      type: "payment",
      refId: p._id,
      status: "reported",
      title: "New payment reported",
    });

    return res.status(201).json({ ok: true, payment: p });
  } catch (e) {
    console.error("reportPayment:", e);
    return res.status(500).json({ error: "Server error" });
  }
};
