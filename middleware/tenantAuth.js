// // middleware/tenantAuth.js
// const jwt = require("jsonwebtoken");
// const Form = require("../models/formModels");

// // One consistent secret (env overrides local)
// const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// module.exports = async function authTenant(req, res, next) {
//   try {
//     // 1) Get Bearer token
//     const hdr = req.headers.authorization || "";
//     const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
//     if (!token) return res.status(401).json({ message: "Missing token" });

//     // 2) Verify
//     const payload = jwt.verify(token, JWT_SECRET);

//     // 3) Optional role enforcement (uncomment if you include role in your token)
//     // if (payload.role !== "tenant") return res.status(403).json({ message: "Forbidden" });

//     // 4) Resolve tenant id from common fields
//     const tenantId =
//       payload.sub || payload.tenantId || payload.userId || payload.id || payload._id;
//     if (!tenantId) return res.status(401).json({ message: "Invalid token (no id)" });

//     // 5) Load tenant from DB
//     // const tenant = await Form.findById(tenantId).lean();
//     const tenant = await Form.findById(tenantId);
//     if (!tenant) return res.status(401).json({ message: "Invalid token / tenant missing" });

//     // 6) Attach BOTH shapes for compatibility
//     req.tenantDoc = tenant; // full Mongoose document
// req.tenant = { id: String(tenant._id), _id: String(tenant._id), phone: payload.phone };

//     req.user = {
//       id: String(tenant._id),
//       _id: String(tenant._id),
//       userId: String(tenant._id),
//       name: tenant.name || "Tenant",
//       fullName: tenant.name || "Tenant",
//       username: tenant.name || "Tenant",
//       roomNo: tenant.roomNo,
//       bedNo: tenant.bedNo,
//     };

//     next();
//   } catch (err) {
//     console.error("authTenant error:", err?.message || err);
//     return res.status(401).json({ message: "Invalid/expired token" });
//   }
// };



// middleware/tenantAuth.js
const jwt = require("jsonwebtoken");
const Form = require("../models/formModels");

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

module.exports = async function authTenant(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Missing token" });

    const payload = jwt.verify(token, JWT_SECRET);

    const tenantId =
      payload.sub || payload.tenantId || payload.userId || payload.id || payload._id;
    if (!tenantId) return res.status(401).json({ message: "Invalid token (no id)" });

    // ✅ Fetch tenant as full Mongoose document
    const tenant = await Form.findById(tenantId);
    if (!tenant) return res.status(401).json({ message: "Invalid token / tenant missing" });

    // ✅ Attach full document to req.tenant so .save() works
    req.tenant = tenant;

    req.user = {
      id: String(tenant._id),
      _id: String(tenant._id),
      userId: String(tenant._id),
      name: tenant.name || "Tenant",
      fullName: tenant.name || "Tenant",
      username: tenant.name || "Tenant",
      roomNo: tenant.roomNo,
      bedNo: tenant.bedNo,
    };

    next();
  } catch (err) {
    console.error("authTenant error:", err?.message || err);
    return res.status(401).json({ message: "Invalid/expired token" });
  }
};
