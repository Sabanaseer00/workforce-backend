import Task from "../models/Task.js";
import {
  computeCPM,
  cpmToDbFields,
  projectPERT,
  pertCalc,
} from "../services/cpmPert.service.js";

// ── Helper ────────────────────────────────────────────────────
function toPlain(doc) {
  const obj = doc.toObject ? doc.toObject() : { ...doc };

  obj._id = String(obj._id);

  obj.dependencies = (obj.dependencies || []).map((d) =>
    typeof d === "object"
      ? String(d._id || d)
      : String(d)
  );

  return obj;
}

// ── GET /api/tasks ─────────────────────────────────────────────
export const getAllTasks = async (req, res) => {
  try {
    const filter = {};

    if (req.query.assigned_to) {
      filter.assigned_to = req.query.assigned_to;
    }

    if (req.query.status) {
      filter.status = req.query.status;
    }

    if (req.query.project) {
      filter.project = req.query.project;
    }

    if (req.query.isCritical) {
      filter.isCritical =
        req.query.isCritical === "true";
    }

    const tasks = await Task.find(filter)
      .populate(
        "assigned_to",
        "firstName lastName name email department"
      )
      .populate(
        "dependencies",
        "title status"
      )
      .sort({ createdAt: -1 });

    res.json(tasks);

  } catch (err) {

    console.error("GET TASKS ERROR:", err);

    res.status(500).json({
      message: err.message,
    });
  }
};

// ── GET /api/tasks/:id ─────────────────────────────────────────
export const getTaskById = async (req, res) => {
  try {

    const task = await Task.findById(
      req.params.id
    )
      .populate(
        "assigned_to",
        "firstName lastName name email department"
      )
      .populate(
        "dependencies",
        "title status duration"
      );

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    res.json(task);

  } catch (err) {

    console.error("GET TASK ERROR:", err);

    res.status(500).json({
      message: err.message,
    });
  }
};

// ── POST /api/tasks ────────────────────────────────────────────
export const createTask = async (req, res) => {
  try {

    console.log("TASK BODY:", req.body);

    const {
      title,
      description,
      priority,
      status,
      assigned_to,
      due_date,
      start_date,
      end_date,
      pertOptimistic,
      pertMostLikely,
      pertPessimistic,
      duration,
      dependencies,
      progress,
      project,
    } = req.body;

    // ✅ Required title
    if (!title || title.trim() === "") {
      return res.status(400).json({
        message: "Title is required",
      });
    }

    // ✅ Safe assigned_to
    const safeAssignedTo =
      typeof assigned_to === "object"
        ? assigned_to?._id
        : assigned_to || null;

    // ✅ Safe dependencies
    const safeDependencies =
      Array.isArray(dependencies)
        ? dependencies
            .filter(Boolean)
            .map((d) =>
              typeof d === "object"
                ? d._id
                : d
            )
        : [];

    // ✅ Safe numbers
    const safeDuration =
      duration && !isNaN(duration)
        ? Number(duration)
        : 1;

    const safeProgress =
      progress && !isNaN(progress)
        ? Number(progress)
        : 0;

    const task = await Task.create({
      title: title.trim(),

      description:
        description || "",

      priority:
        priority || "medium",

      status:
        status || "pending",

      assigned_to:
        safeAssignedTo,

      due_date:
        due_date || null,

      start_date:
        start_date || null,

      end_date:
        end_date || null,

      pertOptimistic:
        pertOptimistic ?? null,

      pertMostLikely:
        pertMostLikely ?? null,

      pertPessimistic:
        pertPessimistic ?? null,

      duration:
        safeDuration,

      dependencies:
        safeDependencies,

      progress:
        safeProgress,

      project:
        project || "default",
    });

    const populated =
      await task.populate(
        "assigned_to",
        "firstName lastName name email"
      );

    // ✅ Socket emit
    const io = req.app.get("io");

    if (io) {
      io.emit("task:new", populated);
    }

    res.status(201).json(populated);

  } catch (err) {

    console.error(
      "CREATE TASK ERROR:",
      err
    );

    res.status(400).json({
      message: err.message,
    });
  }
};

// ── PUT /api/tasks/:id ─────────────────────────────────────────
export const updateTask = async (req, res) => {
  try {

    const allowed = [
      "title",
      "description",
      "priority",
      "status",
      "assigned_to",
      "due_date",
      "start_date",
      "end_date",
      "pertOptimistic",
      "pertMostLikely",
      "pertPessimistic",
      "duration",
      "dependencies",
      "progress",
      "project",
    ];

    const updates = {};

    allowed.forEach((f) => {
      if (req.body[f] !== undefined) {
        updates[f] = req.body[f];
      }
    });

    // ✅ Safe assigned_to
    if (updates.assigned_to) {
      updates.assigned_to =
        typeof updates.assigned_to ===
        "object"
          ? updates.assigned_to?._id
          : updates.assigned_to;
    }

    // ✅ Safe dependencies
    if (updates.dependencies) {
      updates.dependencies =
        Array.isArray(
          updates.dependencies
        )
          ? updates.dependencies.map(
              (d) =>
                typeof d === "object"
                  ? d._id
                  : d
            )
          : [];
    }

    const task =
      await Task.findByIdAndUpdate(
        req.params.id,
        {
          $set: updates,
        },
        {
          new: true,
          runValidators: true,
        }
      )
        .populate(
          "assigned_to",
          "firstName lastName name email"
        )
        .populate(
          "dependencies",
          "title status"
        );

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const io = req.app.get("io");

    if (io) {
      io.emit("task:update", task);
    }

    res.json(task);

  } catch (err) {

    console.error(
      "UPDATE TASK ERROR:",
      err
    );

    res.status(400).json({
      message: err.message,
    });
  }
};

// ── PATCH /api/tasks/:id/status ────────────────────────────────
export const updateTaskStatus = async (
  req,
  res
) => {
  try {

    const { status, progress } =
      req.body;

    const update = { status };

    if (progress !== undefined) {
      update.progress = progress;
    }

    if (status === "completed") {
      update.progress = 100;
    }

    const task =
      await Task.findByIdAndUpdate(
        req.params.id,
        {
          $set: update,
        },
        {
          new: true,
        }
      ).populate(
        "assigned_to",
        "firstName lastName name email"
      );

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    const io = req.app.get("io");

    if (io) {
      io.emit(
        "task:statusUpdate",
        {
          taskId: req.params.id,
          status: task.status,
          progress:
            task.progress,
        }
      );
    }

    res.json(task);

  } catch (err) {

    console.error(
      "STATUS UPDATE ERROR:",
      err
    );

    res.status(400).json({
      message: err.message,
    });
  }
};

// ── DELETE /api/tasks/:id ──────────────────────────────────────
export const deleteTask = async (
  req,
  res
) => {
  try {

    const task =
      await Task.findByIdAndDelete(
        req.params.id
      );

    if (!task) {
      return res.status(404).json({
        message: "Task not found",
      });
    }

    await Task.updateMany(
      {
        dependencies:
          req.params.id,
      },
      {
        $pull: {
          dependencies:
            req.params.id,
        },
      }
    );

    const io = req.app.get("io");

    if (io) {
      io.emit("task:deleted", {
        taskId: req.params.id,
      });
    }

    res.status(204).send();

  } catch (err) {

    console.error(
      "DELETE TASK ERROR:",
      err
    );

    res.status(500).json({
      message: err.message,
    });
  }
};

// ── POST /api/tasks/compute-cpm ────────────────────────────────
export const computeAndSaveCPM =
  async (req, res) => {
    try {

      const filter = {};

      if (req.body.project) {
        filter.project =
          req.body.project;
      }

      if (req.body.assigned_to) {
        filter.assigned_to =
          req.body.assigned_to;
      }

      const rawTasks =
        await Task.find(filter).lean();

      if (!rawTasks.length) {
        return res.json({
          tasks: [],
          criticalPath: [],
          projectDuration: 0,
        });
      }

      const normalized =
        rawTasks.map((t) => ({
          ...t,

          _id: String(t._id),

          dependencies:
            (
              t.dependencies || []
            ).map(String),

          duration:
            t.duration ||
            t.pertTime ||
            1,
        }));

      const {
        tasks: enriched,
        criticalPath,
        projectDuration,
      } = computeCPM(normalized);

      const pertStats =
        projectPERT(
          enriched,
          criticalPath
        );

      const dbUpdates =
        cpmToDbFields(enriched);

      await Promise.all(
        dbUpdates.map((u) =>
          Task.findByIdAndUpdate(
            u._id,
            {
              $set: {
                earlyStart:
                  u.earlyStart,

                earlyFinish:
                  u.earlyFinish,

                lateStart:
                  u.lateStart,

                lateFinish:
                  u.lateFinish,

                float:
                  u.float,

                isCritical:
                  u.isCritical,
              },
            }
          )
        )
      );

      const updatedTasks =
        await Task.find(filter)
          .populate(
            "assigned_to",
            "firstName lastName name email"
          )
          .populate(
            "dependencies",
            "title status"
          );

      res.json({
        tasks: updatedTasks,
        criticalPath,
        projectDuration,
        pertStats,
      });

    } catch (err) {

      console.error(
        "CPM ERROR:",
        err
      );

      res.status(500).json({
        message: err.message,
      });
    }
  };

// ── GET /api/tasks/analytics ───────────────────────────────────
export const getAnalytics = async (
  req,
  res
) => {
  try {

    const filter = {};

    if (req.query.project) {
      filter.project =
        req.query.project;
    }

    const tasks =
      await Task.find(filter).lean();

    const total = tasks.length;

    const byStatus = {};
    const byPriority = {};

    tasks.forEach((t) => {

      byStatus[t.status] =
        (byStatus[t.status] || 0) +
        1;

      byPriority[t.priority] =
        (byPriority[t.priority] ||
          0) + 1;
    });

    const completed =
      byStatus.completed || 0;

    const critical =
      tasks.filter(
        (t) => t.isCritical
      ).length;

    const overdue =
      tasks.filter(
        (t) =>
          t.due_date &&
          new Date(t.due_date) <
            new Date() &&
          t.status !==
            "completed"
      ).length;

    const avgProgress = total
      ? Math.round(
          tasks.reduce(
            (s, t) =>
              s +
              (t.progress || 0),
            0
          ) / total
        )
      : 0;

    res.json({
      total,
      completed,
      critical,
      overdue,
      avgProgress,

      completionRate: total
        ? Math.round(
            (completed /
              total) *
              100
          )
        : 0,

      byStatus,
      byPriority,
    });

  } catch (err) {

    console.error(
      "ANALYTICS ERROR:",
      err
    );

    res.status(500).json({
      message: err.message,
    });
  }
};

// ── GET /api/tasks/gantt ───────────────────────────────────────
export const getGanttData = async (
  req,
  res
) => {
  try {

    const filter = {};

    if (req.query.project) {
      filter.project =
        req.query.project;
    }

    if (req.query.assigned_to) {
      filter.assigned_to =
        req.query.assigned_to;
    }

    const tasks = await Task.find(
      filter
    )
      .populate(
        "assigned_to",
        "firstName lastName name"
      )
      .lean();

    const gantt = tasks.map((t) => {

      const empName =
        t.assigned_to
          ? t.assigned_to.name ||
            `${
              t.assigned_to
                .firstName || ""
            } ${
              t.assigned_to
                .lastName || ""
            }`.trim()
          : "Unassigned";

      return {
        id: String(t._id),

        title: t.title,

        empName,

        duration:
          t.duration || 1,

        es:
          t.earlyStart ?? 0,

        ef:
          t.earlyFinish ??
          (t.earlyStart || 0) +
            (t.duration || 1),

        ls:
          t.lateStart ?? 0,

        lf:
          t.lateFinish ??
          (t.lateStart || 0) +
            (t.duration || 1),

        float:
          t.float ?? 0,

        isCritical:
          t.isCritical ?? false,

        status: t.status,

        priority:
          t.priority,

        progress:
          t.progress || 0,

        dependencies:
          (
            t.dependencies || []
          ).map(String),

        pertTime:
          t.pertTime || null,

        start_date:
          t.start_date || null,

        due_date:
          t.due_date || null,
      };
    });

    res.json(gantt);

  } catch (err) {

    console.error(
      "GANTT ERROR:",
      err
    );

    res.status(500).json({
      message: err.message,
    });
  }
};