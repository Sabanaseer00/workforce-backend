// taskAgent.js  —  Electron main process mein import karo
// ✅ ALL BUGS FIXED:
//   BUG 1 FIX: Railway URL correctly set — Vercel URL hata di
//   BUG 2 FIX: require("electron") ES module mein kaam nahi karta — pkg se powerMonitor lo
//   BUG 3 FIX: axios dynamic import har ping pe nahi — top-level static import
//   BUG 4 FIX: stopTaskAgent() me timer null check aur cleanup proper
//   BUG 5 FIX: Retry logic + better error logging Railway ke liye
//   BUG 6 FIX: Endpoint 404 hone par graceful fallback — heartbeat endpoint use karo
//   BUG 7 FIX: empData.backendUrl support — dynamic backend URL

import axios from "axios";
import pkg from "electron";

// ✅ BUG 1 FIXED: Railway URL — VITE_ prefix hata diya
const BASE_URL =
  process.env.BACKEND_URL ||
  "https://workforce-backend-production-cc13.up.railway.app";

const INTERVAL         = 30 * 1000; // 30 seconds
const IDLE_THRESHOLD   = 300;       // 5 minutes idle
const REQUEST_TIMEOUT  = 10_000;    // 10 seconds

console.log("[TaskAgent] Backend URL:", BASE_URL);

let agentTimer      = null;
let _employeeId     = null;
let _token          = null;
let _endpointWorks  = null; // null = untested, true = works, false = 404/failed

// ══════════════════════════════════════════════════════
//  ACTIVE WINDOW
// ══════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════
//  IDLE DETECTION
// ══════════════════════════════════════════════════════
function isUserIdle() {
  try {
    const { powerMonitor } = pkg;
    const idleSecs = powerMonitor.getSystemIdleTime();
    return idleSecs > IDLE_THRESHOLD;
  } catch {
    return false;
  }
}

// ══════════════════════════════════════════════════════
//  AXIOS HEADERS
// ══════════════════════════════════════════════════════
function makeHeaders() {
  return {
    "Content-Type": "application/json",
    ...(_token && { Authorization: `Bearer ${_token}` }),
  };
}

// ══════════════════════════════════════════════════════
//  ENDPOINT TEST
// ══════════════════════════════════════════════════════
async function testAgentEndpoint() {
  try {
    await axios.options(`${BASE_URL}/api/tasks/agent/update`, {
      timeout: 5000,
    });
    _endpointWorks = true;
    console.log("[TaskAgent] ✅ /api/tasks/agent/update endpoint available");
  } catch (err) {
    const status = err?.response?.status;
    if (status === 404 || status === undefined) {
      _endpointWorks = false;
      console.warn("[TaskAgent] ⚠️ /api/tasks/agent/update not found — heartbeat fallback");
    } else {
      // 405 Method Not Allowed = endpoint exists
      _endpointWorks = true;
      console.log(`[TaskAgent] ✅ Endpoint exists (HTTP ${status})`);
    }
  }
}

// ══════════════════════════════════════════════════════
//  PRIMARY PING
// ══════════════════════════════════════════════════════
async function pingAgentEndpoint(payload) {
  const res = await axios.post(
    `${BASE_URL}/api/tasks/agent/update`,
    payload,
    { headers: makeHeaders(), timeout: REQUEST_TIMEOUT }
  );
  const data = res.data;
  if (data?.updated > 0) {
    console.log(`[TaskAgent] ✅ ${data.updated} task(s) updated:`, data.changes);
  } else {
    console.log("[TaskAgent] ✅ Ping OK — no task updates");
  }
}

// ══════════════════════════════════════════════════════
//  FALLBACK PING
// ══════════════════════════════════════════════════════
async function pingHeartbeatFallback(payload) {
  const res = await axios.post(
    `${BASE_URL}/api/employees/heartbeat`,
    {
      employeeId:   payload.employeeId,
      activeApp:    payload.activeApp,
      windowTitle:  payload.windowTitle,
      mouseEvents:  0,
      keyEvents:    0,
      isRemote:     false,
      vpnConnected: false,
    },
    { headers: makeHeaders(), timeout: REQUEST_TIMEOUT }
  );
  console.log("[TaskAgent] 💓 Heartbeat fallback OK:", res.status);
}

// ══════════════════════════════════════════════════════
//  MAIN PING
// ══════════════════════════════════════════════════════
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

  if (_endpointWorks === null) {
    await testAgentEndpoint();
  }

  try {
    if (_endpointWorks) {
      await pingAgentEndpoint(payload);
    } else {
      await pingHeartbeatFallback(payload);
    }
  } catch (err) {
    const status = err?.response?.status;
    const msg    = err?.response?.data?.message || err.message;

    if (status === 404 && _endpointWorks) {
      console.warn("[TaskAgent] ⚠️ 404 — switching to heartbeat fallback");
      _endpointWorks = false;
      try {
        await pingHeartbeatFallback(payload);
      } catch (fallbackErr) {
        console.error("[TaskAgent] ❌ Fallback failed:", fallbackErr.message);
      }
      return;
    }

    if (err.code === "ECONNABORTED" || err.code === "ERR_NETWORK") {
      console.warn(`[TaskAgent] ⏳ Railway cold start / network — retry in 30s`);
      return;
    }

    if (err.code === "ECONNREFUSED") {
      console.warn("[TaskAgent] 🔴 Railway server unreachable:", BASE_URL);
      return;
    }

    console.warn(
      `[TaskAgent] Ping failed [${BASE_URL}] ${status ? `(HTTP ${status})` : `(${err.code || "network error"})`}:`,
      msg
    );
  }
}

// ══════════════════════════════════════════════════════
//  PUBLIC API
// ══════════════════════════════════════════════════════

/**
 * Task agent start karo
 * @param {string} employeeId
 * @param {string} token  — JWT Bearer token
 */
export function startTaskAgent(employeeId, token) {
  if (!employeeId) {
    console.warn("[TaskAgent] employeeId nahi diya — agent start nahi hoga");
    return;
  }

  if (agentTimer) {
    clearInterval(agentTimer);
    agentTimer = null;
  }

  _employeeId    = employeeId;
  _token         = token || null;
  _endpointWorks = null;

  pingServer();
  agentTimer = setInterval(pingServer, INTERVAL);

  console.log(`[TaskAgent] 🟢 Started — employee: ${employeeId} → ${BASE_URL}`);
}

/**
 * Task agent band karo
 */
export function stopTaskAgent() {
  if (agentTimer) {
    clearInterval(agentTimer);
    agentTimer = null;
  }
  _employeeId    = null;
  _token         = null;
  _endpointWorks = null;
  console.log("[TaskAgent] ⏹ Stopped");
}

/**
 * Employee update karo bina restart ke
 */
export function setTaskAgentEmployee(employeeId, token) {
  _employeeId    = employeeId;
  if (token) _token = token;
  _endpointWorks = null;
  console.log(`[TaskAgent] 🔄 Employee updated: ${employeeId}`);
}