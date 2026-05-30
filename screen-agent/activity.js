// activity.js — Electron Agent ke liye Complete Activity Tracker

import activeWin from "active-win";
import axios from "axios";

const BACKEND = process.env.BACKEND_URL || "https://workforce-backend-production-cc13.up.railway.app";
console.log("[Activity] Backend:", BACKEND);

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
  { name: "TikTok",    keywords: ["tiktok"] },
  { name: "Instagram", keywords: ["instagram"] },
  { name: "Twitter",   keywords: ["twitter", "x.com"] },
  { name: "Netflix",   keywords: ["netflix"] },
  { name: "WhatsApp",  keywords: ["whatsapp"] },
  { name: "Snapchat",  keywords: ["snapchat"] },
];

// ── State ──
let employeeData    = null;
let heartbeatTimer  = null;
let activityTimer   = null;
let mouseEvents     = 0;
let keyEvents       = 0;
let appUsageMap     = {};
let currentAppStart = null;
let lastApp         = "";
let lastWinTitle    = null;
let _uiohook        = null;
let _uiohookActive  = false;
let _pollTimer      = null;
let sessionStart    = null;

// ── Input tracking ──
async function setupInputTracking() {
  try {
    const mod = await import("uiohook-napi");
    const uIOhook = mod.uIOhook || mod.default?.uIOhook;
    if (!uIOhook) throw new Error("uIOhook export nahi mila");
    _uiohook = uIOhook;
    uIOhook.on("mousemove",  () => { mouseEvents++; });
    uIOhook.on("mouseclick", () => { mouseEvents++; });
    uIOhook.on("keydown",    () => { keyEvents++;   });
    uIOhook.start();
    _uiohookActive = true;
    console.log("✅ [Activity] uiohook active");
  } catch (e) {
    console.log("⚠️ [Activity] uiohook nahi mila, window-poll fallback:", e.message);
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
      if (lastWinTitle === null) { lastWinTitle = title; return; }
      if (title !== lastWinTitle) {
        mouseEvents += 3;
        keyEvents   += 2;
        lastWinTitle = title;
      }
    } catch {}
  }, 2000);
}

// ── Smart app name ──
function getSmartAppName(appName, windowTitle) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const blocked of BLOCKED_APPS) {
    if (blocked.keywords.some(k => combined.includes(k))) return blocked.name;
  }
  return appName || "Unknown App";
}

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
  const threshold = _uiohookActive ? 20 : 8;
  return Math.min(100, Math.round(((mouseCount + keyCount) / threshold) * 100));
}

// ── App usage update ──
function updateAppUsage(newApp) {
  const now = Date.now();
  if (lastApp && currentAppStart) {
    const seconds = Math.round((now - currentAppStart) / 1000);
    if (seconds > 0) appUsageMap[lastApp] = (appUsageMap[lastApp] || 0) + seconds;
  }
  lastApp         = newApp;
  currentAppStart = now;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getActiveTime() {
  if (!sessionStart) return "0h 0m";
  return formatTime(Math.round((Date.now() - sessionStart) / 1000));
}

function getActiveMinsToday() {
  if (!sessionStart) return 0;
  return Math.round((Date.now() - sessionStart) / 60000);
}

function getTopApps() {
  const entries = Object.entries(appUsageMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total   = Math.max(entries.reduce((s, [, v]) => s + v, 0), 1);
  return entries.map(([name, secs]) => ({
    name, pct: Math.round((secs / total) * 100), time: formatTime(secs),
  }));
}

// ── Heartbeat ──
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

    const status      = computeStatus(rawApp, winTitle, curMouse, curKey);
    const activityPct = computeActivityPct(curMouse, curKey);

    await axios.post(
      `${BACKEND}/api/employees/heartbeat`,
      {
        employeeId:      employeeData.id,
        activeApp:       smartApp,
        windowTitle:     winTitle,
        mouseEvents:     curMouse,
        keyEvents:       curKey,
        activityPct,
        activeTime:      getActiveTime(),
        activeMinsToday: getActiveMinsToday(),
        topApps:         getTopApps(),
        status,
        isRemote:        false,
        vpnConnected:    false,
      },
      {
        headers: { Authorization: `Bearer ${employeeData.token}` },
        timeout: 10_000,
      }
    );
    console.log(`💓 [Activity] ${smartApp} | ${status} | ${activityPct}%`);
  } catch (err) {
    console.error("❌ [Activity] Heartbeat:", err?.response?.status, err?.response?.data?.message || err.message);
    if (err?.response?.status === 401)
      console.error("⚠️  Token expired — employee dobara login kare");
  }
}

// ── Public API ──
export async function startTracking(empData) {
  employeeData    = empData;
  sessionStart    = Date.now();
  appUsageMap     = {};
  mouseEvents     = 0;
  keyEvents       = 0;
  lastApp         = "";
  lastWinTitle    = null;
  currentAppStart = Date.now();

  console.log(`🟢 [Activity] Started: ${empData.name} → ${BACKEND}`);
  await setupInputTracking();
  await sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 10_000);
}

export async function stopTracking() {
  if (!employeeData) return;

  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (_pollTimer)     { clearInterval(_pollTimer);     _pollTimer     = null; }

  try {
    await axios.post(
      `${BACKEND}/api/employees/go-offline`,
      { employeeId: employeeData.id },
      { headers: { Authorization: `Bearer ${employeeData.token}` }, timeout: 5000 }
    );
    console.log("🔴 [Activity] Employee offline");
  } catch (err) {
    console.error("[Activity] go-offline failed:", err.message);
  }

  if (_uiohook && _uiohookActive) {
    try { _uiohook.stop(); } catch {}
    _uiohook = null;
  }

  employeeData   = null;
  sessionStart   = null;
  _uiohookActive = false;
  lastWinTitle   = null;
  appUsageMap    = {};
  mouseEvents    = 0;
  keyEvents      = 0;
  console.log("⏹️  [Activity] Stopped");
}

export async function cleanupOnQuit() {
  await stopTracking();
}