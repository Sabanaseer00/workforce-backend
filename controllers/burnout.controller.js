import Activity from "../models/Activity.js";
import Employee from "../models/Employee.js";
import Alert    from "../models/Alert.js";

/* ══════════════════════════════════════════════════════
   🔥 BURNOUT RISK DETECTION ENGINE
   Longitudinal productivity trend analysis
══════════════════════════════════════════════════════ */

function getBurnoutRisk(hoursPerDay, productivityTrend, breaksTaken, afterHoursCount) {
  let riskScore = 0;

  // Factor 1: Long hours (10+ hrs/day)
  if (hoursPerDay >= 10) riskScore += 35;
  else if (hoursPerDay >= 8) riskScore += 15;

  // Factor 2: Declining productivity trend
  if (productivityTrend < -20) riskScore += 30; // dropped 20%+ over the week
  else if (productivityTrend < -10) riskScore += 15;

  // Factor 3: No breaks
  if (breaksTaken === 0) riskScore += 20;
  else if (breaksTaken < 2) riskScore += 10;

  // Factor 4: After-hours activity
  if (afterHoursCount >= 5) riskScore += 15; // 5+ after-hours sessions this week

  if (riskScore >= 70) return { level: "HIGH",   label: "🔴 Burnout Risk: HIGH",   color: "red" };
  if (riskScore >= 40) return { level: "MEDIUM", label: "🟡 Burnout Risk: MEDIUM", color: "yellow" };
  return                      { level: "LOW",    label: "🟢 Burnout Risk: LOW",    color: "green" };
}

export const getBurnoutAnalysis = async (req, res) => {
  try {
    const employees = await Employee.find().lean();
    const results   = [];

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    for (const emp of employees) {
      const empId = emp._id;

      // ── Fetch last 7 days of activity ──
      const weekLogs = await Activity.find({
        employeeId: empId,
        createdAt: { $gte: sevenDaysAgo },
      }).lean();

      if (weekLogs.length < 5) continue; // not enough data

      // ── Group by day ──
      const byDay = {};
      weekLogs.forEach(log => {
        const day = new Date(log.createdAt).toDateString();
        if (!byDay[day]) byDay[day] = { totalUnits: 0, productivities: [] };
        byDay[day].totalUnits      += (log.duration || 1);
        byDay[day].productivities.push(log.pct || 50);
      });

      const days = Object.values(byDay);
      if (days.length < 3) continue; // need at least 3 days

      // ── Avg hours per day ──
      const avgMinsPerDay = days.reduce((sum, d) => sum + (d.totalUnits / 6), 0) / days.length;
      const hoursPerDay   = avgMinsPerDay / 60;

      // ── Productivity Trend (first half vs second half of week) ──
      const firstHalf  = days.slice(0, Math.ceil(days.length / 2));
      const secondHalf = days.slice(Math.ceil(days.length / 2));
      const firstAvg   = firstHalf.flatMap(d => d.productivities).reduce((a, b) => a + b, 0)
                         / (firstHalf.flatMap(d => d.productivities).length || 1);
      const secondAvg  = secondHalf.flatMap(d => d.productivities).reduce((a, b) => a + b, 0)
                         / (secondHalf.flatMap(d => d.productivities).length || 1);
      const trend       = secondAvg - firstAvg; // negative = dropping

      // ── After-hours activity ──
      const afterHoursCount = weekLogs.filter(log => {
        const h = new Date(log.createdAt).getHours();
        return h >= 20 || h <= 6;
      }).length;

      // ── Breaks (simplified: "Break" status entries) ──
      const breaksTaken = weekLogs.filter(l => (l.activity || "").toLowerCase().includes("break")).length;

      // ── Calculate Risk ──
      const risk = getBurnoutRisk(hoursPerDay, trend, breaksTaken, afterHoursCount);

      // ── Auto-create alert if HIGH risk ──
      if (risk.level === "HIGH") {
        const date = new Date().toLocaleDateString();
        const existing = await Alert.findOne({
          employeeId: String(empId),
          type: "productivity_drop",
          date,
        });
        if (!existing) {
          await Alert.create({
            employeeId:   String(empId),
            employeeName: `${emp.firstName} ${emp.lastName}`,
            department:   emp.department,
            type:         "low_productivity",
            severity:     "high",
            productivity: Math.round(secondAvg),
            time:         new Date().toLocaleTimeString(),
            date,
            resolved:     false,
          });
        }
      }

      results.push({
        employeeId:     empId,
        name:           `${emp.firstName} ${emp.lastName}`,
        department:     emp.department,
        hoursPerDay:    Math.round(hoursPerDay * 10) / 10,
        productivityStart: Math.round(firstAvg),
        productivityEnd:   Math.round(secondAvg),
        trend:          Math.round(trend),
        afterHoursCount,
        burnoutRisk:    risk.level,
        burnoutLabel:   risk.label,
        burnoutColor:   risk.color,
        recommendation: risk.level === "HIGH"
          ? "Consider workload redistribution and mandatory rest days."
          : risk.level === "MEDIUM"
          ? "Monitor closely. Encourage breaks and flexible hours."
          : "Employee performing well. Maintain current balance.",
      });
    }

    // Sort by risk level
    const order = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    results.sort((a, b) => order[a.burnoutRisk] - order[b.burnoutRisk]);

    res.json({ success: true, data: results, analyzedAt: new Date() });
  } catch (err) {
    console.error("Burnout analysis error:", err.message);
    res.status(500).json({ message: "Burnout analysis failed" });
  }
};