// middleware/requireTenantAuth.js
const jwt = require("jsonwebtoken");
const Form = require("../models/formModels"); // your single source of truth

// Helper: extract bearer token
function getToken(req) {
  const h = req.headers.authorization || req.headers.Authorization || "";
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) return m[1];

  // optional cookie support
  if (req.cookies?.tenant_token) return req.cookies.tenant_token;

  return null;
}

module.exports = async function requireTenantAuth(req, res, next) {
  try {
    let tenantId = null;

    // 1) Try JWT first (recommended)
    const token = getToken(req);
    if (token) {
      const secret =
        process.env.TENANT_JWT_SECRET ||
        process.env.JWT_SECRET ||
        process.env.JWT_TOKEN ||
        "changeme-in-env";
      const payload = jwt.verify(token, secret);

      // try common id keys in payload
      tenantId =
        payload.sub ||
        payload.tenantId ||
        payload.userId ||
        payload.id ||
        payload._id ||
        null;
    }

    // 2) Dev fallback: allow x-tenant-id header or ?tenantId=...
    if (!tenantId) {
      const headerId = req.headers["x-tenant-id"];
      const qsId = req.query.tenantId || req.query.tid;
      tenantId = headerId || qsId || null;
    }

    if (!tenantId) {
      return res.status(401).json({ message: "Unauthorized (no tenant token/id)" });
    }

    // 3) Load tenant from DB
    const tenant = await Form.findById(tenantId).lean();
    if (!tenant) {
      return res.status(401).json({ message: "Unauthorized (tenant not found)" });
    }

    // 4) Attach a consistent req.user
    req.user = {
      _id: tenant._id,
      id: String(tenant._id),
      userId: String(tenant._id),
      name: tenant.name || "Tenant",
      roomNo: tenant.roomNo,
      bedNo: tenant.bedNo,
    };

    next();
  } catch (err) {
    console.error("requireTenantAuth error:", err?.message || err);
    return res.status(401).json({ message: "Unauthorized (invalid token)" });
  }
};
