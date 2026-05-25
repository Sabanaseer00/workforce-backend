import express from "express";
import {
  createEmployee,
  getEmployees,
  updateEmployee,
  deleteEmployee,
} from "../controllers/employee.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.post("/", protect, createEmployee);
router.get("/", protect, getEmployees);
router.put("/:id", protect, updateEmployee);
router.delete("/:id", protect, deleteEmployee);

export default router;