// ═══════════════════════════════════════════════════════
//  routes/empTask.routes.js
//  Mount in server.js:
//  app.use("/api/emp", empTaskRoutes)
// ═══════════════════════════════════════════════════════
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getMyTasks, updateMyTaskStatus } from "../controllers/Emptask.controller.js";

const router = express.Router();

// GET   /api/emp/tasks              → apni tasks dekho
// PATCH /api/emp/tasks/:id/status   → task status update karo
router.get("/tasks",                  protect, getMyTasks);
router.patch("/tasks/:id/status",     protect, updateMyTaskStatus);

export default router;