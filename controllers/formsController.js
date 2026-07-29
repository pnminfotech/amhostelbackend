// import mongoose from "mongoose";
// import Invite from "../models/Invite.js";
// import Form from "../models/Form.js"; // your existing tenant form model

// function getFirstRentMonth(joiningDate) {
//   const d = new Date(joiningDate);
//   return new Date(d.getFullYear(), d.getMonth() + 1, 1); // next month
// }

// export async function createForm(req, res) {
//   const session = await mongoose.startSession();
//   try {
//     const {
//       inviteToken, // << EXPECTED FROM FRONTEND
//       // ... rest payload
//     } = req.body;

//     await session.withTransaction(async () => {
//       // 1) Verify & atomically mark invite as used
//       const now = new Date();
//       const invite = await Invite.findOneAndUpdate(
//         {
//           token: inviteToken,
//           usedAt: null,
//           expiresAt: { $gt: now },
//         },
//         { $set: { usedAt: now } },
//         { new: true, session }
//       );

//       if (!invite) {
//         // Either invalid, already used, or expired
//         throw Object.assign(new Error("Invalid or already used link"), { http: 409 });
//       }

//       // 2) Create tenant form (you already sanitize payload elsewhere)
//       const doc = await Form.create([{ ...req.body }], { session });
//       const saved = doc[0];

//       // 3) Link for audit
//       await Invite.updateOne(
//         { _id: invite._id },
//         { $set: { usedByFormId: saved._id } },
//         { session }
//       );

//       res.status(201).json(saved);
//     });
//   } catch (err) {
//     console.error("createForm error:", err);
//     const code = err.http || 500;
//     res.status(code).json({ message: err.message || "Failed to create form" });
//   } finally {
//     session.endSession();
//   }
// }




import mongoose from "mongoose";
import Invite from "../models/Invite.js";
import Form from "../models/Form.js"; // tenant form model

// ✅ Rent always starts from NEXT month
function getFirstRentMonth(joiningDate) {
  const d = new Date(joiningDate);
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}

export async function createForm(req, res) {
  const session = await mongoose.startSession();

  try {
    const { inviteToken } = req.body;

    await session.withTransaction(async () => {
      // 1️⃣ Verify & atomically mark invite as used
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
        throw Object.assign(
          new Error("Invalid or already used link"),
          { http: 409 }
        );
      }

      // 2️⃣ BACKEND controls tenant creation
      // Ignore rent-related fields from frontend
      const {
        rents,        // ❌ ignore
        paidRent,    // ❌ ignore
        status,      // ❌ ignore
        inviteToken: _ignoreInvite,
        ...rest
      } = req.body;

      const tenantPayload = {
        ...rest,
        joiningDate: new Date(rest.joiningDate),
        rents: [], // ✅ ALWAYS EMPTY ON CREATE
        rentStartMonth: getFirstRentMonth(rest.joiningDate), // optional but safe
      };

      // 3️⃣ Create tenant form
      const doc = await Form.create([tenantPayload], { session });
      const saved = doc[0];

      // 4️⃣ Link invite → form (audit trail)
      await Invite.updateOne(
        { _id: invite._id },
        { $set: { usedByFormId: saved._id } },
        { session }
      );

      res.status(201).json(saved);
    });
  } catch (err) {
    console.error("createForm error:", err);
    const code = err.http || 500;
    res.status(code).json({
      message: err.message || "Failed to create form",
    });
  } finally {
    session.endSession();
  }
}
