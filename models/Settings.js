import mongoose from "mongoose";

const settingsSchema = new mongoose.Schema(
  {
    // General
    companyName:  { type: String, default: "WorkTrack Pvt Ltd" },
    adminEmail:   { type: String, default: "" },
    timezone:     { type: String, default: "PKT (UTC+5)" },
    workingDays:  { type: String, default: "Mon - Fri" },
    workStart:    { type: String, default: "09:00" },
    workEnd:      { type: String, default: "18:00" },

    // Monitoring
    screenshotEnabled:  { type: Boolean, default: true },
    screenshotInterval: { type: String,  default: "30" },
    trackActiveApp:     { type: Boolean, default: true },
    idleDetection:      { type: Boolean, default: true },

    // Alerts / Notifications
    blockedAppAlerts:      { type: Boolean, default: true },
    lowProdAlerts:         { type: Boolean, default: true },
    alertEmail:            { type: String,  default: "" },

    // Data & Storage
    autoDelete:       { type: Boolean, default: true },
    deleteAfterDays:  { type: String,  default: "7" },

    // Security
    sessionTimeout:   { type: String,  default: "1" },
    consentNotice:    { type: Boolean, default: true },
  },
  { timestamps: true }
);

const Settings = mongoose.models.Settings || mongoose.model("Settings", settingsSchema);
export default Settings;
