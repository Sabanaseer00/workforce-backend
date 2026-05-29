// ══════════════════════════════════════════════════════
//  Apne Employee.js model mein yeh fields ADD karo
//  (existing fields ke saath merge karo, replace mat karo)
// ══════════════════════════════════════════════════════

// Yeh fields teri Employee schema mein MISSING hain.
// Inhe apni existing schema mein add karo:

/*
  status: {
    type: String,
    enum: ["Online", "Active", "Working", "Idle", "Meeting", "Break", "Remote", "Offline"],
    default: "Offline",
  },
  lastSeen: {
    type: Date,
    default: null,
  },
  currentApp: {
    type: String,
    default: "",
  },
  currentActivity: {
    type: String,
    default: "",
  },
  activityPct: {
    type: Number,
    default: 0,
  },
  activeTime: {
    type: String,
    default: "0h 0m",
  },
  apps: {
    type: [String],
    default: [],
  },
  isRemote: {
    type: Boolean,
    default: false,
  },
  vpnConnected: {
    type: Boolean,
    default: false,
  },
  screenshots: {
    type: Array,
    default: [],
  },
*/

// ══════════════════════════════════════════════════════
//  Activity Model — agar nahi hai to yeh banao:
//  models/Activity.js
// ══════════════════════════════════════════════════════

import mongoose from "mongoose";

const ActivitySchema = new mongoose.Schema(
  {
    employeeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Employee",
      required: true,
      index: true,
    },
    app: {
      type: String,
      default: "Unknown",
    },
    time: {
      type: String, // "09:30 AM"
      default: "",
    },
    duration: {
      type: Number, // minutes
      default: 1,
    },
    pct: {
      type: Number, // activity percentage
      default: 0,
    },
    activity: {
      type: String, // window title / description
      default: "",
    },
  },
  { timestamps: true }
);

// Index for fast queries
ActivitySchema.index({ employeeId: 1, createdAt: -1 });

export default mongoose.models.Activity || mongoose.model("Activity", ActivitySchema);