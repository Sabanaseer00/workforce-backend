// ═══════════════════════════════════════════════════════
//  routes/empActivity.routes.js
//  Mount in server.js:
//  app.use("/api/emp", empActivityRoutes)
// ═══════════════════════════════════════════════════════
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getMyActivity } from "../controllers/Empactivity.controller.js";

const router = express.Router();

// GET /api/emp/activity?range=today&limit=200
router.get("/activity", protect, getMyActivity);

export default router;