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
    const empId     = req.user._id;
    const empIdStr  = empId.toString();
    const now       = new Date();
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

    // ── Activity stats ──
    const totalMins = todayActivity.reduce((s, a) => s + (a.duration || 1), 0);
    const avgPct    = todayActivity.length
      ? Math.round(todayActivity.reduce((s, a) => s + (a.pct || 0), 0) / todayActivity.length)
      : 0;

    // ── Screenshot stats ──
    const blockedShots = todayShots.filter(s => s.isBlocked).length;

    // ── Task stats ──
    const pendingTasks   = tasks.filter(t => t.status === "pending" || t.status === "in_progress").length;
    const completedTasks = tasks.filter(t => t.status === "completed").length;

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
        status:             emp.status    || "Offline",
        currentApp:         emp.currentApp || "",
        activeTime:         emp.activeTime || "0h 0m",
      },

      // Dashboard cards ke liye recent data
      recentActivity:    todayActivity.slice(0, 5),
      recentScreenshots: todayShots.slice(0, 4),
      recentTasks:       tasks.slice(0, 5),
    });
  } catch (err) {
    console.error("getMyDashboard error:", err.message);
    res.status(500).json({ message: err.message });
  }
};