// main.js — WorkTrack Electron Agent
// screenshot-desktop → sharp compress → base64 → Railway backend
// Dynamic site blocking — admin dashboard se control
// Tamper watcher — employee hosts edit na kar sake
// Auto admin relaunch — admin rights automatic

import pkg from "electron";
const { app, BrowserWindow, ipcMain } = pkg;

import axios        from "axios";
import screenshot   from "screenshot-desktop";
import sharp        from "sharp";
import path         from "path";
import fs           from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { config }   from "dotenv";

import { startTracking, stopTracking } from "./activity.js";
import { startTaskAgent, stopTaskAgent } from "./Taskagent.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
config({ path: path.join(__dirname, ".env") });

const BACKEND  = process.env.BACKEND_URL  || "https://workforce-backend-production-cc13.up.railway.app";
const FRONTEND = process.env.FRONTEND_URL || "https://workforce-frontend-ten.vercel.app";
console.log("🌐 Backend :", BACKEND);
console.log("🖥  Frontend:", FRONTEND);

// PowerShell based active window detection — no ffi-napi needed
const activeWin = async () => {
  try {
    const result = execSync(
      `powershell -NoProfile -Command "$pid2 = 0; $sig = '[DllImport(\\\"user32.dll\\\")]public static extern IntPtr GetForegroundWindow();[DllImport(\\\"user32.dll\\\")]public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);'; $t = Add-Type -PassThru -Name U32 -Namespace W -MemberDefinition $sig; $hwnd = $t::GetForegroundWindow(); $t::GetWindowThreadProcessId($hwnd,[ref]$pid2)|Out-Null; $proc = Get-Process -Id $pid2 -ErrorAction SilentlyContinue; $name = if($proc.MainModule.FileVersionInfo.ProductName){$proc.MainModule.FileVersionInfo.ProductName}else{$proc.ProcessName}; $title = $proc.MainWindowTitle; Write-Output ($name + '|||' + $title)"`,
      { timeout: 4000, windowsHide: true }
    ).toString().trim();
    const parts = result.split("|||");
    return { owner: { name: parts[0]?.trim() || "Unknown" }, title: parts[1]?.trim() || "" };
  } catch {
    return null;
  }
};

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

const HOSTS_FILE         = "C:\\Windows\\System32\\drivers\\etc\\hosts";
const BLOCK_MARKER_START = "# WORKTRACK_BLOCK_START";
const BLOCK_MARKER_END   = "# WORKTRACK_BLOCK_END";

let _adminBlockedSites = [];
let _isAdminMode       = false;
let _watcherInterval   = null;

function isRunningAsAdmin() {
  try {
    execSync("net session", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function relaunchAsAdmin() {
  try {
    const psLines = [
      `$exe = '${process.execPath.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`,
      `$dir = '${__dirname.replace(/\\/g, "\\\\").replace(/'/g, "''")}'`,
      `Start-Process -FilePath $exe -ArgumentList $dir -Verb RunAs`,
    ].join("\r\n");
    const psFile = path.join(process.env.TEMP || "C:\\Windows\\Temp", "worktrack_relaunch.ps1");
    fs.writeFileSync(psFile, psLines, "utf8");
    execSync(`powershell.exe -ExecutionPolicy Bypass -NonInteractive -File "${psFile}"`, { stdio: "inherit" });
    app.exit(0);
  } catch (e) {
    console.error("❌ Admin relaunch failed:", e.message);
    const { dialog } = pkg;
    dialog.showMessageBoxSync({
      type: "warning",
      title: "Administrator Required",
      message: "Right Click → Run as Administrator",
      buttons: ["OK"],
    });
    app.exit(0);
  }
}

function checkAdminPrivileges() {
  if (isRunningAsAdmin()) {
    _isAdminMode = true;
    console.log("🔑 Admin mode — site blocking enabled");
  } else {
    _isAdminMode = false;
    console.warn("⚠️  No admin rights — site blocking skipped");
  }
}

function cleanDomain(raw) {
  if (!raw) return "";
  raw = raw.trim();
  try {
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      raw = new URL(raw).hostname;
    }
  } catch (e) {}
  return raw.replace(/^www\./, "").toLowerCase();
}

async function fetchAdminBlockedSites() {
  if (!employeeData?.token) return [];
  try {
    const res = await axios.get(`${BACKEND}/api/blocked-apps/sites`, {
      headers: { Authorization: `Bearer ${employeeData.token}` },
      timeout: 8000,
    });
    const sites = res.data?.sites || res.data || [];
    const domains = sites
      .map(s => {
        const raw = typeof s === "string" ? s : (s.domain || s.identifier || s.url || "");
        return cleanDomain(raw);
      })
      .filter(Boolean);
    console.log(`🔒 Blocked sites (${domains.length}):`, domains.join(", ") || "none");
    return domains;
  } catch (e) {
    console.warn("⚠️  blocked-sites fetch failed:", e.message);
    return [];
  }
}

function applyHostsBlock(sites) {
  if (!_isAdminMode) return;
  try {
    let content = fs.readFileSync(HOSTS_FILE, "utf8");
    const si = content.indexOf(BLOCK_MARKER_START);
    const ei = content.indexOf(BLOCK_MARKER_END);
    if (si !== -1 && ei !== -1)
      content = content.slice(0, si).trimEnd() + "\n" + content.slice(ei + BLOCK_MARKER_END.length);
    content = content.trim();
    if (sites.length > 0) {
      const lines = [];
      sites.forEach(d => {
        const c = cleanDomain(d);
        lines.push(`127.0.0.1   ${c}`, `127.0.0.1   www.${c}`);
      });
      content += `\n\n${BLOCK_MARKER_START}\n${lines.join("\n")}\n${BLOCK_MARKER_END}\n`;
    } else {
      content += "\n";
    }
    fs.writeFileSync(HOSTS_FILE, content, "utf8");
    execSync("ipconfig /flushdns", { stdio: "ignore" });
    console.log(sites.length ? `🚫 Hosts: ${sites.length} blocked` : "✅ Hosts: cleared");
  } catch (err) {
    console.error("❌ Hosts update failed:", err.message);
  }
}

function applyFirewallBlock(sites) {
  if (!_isAdminMode) return;
  try {
    try { execSync(`netsh advfirewall firewall delete rule name="WORKTRACK_*"`, { stdio: "ignore" }); } catch {}
    sites.forEach(domain => {
      const c = cleanDomain(domain);
      try {
        execSync(
          `netsh advfirewall firewall add rule name="WORKTRACK_${c.replace(/\./g, "_")}" dir=out action=block remotehost="${c}" enable=yes`,
          { stdio: "ignore" }
        );
      } catch {}
    });
    console.log(sites.length ? `🔥 Firewall: ${sites.length} blocked` : "✅ Firewall: cleared");
  } catch (err) {
    console.error("❌ Firewall update failed:", err.message);
  }
}

async function blockEverything() {
  if (!_isAdminMode) { console.log("⏭️  Blocking skipped — no admin"); return; }
  _adminBlockedSites = await fetchAdminBlockedSites();
  applyHostsBlock(_adminBlockedSites);
  applyFirewallBlock(_adminBlockedSites);
}

function unblockEverything() {
  if (!_isAdminMode) return;
  applyHostsBlock([]);
  applyFirewallBlock([]);
  _adminBlockedSites = [];
  console.log("✅ All sites unblocked");
}

function startTamperWatcher() {
  if (_watcherInterval) clearInterval(_watcherInterval);
  _watcherInterval = setInterval(() => {
    try {
      const content = fs.readFileSync(HOSTS_FILE, "utf8");
      if (_adminBlockedSites.length > 0 && !content.includes(BLOCK_MARKER_START)) {
        console.log("⚠️  Tamper detected — re-blocking!");
        applyHostsBlock(_adminBlockedSites);
        applyFirewallBlock(_adminBlockedSites);
      }
    } catch (e) {
      console.error("❌ Watcher error:", e.message);
    }
  }, 30_000);
  console.log("👁️  Tamper watcher started");
}

function stopTamperWatcher() {
  if (_watcherInterval) { clearInterval(_watcherInterval); _watcherInterval = null; }
  console.log("👁️  Tamper watcher stopped");
}

async function takeScreenshot() {
  const rawBuffer = await screenshot({ format: "png" });
  const compressed = await sharp(rawBuffer)
    .resize({ width: 1280, withoutEnlargement: true })
    .jpeg({ quality: 50 })
    .toBuffer();
  return "data:image/jpeg;base64," + compressed.toString("base64");
}

function getSmartAppName(appName, windowTitle) {
  const combined = ((appName || "") + " " + (windowTitle || "")).toLowerCase();
  for (const b of FLAGGED_APPS)
    if (b.keywords.some(k => combined.includes(k))) return b.name;
  const isBrowser = ["chrome","edge","firefox","brave","opera"].some(b =>
    (appName || "").toLowerCase().includes(b)
  );
  if (isBrowser && windowTitle) {
    const p = windowTitle.split(" - ");
    return p.length >= 2 ? p[0].trim() : windowTitle.split(" | ")[0].trim();
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

let captureInterval = null;

async function captureScreen() {
  if (!employeeData) return;
  try {
    const aw          = await activeWin().catch(() => null);
    const rawAppName  = aw?.owner?.name || "";
    const windowTitle = aw?.title        || "";
    const smartApp    = getSmartAppName(rawAppName, windowTitle);
    const { isFlagged, flaggedAppName } = getFlaggedInfo(rawAppName, windowTitle);

    let imageUrl = "";
    try {
      imageUrl = await takeScreenshot();
      console.log(`📸 Screenshot: ~${Math.round(imageUrl.length / 1024)}KB`);
    } catch (e) {
      console.warn("⚠️  Screenshot failed:", e.message);
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
        windowTitle,
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
        headers: {
          Authorization:  `Bearer ${employeeData.token}`,
          "Content-Type": "application/json",
        },
        timeout:       20_000,
        maxBodyLength: 10 * 1024 * 1024,
      }
    );
    console.log(`📸 ${employeeData.name} | ${smartApp}${isFlagged ? " 🚨 FLAGGED" : " ✅"}`);
  } catch (e) {
    console.error("❌ captureScreen error:", e.message);
  }
}

function startCapture() {
  if (captureInterval) clearInterval(captureInterval);
  captureScreen();
  captureInterval = setInterval(captureScreen, 30_000);
}

function stopCapture() {
  if (captureInterval) { clearInterval(captureInterval); captureInterval = null; }
}

let mainWin      = null;
let loginWin     = null;
let employeeData = null;
let TOKEN_FILE   = null;

function initPaths() {
  TOKEN_FILE = path.join(app.getPath("userData"), "emp_token.json");
  console.log("📁 Token:", TOKEN_FILE);
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
  } catch (e) {
    return null;
  }
}

function createLoginWindow() {
  loginWin = new BrowserWindow({
    width: 420, height: 540, resizable: false, center: true,
    title: "WorkTrack — Login",
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Segoe UI',sans-serif;background:#0c1017;color:#e2e8f0;
  display:flex;align-items:center;justify-content:center;height:100vh;padding:24px}
.box{width:100%;max-width:340px;background:rgba(255,255,255,.03);
  border:1px solid rgba(255,255,255,.08);border-radius:16px;padding:32px 28px}
h2{font-size:20px;font-weight:700;color:#fff;margin-bottom:6px}
p{font-size:12px;color:#4b5a70;margin-bottom:24px}
label{font-size:11px;font-weight:600;color:#4b5a70;text-transform:uppercase;
  letter-spacing:.08em;display:block;margin-bottom:6px}
input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
  border-radius:9px;padding:10px 14px;font-size:13px;color:#fff;
  margin-bottom:16px;outline:none;font-family:inherit}
input:focus{border-color:rgba(125,195,245,.5)}
button{width:100%;padding:11px;border-radius:9px;
  border:1px solid rgba(125,195,245,.3);background:rgba(125,195,245,.15);
  color:#7dc3f5;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;margin-top:4px}
button:hover{background:rgba(125,195,245,.25)}
button:disabled{opacity:.5;cursor:not-allowed}
.error{font-size:12px;color:#fca5a5;text-align:center;margin-top:12px;min-height:20px}
.env{font-size:10px;color:#2a3a50;text-align:center;margin-top:16px}
</style></head><body><div class="box">
<h2>WorkTrack Login</h2><p>Company email se login karein</p>
<label>Email</label>
<input type="email" id="email" placeholder="ali@company.com"/>
<label>Password</label>
<input type="password" id="pwd" placeholder="••••••••"/>
<button id="btn" onclick="doLogin()">Login &amp; Start Monitoring</button>
<div class="error" id="err"></div>
<div class="env" id="srv"></div>
</div><script>
const { ipcRenderer } = require('electron');
document.addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
ipcRenderer.on('login-error', (_, msg) => {
  document.getElementById('err').textContent = msg;
  document.getElementById('btn').textContent = 'Login & Start Monitoring';
  document.getElementById('btn').disabled = false;
});
ipcRenderer.on('backend-url', (_, url) => {
  document.getElementById('srv').textContent = 'Server: ' + url;
});
function doLogin() {
  const email = document.getElementById('email').value.trim();
  const pwd   = document.getElementById('pwd').value;
  if (!email || !pwd) { document.getElementById('err').textContent = 'Email aur password zarori hain'; return; }
  document.getElementById('btn').textContent = 'Logging in...';
  document.getElementById('btn').disabled    = true;
  document.getElementById('err').textContent = '';
  ipcRenderer.send('do-login', { email, pwd });
}
</script></body></html>`;

  const tmp = path.join(app.getPath("temp"), "wt_login.html");
  fs.writeFileSync(tmp, html, "utf8");
  loginWin.loadFile(tmp);
  loginWin.webContents.on("did-finish-load", () => {
    loginWin?.webContents.send("backend-url", BACKEND);
  });
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
  mainWin.loadURL(FRONTEND);
  console.log("🖥  Dashboard:", FRONTEND);
  mainWin.on("closed", () => { mainWin = null; });
}

async function startSession() {
  startCapture();
  await startTracking(employeeData);
  startTaskAgent(employeeData.id, employeeData.token);
  await blockEverything();
  startTamperWatcher();
  console.log(`✅ Session started: ${employeeData.name}`);
}

async function stopSession() {
  stopCapture();
  stopTamperWatcher();
  await stopTracking();
  stopTaskAgent();
  unblockEverything();
  console.log("🛑 Session stopped");
}

ipcMain.on("do-login", async (event, { email, pwd }) => {
  try {
    console.log("🔐 Login:", email, "→", BACKEND);
    const res = await axios.post(
      `${BACKEND}/api/auth/login`,
      { email, password: pwd, role: "employee" },
      { timeout: 10_000 }
    );
    employeeData = {
      token:      res.data.token,
      id:         res.data.user?.id,
      empId:      res.data.user?.empId || res.data.user?.id,
      name:       res.data.user?.name
                  || `${res.data.user?.firstName || ""} ${res.data.user?.lastName || ""}`.trim(),
      department: res.data.user?.department,
      role:       res.data.user?.role,
      email:      res.data.user?.email,
    };
    saveToken(employeeData);
    if (loginWin) {
      loginWin.removeAllListeners("closed");
      loginWin.close();
      loginWin = null;
    }
    createMainWindow();
    await startSession();
  } catch (e) {
    console.error("❌ Login failed:", e?.response?.data || e.message);
    event.sender.send(
      "login-error",
      e?.response?.data?.message || `Login failed: ${e.message}`
    );
  }
});

ipcMain.on("employee-logout", async () => {
  await stopSession();
  clearToken();
  employeeData = null;
  if (mainWin) { mainWin.close(); mainWin = null; }
  createLoginWindow();
});

app.whenReady().then(async () => {
  initPaths();

  if (!isRunningAsAdmin()) {
    console.log("⚠️  Admin rights nahi — restarting as Administrator...");
    relaunchAsAdmin();
    return;
  }

  checkAdminPrivileges();

  const saved = loadSavedToken();
  if (saved?.token && saved?.id) {
    console.log("🔍 Validating saved token...");
    const valid = await validateToken(saved.token);
    if (valid) {
      employeeData = saved;
      console.log(`✅ Auto-login: ${employeeData.name}`);
      createMainWindow();
      await startSession();
    } else {
      console.warn("⚠️  Token expired — showing login");
      clearToken();
      createLoginWindow();
    }
  } else {
    createLoginWindow();
  }
});

let _quitting = false;
app.on("before-quit", async (e) => {
  if (_quitting) return;
  e.preventDefault();
  _quitting = true;
  console.log("👋 Quitting...");
  await stopSession().catch(() => {});
  app.exit(0);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});