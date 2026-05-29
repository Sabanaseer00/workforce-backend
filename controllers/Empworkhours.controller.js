// ═══════════════════════════════════════════════════════
//  controllers/empWorkHours.controller.js
//  Employee apne work hours dekhta hai
// ═══════════════════════════════════════════════════════
import Activity from "../models/Activity.js";

function getDateFilter(range) {
  const now   = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === "today")     return { $gte: today };
  if (range === "yesterday") { const y = new Date(today); y.setDate(today.getDate() - 1); return { $gte: y, $lt: today }; }
  if (range === "week")      { const w = new Date(today); w.setDate(today.getDate() - 7);  return { $gte: w }; }
  if (range === "month")     { const m = new Date(today); m.setDate(today.getDate() - 30); return { $gte: m }; }
  return null;
}

// ════════════════════════════════════════════════════════
//  GET /api/emp/workhours
//  Activity data se work hours calculate karta hai
// ════════════════════════════════════════════════════════
export const getMyWorkHours = async (req, res) => {
  try {
    const { range = "today" } = req.query;

    const filter = { employeeId: req.user._id };
    const df = getDateFilter(range);
    if (df) filter.createdAt = df;

    const activities = await Activity.find(filter).sort({ createdAt: 1 });

    // ── Hourly breakdown — 24 hours ──
    const hourly = Array(24).fill(0);
    activities.forEach(a => {
      const t     = a.time || "";
      const match = t.match(/(\d+):(\d+)\s*(AM|PM)?/i);
      if (!match) return;
      let h = parseInt(match[1]);
      const mer = (match[3] || "").toUpperCase();
      if (mer === "PM" && h !== 12) h += 12;
      if (mer === "AM" && h === 12) h = 0;
      if (h >= 0 && h < 24) hourly[h] += a.duration || 1;
    });

    // ── Daily breakdown — last 7 days ──
    const dailyMap = {};
    activities.forEach(a => {
      const d = new Date(a.createdAt);
      if (isNaN(d)) return;
      const key = d.toISOString().split("T")[0];
      if (!dailyMap[key]) dailyMap[key] = { date: key, mins: 0, pctSum: 0, count: 0 };
      dailyMap[key].mins   += a.duration || 1;
      dailyMap[key].pctSum += a.pct || 0;
      dailyMap[key].count++;
    });

    const daily = Object.values(dailyMap)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(d => ({
        date:   d.date,
        mins:   d.mins,
        avgPct: d.count ? Math.round(d.pctSum / d.count) : 0,
      }));

    // ── Summary stats ──
    const totalMins = activities.reduce((s, a) => s + (a.duration || 1), 0);
    const avgPct    = activities.length
      ? Math.round(activities.reduce((s, a) => s + (a.pct || 0), 0) / activities.length)
      : 0;
    const workMins  = hourly.slice(9, 18).reduce((s, m) => s + m, 0); // 9AM–6PM
    const afterMins = totalMins - workMins;

    res.json({
      hourly,  // Array[24] — mins per hour
      daily,   // Array — daily summaries
      stats: { totalMins, workMins, afterMins, avgPct },
    });
  } catch (err) {
    console.error("getMyWorkHours error:", err.message);
    res.status(500).json({ message: err.message });
  }
};