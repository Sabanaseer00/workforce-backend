// ═══════════════════════════════════════════════════════
//  controllers/empScreenshot.controller.js
//  Employee apne screenshots dekhta hai — sirf apne
// ═══════════════════════════════════════════════════════
import Screenshot from "../models/Screenshot.js";

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
//  GET /api/emp/screenshots
//  Employee apne screenshots dekhta hai
//  Wohi screenshots jo admin AllScreenshots mein dekhta hai
// ════════════════════════════════════════════════════════
export const getMyScreenshots = async (req, res) => {
  try {
    const { range = "today", limit = 100 } = req.query;
    const empId = req.user._id.toString();

    // Screenshot model mein employeeId alag alag fields mein stored hoti hai
    const filter = {
      $or: [
        { employeeId: empId },
        { empId:      empId },
        { userId:     req.user._id },
      ],
    };

    const df = getDateFilter(range);
    if (df) filter.createdAt = df;

    const screenshots = await Screenshot.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // ── Stats ──
    const total   = screenshots.length;
    const blocked = screenshots.filter(s => s.isBlocked).length;
    const clean   = total - blocked;
    const avgProd = total
      ? Math.round(screenshots.reduce((s, sc) => s + (sc.productivity || 0), 0) / total)
      : 0;

    res.json({
      screenshots,
      stats: { total, blocked, clean, avgProd },
    });
  } catch (err) {
    console.error("getMyScreenshots error:", err.message);
    res.status(500).json({ message: err.message });
  }
};