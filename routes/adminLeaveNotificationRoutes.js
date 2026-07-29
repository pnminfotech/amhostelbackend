const express = require("express");
const router = express.Router();
const LeaveNotification = require("../models/LeaveNotification");
const LeaveRequest = require("../models/LeaveRequest");
const requireAdmin = (_req,_res,next)=>next();

router.get("/notifications/leave", requireAdmin, async (req,res)=>{
  const limit = Math.min(parseInt(req.query.limit||"100",10), 200);
  const unread = String(req.query.unread||"false")==="true";
  const list = await LeaveNotification.find(unread?{isRead:false}:{})
    .sort({createdAt:-1})
    .limit(limit)
    .populate({ path:"requestId", model:"LeaveRequest" })
    .populate({ path:"tenant", model:"Tenant", select:"name roomNo bedNo" })
    .lean();
  res.json(list);
});

router.get("/notifications/leave/unread-count", requireAdmin, async (_req,res)=>{
  const count = await LeaveNotification.countDocuments({ isRead:false });
  res.json({ count });
});

router.patch("/notifications/leave/:id/read", requireAdmin, async (req,res)=>{
  const { id } = req.params;
  const doc = await LeaveNotification.findByIdAndUpdate(id, { isRead:true }, { new:true });
  if(!doc) return res.status(404).json({ message:"Not found" });
  res.json(doc);
});

router.post("/notifications/leave/read-all", requireAdmin, async (_req,res)=>{
  await LeaveNotification.updateMany({ isRead:false }, { $set:{ isRead:true }});
  res.json({ ok:true });
});

router.post("/leave/:id/approve", requireAdmin, async (req,res)=>{
  const { id } = req.params;
  const doc = await LeaveRequest.findById(id);
  if(!doc) return res.status(404).json({ message:"Request not found" });
  if(doc.status !== "pending") return res.status(400).json({ message:"Only pending can be updated" });
  doc.status = "approved";
  await doc.save();
  res.json(doc);
});

router.post("/leave/:id/reject", requireAdmin, async (req,res)=>{
  const { id } = req.params;
  const { reason = "" } = req.body;
  const doc = await LeaveRequest.findById(id);
  if(!doc) return res.status(404).json({ message:"Request not found" });
  if(doc.status !== "pending") return res.status(400).json({ message:"Only pending can be updated" });
  doc.status = "rejected";
  doc.cancelReason = reason;
  await doc.save();
  res.json(doc);
});

module.exports = router;
