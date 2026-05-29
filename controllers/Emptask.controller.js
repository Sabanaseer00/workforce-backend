// ═══════════════════════════════════════════════════════
//  controllers/empTask.controller.js
//  Employee apni tasks dekhta aur status update karta hai
// ═══════════════════════════════════════════════════════
import Task from "../models/Task.js";

// ════════════════════════════════════════════════════════
//  GET /api/emp/tasks
//  Employee apni assigned tasks dekhta hai
// ════════════════════════════════════════════════════════
export const getMyTasks = async (req, res) => {
  try {
    const tasks = await Task.find({ assigned_to: req.user._id })
      .sort({ createdAt: -1 });

    const total     = tasks.length;
    const completed = tasks.filter(t => t.status === "completed").length;
    const pending   = tasks.filter(t => t.status === "pending").length;
    const inProg    = tasks.filter(t => t.status === "in_progress").length;
    const blocked   = tasks.filter(t => t.status === "blocked").length;

    res.json({
      tasks,
      stats: { total, completed, pending, inProgress: inProg, blocked },
    });
  } catch (err) {
    console.error("getMyTasks error:", err.message);
    res.status(500).json({ message: err.message });
  }
};

// ════════════════════════════════════════════════════════
//  PATCH /api/emp/tasks/:id/status
//  Employee apni task ka status update karta hai
// ════════════════════════════════════════════════════════
export const updateMyTaskStatus = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    // Security — sirf apni task
    if (task.assigned_to.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Yeh aapki task nahi hai" });
    }

    const { status, note } = req.body;
    const validStatuses = ["pending", "in_progress", "in_review", "completed", "blocked"];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    task.status = status;
    if (status === "in_progress" && !task.started_at)  task.started_at  = new Date();
    if (status === "completed"   && !task.completed_at) {
      task.completed_at = new Date();
      if (task.started_at)
        task.time_spent_mins = Math.max(1, Math.round((task.completed_at - task.started_at) / 60000));
    }

    if (!task.activity_log) task.activity_log = [];
    task.activity_log.push({
      status,
      changed_by: req.user._id,
      changed_at: new Date(),
      note: note || `Status changed to ${status}`,
    });

    await task.save();
    res.json(task);
  } catch (err) {
    console.error("updateMyTaskStatus error:", err.message);
    res.status(500).json({ message: err.message });
  }
};