// ═══════════════════════════════════════════════════════
//  routes/empWorkHours.routes.js
//  Mount in server.js:
//  app.use("/api/emp", empWorkHoursRoutes)
// ═══════════════════════════════════════════════════════
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getMyWorkHours } from "../controllers/Empworkhours.controller.js";

const router = express.Router();

// GET /api/emp/workhours?range=today
router.get("/workhours", protect, getMyWorkHours);

export default router;