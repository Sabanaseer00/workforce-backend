import express from "express";

import {
  getAll,
  getStats,
  getBlockedSites,
  getBrowserBlockList,
  create,
  toggle,
  update,
  remove,
} from "../controllers/blockedApp.controller.js";

import { protect } from "../middleware/auth.middleware.js";
import { authorize } from "../middleware/role.middleware.js";

const router = express.Router();

// ─────────────────────────────────────────────
// ADMIN ONLY routes
// ─────────────────────────────────────────────
router.post("/",             protect, authorize("admin"), create);
router.patch("/:id/toggle",  protect, authorize("admin"), toggle);
router.put("/:id",           protect, authorize("admin"), update);
router.delete("/:id",        protect, authorize("admin"), remove);

// ─────────────────────────────────────────────
// ALL AUTHENTICATED USERS
// ─────────────────────────────────────────────
router.get("/",              protect, getAll);
router.get("/stats",         protect, getStats);

// ─────────────────────────────────────────────
// SPECIAL ENDPOINTS
// /api/blocked-apps/sites        ← Electron main.js uses this
// /api/blocked-apps/browser-list ← Browser Guard (mobile/tablet) uses this
// ─────────────────────────────────────────────
router.get("/sites",         protect, getBlockedSites);
router.get("/browser-list",  protect, getBrowserBlockList);

export default router;