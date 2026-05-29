// ═══════════════════════════════════════════════════════
//  routes/empScreenshot.routes.js
//  Mount in server.js:
//  app.use("/api/emp", empScreenshotRoutes)
// ═══════════════════════════════════════════════════════
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getMyScreenshots } from "../controllers/Empscreenshot.controller.js";

const router = express.Router();

// GET /api/emp/screenshots?range=today&limit=100
router.get("/screenshots", protect, getMyScreenshots);

export default router;