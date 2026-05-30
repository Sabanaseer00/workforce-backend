// ═══════════════════════════════════════════════════════
//  controllers/Emptask.controller.js
//  Employee apni tasks dekhta aur status update karta hai
// ═══════════════════════════════════════════════════════
import Task     from "../models/Task.js";
import Employee from "../models/Employee.js";

// ── Helper: req.user se Employee record nikalo ──────────
// Problem: auth middleware pehle User collection check karta hai.
// Agar Employee aur User dono collections mein same email hai,
// toh req.user User ka document hoga jiska _id Employee._id se
// alag hoga. Task.assigned_to mein Employee._id stored hai,
// isliye hamesha Employee collection se match karo.
async function getEmployee(req) {
  // Case 1: req.user already Employee collection ka document hai
  //         (email field check karo — Employee model mein email hai)
  // Case 2: req.user User collection ka document hai —
  //         email se Employee dhundo
  const email = req.user?.email;
  const uid   = req.user?._id;

  if (!email && !uid) return null;

  // Pehle _id se try karo (agar directly Employee se login hua)
  let employee = await Employee.findById(uid).lean();

  // Agar nahi mila toh email se dhundo
  if (!employee && email) {
    employee = await Employee.findOne({ email }).lean();
  }

  return employee;
}

// ════════════════════════════════════════════════════════
//  GET /api/emp/tasks
//  Sirf logged-in employee ki assigned tasks
// ════════════════════════════════════════════════════════
export const getMyTasks = async (req, res) => {
  try {
    const employee = await getEmployee(req);

    if (!employee) {
      return res.status(404).json({ message: "Employee record nahi mila" });
    }

    // Task.assigned_to mein Employee._id stored hai
    const tasks = await Task.find({ assigned_to: employee._id })
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
//  Employee apni task ka status update kare
// ════════════════════════════════════════════════════════
export const updateMyTaskStatus = async (req, res) => {
  try {
    const employee = await getEmployee(req);

    if (!employee) {
      return res.status(404).json({ message: "Employee record nahi mila" });
    }

    const task = await Task.findById(req.params.id);
    if (!task) return res.status(404).json({ message: "Task not found" });

    // Security: sirf apni task update kar sakta hai
    if (task.assigned_to?.toString() !== employee._id.toString()) {
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
        task.time_spent_mins = Math.max(1, Math.round(
          (task.completed_at - task.started_at) / 60000
        ));
    }

    if (!task.activity_log) task.activity_log = [];
    task.activity_log.push({
      status,
      changed_by: employee._id,
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