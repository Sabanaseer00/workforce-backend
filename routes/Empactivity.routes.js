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

export default router;