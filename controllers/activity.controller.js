import Employee from "../models/Employee.js";
import Activity from "../models/Activity.js";
import { getIO } from "../config/socket.js";

/* ─────────────────────────────────────────────────────
   🔥 HEARTBEAT
   POST /api/employees/heartbeat
───────────────────────────────────────────────────── */
export const heartbeat = async (req, res) => {
  try {
    const {
      employeeId,
      activeApp = "",
      windowTitle = "",
      mouseEvents = 0,
      keyEvents = 0,
      isRemote = false,
      vpnConnected = false,
      manualBreak = false,
    } = req.body;

    if (!employeeId) return res.status(400).json({ message: "employeeId required" });

    const PRODUCTIVE_APPS = [
      "VS Code","Figma","Photoshop","Illustrator","Postman","Terminal",
      "GitHub","Jira","Excel","Word","PowerPoint","Notion","Slack",
      "IntelliJ","PyCharm","WebStorm","Android Studio","Xcode","MySQL Workbench"
    ];
    const MEETING_APPS = ["Zoom","Teams","Google Meet","Skype","Webex"];

    let status = "Online";
    if (manualBreak) status = "Break";
    else if (isRemote || vpnConnected) status = "Remote";
    else if (MEETING_APPS.includes(activeApp)) status = "Meeting";
    else if ((mouseEvents + keyEvents) > 0 && PRODUCTIVE_APPS.includes(activeApp)) status = "Working";
    else if ((mouseEvents + keyEvents) > 0 && activeApp) status = "Active";

    const now = new Date();

    // ── Today ki midnight ──
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    // ── Aaj ke total active minutes Activity logs se calculate karo ──
    const todayLogs = await Activity.find({
      employeeId,
      createdAt: { $gte: todayStart },
    }).lean();

    // Har heartbeat ~10s ka hai, duration = heartbeat count
    // 1 duration unit = 1 heartbeat = ~10 seconds = 1/6 minute
    const totalDurationUnits = todayLogs.reduce((sum, l) => sum + (l.duration || 1), 0);
    // Current heartbeat bhi add karo (+1)
    const activeMinsToday = Math.round((totalDurationUnits + 1) / 6);

    // ── activeTime string format karo ──
    const h = Math.floor(activeMinsToday / 60);
    const m = activeMinsToday % 60;
    const activeTimeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;

    // ── Employee update karo ──
    const emp = await Employee.findByIdAndUpdate(
      employeeId,
      {
        status,
        lastSeen: now,
        currentApp: activeApp,
        currentActivity: windowTitle,
        isRemote,
        vpnConnected,
        activityPct: Math.min(100, Math.round(((mouseEvents + keyEvents) / 20) * 100)),
        // FIXED: activeTime aur activeMinsToday dono save karo
        activeTime: activeTimeStr,
        activeMinsToday,
        $addToSet: activeApp ? { apps: activeApp } : {},
      },
      { new: true }
    ).lean();

    if (!emp) return res.status(404).json({ message: "Employee not found" });

    // ── Activity log save karo ──
    if (activeApp) {
      const lastLog = await Activity.findOne({ employeeId })
        .sort({ createdAt: -1 })
        .lean();

      const tenMinsAgo = new Date(now - 10 * 60 * 1000);

      if (lastLog && lastLog.app === activeApp && new Date(lastLog.createdAt) > tenMinsAgo) {
        await Activity.findByIdAndUpdate(lastLog._id, {
          $inc: { duration: 1 },
          pct: Math.min(100, (lastLog.pct || 0) + 5),
          time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        });
      } else {
        await Activity.create({
          employeeId,
          app: activeApp,
          time: now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
          duration: 1,
          pct: (mouseEvents + keyEvents) > 0 ? 75 : 30,
          activity: windowTitle || activeApp,
        });
      }
    }

    // ── Socket broadcast — activeMinsToday bhi bhejo ──
    const io = getIO();
    if (io) {
      io.to("admins").emit("employee:update", {
        employeeId,
        status,
        currentApp: activeApp,
        currentActivity: windowTitle,
        activityPct: emp.activityPct,
        lastSeen: now,
        // FIXED: yeh dono fields ab socket mein bhi jayengi
        activeMinsToday,
        activeTime: activeTimeStr,
      });

      io.to(employeeId.toString()).emit("status:update", { status });
    }

    res.json({ success: true, status, activeMinsToday, activeTime: activeTimeStr });
  } catch (err) {
    console.error("HEARTBEAT ERROR:", err.message);
    res.status(500).json({ message: "Heartbeat failed" });
  }
};

/* ─────────────────────────────────────────────────────
   🔴 GO OFFLINE
   POST /api/employees/go-offline
───────────────────────────────────────────────────── */
export const goOffline = async (req, res) => {
  try {
    const { employeeId } = req.body;
    if (!employeeId) return res.status(400).json({ message: "employeeId required" });

    await Employee.findByIdAndUpdate(employeeId, {
      status: "Offline",
      lastSeen: new Date(),
      currentApp: "",
      currentActivity: "",
    });

    const io = getIO();
    if (io) {
      io.to("admins").emit("employee:update", {
        employeeId,
        status: "Offline",
        currentApp: "",
        currentActivity: "",
        lastSeen: new Date(),
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ─────────────────────────────────────────────────────
   📊 ALL EMPLOYEES ACTIVITY
   GET /api/employees/activity
───────────────────────────────────────────────────── */
export const getAllEmployeesActivity = async (req, res) => {
  try {
    const employees = await Employee.find().lean();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    // ── Aaj ke sabhi Activity logs ek baar fetch karo (efficient) ──
    const allTodayLogs = await Activity.find({
      createdAt: { $gte: todayStart },
    }).lean();

    // Employee ID se group karo
    const logsByEmp = {};
    allTodayLogs.forEach(l => {
      const eid = l.employeeId?.toString();
      if (!eid) return;
      if (!logsByEmp[eid]) logsByEmp[eid] = [];
      logsByEmp[eid].push(l);
    });

    const result = employees.map(emp => {
      const eid = emp._id?.toString();

      // ── Offline check ──
      let status = emp.status || "Offline";
      if (emp.lastSeen) {
        const secsSince = (Date.now() - new Date(emp.lastSeen).getTime()) / 1000;
        if (secsSince > 60 && status !== "Offline") status = "Offline";
      } else {
        status = "Offline";
      }

      // ── Active time calculate karo ──
      // Priority 1: Employee model mein stored activeMinsToday (heartbeat ne save kiya)
      let activeMinsToday = emp.activeMinsToday || 0;

      // Priority 2: Agar model mein nahi hai ya 0 hai — Activity logs se calculate karo
      if (!activeMinsToday && logsByEmp[eid]) {
        const totalUnits = logsByEmp[eid].reduce((sum, l) => sum + (l.duration || 1), 0);
        activeMinsToday = Math.round(totalUnits / 6); // 6 heartbeats = 1 minute
      }

      // Priority 3: activeTime string already stored hai aur valid hai
      let activeTimeStr = "";
      if (activeMinsToday > 0) {
        const h = Math.floor(activeMinsToday / 60);
        const m = activeMinsToday % 60;
        activeTimeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
      } else if (emp.activeTime && emp.activeTime !== "0h 0m" && emp.activeTime !== "0m") {
        activeTimeStr = emp.activeTime;
      }

      return {
        _id: emp._id,
        firstName: emp.firstName,
        lastName: emp.lastName,
        role: emp.role,
        department: emp.department,
        email: emp.email,
        status,
        statusSince: emp.lastSeen
          ? new Date(emp.lastSeen).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })
          : "—",
        activityPct: emp.activityPct || 0,
        // FIXED: calculated values return karo
        activeMinsToday,
        activeTime: activeTimeStr || null,
        currentApp: emp.currentApp || "",
        currentActivity: emp.currentActivity || "",
        apps: emp.apps || [],
        lastSeen: emp.lastSeen || null,
      };
    });

    res.json(result);
  } catch (err) {
    console.error("ALL ACTIVITY ERROR:", err.message);
    res.status(500).json({ message: "Failed to fetch employees activity" });
  }
};

/* ─────────────────────────────────────────────────────
   👤 SINGLE EMPLOYEE ACTIVITY
   GET /api/employees/:id/activity
───────────────────────────────────────────────────── */
export const getEmployeeActivity = async (req, res) => {
  try {
    const { id } = req.params;
    const { period = "daily" } = req.query;

    const emp = await Employee.findById(id).lean();
    if (!emp) return res.status(404).json({ message: "Employee not found" });

    // ── Date range period ke hisab se ──
    const now = new Date();
    let fromDate = new Date(now);
    fromDate.setHours(0, 0, 0, 0); // default: aaj

    if (period === "weekly") {
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 7);
    } else if (period === "monthly") {
      fromDate = new Date(now);
      fromDate.setDate(fromDate.getDate() - 30);
    }

    const logs = await Activity.find({
      employeeId: id,
      createdAt: { $gte: fromDate },
    })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    // ── Today logs alag se active time ke liye ──
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todayLogs = logs.filter(l => new Date(l.createdAt) >= todayStart);

    // ── activeMinsToday calculate ──
    let activeMinsToday = emp.activeMinsToday || 0;
    if (!activeMinsToday && todayLogs.length > 0) {
      const totalUnits = todayLogs.reduce((sum, l) => sum + (l.duration || 1), 0);
      activeMinsToday = Math.round(totalUnits / 6);
    }

    let activeTimeStr = "";
    if (activeMinsToday > 0) {
      const h = Math.floor(activeMinsToday / 60);
      const m = activeMinsToday % 60;
      activeTimeStr = h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
    } else if (emp.activeTime && emp.activeTime !== "0h 0m") {
      activeTimeStr = emp.activeTime;
    }

    // ── Top apps ──
    const appUsage = {};
    logs.forEach(l => {
      if (!l.app || l.app === "Unknown") return;
      if (!appUsage[l.app]) appUsage[l.app] = { duration: 0 };
      appUsage[l.app].duration += l.duration || 1;
    });

    const totalDuration = Object.values(appUsage).reduce((a, b) => a + b.duration, 0) || 1;

    const topApps = Object.entries(appUsage)
      .sort((a, b) => b[1].duration - a[1].duration)
      .slice(0, 6)
      .map(([name, data]) => {
        const mins = Math.round(data.duration / 6);
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return {
          name,
          pct: Math.round((data.duration / totalDuration) * 100),
          time: mins > 0 ? (h > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : `${m}m`) : "< 1m",
        };
      });

    const finalTopApps = topApps.length > 0
      ? topApps
      : (emp.apps || []).slice(0, 6).map((a, i) => ({
          name: a,
          pct: Math.max(5, Math.round(100 / (i + 2))),
          time: "—",
        }));

    // ── Hourly bars ──
    const hourlyBars = Array(24).fill(0);
    todayLogs.forEach(l => {
      const logTime = new Date(l.createdAt);
      const hoursAgo = Math.floor((now - logTime) / (1000 * 60 * 60));
      if (hoursAgo >= 0 && hoursAgo < 24) {
        hourlyBars[23 - hoursAgo] = Math.min(100, (hourlyBars[23 - hoursAgo] || 0) + (l.pct || 50));
      }
    });

    // ── Status check ──
    let status = emp.status || "Offline";
    if (emp.lastSeen) {
      const secsSince = (Date.now() - new Date(emp.lastSeen).getTime()) / 1000;
      if (secsSince > 60 && status !== "Offline") status = "Offline";
    } else {
      status = "Offline";
    }

    // ── Timeline ──
    const timeline = logs.map(l => {
      const logDate = new Date(l.createdAt);
      const dayNames = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
      return {
        time: l.time || logDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }),
        day: dayNames[logDate.getDay()],
        week: `W${Math.ceil(logDate.getDate() / 7)}`,
        app: l.app || "Unknown",
        duration: l.duration || 1,
        pct: l.pct || 0,
        activity: l.activity || "",
      };
    });

    res.json({
      _id: emp._id,
      firstName: emp.firstName,
      lastName: emp.lastName,
      role: emp.role,
      department: emp.department,
      status,
      activityPct: emp.activityPct || 0,
      activeMinsToday,
      activeTime: activeTimeStr || null,
      currentApp: emp.currentApp || "",
      currentActivity: emp.currentActivity || "",
      timeline,
      topApps: finalTopApps,
      hourlyBars: hourlyBars.map((v, i) => ({
        value: Math.min(100, v),
        label: `${i}:00`,
      })),
    });
  } catch (err) {
    console.error("EMP ACTIVITY ERROR:", err.message);
    res.status(500).json({ message: "Failed to fetch employee activity" });
  }
};