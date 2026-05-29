import BlockedApp from "../models/BlockedApp.js";

// ─────────────────────────────────────────────
// Socket emit helper
// Dono events emit karta hai:
//   1. "blocked_apps_updated" — admin dashboard ke liye (full list)
//   2. "blockedSites:update"  — Electron client ke liye (real-time trigger)
// ─────────────────────────────────────────────
const emitUpdate = async (req) => {
  try {
    const io = req.app.get("io");
    if (!io) {
      console.warn("⚠️  Socket.io instance not found on app. Check server.js: app.set('io', ioInstance)");
      return;
    }

    // Fetch latest blocked list
    const all = await BlockedApp.find({}).sort({ createdAt: -1 });

    // 1️⃣ Admin dashboard — full list update
    io.emit("blocked_apps_updated", all);
    console.log(`📡 Emitted blocked_apps_updated — ${all.length} items`);

    // 2️⃣ Electron desktop clients — triggers refreshAdminBlockedSites()
    io.emit("blockedSites:update");
    console.log(`📡 Emitted blockedSites:update — Electron clients will re-fetch`);

    // 3️⃣ Browser clients (mobile/tablet) — send blocked identifiers list directly
    const blockedDomains = all
      .filter(a => a.isBlocked && a.type === "website")
      .map(a => a.identifier);
    const blockedRoutes = all
      .filter(a => a.isBlocked && a.type === "internal")
      .map(a => a.identifier);

    io.emit("browser:blockedList", { domains: blockedDomains, routes: blockedRoutes });
    console.log(`📡 Emitted browser:blockedList — ${blockedDomains.length} domains, ${blockedRoutes.length} routes`);

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
// GET BLOCKED SITES LIST (for Electron / browser clients)
// Returns only currently-blocked websites as a flat list
// GET /api/blocked-apps/sites  ← Electron main.js is calling this
// ─────────────────────────────────────────────
export const getBlockedSites = async (req, res) => {
  try {
    const sites = await BlockedApp.find({ isBlocked: true, type: "website" })
      .select("identifier name -_id")
      .sort({ createdAt: -1 });

    // Return both formats so any client can consume it
    res.json({
      success: true,
      sites: sites.map(s => ({ domain: s.identifier, name: s.name })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ─────────────────────────────────────────────
// GET BLOCKED LIST FOR BROWSER GUARD
// Returns blocked domains + internal routes
// GET /api/blocked-apps/browser-list
// ─────────────────────────────────────────────
export const getBrowserBlockList = async (req, res) => {
  try {
    const all = await BlockedApp.find({ isBlocked: true }).select("identifier type name -_id");

    const domains = all.filter(a => a.type === "website").map(a => a.identifier);
    const routes  = all.filter(a => a.type === "internal").map(a => a.identifier);

    res.json({ success: true, domains, routes });
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