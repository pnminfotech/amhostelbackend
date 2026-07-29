// routes/documentRoutes.js
const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();
const { ObjectId } = mongoose.Types;

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!ObjectId.isValid(id)) {
      return res.status(404).json({ error: "DOCUMENT_NOT_FOUND", detail: "Invalid file id." });
    }

    const db = mongoose.connection.db;
    if (!db) {
      return res.status(503).json({ error: "DB_NOT_READY", detail: "Database not ready." });
    }

    const _id = new ObjectId(id);

    // 1) Find ALL collections, look for those that end with ".files"
    const cols = await db.listCollections().toArray();
    const filesCols = cols
      .map(c => c.name)
      .filter(name => name.endsWith(".files"));

    // 2) Search each *.files collection for this _id
    let bucketName = null;
    let fileDoc = null;
    for (const filesColName of filesCols) {
      const doc = await db.collection(filesColName).findOne({ _id });
      if (doc) {
        fileDoc = doc;
        bucketName = filesColName.replace(/\.files$/, ""); // derive bucket name
        break;
      }
    }

    if (!bucketName || !fileDoc) {
      // Not in GridFS (or wrong id) — tell client cleanly
      return res.status(404).json({
        error: "DOCUMENT_NOT_FOUND",
        detail: `No GridFS file found for id "${id}".`,
      });
    }

    // 3) Stream from that bucket
    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName });
    const contentType =
      fileDoc.contentType || fileDoc.metadata?.contentType || "application/octet-stream";
    res.setHeader("Content-Type", contentType);
    if (typeof fileDoc.length === "number") {
      res.setHeader("Content-Length", String(fileDoc.length));
    }
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    const stream = bucket.openDownloadStream(_id);
    stream.on("error", (err) => {
      console.error("[documents] stream error:", err);
      if (!res.headersSent) res.status(500).json({ error: "STREAM_ERROR" });
    });
    return stream.pipe(res);
  } catch (err) {
    console.error("[documents] fatal:", err);
    return res.status(500).json({ error: "SERVER_ERROR", detail: err?.message || "Unknown error" });
  }
});

module.exports = router;
