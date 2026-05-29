import express from "express";
import { protect } from "../middleware/auth.middleware.js";
import Employee from "../models/Employee.js";

const router = express.Router();

// All routes protected
router.use(protect);

// GET preferences
router.get("/preferences", async (req, res) => {
  try {
    const emp = await Employee.findById(req.user.id).select("privacyPreferences");
    if (!emp) return res.status(404).json({ message: "Employee not found" });
    res.json(emp.privacyPreferences || {
      blockedApps: [],
      screenshotPaused: false,
      consentGiven: false,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// SAVE preferences
router.post("/preferences", async (req, res) => {
  try {
    const { blockedApps, screenshotPaused, consentGiven } = req.body;
    const emp = await Employee.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          "privacyPreferences.blockedApps": blockedApps ?? [],
          "privacyPreferences.screenshotPaused": screenshotPaused ?? false,
          "privacyPreferences.consentGiven": consentGiven ?? false,
          "privacyPreferences.updatedAt": new Date(),
        },
      },
      { new: true }
    ).select("privacyPreferences");
    res.json(emp.privacyPreferences);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// BLOCK app
router.post("/block", async (req, res) => {
  try {
    const { appName, reason = "" } = req.body;
    if (!appName) return res.status(400).json({ message: "appName required" });

    const emp = await Employee.findById(req.user.id);
    const already = (emp.privacyPreferences?.blockedApps || [])
      .find(a => a.appName.toLowerCase() === appName.toLowerCase());

    if (already)
      return res.json({ message: "Already blocked", preferences: emp.privacyPreferences });

    const updated = await Employee.findByIdAndUpdate(
      req.user.id,
      {
        $push: {
          "privacyPreferences.blockedApps": {
            appName,
            reason,
            blockedAt: new Date(),
          },
        },
        $set: { "privacyPreferences.updatedAt": new Date() },
      },
      { new: true }
    ).select("privacyPreferences");
    res.json(updated.privacyPreferences);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UNBLOCK app
router.post("/unblock", async (req, res) => {
  try {
    const { appName } = req.body;
    if (!appName) return res.status(400).json({ message: "appName required" });

    const updated = await Employee.findByIdAndUpdate(
      req.user.id,
      {
        $pull: {
          "privacyPreferences.blockedApps": {
            appName: { $regex: new RegExp(`^${appName}$`, "i") },
          },
        },
        $set: { "privacyPreferences.updatedAt": new Date() },
      },
      { new: true }
    ).select("privacyPreferences");
    res.json(updated.privacyPreferences);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// PAUSE screenshots
router.post("/pause", async (req, res) => {
  try {
    const { paused } = req.body;
    const updated = await Employee.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          "privacyPreferences.screenshotPaused": !!paused,
          "privacyPreferences.updatedAt": new Date(),
        },
      },
      { new: true }
    ).select("privacyPreferences");
    res.json(updated.privacyPreferences);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CONSENT
router.post("/consent", async (req, res) => {
  try {
    const { consentGiven } = req.body;
    const updated = await Employee.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          "privacyPreferences.consentGiven": !!consentGiven,
          "privacyPreferences.consentAt": new Date(),
          "privacyPreferences.updatedAt": new Date(),
        },
      },
      { new: true }
    ).select("privacyPreferences");
    res.json(updated.privacyPreferences);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// CHECK employee (admin/agent)
router.get("/check/:employeeId", async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.employeeId).select("privacyPreferences");
    if (!emp) return res.status(404).json({ message: "Not found" });
    const prefs = emp.privacyPreferences || {};
    res.json({
      screenshotPaused: prefs.screenshotPaused || false,
      blockedApps: (prefs.blockedApps || []).map(a => a.appName),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;