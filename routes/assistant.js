// server/routes/assistant.js
import express from "express";
import OpenAI from "openai";
import mongoose from "mongoose";
import rentHistoryHelpers from "./_helpers/rentHistory.js";

// Re-use your existing Mongoose models/collections
// Assuming Forms (tenants) and Rooms collections exist like your API uses
const Form = mongoose.model("Form");   // tenants
const Room = mongoose.model("Room");   // rooms
const { getExpectedRentForMonth } = rentHistoryHelpers;

const router = express.Router();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ---- Helpers copied from your UI so answers match exactly ----
const toNum = (v) => {
  if (v === null || v === undefined) return 0;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

const expectFromTenant = (tenant, roomsData) => {
  const v =
    toNum(tenant?.baseRent) ||
    toNum(tenant?.rent) ||
    toNum(tenant?.rentAmount) ||
    toNum(tenant?.expectedRent) ||
    toNum(tenant?.defaultRent) ||
    toNum(tenant?.monthlyRent) ||
    toNum(tenant?.price) ||
    toNum(tenant?.bedPrice);

  if (v) return v;

  if (roomsData && tenant?.roomNo && tenant?.bedNo) {
    const room = roomsData.find(r => String(r.roomNo) === String(tenant.roomNo));
    const bed  = room?.beds?.find(b => String(b.bedNo) === String(tenant.bedNo));
    return (
      toNum(bed?.price) ||
      toNum(bed?.baseRent) ||
      toNum(bed?.monthlyRent) ||
      0
    );
  }
  return 0;
};

const calculateDue = (rents = [], joiningDateStr, tenant = {}, roomsData = []) => {
  if (!joiningDateStr) return 0;
  const now = new Date();
  const currentYear = now.getFullYear();
  const startOfYear = new Date(currentYear, 0, 1);
  const joinDate = new Date(joiningDateStr);
  const rentStart = new Date(joinDate.getFullYear(), joinDate.getMonth() + 1, 1);
  const startDate = rentStart > startOfYear ? rentStart : startOfYear;

  const tempDate = new Date(startDate);
  const paidMonths = new Set(
    rents
      .filter(r => r.date && Number(r.rentAmount) > 0)
      .map(r => {
        const d = new Date(r.date);
        return `${d.getMonth()}-${d.getFullYear()}`;
      })
  );

  let dueCount = 0;
  while (tempDate <= now && tempDate.getFullYear() === currentYear) {
    const key = `${tempDate.getMonth()}-${tempDate.getFullYear()}`;
    if (!paidMonths.has(key)) {
      dueCount += getExpectedRentForMonth(tenant, tempDate.getFullYear(), tempDate.getMonth(), roomsData);
    }
    tempDate.setMonth(tempDate.getMonth() + 1);
  }
  return dueCount;
};

const getPendingMonthsForStatus = (rents = [], joiningDateStr) => {
  if (!joiningDateStr) return [];
  const now = new Date();
  const currentYear = now.getFullYear();
  const paidMonths = new Set(
    rents
      .filter(r => r.date && Number(r.rentAmount) > 0)
      .map(r => {
        const d = new Date(r.date);
        return `${d.getMonth()}-${d.getFullYear()}`;
      })
  );

  const months = [];
  const startMonth = new Date(currentYear, 0);
  const joinDate = new Date(joiningDateStr);
  const startDate = joinDate > startMonth ? joinDate : startMonth;
  const tempDate = new Date(startDate);

  while (tempDate <= now) {
    const key = `${tempDate.getMonth()}-${tempDate.getFullYear()}`;
    if (!paidMonths.has(key)) {
      months.push(tempDate.toLocaleString('default', { month: 'long', year: 'numeric' }));
    }
    tempDate.setMonth(tempDate.getMonth() + 1);
  }
  return months;
};

// Build compact “facts” for the LLM (avoid sending whole DB if huge)
function makeFacts({ tenants, rooms }) {
  const roomsData = rooms.map(r => ({
    roomNo: String(r.roomNo),
    floorNo: r.floorNo,
    beds: (r.beds || []).map(b => ({
      bedNo: String(b.bedNo),
      price: toNum(b.price),
      category: b.category || ""
    }))
  }));

  const facts = tenants.map(t => {
    const due = calculateDue(t.rents || [], t.joiningDate, t, roomsData);
    const pendingMonths = getPendingMonthsForStatus(t.rents || [], t.joiningDate);
    const lastPaid = (t.rents || [])
      .filter(r => r.date && Number(r.rentAmount) > 0)
      .sort((a, b) => new Date(b.date) - new Date(a.date))[0];

    return {
      id: t._id?.toString?.() || "",
      name: t.name || "",
      phoneNo: t.phoneNo || "",
      roomNo: String(t.roomNo || ""),
      bedNo: String(t.bedNo || ""),
      depositAmount: toNum(t.depositAmount || 0),
      joiningDate: t.joiningDate ? new Date(t.joiningDate).toISOString().slice(0, 10) : null,
      leaveDate: t.leaveDate ? new Date(t.leaveDate).toISOString().slice(0, 10) : null,
      baseRent: expectFromTenant(t, roomsData),
      dueAmount: due,
      pendingMonths,
      lastPayment: lastPaid
        ? { amount: toNum(lastPaid.rentAmount), date: new Date(lastPaid.date).toISOString().slice(0, 10) }
        : null,
      status: due > 0 ? "Pending" : "Paid",
    };
  });

  const vacant = [];
  roomsData.forEach(r => {
    (r.beds || []).forEach(b => {
      const taken = tenants.some(
        t =>
          String(t.roomNo) === r.roomNo &&
          String(t.bedNo) === b.bedNo &&
          !t.leaveDate
      );
      if (!taken) {
        vacant.push({
          roomNo: r.roomNo,
          bedNo: b.bedNo,
          price: b.price,
          category: b.category,
        });
      }
    });
  });

  return { tenants: facts, vacant };
}


router.post("/ask", async (req, res) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== "string") {
      return res.status(400).json({ error: "Provide a 'question' string" });
    }

    // Pull current data (small projection for privacy/perf)
    const [tenants, rooms] = await Promise.all([
      Form.find({}, {
        name: 1, phoneNo: 1, roomNo: 1, bedNo: 1, depositAmount: 1,
        joiningDate: 1, leaveDate: 1, baseRent: 1, rents: 1
      }).lean(),
      Room.find({}, { roomNo: 1, floorNo: 1, beds: 1 }).lean()
    ]);

    const world = makeFacts({ tenants, rooms });

    // Prompt: answer ONLY from facts, be concise
    const system = `
You are a helpful assistant for a rent/hostel management app.
You must answer strictly from the provided JSON facts. 
If the answer isn't in facts, say you don't have that info. 
Use Indian currency formatting for rupee amounts (₹ with commas).
When listing tenants, prefer short bullet points or a compact table-like text.`;

    const user = `
Question: ${question}

Facts (JSON):
${JSON.stringify(world).slice(0, 100000)} 
(Truncated automatically if too large.)`;

    // Call your LLM (you can swap model)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });

    const answer = completion.choices?.[0]?.message?.content?.trim() || "I couldn't find that in the data.";
    res.json({ answer });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Assistant failed. Check logs." });
  }
});

export default router;
