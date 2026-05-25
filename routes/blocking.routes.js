// blocking.routes.js — Backend

import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import {
  getBlockedDomains,
  getBlockingSettings,
  updateBlockingSettings,
  testBlockedDomain,
  logBlockingViolation,
} from "../controllers/blocking.controller.js";

const router = express.Router();

// ── Electron agent ──────────────────────────────────────────────────
// Agent startup + 30s polling — blocked domains list fetch karo
router.get("/domains",    protect, getBlockedDomains);

// Agent reports jab employee blocked site try kare
router.post("/violation", protect, logBlockingViolation);

// ── Admin panel ─────────────────────────────────────────────────────
// Admin current blocking settings dekhe
router.get("/settings",   protect, getBlockingSettings);

// Admin ne save kiya → update + realtime push to all agents
router.put("/settings",   protect, updateBlockingSettings);

// Admin test kare koi domain blocked hai ya nahi
router.post("/test",      protect, testBlockedDomain);

export default router;