// taskAgent.js  —  Electron main process mein import karo
// ✅ ALL BUGS FIXED:
//   BUG 1 FIX: VITE_BACKEND_URL priority hata di — main process mein undefined hota hai
//   BUG 2 FIX: require("electron") ES module mein kaam nahi karta — pkg se powerMonitor lo
//   BUG 3 FIX: axios dynamic import har ping pe nahi — top-level static import
//   BUG 4 FIX: stopTaskAgent() me timer null check aur cleanup proper

// ✅ BUG 3 FIXED: Static import — dynamic import(axios) har 30s pe memory leak karta tha
import axios from "axios";
import pkg from "electron";

// ✅ BUG 1 FIXED: VITE_ prefix hata diya — Electron main process mein VITE_ vars undefined hote hain
// BACKEND_URL pehle check karo, VITE_ bilkul nahi
const BASE_URL =
  process.env.BACKEND_URL ||
  "https://workforce-backend-dusky.vercel.app";

const INTERVAL = 30 * 1000; // 30 seconds

console.log("[TaskAgent] Backend URL:", BASE_URL);

let agentTimer  = null;
let _employeeId = null;
let _token      = null;

// ── Active window title get karna (cross-platform) ──
async function getActiveWindow() {
  try {
    const activeWin = await import("active-win");
    const win = await activeWin.default();
    if (!win) return { app: "", title: "" };
    return {
      app:   win.owner?.name || "",
      title: win.title       || "",
    };
  } catch {
    return { app: "", title: "" };
  }
}

// ✅ BUG 2 FIXED: require("electron") ES module mein crash karta hai
// pkg (electron default export) se powerMonitor lo — yahi main.js mein bhi use hota hai
function isUserIdle() {
  try {
    const { powerMonitor } = pkg;
    const idleSecs = powerMonitor.getSystemIdleTime();
    return idleSecs > 300; // 5 min
  } catch {
    return false;
  }
}

async function pingServer() {
  if (!_employeeId) return;

  const { app, title } = await getActiveWindow();
  const idle           = isUserIdle();

  const payload = {
    employeeId:  _employeeId,
    activeApp:   app,
    windowTitle: title,
    isWorking:   !idle,
  };

  try {
    // ✅ BUG 3 FIXED: axios upar se import ho chuka hai — yahan seedha use karo
    const res = await axios.post(
      `${BASE_URL}/api/tasks/agent/update`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          ...(_token && { Authorization: `Bearer ${_token}` }),
        },
        timeout: 10000,
      }
    );

    const data = res.data;
    if (data?.updated > 0) {
      console.log(`[TaskAgent] ${data.updated} tasks updated:`, data.changes);
    }
  } catch (err) {
    const status = err?.response?.status;
    const msg    = err?.response?.data?.message || err.message;
    console.warn(
      `[TaskAgent] Ping failed [${BASE_URL}] ${status ? `(HTTP ${status})` : "(network error)"}:`,
      msg
    );
  }
}

// ✅ Token parameter — production auth ke liye zarori
export function startTaskAgent(employeeId, token) {
  if (!employeeId) {
    console.warn("[TaskAgent] employeeId nahi diya — agent start nahi hoga");
    return;
  }

  // ✅ BUG 4 FIX: Agar pehle se chal raha hai to pehle band karo
  if (agentTimer) {
    clearInterval(agentTimer);
    agentTimer = null;
  }

  _employeeId = employeeId;
  _token      = token || null;

  pingServer();
  agentTimer = setInterval(pingServer, INTERVAL);
  console.log(`[TaskAgent] Started for employee: ${employeeId} → ${BASE_URL}`);
}

// ✅ BUG 4 FIXED: Proper cleanup — null checks aur state reset
export function stopTaskAgent() {
  if (agentTimer) {
    clearInterval(agentTimer);
    agentTimer = null;
  }
  _employeeId = null;
  _token      = null;
  console.log("[TaskAgent] Stopped");
}

export function setTaskAgentEmployee(employeeId, token) {
  _employeeId = employeeId;
  if (token) _token = token;
}