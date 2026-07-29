const jwt = require("jsonwebtoken");
module.exports = function authTenant(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ message: "Missing token" });
    const payload = jwt.verify(token, process.env.JWT_SECRET || "dev-secret");
    if (payload.role !== "tenant") return res.status(403).json({ message: "Forbidden" });
    req.tenant = { id: payload.sub, phone: payload.phone };
    next();
  } catch {
    return res.status(401).json({ message: "Invalid/expired token" });
  }
};
