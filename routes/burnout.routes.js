import express from "express";
import { getBurnoutAnalysis } from "../controllers/burnout.controller.js";
import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

router.get("/analysis", protect, getBurnoutAnalysis);

export default router;