// ═══════════════════════════════════════════════════════
//  routes/empProfile.routes.js
//  Mount in server.js:
//  app.use("/api/emp", empProfileRoutes)
// ═══════════════════════════════════════════════════════
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getMyProfile, updateMyProfile } from "../controllers/empProfile.controller.js";

const router = express.Router();

// GET /api/emp/profile   → apni profile dekho
// PUT /api/emp/profile   → apni profile update karo
router.get("/profile", protect, getMyProfile);
router.put("/profile", protect, updateMyProfile);

export default router;