import express from "express";
import Employee from "../models/Employee.js";
import Task from "../models/Task.js";

const router = express.Router();

router.get("/stats", async (req, res) => {
  try {
    const totalEmployees = await Employee.countDocuments();

    // ── Online count: "Offline" nahi woh sab online
    // Case-insensitive: "Online", "online", "Active", "active" sab cover
    const onlineEmployees = await Employee.countDocuments({
      status: { $not: /^offline$/i },
    });

    // Leave employees
    const onLeave = await Employee.countDocuments({
      status: { $regex: /^(leave|on.?leave)$/i },
    });

    const totalTasks = await Task.countDocuments();
    const completedTasks = await Task.countDocuments({ status: "completed" });
    const pendingTasks = await Task.countDocuments({
      status: { $ne: "completed" },
    });

    res.json({
      totalEmployees,
      onlineEmployees,                   // "Online Now" stat card
      activeEmployees: onlineEmployees,  // fallback same value
      onLeave,
      totalTasks,
      completedTasks,
      pendingTasks,
      registeredLabel: `${totalEmployees} Registered`,
      activeLeaveLabel: `${onlineEmployees} Online • ${onLeave} Leave`,
      completedLabel: `${completedTasks} Completed Tasks`,
      headerStats: {
        total: totalEmployees,
        active: onlineEmployees,
        pending: pendingTasks,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;