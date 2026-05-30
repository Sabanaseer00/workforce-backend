// ═══════════════════════════════════════════════════════
//  controllers/empActivity.controller.js
//  Employee apni activities dekhta hai — sirf apni
// ═══════════════════════════════════════════════════════
import Activity from "../models/Activity.js";

// ── Date filter helper ───────────────────────────────────
function getDateFilter(range) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (range === "today")     return { $gte: today };
  if (range === "yesterday") {
    const y = new Date(today); y.setDate(today.getDate() - 1);
    return { $gte: y, $lt: today };
  }
  if (range === "week")  { const w = new Date(today); w.setDate(today.getDate() - 7);  return { $gte: w }; }
  if (range === "month") { const m = new Date(today); m.setDate(today.getDate() - 30); return { $gte: m }; }
  return null;
}

// ════════════════════════════════════════════════════════
//  GET /api/emp/activity
//  Employee apni activity log dekhta hai
// ════════════════════════════════════════════════════════
export const getMyActivity = async (req, res) => {
  try {
    const { range = "today", limit = 200 } = req.query;

    const filter = { employeeId: req.user._id };
    const df = getDateFilter(range);
    if (df) filter.createdAt = df;

    const activities = await Activity.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // ── Stats calculate karo ──
    const totalMins = activities.reduce((s, a) => s + (a.duration || 1), 0);
    const avgPct    = activities.length
      ? Math.round(activities.reduce((s, a) => s + (a.pct || 0), 0) / activities.length)
      : 0;

    // ── Top apps ──
    const appMap = {};
    activities.forEach(a => {
      if (!a.app || a.app === "Unknown") return;
      appMap[a.app] = (appMap[a.app] || 0) + (a.duration || 1);
    });
    const topApps = Object.entries(appMap)
      .sort((x, y) => y[1] - x[1])
      .slice(0, 5)
      .map(([name, mins]) => ({ name, mins }));

    res.json({
      activities,
      stats: {
        totalMins,
        avgPct,
        totalApps: Object.keys(appMap).length,
        topApps,
      },
    });
  } catch (err) {
    console.error("getMyActivity error:", err.message);
    res.status(500).json({ message: err.message });
  }
};