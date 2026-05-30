<<<<<<< HEAD
// ═══════════════════════════════════════════════════════
//  routes/empActivity.routes.js
//  Mount in server.js:
//  app.use("/api/emp", empActivityRoutes)
// ═══════════════════════════════════════════════════════
import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import { getMyActivity } from "../controllers/Empactivity.controller.js";

const router = express.Router();

// GET /api/emp/activity?range=today&limit=200
router.get("/activity", protect, getMyActivity);
=======
import express from "express";

import {
  getAll,
  getStats,
  create,
  toggle,
  update,
  remove,
} from "../controllers/blockedApp.controller.js";

import { protect } from "../middleware/auth.middleware.js";

const router = express.Router();

/**
 * GET all blocked apps
 */
router.get("/", protect, getAll);

/**
 * GET stats
 */
router.get("/stats", protect, getStats);

/**
 * CREATE blocked app
 */
router.post("/", protect, create);

/**
 * TOGGLE block/unblock
 */
router.patch("/:id/toggle", protect, toggle);

/**
 * UPDATE blocked app
 */
router.put("/:id", protect, update);

/**
 * DELETE blocked app
 */
router.delete("/:id", protect, remove);
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f

export default router;