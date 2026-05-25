import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getReport } from "../controllers/report.controller.js";

const router = express.Router();

router.get("/", protect, getReport);

export default router;