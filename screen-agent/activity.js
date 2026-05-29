// activity.js — Electron Agent ke liye Complete Activity Tracker
// ✅ ALL BUGS FIXED (Updated):
//   BUG 1 FIX: lastWinTitle initial value — first poll mismatch fix
//   BUG 2 FIX: stopTracking() race condition — go-offline pehle, uiohook baad mein
//   BUG 3 FIX: VITE_ prefix remove — Electron main process mein kaam nahi karta
//   BUG 4 FIX: uiohook-napi robust fallback — window-poll se activity estimate
//   BUG 5 FIX: Railway URL — Vercel URL hata di
//   BUG 6 FIX: Railway cold start errors gracefully handle kiye
//   BUG 7 FIX: sendHeartbeat mein mouseEvents/keyEvents reset race condition fix
//   BUG 8 FIX: employeeData.backendUrl use karo — dynamic backend support
//   BUG 9 FIX: startTracking mein empData validation
//   BUG 10 FIX: go-offline activity.js mein bhi — double-call safe hai

import activeWin from "active-win";
import axios from "axios";

// ✅ BUG 5 + 8 FIXED: BACKEND startTracking ke time empData se milega
//    Fallback ke liye env variable ya hardcoded Railway URL
const DEFAULT_BACKEND =
  process.env.BACKEND_URL ||
  "https://workforce-backend-production-cc13.up.railway.app";

let BACKEND = DEFAULT_BACKEND;

console.log("[Activity] Default Backend URL:", BACKEND);

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

// ✅ FIX: uiohook setup properly — multiple start calls se protect karo
let _trackingActive = false;

async function setupInputTracking() {
  try {
    const { uIOhook } = await import("uiohook-napi");
    _uiohook = uIOhook;

    // ✅ FIX: Pehle listeners lagao, phir start karo
    uIOhook.on("mousemove",  () => { mouseEvents++; });
    uIOhook.on("mouseclick", () => { mouseEvents++; });
    uIOhook.on("keydown",    () => { keyEvents++; });

    uIOhook.start();
    _uiohookActive = true;
    console.log("[Activity] ✅ uiohook active — real mouse/keyboard tracking");
  } catch (e) {
    console.log("[Activity] ⚠ uiohook not available — window-poll fallback:", e.message);
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

      // ✅ BUG 1 FIXED: pehli poll pe sirf lastWinTitle set karo
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
  console.log("[Activity] 🔄 Window-poll fallback started (2s interval)");
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
  const total     = mouseCount + keyCount;
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
    pct:  Math.round((seconds / total) * 100),
    time: formatTime(seconds),
  }));
}

async function sendHeartbeat() {
  // ✅ BUG 9 FIX: employeeData validation — id aur token dono check karo
  if (!employeeData?.token || !employeeData?.id) {
    console.log("[Activity] ⚠️ sendHeartbeat skipped — employeeData incomplete");
    return;
  }

  try {
    const activeWindow = await activeWin().catch(() => null);
    const rawApp       = activeWindow?.owner?.name || "";
    const winTitle     = activeWindow?.title || "";
    const smartApp     = getSmartAppName(rawApp, winTitle);

    if (smartApp !== lastApp) updateAppUsage(smartApp);

    // ✅ BUG 7 FIXED: snapshot lo pehle, phir reset karo
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

    console.log(`[Activity] 💓 Heartbeat | ${smartApp} | ${status} | mouse:${curMouse} key:${curKey}`);
  } catch (err) {
    // ✅ BUG 6 FIXED: Railway-specific errors handle
    if (err.code === "ECONNABORTED" || err.code === "ECONNREFUSED") {
      console.log("[Activity] ⏳ Railway cold start / network — retry next cycle");
      return;
    }
    if (err.code === "ERR_NETWORK") {
      console.log("[Activity] 🔴 Network error — internet check karo");
      return;
    }
    // ✅ FIX: 401 Unauthorized — token expire ho gaya
    if (err?.response?.status === 401) {
      console.log("[Activity] 🔑 Token unauthorized — heartbeat band kar raha hun");
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
      return;
    }
    console.error("[Activity] ❌ Heartbeat error:", err.message);
  }
}

export async function startTracking(empData) {
  // ✅ BUG 9 FIX: Validation pehle
  if (!empData?.id || !empData?.token) {
    console.error("[Activity] ❌ startTracking failed — empData.id or empData.token missing");
    console.error("[Activity] Received empData:", JSON.stringify({ ...empData, token: empData?.token ? "***" : undefined }));
    return;
  }

  // ✅ FIX: Agar pehle se chal raha hai to band karo pehle
  if (_trackingActive) {
    console.log("[Activity] ⚠️ Already tracking — stopping first");
    await stopTracking();
  }

  employeeData = empData;

  // ✅ BUG 8 FIX: empData.backendUrl se BACKEND update karo
  if (empData.backendUrl) {
    BACKEND = empData.backendUrl;
    console.log("[Activity] 🌐 Backend URL updated:", BACKEND);
  }

  sessionStart    = new Date();
  appUsageMap     = {};
  mouseEvents     = 0;
  keyEvents       = 0;
  lastApp         = "";
  lastWinTitle    = null;
  currentAppStart = new Date();
  _trackingActive = true;

  console.log(`[Activity] 🟢 Tracking started → Employee: ${empData.name} (${empData.id}) → ${BACKEND}`);

  await setupInputTracking();

  // ✅ FIX: Pehla heartbeat immediately bhejo
  await sendHeartbeat();

  heartbeatTimer = setInterval(sendHeartbeat, 10_000);
  console.log("[Activity] ✅ Heartbeat interval set (10s)");
}

// ✅ BUG 2 FIXED: go-offline pehle, uiohook.stop() baad mein
export async function stopTracking() {
  if (!_trackingActive && !employeeData) {
    console.log("[Activity] ⚠️ stopTracking called but not active — skipping");
    return;
  }

  console.log("[Activity] ⏹ Stopping tracking...");

  // Timers band karo sabse pehle
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (_pollTimer)     { clearInterval(_pollTimer);     _pollTimer = null;     }

  // Go-offline API call — uiohook se pehle
  if (employeeData?.id && employeeData?.token) {
    try {
      await axios.post(
        `${BACKEND}/api/employees/go-offline`,
        { employeeId: employeeData.id },
        {
          headers: { Authorization: `Bearer ${employeeData.token}` },
          timeout: 5000,
        }
      );
      console.log("[Activity] 🔴 Employee marked offline");
    } catch (err) {
      console.error("[Activity] go-offline error:", err.message);
    }
  }

  // uiohook band karo go-offline ke baad
  if (_uiohook && _uiohookActive) {
    try { _uiohook.stop(); } catch (e) {
      console.log("[Activity] uiohook stop error:", e.message);
    }
  }

  // State reset
  employeeData    = null;
  sessionStart    = null;
  _uiohookActive  = false;
  _trackingActive = false;
  lastWinTitle    = null;
  _uiohook        = null;
  mouseEvents     = 0;
  keyEvents       = 0;

  console.log("[Activity] ✅ Tracking stopped");
}

export async function cleanupOnQuit() {
  await stopTracking();
}