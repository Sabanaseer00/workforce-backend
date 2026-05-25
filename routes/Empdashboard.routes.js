// ═══════════════════════════════════════════════════════
//  routes/empDashboard.routes.js
//  Mount in server.js:
//  app.use("/api/emp", empDashboardRoutes)
// ═══════════════════════════════════════════════════════
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getMyDashboard } from "../controllers/empDashboard.controller.js";

const router = express.Router();

// GET /api/emp/dashboard
router.get("/dashboard", protect, getMyDashboard);

export default router;