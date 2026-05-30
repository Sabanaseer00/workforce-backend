<<<<<<< HEAD
// activity.js — Electron Agent ke liye Complete Activity Tracker
// Yeh file:
// 1. Employee login/logout track karti hai
// 2. Current active app track karti hai
// 3. Mouse/keyboard events count karti hai (activity %)
// 4. Har 10s pe heartbeat bhejti hai backend ko
// 5. App usage time calculate karti hai

import activeWin from "active-win";
import axios from "axios";

const BACKEND = "http://localhost:5000";

// ── Productive apps list ──
const PRODUCTIVE_APPS = [
  "VS Code", "Code", "Figma", "Photoshop", "Illustrator",
  "Postman", "Terminal", "iTerm", "GitHub Desktop",
  "Jira", "Excel", "Microsoft Excel", "Word", "Microsoft Word",
  "PowerPoint", "Microsoft PowerPoint", "Notion", "Slack",
  "IntelliJ IDEA", "PyCharm", "WebStorm", "Android Studio",
  "Xcode", "MySQL Workbench", "DataGrip", "Sublime Text",
  "Atom", "Notepad++", "Chrome", "Firefox", "Safari",
  "Microsoft Edge", "Outlook", "Microsoft Outlook",
];

const MEETING_APPS = [
  "zoom", "teams", "google meet", "skype", "webex", "discord",
  "Microsoft Teams",
];

const BLOCKED_APPS = [
  { name: "YouTube",   keywords: ["youtube"] },
  { name: "Facebook",  keywords: ["facebook"] },
  { name: "TikTok",   keywords: ["tiktok"] },
  { name: "Instagram", keywords: ["instagram"] },
  { name: "Twitter",   keywords: ["twitter", "x.com"] },
  { name: "Netflix",   keywords: ["netflix"] },
  { name: "WhatsApp",  keywords: ["whatsapp"] },
  { name: "Snapchat",  keywords: ["snapchat"] },
];

// ── State ──
let employeeData    = null;   // { token, id, empId, name }
let heartbeatTimer  = null;
let activityTimer   = null;

// Counters — reset har 10s pe
let mouseEvents = 0;
let keyEvents   = 0;

// App usage tracking
let appUsageMap = {};         // { appName: totalSeconds }
let currentAppStart = null;   // Date — jab current app start hua
let lastApp = "";             // pichla active app

// ── Mouse/Keyboard counter setup ──
// Electron mein globalShortcut ya uiohook use hoti hai
// Yahan hum simple polling se activity estimate karte hain
// (Agar uiohook install hai toh woh better hai)
let _uiohook = null;

async function setupInputTracking() {
  try {
    // uiohook-napi try karo
    const { UiohookKey, uIOhook } = await import("uiohook-napi");
    _uiohook = uIOhook;
    uIOhook.on("mousemove", () => { mouseEvents++; });
    uIOhook.on("mouseclick", () => { mouseEvents++; });
    uIOhook.on("keydown", () => { keyEvents++; });
    uIOhook.start();
    console.log("✅ uiohook active — real mouse/keyboard tracking");
  } catch (e) {
    console.log("⚠ uiohook not available — using window poll for activity estimate");
    // Fallback: agar active window change hota rahe toh activity maano
  }
}

// ── Smart app name ──
function getSmartAppName(appName, windowTitle) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const blocked of BLOCKED_APPS) {
    if (blocked.keywords.some(k => combined.includes(k))) {
      return blocked.name;
    }
=======
// activity.js — Heartbeat + Input Tracking
// Railway backend — koi body size limit nahi

import activeWin from "active-win";
import axios     from "axios";

const BACKEND =
  process.env.BACKEND_URL ||
  "https://workforce-backend-production-cc13.up.railway.app";

console.log("[Activity] Backend:", BACKEND);

const MEETING_APPS = [
  "zoom","teams","google meet","skype","webex","discord","microsoft teams",
];
const BLOCKED_APPS = [
  { name: "YouTube",   keywords: ["youtube"]          },
  { name: "Facebook",  keywords: ["facebook"]         },
  { name: "TikTok",    keywords: ["tiktok"]           },
  { name: "Instagram", keywords: ["instagram"]        },
  { name: "Twitter",   keywords: ["twitter","x.com"]  },
  { name: "Netflix",   keywords: ["netflix"]          },
  { name: "WhatsApp",  keywords: ["whatsapp"]         },
  { name: "Snapchat",  keywords: ["snapchat"]         },
];

// ── State ──────────────────────────────────────────────────────────────
let employeeData   = null;
let heartbeatTimer = null;
let mouseEvents    = 0;
let keyEvents      = 0;
let appUsageMap    = {};
let currentAppStart = null;
let lastApp        = "";
let lastWinTitle   = null;   // null = not yet initialized
let _uiohook       = null;
let _uiohookActive = false;
let _pollTimer     = null;
let _sessionStart  = null;

// ── Input tracking ─────────────────────────────────────────────────────
async function setupInputTracking() {
  try {
    const mod = await import("uiohook-napi");
    const uIOhook = mod.uIOhook || mod.default?.uIOhook;
    if (!uIOhook) throw new Error("export nahi mila");
    _uiohook = uIOhook;
    uIOhook.on("mousemove",  () => { mouseEvents++; });
    uIOhook.on("mouseclick", () => { mouseEvents++; });
    uIOhook.on("keydown",    () => { keyEvents++;   });
    uIOhook.start();
    _uiohookActive = true;
    console.log("✅ [Activity] uiohook active");
  } catch (e) {
    console.log("⚠️  [Activity] uiohook unavailable, window-poll fallback:", e.message);
    startWindowPollFallback();
  }
}

function startWindowPollFallback() {
  if (_pollTimer) return;
  _pollTimer = setInterval(async () => {
    try {
      const w = await activeWin();
      if (!w) return;
      const title = (w.title || "") + "|" + (w.owner?.name || "");
      if (lastWinTitle === null) { lastWinTitle = title; return; } // first call — init only
      if (title !== lastWinTitle) {
        mouseEvents += 3;
        keyEvents   += 2;
        lastWinTitle = title;
      }
    } catch {}
  }, 2000);
  console.log("🔄 [Activity] Window-poll fallback started");
}

// ── Helpers ────────────────────────────────────────────────────────────
function getSmartAppName(appName, windowTitle) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const b of BLOCKED_APPS)
    if (b.keywords.some(k => combined.includes(k))) return b.name;
  const isBrowser = ["chrome","edge","firefox","brave","opera"].some(b =>
    (appName || "").toLowerCase().includes(b)
  );
  if (isBrowser && windowTitle) {
    const p = windowTitle.split(" - ");
    return p.length >= 2 ? p[0].trim() : windowTitle.split(" | ")[0].trim();
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
  }
  return appName || "Unknown App";
}

<<<<<<< HEAD
// ── Status compute ──
function computeStatus(appName, windowTitle, mouseCount, keyCount) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();

  for (const m of MEETING_APPS) {
    if (combined.includes(m.toLowerCase())) return "Meeting";
  }

  const totalEvents = mouseCount + keyCount;

  if (totalEvents > 15) return "Working";
  if (totalEvents > 0)  return "Active";
  return "Idle";
}

// ── Activity percent ──
function computeActivityPct(mouseCount, keyCount) {
  const total = mouseCount + keyCount;
  // 20+ events in 10s = 100% active
  return Math.min(100, Math.round((total / 20) * 100));
}

// ── App usage update ──
function updateAppUsage(newApp) {
  const now = new Date();

  if (lastApp && currentAppStart) {
    const seconds = Math.round((now - currentAppStart) / 1000);
    if (seconds > 0) {
      appUsageMap[lastApp] = (appUsageMap[lastApp] || 0) + seconds;
    }
  }

  lastApp        = newApp;
  currentAppStart = now;
}

// ── Format seconds to "Xh Ym" ──
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Get active time (total time online today) ──
let sessionStart = null;

function getActiveTime() {
  if (!sessionStart) return "0h 0m";
  const seconds = Math.round((new Date() - sessionStart) / 1000);
  return formatTime(seconds);
}

function getActiveMinsToday() {
  if (!sessionStart) return 0;
  return Math.round((new Date() - sessionStart) / 1000 / 60);
}

// ── Top apps list ──
function getTopApps() {
  const entries = Object.entries(appUsageMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  const total = entries.reduce((s, [, v]) => s + v, 1);

  return entries.map(([name, seconds]) => ({
    name,
    pct:  Math.round((seconds / total) * 100),
    time: formatTime(seconds),
  }));
}

// ── HEARTBEAT — har 10s backend ko update bhejo ──
async function sendHeartbeat() {
  if (!employeeData?.token || !employeeData?.id) return;

  try {
    // Active window fetch karo
    const activeWindow = await activeWin().catch(() => null);
    const rawApp    = activeWindow?.owner?.name || "";
    const winTitle  = activeWindow?.title       || "";
    const smartApp  = getSmartAppName(rawApp, winTitle);

    // App usage track karo
    if (smartApp !== lastApp) {
      updateAppUsage(smartApp);
    }

    const curMouse = mouseEvents;
    const curKey   = keyEvents;

    // Reset counters
    mouseEvents = 0;
    keyEvents   = 0;

    const activityPct = computeActivityPct(curMouse, curKey);
    const status      = computeStatus(rawApp, winTitle, curMouse, curKey);
    const activeTime  = getActiveTime();
    const activeMins  = getActiveMinsToday();
    const topApps     = getTopApps();

    // Backend ko bhejo
    const res = await axios.post(
=======
function computeStatus(appName, windowTitle, mc, kc) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const m of MEETING_APPS)
    if (combined.includes(m)) return "Meeting";
  const total = mc + kc;
  if (total > 15) return "Working";
  if (total > 0)  return "Active";
  return "Idle";
}

function computeActivityPct(mc, kc) {
  const threshold = _uiohookActive ? 20 : 8;
  return Math.min(100, Math.round(((mc + kc) / threshold) * 100));
}

function updateAppUsage(newApp) {
  const now = Date.now();
  if (lastApp && currentAppStart) {
    const secs = Math.round((now - currentAppStart) / 1000);
    if (secs > 0) appUsageMap[lastApp] = (appUsageMap[lastApp] || 0) + secs;
  }
  lastApp         = newApp;
  currentAppStart = now;
}

function formatTime(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getActiveTime() {
  if (!_sessionStart) return "0h 0m";
  return formatTime(Math.round((Date.now() - _sessionStart) / 1000));
}

function getActiveMinsToday() {
  if (!_sessionStart) return 0;
  return Math.round((Date.now() - _sessionStart) / 60000);
}

function getTopApps() {
  const entries = Object.entries(appUsageMap).sort((a,b) => b[1]-a[1]).slice(0,6);
  const total   = Math.max(entries.reduce((s,[,v]) => s+v, 0), 1);
  return entries.map(([name, secs]) => ({
    name, pct: Math.round((secs/total)*100), time: formatTime(secs),
  }));
}

// ── Heartbeat ──────────────────────────────────────────────────────────
async function sendHeartbeat() {
  if (!employeeData?.token || !employeeData?.id) return;
  try {
    const w        = await activeWin().catch(() => null);
    const rawApp   = w?.owner?.name || "";
    const winTitle = w?.title        || "";
    const smartApp = getSmartAppName(rawApp, winTitle);

    if (smartApp !== lastApp) updateAppUsage(smartApp);

    const curMouse = mouseEvents; mouseEvents = 0;
    const curKey   = keyEvents;   keyEvents   = 0;

    await axios.post(
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
      `${BACKEND}/api/employees/heartbeat`,
      {
        employeeId:      employeeData.id,
        activeApp:       smartApp,
        windowTitle:     winTitle,
        mouseEvents:     curMouse,
        keyEvents:       curKey,
<<<<<<< HEAD
        activityPct,
        activeTime,
        activeMinsToday: activeMins,
        topApps,
        status,
=======
        activityPct:     computeActivityPct(curMouse, curKey),
        activeTime:      getActiveTime(),
        activeMinsToday: getActiveMinsToday(),
        topApps:         getTopApps(),
        status:          computeStatus(rawApp, winTitle, curMouse, curKey),
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
        isRemote:        false,
        vpnConnected:    false,
      },
      {
        headers: { Authorization: `Bearer ${employeeData.token}` },
<<<<<<< HEAD
        timeout: 8000,
      }
    );

    console.log(
      `💓 Heartbeat | App: ${smartApp} | Status: ${status} | Activity: ${activityPct}% | Active: ${activeTime}`
    );
  } catch (err) {
    console.error("❌ Heartbeat error:", err?.response?.data?.message || err.message);
  }
}

// ── LOGIN — activity tracking shuru karo ──
export async function startTracking(empData) {
  employeeData = empData;
  sessionStart = new Date();
  appUsageMap  = {};
  mouseEvents  = 0;
  keyEvents    = 0;
  lastApp      = "";
  currentAppStart = new Date();

  console.log(`🟢 Tracking started for: ${empData.name}`);

  // Input tracking setup
  await setupInputTracking();

  // Pehla heartbeat turant
  await sendHeartbeat();

  // Har 10s pe heartbeat
  heartbeatTimer = setInterval(sendHeartbeat, 10000);
}

// ── LOGOUT — tracking band karo ──
export async function stopTracking() {
  if (!employeeData) return;

  // Timers clear karo
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (activityTimer)  { clearInterval(activityTimer);  activityTimer  = null; }

  // uiohook stop karo
  if (_uiohook) {
    try { _uiohook.stop(); } catch(e) {}
  }

  // Backend ko offline mark karo
=======
        timeout: 10_000,
      }
    );
    console.log(`💓 [Activity] ${smartApp} | ${computeStatus(rawApp, winTitle, curMouse, curKey)} | ${computeActivityPct(curMouse, curKey)}%`);
  } catch (err) {
    console.error(`❌ [Activity] Heartbeat:`, err?.response?.status, err?.response?.data?.message || err.message);
  }
}

// ── Public API ─────────────────────────────────────────────────────────
export async function startTracking(empData) {
  employeeData    = empData;
  _sessionStart   = Date.now();
  appUsageMap     = {};
  mouseEvents     = 0;
  keyEvents       = 0;
  lastApp         = "";
  lastWinTitle    = null;
  currentAppStart = Date.now();

  console.log(`🟢 [Activity] Started: ${empData.name}`);
  await setupInputTracking();
  await sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 10_000);
}

export async function stopTracking() {
  if (!employeeData) return;

  // 1. Stop timers first
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (_pollTimer)     { clearInterval(_pollTimer);     _pollTimer     = null; }

  // 2. go-offline API
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
  try {
    await axios.post(
      `${BACKEND}/api/employees/go-offline`,
      { employeeId: employeeData.id },
<<<<<<< HEAD
      {
        headers: { Authorization: `Bearer ${employeeData.token}` },
        timeout: 5000,
      }
    );
    console.log("🔴 Employee marked offline");
  } catch (err) {
    console.error("Go-offline error:", err.message);
  }

  employeeData = null;
  sessionStart = null;
  console.log("⏹ Tracking stopped");
}

// ── Cleanup on app quit ──
=======
      { headers: { Authorization: `Bearer ${employeeData.token}` }, timeout: 5000 }
    );
    console.log("🔴 [Activity] Employee offline");
  } catch (err) {
    console.error("[Activity] go-offline failed:", err.message);
  }

  // 3. Stop uiohook
  if (_uiohook && _uiohookActive) {
    try { _uiohook.stop(); } catch {}
    _uiohook = null;
  }

  // 4. Clear state
  employeeData   = null;
  _sessionStart  = null;
  _uiohookActive = false;
  lastWinTitle   = null;
  appUsageMap    = {};
  mouseEvents    = 0;
  keyEvents      = 0;
  console.log("⏹️  [Activity] Stopped");
}

>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
export async function cleanupOnQuit() {
  await stopTracking();
}