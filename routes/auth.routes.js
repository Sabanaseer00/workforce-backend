import express from "express";
import { login, seedAdmin } from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/login", login);
router.get("/seed-admin", seedAdmin); // 🔥 temporary seed route

export default router;