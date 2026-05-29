import mongoose from "mongoose";

const alertSchema = new mongoose.Schema(
  {
    employeeId:   { type: String },
    employeeName: { type: String, default: "Unknown" },
    department:   { type: String, default: "General" },

    type: {
      type: String,
      enum: ["blocked_app", "low_productivity", "idle", "after_hours",
         // ── NEW: Anomaly Types ──
    "productivity_drop",   // e.g. 80% se 20% ek ghante mein
    "unusual_login_time",  // raat 11pm ke baad login
    "pattern_change",      // developer achanak Excel use karne laga
    "screenshot_gap",      // 30+ min koi screenshot nahi
      ],
      default: "blocked_app",
    },

    app:         { type: String },
    windowTitle: { type: String },
    blockedApp:  { type: String },

    severity: {
      type: String,
      enum: ["high", "medium", "low"],
      default: "high",
    },

    productivity: { type: Number, default: 0 },

    screenshotId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Screenshot",
    },

    time: { type: String },
    date: { type: String },

    resolved:   { type: Boolean, default: false },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

const Alert = mongoose.models.Alert || mongoose.model("Alert", alertSchema);
export default Alert;