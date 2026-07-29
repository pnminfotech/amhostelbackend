const Tenant = require("../models/Tenant");
const Rent = require("../models/Rent");
const Announcement = require("../models/Announcement");
const { calculateTenantDue } = require("../utils/calculateTenantDue");

exports.getTenantDashboard = async (req, res) => {
  try {
    const tenant = await Tenant.findById(req.user.id).lean();
    const due = await calculateTenantDue(req.user.id);

    const rents = await Rent.find({ tenantId: req.user.id }).lean();
    const ann = await Announcement.find().sort({ createdAt: -1 }).limit(5).lean();

    res.json({
      me: tenant,
      rents: {
        rents,
        due
      },
      ann
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
};
