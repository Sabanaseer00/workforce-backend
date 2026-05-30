import pkg from "electron";
const { app, BrowserWindow, ipcMain } = pkg;

import axios from "axios";
import activeWin from "active-win";
import sharp from "sharp";
import screenshot from "screenshot-desktop";
import path from "path";
import fs from "fs";
import http from "http";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ═══════════════════════════════════════════════════════════════════════
//  🌐 BACKEND URL — Railway production
// ═══════════════════════════════════════════════════════════════════════
const BACKEND = "https://workforce-backend-production-cc13.up.railway.app";

// Axios instance — production ke liye proper timeouts aur headers
const api = axios.create({
  baseURL: BACKEND,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "Origin": "app://.",           // Electron origin
    "User-Agent": "WorkTrack-Agent/1.0",
  },
});

// Token interceptor — har request mein auto Bearer token lagao
api.interceptors.request.use((config) => {
  if (employeeData?.token) {
    config.headers["Authorization"] = `Bearer ${employeeData.token}`;
  }
  return config;
});

// Response error interceptor — 401 pe auto logout
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401 && employeeData) {
      console.log("🔒 Token expire — auto logout");
      handleLogout();
    }
    return Promise.reject(err);
  }
);

// ═══════════════════════════════════════════════════════════════════════
//  🚫 DISTRACTION APPS LIST — sirf detect karne ke liye (flagging)
// ═══════════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════════
//  🔥 DYNAMIC APP BLOCKER
// ═══════════════════════════════════════════════════════════════════════
const HOSTS_FILE         = "C:\\Windows\\System32\\drivers\\etc\\hosts";
const BLOCK_MARKER_START = "# WORKTRACK_BLOCK_START";
const BLOCK_MARKER_END   = "# WORKTRACK_BLOCK_END";

let _adminBlockedSites = [];

async function fetchAdminBlockedSites() {
  if (!employeeData?.token) return [];
  try {
    const res = await api.get("/api/blocked-sites", { timeout: 8000 });
    const sites = res.data?.sites || res.data || [];
    const domains = sites
      .map(s => (typeof s === "string" ? s : s.domain))
      .filter(Boolean);
    console.log(`🔒 Blocked sites (${domains.length}):`, domains.join(", ") || "none");
    return domains;
  } catch (e) {
    console.log("⚠️ Could not fetch blocked sites:", e.message);
    return [];
  }
}

function applyHostsBlock(sites) {
  try {
    let content = fs.readFileSync(HOSTS_FILE, "utf8");
    const startIdx = content.indexOf(BLOCK_MARKER_START);
    const endIdx   = content.indexOf(BLOCK_MARKER_END);
    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx).trimEnd()
              + "\n"
              + content.slice(endIdx + BLOCK_MARKER_END.length);
    }
    content = content.trim();

    if (sites.length > 0) {
      const blockLines = [];
      sites.forEach(domain => {
        const clean = domain.replace(/^www\./, "");
        blockLines.push(`127.0.0.1   ${clean}`);
        blockLines.push(`127.0.0.1   www.${clean}`);
      });
      content += `\n\n${BLOCK_MARKER_START}\n${blockLines.join("\n")}\n${BLOCK_MARKER_END}\n`;
    } else {
      content += "\n";
    }

    fs.writeFileSync(HOSTS_FILE, content, "utf8");
    execSync("ipconfig /flushdns", { stdio: "ignore" });
    console.log(sites.length > 0 ? `🚫 Hosts: ${sites.length} blocked` : "✅ Hosts: Unblocked");
  } catch (err) {
    console.error("❌ Hosts update failed:", err.message);
  }
}

function applyFirewallBlock(sites) {
  try {
    try {
      execSync(`netsh advfirewall firewall delete rule name="WORKTRACK_*"`, { stdio: "ignore" });
    } catch {}

    sites.forEach(domain => {
      const clean    = domain.replace(/^www\./, "");
      const ruleName = `WORKTRACK_${clean.replace(/\./g, "_")}`;
      try {
        execSync(
          `netsh advfirewall firewall add rule name="${ruleName}" dir=out action=block remotehost="${clean}" enable=yes`,
          { stdio: "ignore" }
        );
      } catch {}
    });

    console.log(sites.length > 0 ? `🔥 Firewall: ${sites.length} blocked` : "✅ Firewall: Cleared");
  } catch (err) {
    console.error("❌ Firewall update failed:", err.message);
  }
}

async function blockEverything() {
  console.log("🚫 Admin blocked sites fetch ho rahi hain...");
  _adminBlockedSites = await fetchAdminBlockedSites();
  applyHostsBlock(_adminBlockedSites);
  applyFirewallBlock(_adminBlockedSites);
}

function unblockEverything() {
  console.log("✅ Sab unblock ho raha hai...");
  applyHostsBlock([]);
  applyFirewallBlock([]);
  _adminBlockedSites = [];
}

async function refreshAdminBlockedSites() {
  if (!employeeData?.token) return;
  const newSites = await fetchAdminBlockedSites();
  const changed  =
    newSites.length !== _adminBlockedSites.length ||
    newSites.some(s => !_adminBlockedSites.includes(s));

  if (changed) {
    console.log("🔄 Blocked sites update — re-applying...");
    _adminBlockedSites = newSites;
    applyHostsBlock(_adminBlockedSites);
    applyFirewallBlock(_adminBlockedSites);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  TASK TRACKER
// ═══════════════════════════════════════════════════════════════════════
let _ttToken    = null;
let _ttEmpId    = null;
let _ttTasks    = [];
let _ttActiveId = null;
let _ttTimer    = null;
let _ttSocket   = null;
let _idleCount  = 0;
let _fetchCtr   = 0;

const IDLE_THRESHOLD = 4;
const TT_CHECK_INTERVAL = 15_000;

const SYSTEM_IDLE_WINDOWS = [
  "lock screen", "sign in", "windows security",
  "screen saver", "screensaver",
];

function isSystemIdle(title) {
  if (!title || title.trim().length === 0) return true;
  const tl = title.toLowerCase().trim();
  if (tl.length < 2) return true;
  return SYSTEM_IDLE_WINDOWS.some(p => tl.includes(p));
}

// Task API — Railway backend ke liye https use karo
function ttApi(endpoint, method = "GET", body = null) {
  return new Promise((resolve, reject) => {
    const data    = body ? JSON.stringify(body) : null;
    const url     = new URL(BACKEND + "/api" + endpoint);
    const options = {
      hostname: url.hostname,
      port:     443,
      path:     url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent":   "WorkTrack-Agent/1.0",
        ...(_ttToken && { Authorization: `Bearer ${_ttToken}` }),
        ...(data && { "Content-Length": Buffer.byteLength(data) }),
      },
    };

    const https = await import("https").then(m => m.default || m);
    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", c => (raw += c));
      res.on("end", () => {
        if (res.statusCode === 204) return resolve(null);
        if (res.statusCode >= 400)
          return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
    if (data) req.write(data);
    req.end();
  });
}

// ttApi async wrapper fix — https import inside sync function nahi ho sakta
async function ttApiCall(endpoint, method = "GET", body = null) {
  const https = (await import("https")).default;
  return new Promise((resolve, reject) => {
    const data    = body ? JSON.stringify(body) : null;
    const url     = new URL(BACKEND + "/api" + endpoint);
    const options = {
      hostname: url.hostname,
      port:     443,
      path:     url.pathname + url.search,
      method,
      headers: {
        "Content-Type": "application/json",
        "User-Agent":   "WorkTrack-Agent/1.0",
        ...(_ttToken && { Authorization: `Bearer ${_ttToken}` }),
        ...(data && { "Content-Length": Buffer.byteLength(data) }),
      },
    };

    const req = https.request(options, (res) => {
      let raw = "";
      res.on("data", c => (raw += c));
      res.on("end", () => {
        if (res.statusCode === 204) return resolve(null);
        if (res.statusCode >= 400)
          return reject(new Error(`HTTP ${res.statusCode}: ${raw.slice(0, 200)}`));
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("Timeout")); });
    if (data) req.write(data);
    req.end();
  });
}

async function ttFetch() {
  if (!_ttToken) return;
  try {
    let tasks = null;
    try { tasks = await ttApiCall("/tasks/mine"); } catch {}
    if (!Array.isArray(tasks)) {
      try {
        const all = await ttApiCall("/tasks");
        if (Array.isArray(all)) {
          tasks = all.filter(t =>
            String(t.assigned_to?._id ?? t.assigned_to ?? "") === String(_ttEmpId)
          );
        }
      } catch (e) { console.log("[TT] fetch error:", e.message); return; }
    }
    if (Array.isArray(tasks)) {
      _ttTasks = tasks;
      console.log(`[TT] ${tasks.length} tasks:`, tasks.map(t => `${t.title}(${t.status})`).join(", "));
    }
  } catch (e) { console.log("[TT] fetch error:", e.message); }
}

async function ttPatch(taskId, newStatus) {
  try {
    await ttApiCall(`/tasks/${taskId}/status`, "PATCH", { status: newStatus });
    console.log(`[TT] ✅ Task ${taskId} → ${newStatus}`);
    _ttTasks = _ttTasks.map(t =>
      String(t._id || t.id) === String(taskId) ? { ...t, status: newStatus } : t
    );
    if (_ttSocket?.connected) {
      _ttSocket.emit("task:statusUpdate", { taskId, status: newStatus, employeeId: _ttEmpId });
    }
    return true;
  } catch (e) {
    console.log(`[TT] ❌ PATCH failed: ${e.message}`);
    try {
      const task = _ttTasks.find(t => String(t._id || t.id) === String(taskId));
      if (task) {
        await ttApiCall(`/tasks/${taskId}`, "PUT", {
          assigned_to:  String(task.assigned_to?._id ?? task.assigned_to ?? ""),
          title:        task.title,
          description:  task.description || "",
          priority:     task.priority || "medium",
          status:       newStatus,
          due_date:     task.due_date || null,
        });
        _ttTasks = _ttTasks.map(t =>
          String(t._id || t.id) === String(taskId) ? { ...t, status: newStatus } : t
        );
        if (_ttSocket?.connected) {
          _ttSocket.emit("task:statusUpdate", { taskId, status: newStatus, employeeId: _ttEmpId });
        }
        console.log(`[TT] ✅ PUT fallback OK`);
        return true;
      }
    } catch (e2) { console.log(`[TT] ❌ PUT also failed: ${e2.message}`); }
    return false;
  }
}

async function ttCheck() {
  if (!_ttToken || !_ttEmpId) return;
  try {
    _fetchCtr++;
    if (_fetchCtr >= 3 || _ttTasks.length === 0) {
      await ttFetch();
      _fetchCtr = 0;
    }

    const win   = await activeWin().catch(() => null);
    const title = win?.title || win?.owner?.name || "";
    console.log(`[TT] Active: "${title.slice(0, 60)}"`);

    let isIdle = isSystemIdle(title);
    try {
      const idleSecs = pkg.powerMonitor.getSystemIdleTime();
      if (idleSecs > 120) { isIdle = true; console.log(`[TT] Idle: ${idleSecs}s`); }
    } catch {}

    const pending    = _ttTasks.filter(t => t.status === "pending");
    const inProgress = _ttTasks.filter(t => t.status === "in_progress");

    if (isIdle) {
      if (_ttActiveId) {
        _idleCount++;
        if (_idleCount >= IDLE_THRESHOLD) {
          const active = _ttTasks.find(t => String(t._id || t.id) === _ttActiveId);
          if (active?.status === "in_progress") {
            await ttPatch(_ttActiveId, "pending");
            _ttActiveId = null;
            _idleCount  = 0;
            _fetchCtr   = 3;
          }
        }
      }
      return;
    }

    _idleCount = 0;

    if (pending.length > 0) {
      const tid = String(pending[0]._id || pending[0].id);
      const ok  = await ttPatch(tid, "in_progress");
      if (ok) { _ttActiveId = tid; _fetchCtr = 3; }
      return;
    }

    if (inProgress.length > 0) {
      _ttActiveId = String(inProgress[0]._id || inProgress[0].id);
    }
  } catch (e) { console.log("[TT] check error:", e.message); }
}

async function ttSocketConnect() {
  try {
    let ioFn;
    try {
      const m = await import("socket.io-client");
      ioFn = m.io || m.default;
    } catch {
      console.log("[TT] socket.io-client not available");
      return;
    }

    // Railway backend WebSocket — wss:// use hoga
    _ttSocket = ioFn(BACKEND, {
      transports:    ["websocket", "polling"],
      auth:          { token: _ttToken },
      reconnection:  true,
      reconnectionDelay: 3000,
      timeout:       10000,
    });

    _ttSocket.on("connect", () => {
      console.log("[TT] Socket connected to Railway");
      _ttSocket.emit("join", `emp_${_ttEmpId}`);
      _ttSocket.emit("join", "admins");
    });

    _ttSocket.on("task:new",    ()  => ttFetch());
    _ttSocket.on("task:update", (p) => {
      _ttTasks = _ttTasks.map(t =>
        String(t._id || t.id) === String(p._id || p.taskId) ? { ...t, ...p } : t
      );
    });
    _ttSocket.on("blockedSites:update", () => {
      console.log("🔔 Admin ne blocked sites update ki...");
      refreshAdminBlockedSites();
    });

    _ttSocket.on("disconnect",    () => console.log("[TT] Socket disconnected"));
    _ttSocket.on("connect_error", (e) => console.log("[TT] Socket error:", e.message));
  } catch (e) { console.log("[TT] socket setup error:", e.message); }
}

async function ttStart(token, empId) {
  _ttToken = token;
  _ttEmpId = empId;
  console.log(`[TT] Starting for: ${empId}`);
  await ttFetch();
  await ttSocketConnect();
  ttCheck();
  _ttTimer = setInterval(ttCheck, TT_CHECK_INTERVAL);
}

function ttStop() {
  if (_ttTimer)  clearInterval(_ttTimer);
  if (_ttSocket) _ttSocket.disconnect();
  _ttTimer    = null;
  _ttSocket   = null;
  _ttActiveId = null;
  _idleCount  = 0;
  console.log("[TT] Stopped");
}

// ═══════════════════════════════════════════════════════════════════════
//  ACTIVITY TRACKING
// ═══════════════════════════════════════════════════════════════════════
let _mouseEvents     = 0;
let _keyEvents       = 0;
let _sessionStart    = null;
let _appUsageMap     = {};
let _lastApp         = "";
let _currentAppStart = null;

function updateAppUsage(newApp) {
  const now = new Date();
  if (_lastApp && _currentAppStart) {
    const seconds = Math.round((now - _currentAppStart) / 1000);
    if (seconds > 0) _appUsageMap[_lastApp] = (_appUsageMap[_lastApp] || 0) + seconds;
  }
  _lastApp         = newApp;
  _currentAppStart = now;
}

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

function getActiveTime() {
  if (!_sessionStart) return "0h 0m";
  return formatTime(Math.round((new Date() - _sessionStart) / 1000));
}

function getActiveMinsToday() {
  if (!_sessionStart) return 0;
  return Math.round((new Date() - _sessionStart) / 1000 / 60);
}

function getTopApps() {
  const entries = Object.entries(_appUsageMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const total   = entries.reduce((s, [, v]) => s + v, 1);
  return entries.map(([name, seconds]) => ({
    name,
    pct:  Math.round((seconds / total) * 100),
    time: formatTime(seconds),
  }));
}

// ═══════════════════════════════════════════════════════════════════════
//  APP / WINDOW HELPERS
// ═══════════════════════════════════════════════════════════════════════
function getSmartAppName(appName, windowTitle) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const b of FLAGGED_APPS) {
    if (b.keywords.some(k => combined.includes(k))) return b.name;
  }
  if (windowTitle) {
    const isBrowser = ["chrome", "edge", "firefox", "brave", "opera"].some(b =>
      (appName || "").toLowerCase().includes(b)
    );
    if (isBrowser) {
      const p = windowTitle.split(" - ");
      return p.length >= 2 ? p[0].trim() : windowTitle.split(" | ")[0].trim();
    }
  }
  return appName || "Unknown App";
}

function getFlaggedInfo(appName, windowTitle) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const b of FLAGGED_APPS) {
    if (b.keywords.some(k => combined.includes(k)))
      return { isFlagged: true, flaggedAppName: b.name };
  }
  return { isFlagged: false, flaggedAppName: null };
}

// ═══════════════════════════════════════════════════════════════════════
//  SCREENSHOT — screenshot-desktop (Electron 35+ compatible)
// ═══════════════════════════════════════════════════════════════════════
async function takeScreenshot() {
  try {
    const imgBuffer  = await screenshot({ format: "png" });
    const jpegBuffer = await sharp(imgBuffer).jpeg({ quality: 60 }).toBuffer();
    return jpegBuffer;
  } catch (err) {
    console.error("❌ Screenshot failed:", err.message);
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  HEARTBEAT — Railway backend
// ═══════════════════════════════════════════════════════════════════════
async function sendHeartbeat(activeApp, windowTitle) {
  if (!employeeData?.id || !employeeData?.token) return;

  const curMouse = _mouseEvents;
  const curKey   = _keyEvents;
  _mouseEvents   = 0;
  _keyEvents     = 0;

  const activityPct = Math.min(100, Math.round(((curMouse + curKey) / 20) * 100));

  // Status compute
  let status = "Idle";
  try {
    const idleSecs = pkg.powerMonitor.getSystemIdleTime?.() ?? 0;
    if (idleSecs < 120) status = activeApp ? "Working" : "Active";
  } catch {
    status = activeApp ? "Working" : "Active";
  }

  try {
    await api.post("/api/employees/heartbeat", {
      employeeId:      employeeData.id,
      activeApp,
      windowTitle,
      mouseEvents:     curMouse,
      keyEvents:       curKey,
      activityPct,
      activeTime:      getActiveTime(),
      activeMinsToday: getActiveMinsToday(),
      topApps:         getTopApps(),
      status,
      isRemote:        false,
      vpnConnected:    false,
    });
    console.log(`💓 Heartbeat | ${activeApp} | ${status} | ${activityPct}% | ${getActiveTime()}`);
  } catch (e) {
    console.log("❌ Heartbeat error:", e?.response?.data?.message || e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  MAIN CAPTURE LOOP
// ═══════════════════════════════════════════════════════════════════════
let mainWin         = null;
let loginWin        = null;
let captureInterval = null;
let employeeData    = null;
let TOKEN_FILE      = null;

async function captureScreen() {
  if (!employeeData) return;
  try {
    const aw          = await activeWin().catch(() => null);
    const rawAppName  = aw?.owner?.name || "";
    const windowTitle = aw?.title       || "";
    const smartApp    = getSmartAppName(rawAppName, windowTitle);
    const { isFlagged, flaggedAppName } = getFlaggedInfo(rawAppName, windowTitle);

    // App usage track
    if (smartApp !== _lastApp) {
      updateAppUsage(smartApp);
      _mouseEvents += 2; // window change = activity signal
    }

    // Heartbeat
    await sendHeartbeat(smartApp, windowTitle);

    // Screenshot
    let base64 = null;
    try {
      const buf = await takeScreenshot();
      base64    = "data:image/jpeg;base64," + buf.toString("base64");
    } catch (screenshotErr) {
      console.log("⚠️ Screenshot skip:", screenshotErr.message);
    }

    if (base64) {
      await api.post("/api/screenshots/live", {
        employeeId:   employeeData.id,
        empId:        employeeData.empId,
        employeeName: employeeData.name,
        department:   employeeData.department,
        role:         employeeData.role,
        app:          smartApp,
        windowTitle,
        rawApp:       rawAppName,
        imageUrl:     base64,
        isBlocked:    isFlagged,
        blockedApp:   flaggedAppName,
        time:         new Date().toLocaleTimeString(),
        date:         new Date().toLocaleDateString(),
        productivity: isFlagged
          ? Math.floor(Math.random() * 15) + 5
          : Math.floor(Math.random() * 30) + 65,
      }, { timeout: 20000 }); // screenshot bada hota hai — zyada timeout

      console.log(`📸 ${employeeData.name} | ${smartApp} ${isFlagged ? "🚨 FLAGGED" : "✅"}`);
    }
  } catch (e) {
    console.log("❌ Capture error:", e?.response?.data?.message || e.message);
  }
}

function startCapture() {
  if (captureInterval) clearInterval(captureInterval);
  _sessionStart    = new Date();
  _appUsageMap     = {};
  _mouseEvents     = 0;
  _keyEvents       = 0;
  _lastApp         = "";
  _currentAppStart = new Date();

  console.log("🎬 Capture loop starting — Railway backend");
  captureScreen();
  captureInterval = setInterval(captureScreen, 10000);
}

function stopCapture() {
  if (captureInterval) clearInterval(captureInterval);
  captureInterval = null;
  _sessionStart   = null;
}

// ═══════════════════════════════════════════════════════════════════════
//  OFFLINE SIGNAL
// ═══════════════════════════════════════════════════════════════════════
async function goOffline() {
  if (!employeeData?.id || !employeeData?.token) return;
  try {
    await api.post("/api/employees/go-offline", { employeeId: employeeData.id }, { timeout: 5000 });
    console.log("🔴 Offline signal sent");
  } catch (e) {
    console.log("⚠️ Go-offline error:", e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
//  TOKEN HELPERS
// ═══════════════════════════════════════════════════════════════════════
function initPaths() {
  TOKEN_FILE = path.join(app.getPath("userData"), "emp_token.json");
  console.log("📁 Token Path:", TOKEN_FILE);
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
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent":  "WorkTrack-Agent/1.0",
      },
      timeout: 8000,
    });
    return res.data;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════════════
//  LOGIN WINDOW
// ═══════════════════════════════════════════════════════════════════════
function createLoginWindow() {
  loginWin = new BrowserWindow({
    width: 420, height: 520, resizable: false, center: true, frame: true,
    title: "Employee Login",
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  const loginHTML = `<!DOCTYPE html>
<html><head><style>
* { box-sizing:border-box; margin:0; padding:0; }
body { font-family:'Segoe UI',sans-serif; background:#0c1017; color:#e2e8f0; display:flex; align-items:center; justify-content:center; height:100vh; padding:24px; }
.box { width:100%; max-width:340px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:32px 28px; }
h2 { font-size:20px; font-weight:700; color:#fff; margin-bottom:6px; }
p { font-size:12px; color:#4b5a70; margin-bottom:24px; }
label { font-size:11px; font-weight:600; color:#4b5a70; text-transform:uppercase; letter-spacing:0.08em; display:block; margin-bottom:6px; }
input { width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); border-radius:9px; padding:10px 14px; font-size:13px; color:#fff; margin-bottom:16px; outline:none; font-family:inherit; }
input:focus { border-color:rgba(125,195,245,0.5); }
button { width:100%; padding:11px; border-radius:9px; border:1px solid rgba(125,195,245,0.3); background:rgba(125,195,245,0.15); color:#7dc3f5; font-size:13px; font-weight:700; cursor:pointer; font-family:inherit; margin-top:4px; }
button:hover { background:rgba(125,195,245,0.25); }
.error { font-size:12px; color:#fca5a5; text-align:center; margin-top:12px; min-height:20px; }
.server { font-size:10px; color:#2a3a4a; text-align:center; margin-top:8px; }
</style></head>
<body><div class="box">
<h2>Employee Login</h2><p>Apni company email se login karein</p>
<label>Email</label><input type="email" id="email" placeholder="ali@company.com"/>
<label>Password</label><input type="password" id="pwd" placeholder="••••••••"/>
<button id="btn" onclick="doLogin()">Login & Start Monitoring</button>
<div class="error" id="err"></div>
<div class="server">workforce-backend-production-cc13.up.railway.app</div>
</div>
<script>
const { ipcRenderer } = require('electron');
document.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
ipcRenderer.on('login-error', (_, msg) => {
  document.getElementById('err').textContent = msg;
  document.getElementById('btn').textContent = 'Login & Start Monitoring';
  document.getElementById('btn').disabled = false;
});
function doLogin() {
  const email = document.getElementById('email').value.trim();
  const pwd   = document.getElementById('pwd').value;
  if (!email || !pwd) {
    document.getElementById('err').textContent = 'Email aur password zarori hain';
    return;
  }
  document.getElementById('btn').textContent = 'Connecting to server...';
  document.getElementById('btn').disabled = true;
  ipcRenderer.send('do-login', { email, pwd });
}
</script></body></html>`;

  const tmpPath = path.join(app.getPath("temp"), "login.html");
  fs.writeFileSync(tmpPath, loginHTML);
  loginWin.loadFile(tmpPath);
  loginWin.on("closed", () => {
    loginWin = null;
    if (!employeeData) app.quit();
  });
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  // Frontend — Vercel URL ya localhost
  const FRONTEND = "https://workforce-frontend-ten.vercel.app";
  mainWin.loadURL(FRONTEND);
  mainWin.on("closed", () => { mainWin = null; });
}

// ═══════════════════════════════════════════════════════════════════════
//  LOGOUT HELPER (reusable — token expire pe bhi)
// ═══════════════════════════════════════════════════════════════════════
async function handleLogout() {
  console.log("🔄 Logout...");
  stopCapture();
  ttStop();
  await goOffline();
  unblockEverything();
  clearToken();
  employeeData = null;
  if (mainWin) { mainWin.close(); mainWin = null; }
  createLoginWindow();
}

// ═══════════════════════════════════════════════════════════════════════
//  IPC HANDLERS
// ═══════════════════════════════════════════════════════════════════════
ipcMain.on("employee-logout", async () => { await handleLogout(); });

ipcMain.on("do-login", async (event, { email, pwd }) => {
  try {
    const res = await axios.post(
      `${BACKEND}/api/auth/login`,
      { email, password: pwd, role: "employee" },
      {
        headers: {
          "Content-Type": "application/json",
          "User-Agent":   "WorkTrack-Agent/1.0",
        },
        timeout: 15000,
      }
    );

    const user = res.data.user || res.data;
    employeeData = {
      token:      res.data.token,
      id:         user?.id || user?._id,
      empId:      user?.empId || user?.id || user?._id,
      name:       user?.name || `${user?.firstName || ""} ${user?.lastName || ""}`.trim(),
      department: user?.department,
      role:       user?.role,
      email:      user?.email,
    };

    saveToken(employeeData);
    console.log(`✅ Login OK: ${employeeData.name} (${employeeData.id})`);

    if (loginWin) { loginWin.removeAllListeners("closed"); loginWin.close(); loginWin = null; }

    createMainWindow();
    startCapture();
    ttStart(employeeData.token, employeeData.id);
    await blockEverything();

  } catch (e) {
    const msg = e?.response?.data?.message || e?.response?.data?.error || e.message || "Login failed";
    console.log("❌ Login error:", msg);
    event.sender.send("login-error", msg);
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  APP LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════
app.whenReady().then(async () => {
  initPaths();

  const saved = loadSavedToken();
  if (saved?.token && saved?.id) {
    console.log("🔍 Saved token validate ho raha hai — Railway backend...");
    const valid = await validateToken(saved.token);
    if (valid) {
      employeeData = saved;
      console.log(`✅ Auto-login: ${employeeData.name}`);
      createMainWindow();
      startCapture();
      ttStart(employeeData.token, employeeData.id);
      await blockEverything();
    } else {
      console.log("⚠️ Token expire — login page");
      clearToken();
      createLoginWindow();
    }
  } else {
    createLoginWindow();
  }
});

app.on("before-quit", async (e) => {
  e.preventDefault();
  stopCapture();
  ttStop();
  await goOffline();
  unblockEverything();
  app.exit(0);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});