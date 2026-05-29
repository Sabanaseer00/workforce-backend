import express from "express";
import {
  getAllEmployeesActivity,
  getEmployeeActivity,
  heartbeat,
  goOffline,
} from "../controllers/activity.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

/* ─────────────────────────────────────────
   🔥 HEARTBEAT — Employee ka laptop bhejta hai
   POST /api/employees/heartbeat
   (protect middleware optional — depends on setup)
───────────────────────────────────────── */
router.post("/heartbeat", protect, heartbeat);

/* ─────────────────────────────────────────
   🔴 GO OFFLINE — Logout pe call hota hai
   POST /api/employees/go-offline
───────────────────────────────────────── */
router.post("/go-offline", protect, goOffline);

/* ─────────────────────────────────────────
   📊 ALL EMPLOYEES ACTIVITY
   GET /api/employees/activity
───────────────────────────────────────── */
router.get("/activity", protect, getAllEmployeesActivity);

/* ─────────────────────────────────────────
   👤 SINGLE EMPLOYEE ACTIVITY
   GET /api/employees/:id/activity
───────────────────────────────────────── */
router.get("/:id/activity", protect, getEmployeeActivity);

export default router;