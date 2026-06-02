import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getMyActivity } from "../controllers/Empactivity.controller.js";
import { getWorkHours } from "../controllers/Empworkhours.controller.js";

const router = express.Router();

router.get("/activity", protect, getMyActivity);
router.get("/workhours", protect, getWorkHours);

export default router;