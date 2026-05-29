// index.js — WorkTrack Electron Agent
// ✅ Single file — no activity.js dependency
// ✅ No Cloudinary — base64 directly backend ko jaata hai
// ✅ screenshot-desktop use karta hai (aapka original package)

import pkg from "electron";
const { app, BrowserWindow, ipcMain } = pkg;

import axios from "axios";
import activeWin from "active-win";
import sharp from "sharp";
import screenshot from "screenshot-desktop";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { config } from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
config({ path: path.join(__dirname, ".env") });

// ═══════════════════════════════════════════════════
//  CONFIG
// ═══════════════════════════════════════════════════
const BACKEND  = process.env.BACKEND_URL  || "https://workforce-backend-production-cc13.up.railway.app";
const FRONTEND = process.env.FRONTEND_URL || "https://workforce-frontend-ten.vercel.app";

console.log("🌐 Backend :", BACKEND);
console.log("🖥  Frontend:", FRONTEND);

// ═══════════════════════════════════════════════════
//  FLAGGED APPS
// ═══════════════════════════════════════════════════
const FLAGGED_APPS = [
  { name: "YouTube",   keywords: ["youtube"] },
  { name: "Facebook",  keywords: ["facebook"] },
  { name: "TikTok",    keywords: ["tiktok"] },
  { name: "Instagram", keywords: ["instagram"] },
  { name: "Twitter",   keywords: ["twitter", "x.com"] },
  { name: "Netflix",   keywords: ["netflix"] },
  { name: "WhatsApp",  keywords: ["whatsapp"] },
  { name: "Snapchat",  keywords: ["snapchat"] },
];

// ═══════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════
let employeeData    = null;
let TOKEN_FILE      = null;
let mainWin         = null;
let loginWin        = null;

// Tracking state
let heartbeatTimer  = null;
let captureTimer    = null;
let mouseEvents     = 0;
let keyEvents       = 0;
let sessionStart    = null;
let appUsageMap     = {};
let currentAppStart = null;
let lastApp         = "";
let lastWinTitle    = null;
let _pollTimer      = null;

// uiohook (optional — graceful fallback agar nahi hai)
let _uiohook        = null;
let _uiohookActive  = false;

// ═══════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════
function getSmartAppName(appName, windowTitle) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const b of FLAGGED_APPS)
    if (b.keywords.some(k => combined.includes(k))) return b.name;
  if (windowTitle) {
    const isBrowser = ["chrome", "edge", "firefox", "brave", "opera"]
      .some(b => (appName || "").toLowerCase().includes(b));
    if (isBrowser) {
      const parts = windowTitle.split(" - ");
      return parts.length >= 2 ? parts[0].trim() : windowTitle.split(" | ")[0].trim();
    }
  }
  return appName || "Unknown App";
}

function getFlaggedInfo(appName, windowTitle) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const b of FLAGGED_APPS)
    if (b.keywords.some(k => combined.includes(k)))
      return { isFlagged: true, flaggedAppName: b.name };
  return { isFlagged: false, flaggedAppName: null };
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getActiveTime() {
  if (!sessionStart) return "0h 0m";
  return formatTime(Math.round((new Date() - sessionStart) / 1000));
}

function getActiveMinsToday() {
  if (!sessionStart) return 0;
  return Math.round((new Date() - sessionStart) / 60000);
}

function getTopApps() {
  const entries = Object.entries(appUsageMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total   = entries.reduce((s, [, v]) => s + v, 1);
  return entries.map(([name, seconds]) => ({
    name,
    pct:  Math.round((seconds / total) * 100),
    time: formatTime(seconds),
  }));
}

function updateAppUsage(newApp) {
  const now = new Date();
  if (lastApp && currentAppStart) {
    const seconds = Math.round((now - currentAppStart) / 1000);
    if (seconds > 0) appUsageMap[lastApp] = (appUsageMap[lastApp] || 0) + seconds;
  }
  lastApp = newApp;
  currentAppStart = now;
}

function computeStatus(mouseCount, keyCount) {
  const total = mouseCount + keyCount;
  if (total > 15) return "Working";
  if (total > 0)  return "Active";
  return "Idle";
}

function computeActivityPct(mouseCount, keyCount) {
  const total     = mouseCount + keyCount;
  const threshold = _uiohookActive ? 20 : 8;
  return Math.min(100, Math.round((total / threshold) * 100));
}

// ═══════════════════════════════════════════════════
//  INPUT TRACKING (uiohook optional)
// ═══════════════════════════════════════════════════
async function setupInputTracking() {
  try {
    const { uIOhook } = await import("uiohook-napi");
    _uiohook = uIOhook;
    uIOhook.on("mousemove",  () => { mouseEvents++; });
    uIOhook.on("mouseclick", () => { mouseEvents++; });
    uIOhook.on("keydown",    () => { keyEvents++;   });
    uIOhook.start();
    _uiohookActive = true;
    console.log("✅ uiohook active");
  } catch (e) {
    console.log("⚠️  uiohook nahi mila — window-poll fallback:", e.message);
    _uiohookActive = false;
    startWindowPollFallback();
  }
}

function startWindowPollFallback() {
  if (_pollTimer) return;
  _pollTimer = setInterval(async () => {
    try {
      const w     = await activeWin();
      if (!w) return;
      const title = (w.title || "") + (w.owner?.name || "");
      if (lastWinTitle === null) { lastWinTitle = title; return; }
      if (title && title !== lastWinTitle) {
        mouseEvents += 3;
        keyEvents   += 2;
        lastWinTitle = title;
      }
    } catch {}
  }, 2000);
  console.log("🔄 Window-poll fallback started");
}

// ═══════════════════════════════════════════════════
//  HEARTBEAT — activity data backend ko bhejo
// ═══════════════════════════════════════════════════
async function sendHeartbeat() {
  if (!employeeData?.id || !employeeData?.token) return;

  try {
    const aw       = await activeWin().catch(() => null);
    const rawApp   = aw?.owner?.name || "";
    const winTitle = aw?.title || "";
    const smartApp = getSmartAppName(rawApp, winTitle);

    if (smartApp !== lastApp) updateAppUsage(smartApp);

    // Snapshot reset karo — race condition fix
    const curMouse = mouseEvents; mouseEvents = 0;
    const curKey   = keyEvents;   keyEvents   = 0;

    const status      = computeStatus(curMouse, curKey);
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
        status,
        activeTime:      getActiveTime(),
        activeMinsToday: getActiveMinsToday(),
        topApps:         getTopApps(),
        isRemote:        false,
        vpnConnected:    false,
      },
      {
        headers:  { Authorization: `Bearer ${employeeData.token}` },
        timeout:  10000,
      }
    );
    console.log(`💓 Heartbeat | ${smartApp} | ${status} | 🖱${curMouse} ⌨${curKey}`);
  } catch (err) {
    if (err.code === "ECONNABORTED" || err.code === "ECONNREFUSED" || err.code === "ERR_NETWORK") {
      console.log("⏳ Heartbeat network error — retry next cycle");
      return;
    }
    if (err?.response?.status === 401) {
      console.log("🔑 Heartbeat 401 — token check karo");
      return;
    }
    console.error("❌ Heartbeat error:", err.message);
  }
}

// ═══════════════════════════════════════════════════
//  SCREENSHOT — screenshot-desktop use karta hai
//  No Cloudinary — base64 directly backend ko
// ═══════════════════════════════════════════════════
async function takeScreenshot() {
  // screenshot-desktop se image buffer lo
  const imgBuffer = await screenshot({ format: "png" });
  // sharp se compress karo — size kam karo
  const jpegBuffer = await sharp(imgBuffer)
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 50 })
    .toBuffer();
  return "data:image/jpeg;base64," + jpegBuffer.toString("base64");
}

async function captureScreen() {
  if (!employeeData?.id || !employeeData?.token) return;

  try {
    const aw         = await activeWin().catch(() => null);
    const rawAppName = aw?.owner?.name || "";
    const winTitle   = aw?.title || "";
    const smartApp   = getSmartAppName(rawAppName, winTitle);
    const { isFlagged, flaggedAppName } = getFlaggedInfo(rawAppName, winTitle);

    const imageUrl = await takeScreenshot();

    // ✅ Size check — backend 10MB limit hai
    const sizeMB = Buffer.byteLength(imageUrl, "utf8") / (1024 * 1024);
    if (sizeMB > 9) {
      console.log(`⚠️  Screenshot too large (${sizeMB.toFixed(1)}MB) — skipping`);
      return;
    }

    await axios.post(
      `${BACKEND}/api/screenshots/live`,
      {
        employeeId:   employeeData.id,
        empId:        employeeData.empId,
        employeeName: employeeData.name,
        department:   employeeData.department,
        role:         employeeData.role,
        app:          smartApp,
        windowTitle:  winTitle,
        rawApp:       rawAppName,
        imageUrl,
        isBlocked:    isFlagged,
        blockedApp:   flaggedAppName,
        time:         new Date().toLocaleTimeString(),
        date:         new Date().toLocaleDateString(),
        productivity: isFlagged
          ? Math.floor(Math.random() * 15) + 5
          : Math.floor(Math.random() * 30) + 65,
      },
      {
        headers: { Authorization: `Bearer ${employeeData.token}` },
        timeout: 20000,  // base64 bada hota hai — timeout zyada
        maxContentLength: Infinity,
        maxBodyLength:    Infinity,
      }
    );
    console.log(`📸 Screenshot | ${smartApp} | ${sizeMB.toFixed(1)}MB ${isFlagged ? "🚨" : "✅"}`);
  } catch (err) {
    if (err.code === "ECONNABORTED" || err.code === "ECONNREFUSED") {
      console.log("⏳ Screenshot network error — retry next cycle");
      return;
    }
    console.error("❌ Screenshot error:", err.message);
  }
}

// ═══════════════════════════════════════════════════
//  START / STOP TRACKING
// ═══════════════════════════════════════════════════
async function startAllTracking(empData) {
  employeeData    = empData;
  sessionStart    = new Date();
  appUsageMap     = {};
  mouseEvents     = 0;
  keyEvents       = 0;
  lastApp         = "";
  lastWinTitle    = null;
  currentAppStart = new Date();

  console.log(`\n🚀 Tracking start: ${empData.name} (${empData.id})`);

  // Input tracking setup
  await setupInputTracking();

  // Pehla heartbeat turant
  await sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, 10_000);
  console.log("✅ Heartbeat started (10s)");

  // Screenshot — 5s baad pehla, phir 30s interval
  setTimeout(async () => {
    await captureScreen();
    captureTimer = setInterval(captureScreen, 30_000);
    console.log("✅ Screenshot capture started (30s)");
  }, 5000);

  console.log("✅ All tracking active\n");
}

async function stopAllTracking() {
  console.log("⏹ Stopping tracking...");

  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  if (captureTimer)   { clearInterval(captureTimer);   captureTimer   = null; }
  if (_pollTimer)     { clearInterval(_pollTimer);      _pollTimer     = null; }

  // Go offline
  if (employeeData?.id && employeeData?.token) {
    try {
      await axios.post(
        `${BACKEND}/api/employees/go-offline`,
        { employeeId: employeeData.id },
        { headers: { Authorization: `Bearer ${employeeData.token}` }, timeout: 5000 }
      );
      console.log("🔴 Employee offline");
    } catch (e) {
      console.error("go-offline error:", e.message);
    }
  }

  // uiohook stop
  if (_uiohook && _uiohookActive) {
    try { _uiohook.stop(); } catch {}
  }

  employeeData   = null;
  sessionStart   = null;
  _uiohookActive = false;
  _uiohook       = null;
  lastWinTitle   = null;

  console.log("✅ Tracking stopped\n");
}

// ═══════════════════════════════════════════════════
//  TOKEN PERSISTENCE
// ═══════════════════════════════════════════════════
function initPaths() {
  TOKEN_FILE = path.join(app.getPath("userData"), "wt_emp_token.json");
  console.log("📁 Token file:", TOKEN_FILE);
}

function loadSavedToken() {
  try {
    if (TOKEN_FILE && fs.existsSync(TOKEN_FILE))
      return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  } catch {}
  return null;
}

function saveToken(data) {
  try { if (TOKEN_FILE) fs.writeFileSync(TOKEN_FILE, JSON.stringify(data), "utf8"); } catch {}
}

function clearToken() {
  try { if (TOKEN_FILE && fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE); } catch {}
}

async function validateToken(token) {
  try {
    const res = await axios.get(`${BACKEND}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000,
    });
    return res.data;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════
//  WINDOWS
// ═══════════════════════════════════════════════════
function createLoginWindow() {
  loginWin = new BrowserWindow({
    width: 420, height: 540,
    resizable: false, center: true,
    title: "WorkTrack — Employee Login",
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#0c1017;color:#e2e8f0;
     display:flex;align-items:center;justify-content:center;height:100vh;padding:24px}
.box{width:100%;max-width:340px;background:rgba(255,255,255,.03);
     border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px 28px}
h2{font-size:20px;font-weight:700;color:#fff;margin-bottom:6px}
.sub{font-size:12px;color:#4b5a70;margin-bottom:28px}
label{font-size:11px;font-weight:600;color:#4b5a70;text-transform:uppercase;
      letter-spacing:.08em;display:block;margin-bottom:6px}
input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
      border-radius:9px;padding:10px 14px;font-size:13px;color:#fff;
      margin-bottom:16px;outline:none;font-family:inherit}
input:focus{border-color:rgba(125,195,245,.5)}
button{width:100%;padding:12px;border-radius:9px;
       border:1px solid rgba(125,195,245,.3);background:rgba(125,195,245,.15);
       color:#7dc3f5;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit}
button:hover{background:rgba(125,195,245,.25)}
button:disabled{opacity:.5;cursor:not-allowed}
.err{font-size:12px;color:#fca5a5;text-align:center;margin-top:14px;min-height:18px}
.srv{font-size:10px;color:#2a3a50;text-align:center;margin-top:14px}
</style></head>
<body><div class="box">
  <h2>WorkTrack Agent</h2>
  <div class="sub">Company email se login karein</div>
  <label>Email</label>
  <input type="email" id="em" placeholder="ali@company.com" autocomplete="email"/>
  <label>Password</label>
  <input type="password" id="pw" placeholder="••••••••"/>
  <button id="btn" onclick="go()">Login & Start Monitoring</button>
  <div class="err" id="err"></div>
  <div class="srv" id="srv"></div>
</div>
<script>
const { ipcRenderer } = require('electron');
document.addEventListener('keydown', e => { if (e.key==='Enter') go(); });
ipcRenderer.on('login-error', (_, m) => {
  document.getElementById('err').textContent = m;
  document.getElementById('btn').textContent  = 'Login & Start Monitoring';
  document.getElementById('btn').disabled     = false;
});
ipcRenderer.on('srv-url', (_, u) => {
  document.getElementById('srv').textContent = 'Server: ' + u;
});
function go() {
  const email = document.getElementById('em').value.trim();
  const pwd   = document.getElementById('pw').value;
  if (!email || !pwd) { document.getElementById('err').textContent='Email aur password zarori hain'; return; }
  document.getElementById('err').textContent = '';
  document.getElementById('btn').textContent = 'Connecting...';
  document.getElementById('btn').disabled    = true;
  ipcRenderer.send('do-login', { email, pwd });
}
</script></body></html>`;

  const tmp = path.join(app.getPath("temp"), "wt_login.html");
  fs.writeFileSync(tmp, html);
  loginWin.loadFile(tmp);
  loginWin.webContents.on("did-finish-load", () => {
    loginWin?.webContents.send("srv-url", BACKEND);
  });
  loginWin.on("closed", () => {
    loginWin = null;
    if (!employeeData) app.quit();
  });
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1280, height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  mainWin.loadURL(FRONTEND);
  mainWin.on("closed", () => { mainWin = null; });
  console.log("🖥  Main window:", FRONTEND);
}

// ═══════════════════════════════════════════════════
//  IPC
// ═══════════════════════════════════════════════════
ipcMain.on("do-login", async (event, { email, pwd }) => {
  try {
    console.log("🔐 Login:", email);
    const res = await axios.post(
      `${BACKEND}/api/auth/login`,
      { email, password: pwd, role: "employee" },
      { timeout: 15000 }
    );

    const user    = res.data.user || res.data;
    const empData = {
      token:      res.data.token,
      id:         user?.id || user?._id,
      empId:      user?.empId || user?.id || user?._id,
      name:       user?.name || `${user?.firstName||""} ${user?.lastName||""}`.trim() || user?.email,
      department: user?.department,
      role:       user?.role,
      email:      user?.email,
    };

    console.log("👤 Login response user:", JSON.stringify({ ...empData, token: "***" }));

    if (!empData.id || !empData.token) {
      throw new Error(`Server ne valid data nahi diya. Mila: id=${empData.id}`);
    }

    saveToken(empData);

    if (loginWin) {
      loginWin.removeAllListeners("closed");
      loginWin.close();
      loginWin = null;
    }

    createMainWindow();
    await startAllTracking(empData);

    console.log(`✅ Login success: ${empData.name}`);
  } catch (e) {
    console.error("❌ Login failed:", e?.response?.data || e.message);
    event.sender.send(
      "login-error",
      e?.response?.data?.message || e?.response?.data?.error || `Error: ${e.message}`
    );
  }
});

ipcMain.on("employee-logout", async () => {
  await stopAllTracking();
  clearToken();
  if (mainWin) { mainWin.close(); mainWin = null; }
  createLoginWindow();
});

// ═══════════════════════════════════════════════════
//  APP LIFECYCLE
// ═══════════════════════════════════════════════════
app.whenReady().then(async () => {
  initPaths();

  const saved = loadSavedToken();
  if (saved?.token && saved?.id) {
    console.log("🔍 Token validate ho raha hai...");
    const valid = await validateToken(saved.token);
    if (valid) {
      console.log(`✅ Auto-login: ${saved.name}`);
      createMainWindow();
      await startAllTracking(saved);
    } else {
      console.log("⚠️  Token expire — login karo");
      clearToken();
      createLoginWindow();
    }
  } else {
    createLoginWindow();
  }
});

app.on("before-quit", async (e) => {
  e.preventDefault();
  await stopAllTracking();
  app.exit(0);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});