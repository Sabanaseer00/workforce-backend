import express from "express";
import {
  getAlerts,
  getAlertStats,
  resolveAlert,
  resolveAllAlerts,
  deleteAlert,
  getFlaggedEmployees,
  checkScreenshotGaps,
} from "../controllers/alert.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/",                protect, getAlerts);
router.get("/stats",           protect, getAlertStats);
router.get("/flagged-employees", protect, getFlaggedEmployees);
router.patch("/:id/resolve",   protect, resolveAlert);
router.patch("/resolve-all",   protect, resolveAllAlerts);
router.delete("/:id",          protect, deleteAlert);
// Existing routes ke baad:
router.post("/check-gaps", protect, checkScreenshotGaps);

export default router;