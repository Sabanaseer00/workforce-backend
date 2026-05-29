// taskAgent.js  —  Electron main process mein require karo
// ✅ FIXED: localhost hardcoding hataya, production backend use karta hai
//
// Setup (main.js mein):
//   import { startTaskAgent } from "./taskAgent.js";
//   startTaskAgent(employeeId, token);   // login ke baad call karo
//   stopTaskAgent();                     // logout pe

// ✅ PRODUCTION CONFIG — env variable se URL lo, fallback production URL
const BASE_URL = process.env.VITE_BACKEND_URL
              || process.env.BACKEND_URL
              || "https://workforce-backend-dusky.vercel.app";

const INTERVAL = 30 * 1000; // 30 seconds

console.log("[TaskAgent] Backend URL:", BASE_URL);

let agentTimer  = null;
let _employeeId = null;
let _token      = null;   // ✅ Token add kiya — production auth ke liye zarori

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

// ── Idle check (5 min idle = not working) ──
function isUserIdle() {
  try {
    // ✅ Dynamic import — Electron context mein hi kaam karta hai
    const electron = require("electron");
    const idleSecs = electron.powerMonitor.getSystemIdleTime();
    return idleSecs > 300;
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
    // ✅ fetch() ki jagah axios use karo — better error handling production mein
    const { default: axios } = await import("axios");

    const res = await axios.post(
      `${BASE_URL}/api/tasks/agent/update`,
      payload,
      {
        headers: {
          "Content-Type": "application/json",
          // ✅ Authorization header add kiya — production APIs ke liye zarori
          ...(_token && { Authorization: `Bearer ${_token}` }),
        },
        timeout: 10000,
      }
    );

    const data = res.data;
    if (data.updated > 0) {
      console.log(`[TaskAgent] ${data.updated} tasks updated:`, data.changes);
    }
  } catch (err) {
    // ✅ Better error info — URL aur status code dikhao
    const status = err?.response?.status;
    const msg    = err?.response?.data?.message || err.message;
    console.warn(`[TaskAgent] Ping failed [${BASE_URL}] ${status ? `(HTTP ${status})` : "(network error)"}:`, msg);
  }
}

// ✅ Token parameter add kiya — auth ke liye
export function startTaskAgent(employeeId, token) {
  if (!employeeId) {
    console.warn("[TaskAgent] employeeId nahi diya — agent start nahi hoga");
    return;
  }
  _employeeId = employeeId;
  _token      = token || null;

  pingServer();
  agentTimer = setInterval(pingServer, INTERVAL);
  console.log(`[TaskAgent] Started for employee: ${employeeId} → ${BASE_URL}`);
}

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
  _token      = token || _token;
}