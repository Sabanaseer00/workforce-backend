import Alert from "../models/Alert.js";
import Screenshot from "../models/Screenshot.js";

const BLOCKED_APPS = [
  "youtube","facebook","tiktok","instagram",
  "twitter","netflix","whatsapp","snapchat",
];

function isBlockedApp(app, windowTitle) {
  const combined = ((app || "") + " " + (windowTitle || "")).toLowerCase();
  return BLOCKED_APPS.some((b) => combined.includes(b));
}

function getBlockedAppName(app, windowTitle, blockedApp) {
  if (blockedApp) return blockedApp;
  const combined = ((app || "") + " " + (windowTitle || "")).toLowerCase();
  for (const b of BLOCKED_APPS) {
    if (combined.includes(b)) return b.charAt(0).toUpperCase() + b.slice(1);
  }
  return app || "Unknown";
}

// ✅ GET ALL ALERTS
export const getAlerts = async (req, res) => {
  try {
    const { resolved, type, severity, limit = 100 } = req.query;
    const filter = {};
    if (resolved !== undefined) filter.resolved = resolved === "true";
    if (type)     filter.type = type;
    if (severity) filter.severity = severity;

    const alerts = await Alert.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json(alerts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ GET ALERT STATS
export const getAlertStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, todayAlerts, unresolved, byType] = await Promise.all([
      Alert.countDocuments(),
      Alert.countDocuments({ createdAt: { $gte: today } }),
      Alert.countDocuments({ resolved: false }),
      Alert.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 } } }
      ]),
    ]);

    const flaggedEmployees = await Alert.distinct("employeeId", {
      resolved: false,
      createdAt: { $gte: today },
    });

    res.json({
      total,
      todayAlerts,
      unresolved,
      flaggedEmployees: flaggedEmployees.length,
      byType,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ RESOLVE ONE ALERT
export const resolveAlert = async (req, res) => {
  try {
    const alert = await Alert.findByIdAndUpdate(
      req.params.id,
      { resolved: true, resolvedAt: new Date() },
      { new: true }
    );
    if (!alert) return res.status(404).json({ message: "Alert not found" });
    res.json(alert);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ RESOLVE ALL ALERTS
export const resolveAllAlerts = async (req, res) => {
  try {
    const result = await Alert.updateMany(
      { resolved: false },
      { resolved: true, resolvedAt: new Date() }
    );
    res.json({ success: true, resolved: result.modifiedCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ DELETE ONE ALERT
export const deleteAlert = async (req, res) => {
  try {
    await Alert.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ AUTO CREATE ALERT from screenshot (called internally)
export const createAlertFromScreenshot = async (shotData) => {
  try {
    const {
      employeeId, empId, employeeName, department,
      app, windowTitle, blockedApp, isBlocked,
      productivity, screenshotId, time, date,
    } = shotData;

    if (isBlocked || isBlockedApp(app, windowTitle)) {
      await Alert.create({
        employeeId: employeeId || empId,
        employeeName,
        department,
        type: "blocked_app",
        app,
        windowTitle,
        blockedApp: getBlockedAppName(app, windowTitle, blockedApp),
        severity: "high",
        productivity,
        screenshotId,
        time,
        date,
        resolved: false,
      });
    }

    if (productivity < 30) {
      await Alert.create({
        employeeId: employeeId || empId,
        employeeName,
        department,
        type: "low_productivity",
        app,
        severity: "medium",
        productivity,
        screenshotId,
        time,
        date,
        resolved: false,
      });
    }

    await detectAnomalies(shotData);
  } catch (err) {
    console.error("Alert create error:", err.message);
  }
};

// ✅ GET MOST FLAGGED EMPLOYEES
export const getFlaggedEmployees = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await Alert.aggregate([
      { $match: { createdAt: { $gte: today }, resolved: false } },
      {
        $group: {
          _id: "$employeeId",
          employeeName: { $first: "$employeeName" },
          department:   { $first: "$department" },
          count:        { $sum: 1 },
          apps:         { $addToSet: "$blockedApp" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]);

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ══════════════════════════════════════════════════════
//  📊 ANOMALY DETECTION ENGINE
// ══════════════════════════════════════════════════════

const employeeBaselines  = {};
const recentProductivity = {};

export const detectAnomalies = async (shotData) => {
  try {
    const {
      employeeId, employeeName, department,
      app, windowTitle, productivity, time,
    } = shotData;

    const empId = String(employeeId);
    const date  = new Date().toLocaleDateString();
    const hour  = new Date().getHours();

    if (!recentProductivity[empId]) recentProductivity[empId] = [];
    recentProductivity[empId].push(productivity);
    if (recentProductivity[empId].length > 6) recentProductivity[empId].shift();

    if (!employeeBaselines[empId]) {
      employeeBaselines[empId] = {
        avgProductivity: productivity,
        usualApps: [app],
        usualHours: [hour],
        totalReadings: 1,
      };
    } else {
      const b = employeeBaselines[empId];
      b.avgProductivity = Math.round(
        (b.avgProductivity * b.totalReadings + productivity) / (b.totalReadings + 1)
      );
      if (app && !b.usualApps.includes(app)) b.usualApps.push(app);
      if (!b.usualHours.includes(hour)) b.usualHours.push(hour);
      b.totalReadings++;
    }

    // ANOMALY CHECK 1: Sudden Productivity Drop
    if (recentProductivity[empId].length >= 4) {
      const recent     = recentProductivity[empId];
      const latest2avg = (recent[recent.length-1] + recent[recent.length-2]) / 2;
      const older2avg  = (recent[0] + recent[1]) / 2;
      if (older2avg - latest2avg > 40 && older2avg > 60) {
        await Alert.create({
          employeeId: empId, employeeName, department,
          type: "productivity_drop", app, windowTitle,
          severity: "high", productivity, time, date, resolved: false,
        });
        console.log(`🚨 ANOMALY: Productivity drop for ${employeeName}`);
      }
    }

    // ANOMALY CHECK 2: Unusual Login Time
    if (hour >= 23 || hour <= 4) {
      const existingAlert = await Alert.findOne({
        employeeId: empId, type: "unusual_login_time", date, resolved: false,
      });
      if (!existingAlert) {
        await Alert.create({
          employeeId: empId, employeeName, department,
          type: "unusual_login_time", app,
          severity: "medium", productivity, time, date, resolved: false,
        });
        console.log(`🚨 ANOMALY: Unusual work time for ${employeeName} at ${hour}:00`);
      }
    }

  } catch (err) {
    console.error("Anomaly detection error:", err.message);
  }
};

// ── Screenshot Gap Detection ──
export const checkScreenshotGaps = async () => {
  try {
    // ✅ FIXED: Sahi case wala Screenshot.js use karo
    const Screenshot = (await import("../models/Screenshot.js")).default;
    const Employee   = (await import("../models/Employee.js")).default;

    const thirtyMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
    const onlineEmps = await Employee.find({
      status: { $ne: "Offline" },
      lastSeen: { $gte: thirtyMinsAgo },
    }).lean();

    for (const emp of onlineEmps) {
      const lastShot = await Screenshot.findOne({ employeeId: emp._id })
        .sort({ createdAt: -1 }).lean();

      if (!lastShot) continue;
      const gapMins = (Date.now() - new Date(lastShot.createdAt).getTime()) / (1000 * 60);

      if (gapMins > 30) {
        const date     = new Date().toLocaleDateString();
        const existing = await Alert.findOne({
          employeeId: String(emp._id), type: "screenshot_gap", date,
        });
        if (!existing) {
          await Alert.create({
            employeeId:   String(emp._id),
            employeeName: `${emp.firstName} ${emp.lastName}`,
            department:   emp.department,
            type:         "screenshot_gap",
            severity:     "medium",
            productivity: 0,
            time:         new Date().toLocaleTimeString(),
            date,
            resolved:     false,
          });
          console.log(`🚨 Screenshot gap: ${emp.firstName} — ${Math.round(gapMins)} mins`);
        }
      }
    }
  } catch (err) {
    console.error("Screenshot gap check error:", err.message);
  }
};