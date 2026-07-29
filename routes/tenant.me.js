const router = require("express").Router();
const authTenant = require("../middleware/tenantAuth");

// GET /api/tenant/me
router.get("/me", authTenant, async (req, res) => {
  // you already attached full Form doc at req.tenant
  const t = req.tenant;
  res.json({
    _id: t._id,
    name: t.name || "Tenant",
    phone: t.phone,
    roomNo: t.roomNo,
    bedNo: t.bedNo,
  });
});

module.exports = router;
