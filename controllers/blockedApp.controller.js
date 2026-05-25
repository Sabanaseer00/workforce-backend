import BlockedApp from "../models/BlockedApp.js";

// ─────────────────────────────────────────────
// Socket emit helper
// req.app.get("io") — server.js mein app.set("io", ioInstance) se set hota hai
// Yeh approach setIO() se better hai kyunki:
//   - Koi separate import/export nahi
//   - server.js mein koi extra call nahi
//   - Express ka standard pattern hai
// ─────────────────────────────────────────────
const emitUpdate = async (req) => {
  try {
    const io = req.app.get("io");
    if (!io) {
      console.warn("⚠️  Socket.io instance not found on app. Check server.js: app.set('io', ioInstance)");
      return;
    }
    const all = await BlockedApp.find({}).sort({ createdAt: -1 });
    io.emit("blocked_apps_updated", all);
    console.log(`📡 Emitted blocked_apps_updated — ${all.length} items`);
  } catch (err) {
    console.error("Socket emit error:", err.message);
  }
};

// ─────────────────────────────────────────────
// GET ALL
// ─────────────────────────────────────────────
export const getAll = async (req, res) => {
  try {
    const apps = await BlockedApp.find({}).sort({ createdAt: -1 });
    res.json({ success: true, data: apps });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// STATS
// ─────────────────────────────────────────────
export const getStats = async (req, res) => {
  try {
    const total    = await BlockedApp.countDocuments();
    const active   = await BlockedApp.countDocuments({ isBlocked: true });
    const websites = await BlockedApp.countDocuments({ type: "website",  isBlocked: true });
    const internal = await BlockedApp.countDocuments({ type: "internal", isBlocked: true });

    res.json({ success: true, data: { total, active, websites, internal } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────
export const create = async (req, res) => {
  try {
    const { name, identifier, type, reason } = req.body;

    if (!name || !identifier) {
      return res.status(400).json({
        success: false,
        message: "Name aur identifier required hain",
      });
    }

    const cleanIdentifier = identifier.toLowerCase().trim();

    const exists = await BlockedApp.findOne({ identifier: cleanIdentifier });
    if (exists) {
      return res.status(409).json({
        success: false,
        message: `"${cleanIdentifier}" pehle se exist karta hai`,
      });
    }

    const app = await BlockedApp.create({
      name,
      identifier: cleanIdentifier,
      type:       type || "website",
      reason:     reason || "",
      isBlocked:  true,
      blockedBy:  req.user?._id || null,
    });

    await emitUpdate(req);

    res.status(201).json({ success: true, data: app });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// TOGGLE BLOCK / UNBLOCK
// ─────────────────────────────────────────────
export const toggle = async (req, res) => {
  try {
    const app = await BlockedApp.findById(req.params.id);
    if (!app) {
      return res.status(404).json({ success: false, message: "App not found" });
    }

    app.isBlocked = !app.isBlocked;
    await app.save();

    await emitUpdate(req);

    res.json({ success: true, data: app });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// UPDATE — sirf name, reason, type change ho sakta hai
// identifier change nahi hoga (unique index protect karta hai)
// ─────────────────────────────────────────────
export const update = async (req, res) => {
  try {
    const { name, reason, type } = req.body;

    const app = await BlockedApp.findByIdAndUpdate(
      req.params.id,
      { name, reason, type },
      { new: true, runValidators: true }
    );

    if (!app) {
      return res.status(404).json({ success: false, message: "App not found" });
    }

    await emitUpdate(req);

    res.json({ success: true, data: app });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// DELETE
// ─────────────────────────────────────────────
export const remove = async (req, res) => {
  try {
    const app = await BlockedApp.findByIdAndDelete(req.params.id);
    if (!app) {
      return res.status(404).json({ success: false, message: "App not found" });
    }

    await emitUpdate(req);

    res.json({ success: true, message: "Deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};