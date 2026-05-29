import "dotenv/config";
import pkg from "electron";
const { app, BrowserWindow, ipcMain, desktopCapturer } = pkg;

import axios from "axios";
import activeWin from "active-win";
import sharp from "sharp";
import path from "path";
import fs from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const BACKEND = process.env.BACKEND_URL || "https://workforce-backend-dusky.vercel.app";

// ═══════════════════════════════════════════════════════════════════════
//  🚫 DISTRACTION APPS LIST — sirf detect karne ke liye (flagging)
//  Yeh list BLOCK karne ke liye nahi, sirf screenshot/heartbeat mein
//  "flagged" mark karne ke liye hai.
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
//  Admin Chrome extension se jo sites block kare, wohi yahan aayengi.
//  Hardcoded list nahi — backend se fetch hogi.
// ═══════════════════════════════════════════════════════════════════════

const HOSTS_FILE         = "C:\\Windows\\System32\\drivers\\etc\\hosts";
const BLOCK_MARKER_START = "# WORKTRACK_BLOCK_START";
const BLOCK_MARKER_END   = "# WORKTRACK_BLOCK_END";

// Runtime mein admin-blocked sites store hoti hain
let _adminBlockedSites = [];

// ── Backend se admin-blocked sites fetch karo ──
async function fetchAdminBlockedSites() {
  if (!employeeData?.token) return [];
  try {
    const res = await axios.get(`${BACKEND}/api/blocked-apps/sites`, {
      headers: { Authorization: `Bearer ${employeeData.token}` },
      timeout: 5000,
    });
    // Backend array of { domain: "youtube.com" } ya sirf strings return kare
    const sites = res.data?.sites || res.data || [];
    const domains = sites.map(s => (typeof s === "string" ? s : s.domain)).filter(Boolean);
    console.log(`🔒 Admin blocked sites fetched (${domains.length}):`, domains.join(", ") || "none");
    return domains;
  } catch (e) {
    console.log("⚠️ Could not fetch blocked sites:", e.message);
    return [];
  }
}

// ── Hosts file update karo (sirf admin-blocked sites ke liye) ──
function applyHostsBlock(sites) {
  try {
    let content = fs.readFileSync(HOSTS_FILE, "utf8");

    // Pehle purani WorkTrack entries hata do
    const startIdx = content.indexOf(BLOCK_MARKER_START);
    const endIdx   = content.indexOf(BLOCK_MARKER_END);
    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx).trimEnd()
              + "\n"
              + content.slice(endIdx + BLOCK_MARKER_END.length);
    }
    content = content.trim();

    // Agar koi site block karni hai tabhi entries likho
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

    if (sites.length > 0) {
      console.log(`🚫 Hosts: ${sites.length} site(s) blocked`);
    } else {
      console.log("✅ Hosts: All sites unblocked");
    }
  } catch (err) {
    console.error("❌ Hosts update failed:", err.message);
  }
}

// ── Firewall rules update karo (sirf admin-blocked sites ke liye) ──
function applyFirewallBlock(sites) {
  try {
    // Pehle sab purane WorkTrack firewall rules hatao
    try {
      execSync(
        `netsh advfirewall firewall delete rule name="WORKTRACK_*"`,
        { stdio: "ignore" }
      );
    } catch {}

    // Naye rules sirf admin-blocked sites ke liye banao
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

    if (sites.length > 0) {
      console.log(`🔥 Firewall: ${sites.length} site(s) blocked`);
    } else {
      console.log("✅ Firewall: All WorkTrack rules removed");
    }
  } catch (err) {
    console.error("❌ Firewall update failed:", err.message);
  }
}

// ── MAIN: Admin sites fetch karke block karo ──
async function blockEverything() {
  console.log("🚫 Work mode ON — admin blocked sites fetch ho rahi hain...");
  _adminBlockedSites = await fetchAdminBlockedSites();
  applyHostsBlock(_adminBlockedSites);
  applyFirewallBlock(_adminBlockedSites);
  if (_adminBlockedSites.length === 0) {
    console.log("ℹ️ Abhi admin ne koi site block nahi ki.");
  } else {
    console.log("🚫 Admin blocked sites apply ho gayi!");
  }
}

// ── MAIN: Sab unblock karo ──
function unblockEverything() {
  console.log("✅ Work mode OFF — sab unblock ho raha hai...");
  applyHostsBlock([]);      // Hosts entries hata do
  applyFirewallBlock([]);   // Firewall rules hata do
  _adminBlockedSites = [];
  console.log("✅ Everything unblocked!");
}

// ── Admin ne naya site block/unblock kiya toh real-time update ──
// (Socket event ya polling se call karo)
async function refreshAdminBlockedSites() {
  if (!employeeData?.token) return;
  const newSites = await fetchAdminBlockedSites();
  const changed  =
    newSites.length !== _adminBlockedSites.length ||
    newSites.some(s => !_adminBlockedSites.includes(s));

  if (changed) {
    console.log("🔄 Admin blocked sites update ho gayi — re-applying...");
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
const CHECK_INTERVAL = 15_000;

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

async function ttApi(path, method = "GET", body = null) {
  const headers = { "Content-Type": "application/json" };
  if (_ttToken) headers["Authorization"] = `Bearer ${_ttToken}`;
  const res = await axios({
    method,
    url: BACKEND + "/api" + path,
    headers,
    data: body || undefined,
    timeout: 8000,
  });
  return res.data;
}

async function ttFetch() {
  if (!_ttToken) return;
  try {
    let tasks = null;
    try { tasks = await ttApi("/tasks/mine"); } catch {}
    if (!Array.isArray(tasks)) {
      try {
        const all = await ttApi("/tasks");
        if (Array.isArray(all)) {
          tasks = all.filter(t =>
            String(t.assigned_to?._id ?? t.assigned_to ?? "") === String(_ttEmpId)
          );
        }
      } catch (e) { console.log("[TT] fetch error:", e.message); return; }
    }
    if (Array.isArray(tasks)) {
      _ttTasks = tasks;
      console.log(`[TT] ${tasks.length} tasks:`, tasks.map(t=>`${t.title}(${t.status})`).join(", "));
    }
  } catch (e) { console.log("[TT] fetch error:", e.message); }
}

async function ttPatch(taskId, newStatus) {
  try {
    await ttApi(`/tasks/${taskId}/status`, "PATCH", { status: newStatus });
    console.log(`[TT] ✅ Task ${taskId} → ${newStatus}`);
    _ttTasks = _ttTasks.map(t =>
      String(t._id||t.id) === String(taskId) ? {...t, status: newStatus} : t
    );
    if (_ttSocket?.connected) {
      _ttSocket.emit("task:statusUpdate", { taskId, status: newStatus, employeeId: _ttEmpId });
    }
    return true;
  } catch (e) {
    console.log(`[TT] ❌ PATCH failed: ${e.message}`);
    try {
      const task = _ttTasks.find(t => String(t._id||t.id) === String(taskId));
      if (task) {
        await ttApi(`/tasks/${taskId}`, "PUT", {
          assigned_to:  String(task.assigned_to?._id ?? task.assigned_to ?? ""),
          title:        task.title,
          description:  task.description || "",
          priority:     task.priority || "medium",
          status:       newStatus,
          due_date:     task.due_date || null,
        });
        _ttTasks = _ttTasks.map(t =>
          String(t._id||t.id) === String(taskId) ? {...t, status: newStatus} : t
        );
        if (_ttSocket?.connected) {
          _ttSocket.emit("task:statusUpdate", { taskId, status: newStatus, employeeId: _ttEmpId });
        }
        console.log(`[TT] ✅ PUT fallback: ${newStatus}`);
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

    const win   = await activeWin();
    const title = win?.title || win?.owner?.name || "";
    console.log(`[TT] Active window: "${title.slice(0, 70)}"`);

    let isIdle = isSystemIdle(title);
    try {
      const { powerMonitor } = pkg;
      const idleSecs = powerMonitor.getSystemIdleTime();
      if (idleSecs > 120) { isIdle = true; console.log(`[TT] System idle: ${idleSecs}s`); }
    } catch {}

    const pending    = _ttTasks.filter(t => t.status === "pending");
    const inProgress = _ttTasks.filter(t => t.status === "in_progress");

    if (isIdle) {
      if (_ttActiveId) {
        _idleCount++;
        if (_idleCount >= IDLE_THRESHOLD) {
          const active = _ttTasks.find(t => String(t._id||t.id) === _ttActiveId);
          if (active?.status === "in_progress") {
            await ttPatch(_ttActiveId, "pending");
            _ttActiveId = null; _idleCount = 0; _fetchCtr = 3;
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

async function ttSocket() {
  try {
    let ioFn;
    try {
      const m = await import("socket.io-client");
      ioFn = m.io || m.default;
    } catch {
      console.log("[TT] socket.io-client not installed");
      return;
    }
    _ttSocket = ioFn(BACKEND, {
      transports: ["websocket", "polling"],
      auth: { token: _ttToken },
      reconnection: true,
    });
    _ttSocket.on("connect", () => {
      console.log("[TT] Socket connected");
      _ttSocket.emit("join", `emp_${_ttEmpId}`);
      _ttSocket.emit("join", "admins");
    });
    _ttSocket.on("task:new",    ()  => { ttFetch(); });
    _ttSocket.on("task:update", p   => {
      _ttTasks = _ttTasks.map(t =>
        String(t._id||t.id) === String(p._id||p.taskId) ? {...t, ...p} : t
      );
    });

    // ── Admin ne blocked sites update ki toh real-time refresh ──
    _ttSocket.on("blockedSites:update", () => {
      console.log("🔔 Admin ne blocked sites update ki — refresh ho rahi hain...");
      refreshAdminBlockedSites();
    });

    _ttSocket.on("disconnect",    () => console.log("[TT] Socket disconnected"));
    _ttSocket.on("connect_error", e  => console.log("[TT] Socket error:", e.message));
  } catch (e) { console.log("[TT] socket error:", e.message); }
}

async function ttStart(token, empId) {
  _ttToken = token;
  _ttEmpId = empId;
  console.log(`[TT] Starting for employee: ${empId}`);
  await ttFetch();
  await ttSocket();
  ttCheck();
  _ttTimer = setInterval(ttCheck, CHECK_INTERVAL);
}

function ttStop() {
  if (_ttTimer)  clearInterval(_ttTimer);
  if (_ttSocket) _ttSocket.disconnect();
  _ttTimer = null; _ttSocket = null; _ttActiveId = null; _idleCount = 0;
  console.log("[TT] Stopped");
}
// ═══════════════════════════════════════════════════════════════════════

let mainWin        = null;
let loginWin       = null;
let captureInterval = null;
let employeeData   = null;
let TOKEN_FILE     = null;

function initPaths() {
  TOKEN_FILE = path.join(app.getPath("userData"), "emp_token.json");
  console.log("📁 Token Path:", TOKEN_FILE);
}
function loadSavedToken() {
  try { if (TOKEN_FILE && fs.existsSync(TOKEN_FILE)) return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8")); } catch {}
  return null;
}
function saveToken(data) { try { if (TOKEN_FILE) fs.writeFileSync(TOKEN_FILE, JSON.stringify(data), "utf8"); } catch {} }
function clearToken()    { try { if (TOKEN_FILE && fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE); } catch {} }

async function validateToken(token) {
  try {
    const res = await axios.get(`${BACKEND}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: 5000,
    });
    return res.data;
  } catch { return null; }
}

function getSmartAppName(appName, windowTitle) {
  const combined = (appName + " " + windowTitle).toLowerCase();
  for (const b of FLAGGED_APPS) if (b.keywords.some(k => combined.includes(k))) return b.name;
  if (windowTitle) {
    const isBrowser = ["chrome","edge","firefox","brave","opera"].some(b => appName.toLowerCase().includes(b));
    if (isBrowser) {
      const p = windowTitle.split(" - ");
      return p.length >= 2 ? p[0].trim() : windowTitle.split(" | ")[0].trim();
    }
  }
  return appName || "Unknown App";
}

function getFlaggedInfo(appName, windowTitle) {
  const combined = (appName + " " + windowTitle).toLowerCase();
  for (const b of FLAGGED_APPS) if (b.keywords.some(k => combined.includes(k)))
    return { isFlagged: true, flaggedAppName: b.name };
  return { isFlagged: false, flaggedAppName: null };
}

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
</style></head>
<body><div class="box">
<h2>Employee Login</h2><p>Apni company email se login karein</p>
<label>Email</label><input type="email" id="email" placeholder="ali@company.com"/>
<label>Password</label><input type="password" id="pwd" placeholder="••••••••"/>
<button id="btn" onclick="doLogin()">Login & Start Monitoring</button>
<div class="error" id="err"></div>
</div>
<script>
const { ipcRenderer } = require('electron');
document.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
ipcRenderer.on('login-error', (_,msg) => {
  document.getElementById('err').textContent = msg;
  document.getElementById('btn').textContent = 'Login & Start Monitoring';
  document.getElementById('btn').disabled = false;
});
function doLogin() {
  const email = document.getElementById('email').value.trim();
  const pwd   = document.getElementById('pwd').value;
  if(!email||!pwd){ document.getElementById('err').textContent='Email aur password zarori hain'; return; }
  document.getElementById('btn').textContent = 'Logging in...';
  document.getElementById('btn').disabled = true;
  ipcRenderer.send('do-login', { email, pwd });
}
</script></body></html>`;
  const tmpPath = path.join(app.getPath("temp"), "login.html");
  fs.writeFileSync(tmpPath, loginHTML);
  loginWin.loadFile(tmpPath);
  loginWin.on("closed", () => { loginWin = null; if (!employeeData) app.quit(); });
}

function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 1200, height: 800,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  mainWin.loadURL(process.env.FRONTEND_URL || "https://workforce-frontend-ten.vercel.app");
}

async function sendHeartbeat(activeApp, windowTitle, mouseEvents, keyEvents) {
  if (!employeeData?.id || !employeeData?.token) return;
  try {
    await axios.post(`${BACKEND}/api/employees/heartbeat`,
      { employeeId: employeeData.id, activeApp, windowTitle, mouseEvents, keyEvents, isRemote: false, vpnConnected: false },
      { headers: { Authorization: `Bearer ${employeeData.token}` }, timeout: 5000 }
    );
    console.log("💓 Heartbeat:", activeApp || "idle");
  } catch(e) { console.log("❌ Heartbeat error:", e.message); }
}

async function takeScreenshot() {
  const sources = await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1280, height: 720 } });
  if (!sources || sources.length === 0) throw new Error("No screen source");
  return await sharp(sources[0].thumbnail.toPNG()).jpeg({ quality: 60 }).toBuffer();
}

async function captureScreen() {
  if (!employeeData) return;
  try {
    const aw          = await activeWin();
    const rawAppName  = aw?.owner?.name || "";
    const windowTitle = aw?.title || "";
    const smartApp    = getSmartAppName(rawAppName, windowTitle);
    const { isFlagged, flaggedAppName } = getFlaggedInfo(rawAppName, windowTitle);
    await sendHeartbeat(smartApp, windowTitle, 5, 3);

    const base64 = "data:image/jpeg;base64," + (await takeScreenshot()).toString("base64");

    await axios.post(`${BACKEND}/api/screenshots/live`, {
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
      productivity: isFlagged ? Math.floor(Math.random()*15)+5 : Math.floor(Math.random()*30)+65,
    }, { headers: { Authorization: `Bearer ${employeeData.token}` }, timeout: 10000 });

    console.log(`📸 ${employeeData.name} | ${smartApp} ${isFlagged ? "🚨 FLAGGED" : "✅"}`);
  } catch(e) { console.log("❌ Capture error:", e.message); }
}

function startCapture() {
  if (captureInterval) clearInterval(captureInterval);
  captureScreen();
  captureInterval = setInterval(captureScreen, 10000);
}
function stopCapture() { if (captureInterval) clearInterval(captureInterval); captureInterval = null; }

async function goOffline() {
  if (!employeeData?.id || !employeeData?.token) return;
  try {
    await axios.post(`${BACKEND}/api/employees/go-offline`,
      { employeeId: employeeData.id },
      { headers: { Authorization: `Bearer ${employeeData.token}` }, timeout: 3000 }
    );
    console.log("🔴 Employee offline");
  } catch {}
}

// ══════════════════════════════════════════════════════
//  🔴 LOGOUT — sab band karo, apps unblock karo
// ══════════════════════════════════════════════════════
ipcMain.on("employee-logout", async () => {
  console.log("🔄 Logout ho raha hai...");
  stopCapture();
  ttStop();
  await goOffline();

  // ✅ LOGOUT PE: Sab unblock karo
  unblockEverything();

  clearToken();
  employeeData = null;
  if (mainWin) { mainWin.close(); mainWin = null; }
  createLoginWindow();
});

// ══════════════════════════════════════════════════════
//  🟢 LOGIN — monitoring shuru, admin sites block karo
// ══════════════════════════════════════════════════════
ipcMain.on("do-login", async (event, { email, pwd }) => {
  try {
    const res = await axios.post(`${BACKEND}/api/auth/login`, { email, password: pwd, role: "employee" });
    employeeData = {
      token:      res.data.token,
      id:         res.data.user?.id,
      empId:      res.data.user?.empId || res.data.user?.id,
      name:       res.data.user?.name || `${res.data.user?.firstName||""} ${res.data.user?.lastName||""}`.trim(),
      department: res.data.user?.department,
      role:       res.data.user?.role,
      email:      res.data.user?.email,
    };
    saveToken(employeeData);
    if (loginWin) { loginWin.removeAllListeners("closed"); loginWin.close(); loginWin = null; }
    createMainWindow();
    startCapture();
    ttStart(employeeData.token, employeeData.id);

    // ✅ LOGIN PE: Admin ki blocked sites fetch karke apply karo
    await blockEverything();

    console.log(`✅ Logged in: ${employeeData.name}`);
  } catch(e) {
    event.sender.send("login-error", e?.response?.data?.message || "Login failed");
  }
});

app.whenReady().then(async () => {
  initPaths();
  const saved = loadSavedToken();
  if (saved?.token && saved?.id) {
    console.log("🔍 Saved token check ho raha hai...");
    const valid = await validateToken(saved.token);
    if (valid) {
      employeeData = saved;
      console.log(`✅ Auto-login: ${employeeData.name}`);
      createMainWindow();
      startCapture();
      ttStart(employeeData.token, employeeData.id);

      // ✅ AUTO LOGIN PE BHI: Admin ki blocked sites apply karo
      await blockEverything();

    } else {
      console.log("⚠️ Token expire ho gaya — login page");
      clearToken(); createLoginWindow();
    }
  } else { createLoginWindow(); }
});

// ══════════════════════════════════════════════════════
//  App band hone pe bhi unblock karo
// ══════════════════════════════════════════════════════
app.on("before-quit", async (e) => {
  e.preventDefault();
  stopCapture();
  ttStop();
  await goOffline();

  // ✅ APP BAND HONE PE: Unblock karo
  unblockEverything();

  app.exit(0);
});

app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });