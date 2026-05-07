// // controllers/forms/createWithOptionalInvite.js
// const mongoose = require("mongoose");
// const Invite = require("../../models/Invite");
// const Form = require("../../models/formModels");

// // Re-use central SrNo helper from formController
// const {
//   assignNextSrNoAndUpdateCounter,
// } = require("../formController");

// // Always assign SrNo on server using shared helper
// async function createFormWithSrNo(rest, session) {
//   const payload = { ...rest };
//   delete payload.srNo;

//   const nextSr = await assignNextSrNoAndUpdateCounter();
//   payload.srNo = Number(nextSr);

//   if (session) {
//     const [doc] = await Form.create([payload], { session });
//     return doc;
//   }
//   return await Form.create(payload);
// }

// // Fallback flow when transactions are not supported
// const plainSingleUseFlow = async (inviteToken, rest) => {
//   const now = new Date();

//   const invite = await Invite.findOneAndUpdate(
//     { token: inviteToken, usedAt: null, expiresAt: { $gt: now } },
//     { $set: { usedAt: now } },
//     { new: true }
//   );

//   if (!invite) {
//     const e = new Error("Invalid, expired, or already used link");
//     e.http = 409;
//     throw e;
//   }

//   const doc = await createFormWithSrNo(rest, null);

//   await Invite.updateOne(
//     { _id: invite._id },
//     { $set: { usedByFormId: doc._id } }
//   );

//   return doc;
// };

// async function createWithOptionalInvite(req, res) {
//   const session = await mongoose.startSession();
//   const { inviteToken, ...rest } = req.body;

//   // No token → normal create (still uses central SrNo helper)
//   if (!inviteToken) {
//     try {
//       const saved = await createFormWithSrNo(rest, null);
//       return res.status(201).json(saved);
//     } catch (err) {
//       console.error("create form (no invite) error:", err);
//       const isDupSr =
//         err?.code === 11000 &&
//         (err?.keyPattern?.srNo || /srNo/i.test(String(err?.errmsg || "")));
//       const code = err.http || (isDupSr ? 409 : 500);
//       return res.status(code).json({
//         message: isDupSr
//           ? "Sr No already exists, please retry."
//           : err.message || "Failed to create form",
//       });
//     }
//   }

//   try {
//     let created = null;

//     try {
//       await session.withTransaction(async () => {
//         const now = new Date();

//         const invite = await Invite.findOneAndUpdate(
//           { token: inviteToken, usedAt: null, expiresAt: { $gt: now } },
//           { $set: { usedAt: now } },
//           { new: true, session }
//         );

//         if (!invite) {
//           const e = new Error("Invalid, expired, or already used link");
//           e.http = 409;
//           throw e;
//         }

//         const doc = await createFormWithSrNo(rest, session);

//         await Invite.updateOne(
//           { _id: invite._id },
//           { $set: { usedByFormId: doc._id } },
//           { session }
//         );

//         created = doc;
//       });
//     } catch (txErr) {
//       const msg = String(txErr?.message || "");
//       const noTx =
//         txErr?.code === 20 ||
//         /Transaction numbers are only allowed/i.test(msg) ||
//         /replica set/i.test(msg);

//       if (noTx) {
//         console.warn("[invites] Falling back to non-transaction flow:", msg);
//         created = await plainSingleUseFlow(inviteToken, rest);
//       } else {
//         throw txErr;
//       }
//     }

//     return res.status(201).json(created);
//   } catch (err) {
//     console.error("create (with invite) error:", err);
//     const isDupSr =
//       err?.code === 11000 &&
//       (err?.keyPattern?.srNo || /srNo/i.test(String(err?.errmsg || "")));
//     const code = err.http || (isDupSr ? 409 : 500);
//     res.status(code).json({
//       message: isDupSr
//         ? "Sr No already exists, please retry."
//         : err.message || "Failed to create form",
//     });
//   } finally {
//     session.endSession();
//   }
// }

// module.exports = { createWithOptionalInvite };



// controllers/forms/createWithOptionalInvite.js
const mongoose = require("mongoose");
const Invite = require("../../models/Invite");
const Form = require("../../models/formModels");
const { getCurrentMonthlyRent } = require("../../routes/_helpers/rentHistory");

// Re-use central SrNo helper from formController
const {
  assignNextSrNoAndUpdateCounter,
} = require("../formController");

// Always assign SrNo on server using shared helper
async function createFormWithSrNo(rest, session) {
  const payload = { ...rest };
  delete payload.srNo;

  const nextSr = await assignNextSrNoAndUpdateCounter();
  payload.srNo = Number(nextSr);

  if (session) {
    const [doc] = await Form.create([payload], { session });
    return doc;
  }
  return await Form.create(payload);
}

function parseLeaveDate(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  const raw = String(value).trim();
  if (!raw) return null;

  const ymd = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));

  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function isActiveBedTenant(tenant, category) {
  const tenantCategory = String(tenant?.category || "").trim();
  if (tenantCategory && category && tenantCategory !== category) return false;

  const leaveDate = parseLeaveDate(tenant?.leaveDate);
  if (!leaveDate) return true;

  leaveDate.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return leaveDate > today;
}

async function assertBedIsVacant(rest, excludeTenantId) {
  const roomNo = String(rest?.roomNo || "").trim();
  const bedNo = String(rest?.bedNo || "").trim();
  if (!roomNo || !bedNo) return;

  const category = String(rest?.category || "").trim();
  const candidates = await Form.find({
    roomNo,
    bedNo,
    ...(excludeTenantId ? { _id: { $ne: excludeTenantId } } : {}),
  })
    .select("_id name category leaveDate")
    .lean();
  const occupied = candidates.find((tenant) => isActiveBedTenant(tenant, category));

  if (occupied) {
    const e = new Error(
      `Bed already occupied by "${occupied.name || "tenant"}": Room "${roomNo}", Bed "${bedNo}".`
    );
    e.http = 409;
    throw e;
  }
}

// Fallback flow when transactions are not supported
const plainSingleUseFlow = async (inviteToken, rest) => {
  const now = new Date();

  const invite = await Invite.findOneAndUpdate(
    {
      token: inviteToken,
      usedAt: null,
      $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
    },
    { $set: { usedAt: now } },
    { new: true }
  );

  if (!invite) {
    const e = new Error("Invalid, expired, or already used link");
    e.http = 409;
    throw e;
  }

  await assertBedIsVacant(rest, invite.usedByFormId);
  const doc = await createFormWithSrNo(rest, null);

  await Invite.updateOne(
    { _id: invite._id },
    { $set: { usedByFormId: doc._id } }
  );

  return doc;
};

async function createWithOptionalInvite(req, res) {
  const session = await mongoose.startSession();
  const { inviteToken, ...rest } = req.body;

  /* ---------------------------------------------------------
     ✅ FIX 1: STORE monthly rent into baseRent (BEFORE deleting)
     --------------------------------------------------------- */
  const monthlyRent = Number(rest.baseRent ?? rest.rentAmount ?? 0);
  if (Number.isFinite(monthlyRent) && monthlyRent > 0) {
    rest.baseRent = monthlyRent; // ✅ monthly expected rent stored on tenant
  }

  /* ---------------------------------------------------------
     ✅ FIX 2: rents[] means "payments", so always start empty
     --------------------------------------------------------- */
  delete rest.rents;
  delete rest.rentAmount;
  delete rest.month;
  delete rest.date;
  delete rest.paymentMode;
  rest.rents = []; // 🟢 Force rents to always start empty
  if (!Array.isArray(rest.rentHistory) || !rest.rentHistory.length) {
    const initialRent = getCurrentMonthlyRent(rest);
    if (initialRent > 0) {
      rest.rentHistory = [
        {
          effectiveFrom: rest.joiningDate ? new Date(rest.joiningDate) : new Date(),
          roomNo: rest.roomNo != null ? String(rest.roomNo) : "",
          bedNo: rest.bedNo != null ? String(rest.bedNo) : "",
          baseRent: initialRent,
          rentAmount: initialRent,
          source: "initial",
        },
      ];
    }
  }

  // No invite token → normal create
  if (!inviteToken) {
    try {
      await assertBedIsVacant(rest);
      const saved = await createFormWithSrNo(rest, null);
      return res.status(201).json(saved);
    } catch (err) {
      console.error("create form (no invite) error:", err);
      const isDupSr =
        err?.code === 11000 &&
        (err?.keyPattern?.srNo || /srNo/i.test(String(err?.errmsg || "")));
      const code = err.http || (isDupSr ? 409 : 500);
      return res.status(code).json({
        message: isDupSr
          ? "Sr No already exists, please retry."
          : err.message || "Failed to create form",
      });
    }
  }

  // Invite token exists → special flow
  try {
    let created = null;

    try {
      await session.withTransaction(async () => {
        const now = new Date();

        const invite = await Invite.findOneAndUpdate(
          {
            token: inviteToken,
            usedAt: null,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
          },
          { $set: { usedAt: now } },
          { new: true, session }
        );

        if (!invite) {
          const e = new Error("Invalid, expired, or already used link");
          e.http = 409;
          throw e;
        }

        // 🟢 rents already sanitized above
        await assertBedIsVacant(rest, invite.usedByFormId);
        const doc = await createFormWithSrNo(rest, session);

        await Invite.updateOne(
          { _id: invite._id },
          { $set: { usedByFormId: doc._id } },
          { session }
        );

        created = doc;
      });
    } catch (txErr) {
      const msg = String(txErr?.message || "");
      const noTx =
        txErr?.code === 20 ||
        /Transaction numbers are only allowed/i.test(msg) ||
        /replica set/i.test(msg);

      if (noTx) {
        console.warn("[invites] Falling back to non-transaction flow:", msg);
        created = await plainSingleUseFlow(inviteToken, rest);
      } else {
        throw txErr;
      }
    }

    return res.status(201).json(created);
  } catch (err) {
    console.error("create (with invite) error:", err);
    const isDupSr =
      err?.code === 11000 &&
      (err?.keyPattern?.srNo || /srNo/i.test(String(err?.errmsg || "")));
    const code = err.http || (isDupSr ? 409 : 500);
    res.status(code).json({
      message: isDupSr
        ? "Sr No already exists, please retry."
        : err.message || "Failed to create form",
    });
  } finally {
    session.endSession();
  }
}

module.exports = { createWithOptionalInvite };
