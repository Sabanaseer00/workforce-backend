// activity.js — Electron Agent ke liye Complete Activity Tracker

import activeWin from "active-win";
import axios from "axios";

// ════════════════════════════════════════════════════════
//  ✅ FIX: BACKEND URL — env variable se lo, localhost nahi
// ════════════════════════════════════════════════════════
const BACKEND = process.env.BACKEND_URL || "https://workforce-backend-production-cc13.up.railway.app";
console.log("[Activity] Backend URL:", BACKEND);

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
let employeeData    = null;
let heartbeatTimer  = null;
let activityTimer   = null;

let mouseEvents = 0;
let keyEvents   = 0;

let appUsageMap = {};
let currentAppStart = null;
let lastApp = "";

// ── Mouse/Keyboard counter setup ──
let _uiohook = null;

async function setupInputTracking() {
  try {
    const { UiohookKey, uIOhook } = await import("uiohook-napi");
    _uiohook = uIOhook;
    uIOhook.on("mousemove", () => { mouseEvents++; });
    uIOhook.on("mouseclick", () => { mouseEvents++; });
    uIOhook.on("keydown", () => { keyEvents++; });
    uIOhook.start();
    console.log("✅ uiohook active — real mouse/keyboard tracking");
  } catch (e) {
    console.log("⚠ uiohook not available — using window poll for activity estimate");
  }
}

// ── Smart app name ──
function getSmartAppName(appName, windowTitle) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const blocked of BLOCKED_APPS) {
    if (blocked.keywords.some(k => combined.includes(k))) {
      return blocked.name;
    }
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
  const total = mouseCount + keyCount;
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
  lastApp         = newApp;
  currentAppStart = now;
}

// ── Format seconds ──
function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

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

// ── HEARTBEAT ──
async function sendHeartbeat() {
  if (!employeeData?.token || !employeeData?.id) return;
  try {
    const activeWindow = await activeWin().catch(() => null);
    const rawApp    = activeWindow?.owner?.name || "";
    const winTitle  = activeWindow?.title       || "";
    const smartApp  = getSmartAppName(rawApp, winTitle);

    if (smartApp !== lastApp) {
      updateAppUsage(smartApp);
    }

    const curMouse = mouseEvents;
    const curKey   = keyEvents;
    mouseEvents = 0;
    keyEvents   = 0;

    const activityPct = computeActivityPct(curMouse, curKey);
    const status      = computeStatus(rawApp, winTitle, curMouse, curKey);
    const activeTime  = getActiveTime();
    const activeMins  = getActiveMinsToday();
    const topApps     = getTopApps();

    // ✅ FIX: Railway deployed backend ko POST karo
    await axios.post(
      `${BACKEND}/api/employees/heartbeat`,
      {
        employeeId:      employeeData.id,
        activeApp:       smartApp,
        windowTitle:     winTitle,
        mouseEvents:     curMouse,
        keyEvents:       curKey,
        activityPct,
        activeTime,
        activeMinsToday: activeMins,
        topApps,
        status,
        isRemote:        false,
        vpnConnected:    false,
      },
      {
        headers: { Authorization: `Bearer ${employeeData.token}` },
        timeout: 8000,
      }
    );

    console.log(
      `💓 Heartbeat | App: ${smartApp} | Status: ${status} | Activity: ${activityPct}% | Active: ${activeTime}`
    );
  } catch (err) {
    // ✅ FIX: Network error pe crash mat karo — sirf log karo
    const msg = err?.response?.data?.message || err.message;
    console.error("❌ Heartbeat error:", msg);
    // Agar 401 aaye toh token expire ho gaya
    if (err?.response?.status === 401) {
      console.error("⚠️ Token expired — employee ko dobara login karna hoga");
    }
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
  console.log(`🌐 Sending data to: ${BACKEND}`);

  await setupInputTracking();
  await sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 10000);
}

// ── LOGOUT — tracking band karo ──
export async function stopTracking() {
  if (!employeeData) return;

  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (activityTimer)  { clearInterval(activityTimer);  activityTimer  = null; }

  if (_uiohook) {
    try { _uiohook.stop(); } catch(e) {}
  }

  try {
    await axios.post(
      `${BACKEND}/api/employees/go-offline`,
      { employeeId: employeeData.id },
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

export async function cleanupOnQuit() {
  await stopTracking();
}