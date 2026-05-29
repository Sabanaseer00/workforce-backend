import express from "express";
import { protect } from "../middleware/auth.middleware.js";

import {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  computeAndSaveCPM,
  getAnalytics,
  getGanttData,
} from "../controllers/task.controller.js";

const router = express.Router();

// Analytics & CPM
router.get("/analytics", protect, getAnalytics);
router.get("/gantt", protect, getGanttData);
router.post("/compute-cpm", protect, computeAndSaveCPM);

// CRUD
router.get("/", protect, getAllTasks);
router.post("/", protect, createTask);
router.get("/:id", protect, getTaskById);
router.put("/:id", protect, updateTask);
router.patch("/:id/status", protect, updateTaskStatus);
router.delete("/:id", protect, deleteTask);

export default router;