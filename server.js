// server.js (CommonJS)
const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config();

const { connectDB } = require("./config/db");

// Routers
const formRoutes = require("./routes/formRoutes");
const maintenanceRoutes = require("./routes/MaintRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const projectRoutes = require("./routes/Project");
const roomRoutes = require("./routes/roomRoutes");
const commercialRoutes = require("./routes/commercialRoutes");
const lightBillRoutes = require("./routes/lightBillRoutes");
const otherExpenseRoutes = require("./routes/otherExpenseRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const authRoutes = require("./routes/authRoutes");
const formWithDocsRoutes = require("./routes/formWithDocs");
const documentRoutes = require("./routes/documentRoutes");
const tenantRoutes = require("./routes/tenant");
const paymentRoutes = require("./routes/payments");
const leaveRoutes = require("./routes/leaveRoutes");
const adminNotificationsRouter = require("./routes/adminattendenceNotifications");
const adminLeaveRoutes = require("./routes/adminLeaveRoutes");
const tenantDocsRoutes = require("./routes/tenantDocs");
const invitesRouter = require("./routes/invites");

const app = express();

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://pnminfotech.com",
  "https://www.pnminfotech.com",
];

const envAllowedOrigins = String(
  process.env.CORS_ALLOWED_ORIGINS ||
    process.env.ALLOWED_ORIGINS ||
    process.env.FRONTEND_ORIGIN ||
    ""
)
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = [...new Set([...DEFAULT_ALLOWED_ORIGINS, ...envAllowedOrigins])];

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error(`Origin not allowed by CORS: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Origin",
    "X-Idempotency-Key",
  ],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json());

// Static files for uploaded content (if any local)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use("/api/tenant-docs", tenantDocsRoutes);

app.get("/.well-known/appspecific/com.chrome.devtools.json", (_req, res) =>
  res.sendStatus(204)
);

app.get("/api/health", (_req, res) =>
  res.json({ ok: true, env: process.env.NODE_ENV || "dev" })
);

// Routes
app.use("/api", authRoutes);
app.use("/api", formRoutes);
app.use("/api", formWithDocsRoutes); // ✅ no trailing slash
app.use("/api", projectRoutes);

app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/rooms", roomRoutes);
app.use("/api/commercial-units", commercialRoutes);
app.use("/api/light-bill", lightBillRoutes);
app.use("/api/other-expense", otherExpenseRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/documents", documentRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/invites", invitesRouter);
app.use("/api/tenant/leaves", leaveRoutes);

app.use("/api/staff-expenses", require("./routes/staffExpenseRoutes"));
app.use("/api", require("./routes/notifications"));
app.use("/api/admin", adminLeaveRoutes);
app.use("/api", require("./routes/tenantAttendance"));
app.use("/api/admin", adminNotificationsRouter);

connectDB();

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`✅ Server running: http://localhost:${PORT}`);
  console.log(`✅ Health:        http://localhost:${PORT}/api/health`);
});
