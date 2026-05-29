import Employee from "../models/Employee.js";
import Task from "../models/Task.js";

/* =========================
   📊 DASHBOARD STATS
========================= */
export const getDashboardStats = async (req, res) => {
  try {
    // 👥 Employees
    const totalEmployees = await Employee.countDocuments();

    const activeEmployees = await Employee.countDocuments({
      status: "active",   // ⚠️ ensure DB me "active" string ho
    });

    const onLeave = await Employee.countDocuments({
      status: "leave",    // ⚠️ adjust if different in DB
    });

    // 📋 Tasks
    const totalTasks = await Task.countDocuments();

    const completedTasks = await Task.countDocuments({
      status: "completed",
    });

    const pendingTasks = await Task.countDocuments({
      status: "pending",
    });

    // 🧾 Labels (frontend ke liye)
    const registeredLabel = `${totalEmployees} Registered`;
    const activeLeaveLabel = `${activeEmployees} Active • ${onLeave} Leave`;
    const completedLabel = `${completedTasks} Completed Tasks`;

    // 📈 Header stats (cards)
    const headerStats = {
      total: totalEmployees,
      active: activeEmployees,
      pending: pendingTasks,
    };

    res.json({
      totalEmployees,
      activeEmployees,
      onLeave,
      totalTasks,
      completedTasks,
      pendingTasks,

      registeredLabel,
      activeLeaveLabel,
      completedLabel,

      headerStats,
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ message: "Server Error" });
  }
};