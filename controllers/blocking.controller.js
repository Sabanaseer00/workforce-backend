// blocking.controller.js — Backend
// Admin jis app ko block kare, employee us app/website ko use nahi kar sakta

import Settings  from "../models/Settings.js";
import Employee  from "../models/Employee.js";
import Alert     from "../models/Alert.js";
import Screenshot from "../models/screenshot.js";

// Social app id → domain map
const SOCIAL_DOMAINS = {
  facebook:  "facebook.com",
  instagram: "instagram.com",
  tiktok:    "tiktok.com",
  youtube:   "youtube.com",
  twitter:   "twitter.com",
  snapchat:  "snapchat.com",
  whatsapp:  "web.whatsapp.com",
  reddit:    "reddit.com",
  linkedin:  "linkedin.com",
  telegram:  "web.telegram.org",
};

// Settings se flat domain list banao
function buildDomainList(settings) {
  const domains = [];

  // Globally blocked social apps
  for (const [id, domain] of Object.entries(SOCIAL_DOMAINS)) {
    if (settings.blockedApps?.get?.(id) || settings.blockedApps?.[id]) {
      domains.push(domain);
    }
  }

  // Custom domains
  if (settings.customDomains?.length) {
    domains.push(...settings.customDomains);
  }

  return [...new Set(domains)]; // duplicates remove
}

// ✅ GET BLOCKED DOMAINS — Electron agent polling + on connect
// Returns global blocked list (applies to all employees)
export const getBlockedDomains = async (req, res) => {
  try {
    const settings = await Settings.findOne();

    if (!settings || !settings.appBlockingEnabled) {
      return res.json({ enabled: false, domains: [] });
    }

    const domains = buildDomainList(settings);

    res.json({
      enabled:                true,
      domains,
      blockAlertEnabled:      settings.blockAlertEnabled      ?? true,
      blockScreenshotEnabled: settings.blockScreenshotEnabled ?? true,
      logBlockAttempts:       settings.logBlockAttempts       ?? true,
    });
  } catch (err) {
    console.error("[Blocking] getBlockedDomains error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ✅ GET SETTINGS — Admin panel ke liye current blocking settings
export const getBlockingSettings = async (req, res) => {
  try {
    const settings = await Settings.findOne();
    if (!settings) return res.json({});

    res.json({
      appBlockingEnabled:     settings.appBlockingEnabled,
      blockedApps:            Object.fromEntries(settings.blockedApps || new Map()),
      customDomains:          settings.customDomains || [],
      blockAlertEnabled:      settings.blockAlertEnabled,
      blockScreenshotEnabled: settings.blockScreenshotEnabled,
      logBlockAttempts:       settings.logBlockAttempts,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ UPDATE BLOCKING SETTINGS — Admin save kare, sabhi agents ko realtime update jata hai
export const updateBlockingSettings = async (req, res) => {
  try {
    const {
      appBlockingEnabled,
      blockedApps,
      customDomains,
      blockAlertEnabled,
      blockScreenshotEnabled,
      logBlockAttempts,
    } = req.body;

    let settings = await Settings.findOne();
    if (!settings) settings = new Settings();

    if (appBlockingEnabled     !== undefined) settings.appBlockingEnabled     = appBlockingEnabled;
    if (blockedApps            !== undefined) settings.blockedApps            = new Map(Object.entries(blockedApps));
    if (customDomains          !== undefined) settings.customDomains          = customDomains;
    if (blockAlertEnabled      !== undefined) settings.blockAlertEnabled      = blockAlertEnabled;
    if (blockScreenshotEnabled !== undefined) settings.blockScreenshotEnabled = blockScreenshotEnabled;
    if (logBlockAttempts       !== undefined) settings.logBlockAttempts       = logBlockAttempts;

    await settings.save();

    // ── Realtime: sabhi connected Electron agents ko turant update bhejo ──
    const io = req.app.get("io");
    if (io) {
      const payload = {
        enabled: settings.appBlockingEnabled,
        domains: settings.appBlockingEnabled ? buildDomainList(settings) : [],
        blockAlertEnabled:      settings.blockAlertEnabled,
        blockScreenshotEnabled: settings.blockScreenshotEnabled,
        logBlockAttempts:       settings.logBlockAttempts,
      };
      io.emit("blocking:updated", payload);
      console.log("[Blocking] ⚡ Realtime update pushed to all agents:", payload.domains);
    }

    res.json({ success: true, settings });
  } catch (err) {
    console.error("[Blocking] updateBlockingSettings error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ✅ TEST DOMAIN — Admin frontend test kare
export const testBlockedDomain = async (req, res) => {
  try {
    const { domain } = req.body;
    if (!domain) return res.status(400).json({ message: "Domain required" });

    const settings = await Settings.findOne();
    if (!settings) return res.json({ blocked: false });

    const clean = domain.toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/$/, "")
      .replace(/^www\./, "");

    let blocked = false;

    // Check social apps
    for (const [id, appDomain] of Object.entries(SOCIAL_DOMAINS)) {
      const base = appDomain.replace(/^www\./, "");
      if (clean === base || clean.endsWith("." + base)) {
        const isBlocked = settings.blockedApps?.get?.(id) || settings.blockedApps?.[id];
        if (isBlocked) { blocked = true; break; }
      }
    }

    // Check custom domains
    if (!blocked && settings.customDomains?.length) {
      blocked = settings.customDomains.some(d => {
        const base = d.replace(/^www\./, "");
        return clean === base || clean.endsWith("." + base);
      });
    }

    res.json({ blocked, enabled: settings.appBlockingEnabled });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ✅ LOG VIOLATION — Electron agent reports jab employee blocked site try kare
export const logBlockingViolation = async (req, res) => {
  try {
    const { employeeId, domain, screenshotBase64, timestamp } = req.body;

    if (!employeeId || !domain) {
      return res.status(400).json({ message: "employeeId aur domain required hain" });
    }

    const settings = await Settings.findOne();

    // Alert save karo
    if (settings?.blockAlertEnabled || settings?.logBlockAttempts) {
      await Alert.create({
        employeeId,
        type:      "blocked_access",
        message:   `Blocked site access attempt: ${domain}`,
        domain,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      });
      console.log(`[Blocking] 🚨 Violation logged — Employee: ${employeeId}, Domain: ${domain}`);
    }

    // Screenshot save karo
    if (settings?.blockScreenshotEnabled && screenshotBase64) {
      await Screenshot.create({
        employeeId,
        imageUrl:  screenshotBase64,
        isBlocked: true,
        blockedApp: domain,
        reason:    "blocked_access",
        time:      new Date().toLocaleTimeString(),
        date:      new Date().toLocaleDateString(),
      });
    }

    // Realtime: admin ko turant alert bhejo
    const io = req.app.get("io");
    if (io) {
      io.emit("blocking:violation", { employeeId, domain, timestamp: new Date() });
    }

    res.json({ success: true });
  } catch (err) {
    console.error("[Blocking] logBlockingViolation error:", err.message);
    res.status(500).json({ error: err.message });
  }
};

// ✅ PUSH UPDATE TO ALL AGENTS — manually call karo agar needed ho
export const emitBlockingUpdate = async (io) => {
  try {
    const settings = await Settings.findOne();
    if (!settings) return;

    const payload = {
      enabled: settings.appBlockingEnabled,
      domains: settings.appBlockingEnabled ? buildDomainList(settings) : [],
    };

    io.emit("blocking:updated", payload);
    console.log("[Blocking] Realtime update pushed:", payload.domains);
  } catch (err) {
    console.error("[Blocking] emitBlockingUpdate error:", err.message);
  }
};