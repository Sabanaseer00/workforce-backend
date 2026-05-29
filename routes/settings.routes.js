import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getSettings,
  updateSettings,
  changePassword,
  deleteAllScreenshots,
  resetAllAlerts,
} from "../controllers/settings.controller.js";

const router = express.Router();

router.get("/",                    protect, getSettings);
router.put("/",                    protect, updateSettings);
router.post("/change-password",    protect, changePassword);
router.delete("/screenshots/all",  protect, deleteAllScreenshots);
router.delete("/alerts/all",       protect, resetAllAlerts);

export default router;
