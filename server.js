import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http";
import cookieParser from "cookie-parser";
import dns from "dns";
import { connectDB } from "./config/db.js";
import { initSocket } from "./config/socket.js";
<<<<<<< HEAD
import burnoutRoutes   from "./routes/burnout.routes.js";
import authRoutes       from "./routes/auth.routes.js";
import taskRoutes       from "./routes/task.routes.js";
import employeeRoutes   from "./routes/employee.routes.js";
import activityRoutes   from "./routes/activity.routes.js";
import screenshotRoutes from "./routes/screenshot.routes.js";
import reportRoutes     from "./routes/report.routes.js";
import settingsRoutes   from "./routes/settings.routes.js";
import dashboardRoutes  from "./routes/dashboard.routes.js";
import alertRoutes      from "./routes/alert.routes.js";
import privacyRoutes    from "./routes/privacy.routes.js";
import blockingRoutes   from "./routes/blocking.routes.js";
import empActivityRoutes   from "./routes/Empactivity.routes.js";
import empScreenshotRoutes from "./routes/Empscreenshot.routes.js";
import empWorkHoursRoutes  from "./routes/Empworkhours.routes.js";
import empProfileRoutes    from "./routes/Empprofile.routes.js";
import empTaskRoutes       from "./routes/Emptask.routes.js";
import empDashboardRoutes  from "./routes/Empdashboard.routes.js";
import blockedAppRoutes    from "./routes/blockedApp.routes.js";
import emailVerifyRoutes   from "./routes/emailVerify.routes.js";
=======
import burnoutRoutes        from "./routes/burnout.routes.js";
import authRoutes           from "./routes/auth.routes.js";
import taskRoutes           from "./routes/task.routes.js";
import employeeRoutes       from "./routes/employee.routes.js";
import activityRoutes       from "./routes/activity.routes.js";
import screenshotRoutes     from "./routes/screenshot.routes.js";
import reportRoutes         from "./routes/report.routes.js";
import settingsRoutes       from "./routes/settings.routes.js";
import dashboardRoutes      from "./routes/dashboard.routes.js";
import alertRoutes          from "./routes/alert.routes.js";
import privacyRoutes        from "./routes/privacy.routes.js";
import blockingRoutes       from "./routes/blocking.routes.js";
import empActivityRoutes    from "./routes/Empactivity.routes.js";
import empScreenshotRoutes  from "./routes/Empscreenshot.routes.js";
import empWorkHoursRoutes   from "./routes/Empworkhours.routes.js";
import empProfileRoutes     from "./routes/Empprofile.routes.js";
import empTaskRoutes        from "./routes/Emptask.routes.js";
import empDashboardRoutes   from "./routes/Empdashboard.routes.js";
import blockedAppRoutes     from "./routes/blockedApp.routes.js";
import emailVerifyRoutes    from "./routes/emailVerify.routes.js";
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f

dotenv.config();

const app    = express();
const server = http.createServer(app);

dns.setServers(["1.1.1.1", "8.8.8.8"]);

<<<<<<< HEAD
app.use(cors({
  origin: function (origin, callback) {
    const allowed = [
      "https://workforce-frontend-ten.vercel.app",
      "https://workforce-productivity-5163.vercel.app",
      "https://workforce-frontend-git-main-beenish-latifs-projects.vercel.app",
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:5000",
    ];
    if (
      !origin ||
      allowed.includes(origin) ||
=======
// ─── Ek hi jagah — dono server.js aur socket.js yahan se sync hain ──────────
const ALLOWED_ORIGINS = [
  "https://workforce-frontend-ten.vercel.app",
  "https://workforce-productivity-5163.vercel.app",
  "https://workforce-frontend-git-main-beenish-latifs-projects.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5000",
];

app.use(cors({
  origin: function (origin, callback) {
    if (
      !origin ||
      ALLOWED_ORIGINS.includes(origin) ||
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
      origin.startsWith("http://127.0.0.1") ||
      origin.startsWith("chrome-extension://")
    ) {
      callback(null, true);
    } else {
<<<<<<< HEAD
      callback(new Error("Not allowed by CORS"));
=======
      callback(new Error("Not allowed by CORS: " + origin));
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());

app.get("/", (req, res) => {
  res.json({ message: "🚀 API is running" });
});

const startServer = async () => {
  try {
    await connectDB();
    console.log("✅ Database Connected Successfully");

    const ioInstance = initSocket(server);
    app.set("io", ioInstance);

<<<<<<< HEAD
=======
    // ─── Routes ────────────────────────────────────────────────────────────
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
    app.use("/api/auth",         authRoutes);
    app.use("/api/tasks",        taskRoutes);
    app.use("/api/screenshots",  screenshotRoutes);
    app.use("/api/reports",      reportRoutes);
    app.use("/api/settings",     settingsRoutes);
    app.use("/api/dashboard",    dashboardRoutes);
    app.use("/api/alerts",       alertRoutes);
    app.use("/api/employees",    activityRoutes);
    app.use("/api/employees",    employeeRoutes);
    app.use("/api/burnout",      burnoutRoutes);
    app.use("/api/privacy",      privacyRoutes);
    app.use("/api/blocking",     blockingRoutes);
    app.use("/api/blocked-apps", blockedAppRoutes);

    app.use("/api/emp", empActivityRoutes);
    app.use("/api/emp", empScreenshotRoutes);
    app.use("/api/emp", empWorkHoursRoutes);
    app.use("/api/emp", empProfileRoutes);
    app.use("/api/emp", empTaskRoutes);
    app.use("/api/emp", empDashboardRoutes);
    app.use("/api/verify-email", emailVerifyRoutes);

<<<<<<< HEAD
=======
    // ─── Start ─────────────────────────────────────────────────────────────
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error("❌ Server failed to start:", error.message);
    if (error.message.includes("bad auth"))           console.log("👉 MongoDB username/password issue");
    if (error.message.includes("ENOTFOUND"))          console.log("👉 DNS / Cluster URL issue");
    if (error.message.includes("Cannot find module")) console.log("👉 Missing file:", error.message);
    process.exit(1);
  }
};

startServer();