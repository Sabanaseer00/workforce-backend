// taskAgent.js — WorkTrack Electron Agent
// ✅ FIX 1: localhost hardcode hata diya — BACKEND_URL env se aata hai
// ✅ FIX 2: fetch() ki jagah axios — Electron mein reliable
// ✅ FIX 3: require("electron") → pkg import — ES module crash fix
// ✅ FIX 4: token support — authorized API calls
// ✅ FIX 5: 404 fallback — multiple endpoints try karta hai

import axios from "axios";
import pkg   from "electron"; // ✅ FIX 3: require nahi — ES module safe

// ✅ FIX 1: localhost nahi — Railway URL env se
const BASE_URL =
  process.env.BACKEND_URL ||
  "https://workforce-backend-production-cc13.up.railway.app";

const INTERVAL = 30_000;
console.log("[TaskAgent] Backend:", BASE_URL);

// ✅ FIX 5: Sare possible endpoints — jo pehle kaam kare woh use hoga
const TASK_ENDPOINTS = [
  "/api/tasks/agent/update",
  "/api/tasks/agent/ping",
  "/api/tasks/ping",
  "/api/agent/update",
];

let agentTimer       = null;
let _employeeId      = null;
let _token           = null;
let _workingEndpoint = null; // cached working endpoint

// ── Active window ──────────────────────────────────────────────────────
async function getActiveWindow() {
  try {
    const m   = await import("active-win");
    const win = await m.default();
    return { app: win?.owner?.name || "", title: win?.title || "" };
  } catch {
    return { app: "", title: "" };
  }
}

// ✅ FIX 3: pkg se powerMonitor — require("electron") ES module mein crash karta
function isUserIdle() {
  try {
    const { powerMonitor } = pkg;
    return powerMonitor.getSystemIdleTime() > 300; // 5 min
  } catch {
    return false;
  }
}

// ✅ FIX 5: Sare endpoints try karo — jo 200/non-404 de woh save karo
async function findWorkingEndpoint(payload, headers) {
  for (const ep of TASK_ENDPOINTS) {
    try {
      await axios.post(`${BASE_URL}${ep}`, payload, { headers, timeout: 8_000 });
      console.log(`[TaskAgent] Working endpoint found: ${ep}`);
      return ep;
    } catch (err) {
      const status = err?.response?.status;
      if (status && status !== 404 && status !== 405) {
        // Endpoint exist karta hai (auth/server error) — use karo
        console.log(`[TaskAgent] Endpoint ${ep} exists (status ${status}) — using it`);
        return ep;
      }
      console.log(`[TaskAgent] ${ep} → ${status || err.message}, trying next...`);
    }
  }
  return null; // koi endpoint nahi mila
}

// ── Main ping ─────────────────────────────────────────────────────────
async function pingServer() {
  if (!_employeeId) return;

  const { app, title } = await getActiveWindow();

  const payload = {
    employeeId:  _employeeId,
    activeApp:   app,
    windowTitle: title,
    isWorking:   !isUserIdle(),
  };

  // ✅ FIX 2+4: axios + token header
  const headers = {
    "Content-Type": "application/json",
    ...(_token && { Authorization: `Bearer ${_token}` }),
  };

  try {
    // ✅ FIX 5: Working endpoint na ho toh dhundho
    if (!_workingEndpoint) {
      _workingEndpoint = await findWorkingEndpoint(payload, headers);
      if (!_workingEndpoint) {
        console.warn("[TaskAgent] Koi bhi task endpoint nahi mila backend pe — ping skip");
        return;
      }
    }

    // ✅ FIX 2: fetch() nahi — axios use karo
    const res = await axios.post(
      `${BASE_URL}${_workingEndpoint}`,
      payload,
      { headers, timeout: 10_000 }
    );

    if (res.data?.updated > 0) {
      console.log(`[TaskAgent] ${res.data.updated} tasks updated`);
    } else {
      console.log(`[TaskAgent] Ping OK`);
    }
  } catch (err) {
    const status = err?.response?.status;
    console.warn(`[TaskAgent] Ping failed:`, status || err.message);
    // 404 aaya — endpoint reset, agla ping dobara dhundhega
    if (status === 404 || status === 405) {
      _workingEndpoint = null;
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────

// ✅ FIX 4: token parameter add kiya
export function startTaskAgent(employeeId, token) {
  if (!employeeId) {
    console.warn("[TaskAgent] employeeId nahi diya — agent start nahi hoga");
    return;
  }
  if (agentTimer) { clearInterval(agentTimer); agentTimer = null; }

  _employeeId      = String(employeeId);
  _token           = token || null;
  _workingEndpoint = null; // fresh start

  pingServer(); // turant pehla ping
  agentTimer = setInterval(pingServer, INTERVAL);
  console.log(`[TaskAgent] Started: ${_employeeId} → ${BASE_URL}`);
}

export function stopTaskAgent() {
  if (agentTimer) { clearInterval(agentTimer); agentTimer = null; }
  _employeeId      = null;
  _token           = null;
  _workingEndpoint = null;
  console.log("[TaskAgent] Stopped");
}

export function setTaskAgentEmployee(employeeId, token) {
  _employeeId      = employeeId ? String(employeeId) : null;
  if (token) _token = token;
  _workingEndpoint = null;
}