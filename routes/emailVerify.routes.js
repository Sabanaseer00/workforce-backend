import express from "express";
import { verifyEmailExists } from "../utils/smtpCheck.js";

const router = express.Router();

// ─────────────────────────────────────────────
// RATE LIMIT
// ─────────────────────────────────────────────
const rateMap = new Map();

const RATE_LIMIT = 10;
const RATE_WINDOW = 60_000;

function rateLimit(req, res, next) {

  try {

    const ip =
      req.ip ||
      req.connection.remoteAddress ||
      "unknown";

    const now = Date.now();

    const entry =
      rateMap.get(ip) || {
        count: 0,
        start: now,
      };

    // Reset
    if (now - entry.start > RATE_WINDOW) {

      rateMap.set(ip, {
        count: 1,
        start: now,
      });

      return next();
    }

    // Limit exceeded
    if (entry.count >= RATE_LIMIT) {

      return res.status(429).json({
        valid: false,
        reason:
          "Too many requests. Please wait.",
      });
    }

    entry.count++;

    rateMap.set(ip, entry);

    next();

  } catch (err) {

    console.error(
      "❌ Rate Limit Error:",
      err.message
    );

    next();
  }
}

// ─────────────────────────────────────────────
// POST /api/verify-email
// ─────────────────────────────────────────────
router.post(
  "/",
  rateLimit,
  async (req, res) => {

    try {

      const { email } = req.body;

      if (
        !email ||
        typeof email !== "string"
      ) {

        return res.status(400).json({
          valid: false,
          reason: "Email is required",
        });
      }

      const cleanEmail =
        email.trim().toLowerCase();

      console.log(
        "📧 Verifying Email:",
        cleanEmail
      );

      const result =
        await verifyEmailExists(cleanEmail);

      console.log(
        "✅ Verification Result:",
        result
      );

      return res.status(200).json(result);

    } catch (err) {

      console.error(
        "❌ Verify Route Error:",
        err.message
      );

      return res.status(500).json({
        valid: false,
        reason: "Email verification failed",
      });
    }
  }
);

export default router;