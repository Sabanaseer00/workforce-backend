// ═══════════════════════════════════════════════════════
//  controllers/empDashboard.controller.js
//  Employee dashboard — sab kuch ek API call mein
// ═══════════════════════════════════════════════════════
import Employee   from "../models/Employee.js";
import Activity   from "../models/Activity.js";
import Screenshot from "../models/Screenshot.js";
import Task       from "../models/Task.js";

// ════════════════════════════════════════════════════════
//  GET /api/emp/dashboard
// ════════════════════════════════════════════════════════
export const getMyDashboard = async (req, res) => {
  try {
    const empId      = req.user._id;
    const empIdStr   = empId.toString();
    const now        = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    // ── Sab kuch parallel fetch karo ──
    const [emp, todayActivity, todayShots, tasks] = await Promise.all([

      // Profile
      Employee.findById(empId).select("-password"),

      // Aaj ki activities
      Activity.find({
        employeeId: empId,
        createdAt:  { $gte: todayStart },
      }).sort({ createdAt: -1 }).limit(50),

      // Aaj ke screenshots (sirf metadata, image nahi)
      Screenshot.find({
        $or: [
          { employeeId: empIdStr },
          { empId:      empIdStr },
          { userId:     empId   },
        ],
        createdAt: { $gte: todayStart },
      }).sort({ createdAt: -1 }).limit(20).select("-imageUrl"),

      // Tasks
      Task.find({ assigned_to: empId }).sort({ createdAt: -1 }).limit(10),
    ]);

    if (!emp) return res.status(404).json({ message: "Employee not found" });

    // ── DEBUG: pehli activity log karo taake field names confirm ho sakein ──
    if (todayActivity.length > 0) {
      console.log("[Dashboard] Sample activity fields:", {
        duration:          todayActivity[0].duration,
        pct:               todayActivity[0].pct,
        productivity:      todayActivity[0].productivity,
        productivityScore: todayActivity[0].productivityScore,
        appName:           todayActivity[0].appName,
        app:               todayActivity[0].app,
        title:             todayActivity[0].title,
      });
    }

    // ── totalMins: duration seconds mein stored hai → minutes mein convert ──
    // NOTE: agar tumhara Activity model duration pehle se minutes mein save karta hai
    //       tab neeche se "/ 60" hata do aur sirf Math.round(totalRaw) use karo
    const totalRaw  = todayActivity.reduce((s, a) => s + (a.duration || 0), 0);
    const totalMins = Math.round(totalRaw / 60); // seconds → minutes

    // ── avgPct: teen possible field names handle karo ──
    const activitiesWithPct = todayActivity.filter(
      a => (a.productivity ?? a.pct ?? a.productivityScore) != null
    );
    const avgPct = activitiesWithPct.length
      ? Math.round(
          activitiesWithPct.reduce(
            (s, a) => s + (a.productivity ?? a.pct ?? a.productivityScore ?? 0),
            0
          ) / activitiesWithPct.length
        )
      : 0;

    // ── Screenshot stats ──
    const blockedShots = todayShots.filter(s => s.isBlocked).length;

    // ── Task stats ──
    const pendingTasks   = tasks.filter(t => ["pending", "in_progress"].includes(t.status)).length;
    const completedTasks = tasks.filter(t => t.status === "completed").length;

    // ── recentActivity normalize: frontend ko clean shape do ──
    const recentActivity = todayActivity.slice(0, 5).map(a => ({
      app:      a.appName || a.app || a.title || "Unknown",
      time:     a.createdAt
                  ? new Date(a.createdAt).toLocaleTimeString("en-US", {
                      hour:   "2-digit",
                      minute: "2-digit",
                    })
                  : "—",
      // duration seconds → minutes (minimum 1m show karo)
      duration: Math.max(1, Math.round((a.duration || 0) / 60)),
      pct:      a.productivity ?? a.pct ?? a.productivityScore ?? 0,
    }));

    res.json({
      // Profile info
      profile: emp,

      // Aaj ki summary
      stats: {
        totalMins,
        avgPct,
        todayScreenshots:   todayShots.length,
        blockedScreenshots: blockedShots,
        pendingTasks,
        completedTasks,
        totalTasks:         tasks.length,
        status:             emp.status     || "Offline",
        currentApp:         emp.currentApp || "",
        activeTime:         emp.activeTime || "0h 0m",
      },

      // Dashboard cards ke liye recent data
      recentActivity,
      recentScreenshots: todayShots.slice(0, 4),
      recentTasks:       tasks.slice(0, 5),
    });

  } catch (err) {
    console.error("getMyDashboard error:", err.message);
    res.status(500).json({ message: err.message });
  }
};