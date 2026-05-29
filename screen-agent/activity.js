// activity.js — Electron Agent ke liye Complete Activity Tracker
// ✅ ALL BUGS FIXED:
//   BUG 1 FIX: lastWinTitle initial value — first poll mismatch fix
//   BUG 2 FIX: stopTracking() race condition — go-offline pehle, uiohook baad mein
//   BUG 3 FIX: VITE_ prefix remove — Electron main process mein kaam nahi karta
//   BUG 4 FIX: uiohook-napi robust fallback — window-poll se activity estimate
//   BUG 5 FIX: Railway URL — Vercel URL hata di
//   BUG 6 FIX: Railway cold start errors gracefully handle kiye
//   BUG 7 FIX: sendHeartbeat mein mouseEvents/keyEvents reset race condition fix

import activeWin from "active-win";
import axios from "axios";

// ✅ BUG 5 FIXED: Railway backend URL
const BACKEND =
  process.env.BACKEND_URL ||
  "https://workforce-backend-production-cc13.up.railway.app";

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
  { name: "TikTok",    keywords: ["tiktok"] },
  { name: "Instagram", keywords: ["instagram"] },
  { name: "Twitter",   keywords: ["twitter", "x.com"] },
  { name: "Netflix",   keywords: ["netflix"] },
  { name: "WhatsApp",  keywords: ["whatsapp"] },
  { name: "Snapchat",  keywords: ["snapchat"] },
];

// ── State ──
let employeeData   = null;
let heartbeatTimer = null;

let mouseEvents = 0;
let keyEvents   = 0;

let appUsageMap     = {};
let currentAppStart = null;
let lastApp         = "";

// ✅ BUG 1 FIXED: null rakha — first poll pe mismatch nahi hoga
let lastWinTitle    = null;

let _uiohook        = null;
let _uiohookActive  = false;
let _pollTimer      = null;

async function setupInputTracking() {
  try {
    const { uIOhook } = await import("uiohook-napi");
    _uiohook = uIOhook;
    uIOhook.on("mousemove",  () => { mouseEvents++; });
    uIOhook.on("mouseclick", () => { mouseEvents++; });
    uIOhook.on("keydown",    () => { keyEvents++; });
    uIOhook.start();
    _uiohookActive = true;
    console.log("✅ uiohook active — real mouse/keyboard tracking");
  } catch (e) {
    console.log("⚠ uiohook not available — window-poll fallback active:", e.message);
    _uiohookActive = false;
    startWindowPollFallback();
  }
}

function startWindowPollFallback() {
  if (_pollTimer) return;
  _pollTimer = setInterval(async () => {
    try {
      const w = await activeWin();
      if (!w) return;
      const title = (w.title || "") + (w.owner?.name || "");

      // ✅ BUG 1 FIXED: pehli poll pe sirf lastWinTitle set karo, count mat karo
      if (lastWinTitle === null) {
        lastWinTitle = title;
        return;
      }

      if (title && title !== lastWinTitle) {
        mouseEvents += 3;
        keyEvents   += 2;
        lastWinTitle = title;
      }
    } catch {}
  }, 2000);
  console.log("🔄 Window-poll fallback started (2s interval)");
}

function getSmartAppName(appName, windowTitle) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const blocked of BLOCKED_APPS) {
    if (blocked.keywords.some(k => combined.includes(k))) {
      return blocked.name;
    }
  }
  return appName || "Unknown App";
}

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

function computeActivityPct(mouseCount, keyCount) {
  const total = mouseCount + keyCount;
  const threshold = _uiohookActive ? 20 : 8;
  return Math.min(100, Math.round((total / threshold) * 100));
}

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
    pct: Math.round((seconds / total) * 100),
    time: formatTime(seconds),
  }));
}

async function sendHeartbeat() {
  if (!employeeData?.token || !employeeData?.id) return;

  try {
    const activeWindow = await activeWin().catch(() => null);
    const rawApp   = activeWindow?.owner?.name || "";
    const winTitle = activeWindow?.title || "";
    const smartApp = getSmartAppName(rawApp, winTitle);

    if (smartApp !== lastApp) updateAppUsage(smartApp);

    // ✅ BUG 7 FIXED: snapshot lo pehle, phir reset karo
    //    Warna agar await ke dauraan events aayein to woh lost ho jaate hain
    const curMouse  = mouseEvents;
    const curKey    = keyEvents;
    mouseEvents     = 0;
    keyEvents       = 0;

    const activityPct = computeActivityPct(curMouse, curKey);
    const status      = computeStatus(rawApp, winTitle, curMouse, curKey);

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
        timeout: 10000,
      }
    );

    console.log(`💓 Heartbeat | ${smartApp} | ${status}`);
  } catch (err) {
    // ✅ BUG 6 FIXED: Railway-specific errors handle
    if (err.code === "ECONNABORTED" || err.code === "ECONNREFUSED") {
      console.log("⏳ Railway cold start / network — retry next cycle");
      return;
    }
    if (err.code === "ERR_NETWORK") {
      console.log("🔴 Network error — internet check karo");
      return;
    }
    console.error("❌ Heartbeat error:", err.message);
  }
}

export async function startTracking(empData) {
  employeeData    = empData;
  sessionStart    = new Date();
  appUsageMap     = {};
  mouseEvents     = 0;
  keyEvents       = 0;
  lastApp         = "";
  lastWinTitle    = null; // ✅ BUG 1: null se shuru — undefined nahi
  currentAppStart = new Date();

  console.log(`🟢 Tracking started → ${BACKEND}`);

  await setupInputTracking();
  await sendHeartbeat();

  heartbeatTimer = setInterval(sendHeartbeat, 10000);
}

// ✅ BUG 2 FIXED: go-offline pehle, uiohook.stop() baad mein
//    Pehle wala code uiohook.stop() pehle karta tha — race condition tha
export async function stopTracking() {
  if (!employeeData) return;

  // Timers band karo sabse pehle
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (_pollTimer)     { clearInterval(_pollTimer);     _pollTimer = null;     }

  // Go-offline API call — uiohook se pehle
  try {
    await axios.post(
      `${BACKEND}/api/employees/go-offline`,
      { employeeId: employeeData.id },
      {
        headers: { Authorization: `Bearer ${employeeData.token}` },
        timeout: 5000,
      }
    );
    console.log("🔴 Employee offline");
  } catch (err) {
    console.error("Go-offline error:", err.message);
  }

  // uiohook band karo go-offline ke baad
  if (_uiohook && _uiohookActive) {
    try { _uiohook.stop(); } catch {}
  }

  // State reset
  employeeData   = null;
  sessionStart   = null;
  _uiohookActive = false;
  lastWinTitle   = null;
  _uiohook       = null;

  console.log("⏹ Tracking stopped");
}

export async function cleanupOnQuit() {
  await stopTracking();
}