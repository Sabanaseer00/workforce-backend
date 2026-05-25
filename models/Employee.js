import mongoose from "mongoose";

const employeeSchema = new mongoose.Schema(
  {
    // ── Basic Info ─────────────────────────────────────
    empId:       String,
    firstName:   String,
    lastName:    String,
    email:       { type: String, unique: true },
    password:    String,
    phone:       String,
    city:        String,
    address:     String,
    country:     String,
    department:  String,
    role:        String,
    salary:      Number,
    currency:    String,
    joinDate:    String,
    description: String,

    // ── 🔥 Live Tracking Fields (yeh missing the) ──────
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
      min: 0,
      max: 100,
    },
    activeTime: {
      type: String,
      default: "0h 0m",
    },
    // Apps jo employee ne aaj use ki hain
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
    // Hourly activity bars (24 values, 0-100)
    hourlyBars: {
      type: [Number],
      default: Array(24).fill(0),
    },
    // Aaj kitne minutes active raha
    activeMinsToday: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Employee", employeeSchema);