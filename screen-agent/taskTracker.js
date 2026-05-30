// taskAgent.js — Electron main process mein import karo
// ✅ FIXES:
//   FIX 1: localhost hardcode hata diya — BACKEND_URL env se aata hai
//   FIX 2: fetch() ki jagah axios — Electron mein reliable
//   FIX 3: require("electron") ES module crash fix — pkg se lo
//   FIX 4: token bhi bhejo — authorized API calls ke liye

import axios from "axios";
import pkg   from "electron";

// ✅ FIX 1: localhost nahi — Railway URL
const BASE_URL =
  process.env.BACKEND_URL ||
  "https://workforce-backend-production-cc13.up.railway.app";

const INTERVAL = 30_000;
console.log("[TaskAgent] Backend:", BASE_URL);

let agentTimer  = null;
let _employeeId = null;
let _token      = null;

async function getActiveWindow() {
  try {
    const m   = await import("active-win");
    const win = await m.default();
    return { app: win?.owner?.name || "", title: win?.title || "" };
  } catch {
    return { app: "", title: "" };
  }
}

// ✅ FIX 3: pkg se powerMonitor — require("electron") ES module mein crash karta hai
function isUserIdle() {
  try {
    const { powerMonitor } = pkg;
    return powerMonitor.getSystemIdleTime() > 300;
  } catch {
    return false;
  }
}

async function pingServer() {
  if (!_employeeId) return;
  const { app, title } = await getActiveWindow();
  try {
    // ✅ FIX 2: axios use karo fetch() ki jagah
    const res = await axios.post(
      `${BASE_URL}/api/tasks/agent/update`,
      {
        employeeId:  _employeeId,
        activeApp:   app,
        windowTitle: title,
        isWorking:   !isUserIdle(),
      },
      {
        headers: {
          "Content-Type": "application/json",
          // ✅ FIX 4: token bhejo
          ...(_token && { Authorization: `Bearer ${_token}` }),
        },
        timeout: 10_000,
      }
    );
    if (res.data?.updated > 0) {
      console.log(`[TaskAgent] ${res.data.updated} tasks updated`);
    }
  } catch (err) {
    console.warn(`[TaskAgent] Ping failed:`, err?.response?.status || err.message);
  }
}

// ✅ FIX 4: token parameter add kiya
export function startTaskAgent(employeeId, token) {
  if (!employeeId) { console.warn("[TaskAgent] No employeeId"); return; }
  if (agentTimer)  { clearInterval(agentTimer); agentTimer = null; }
  _employeeId = String(employeeId);
  _token      = token || null;
  pingServer();
  agentTimer = setInterval(pingServer, INTERVAL);
  console.log(`[TaskAgent] Started: ${_employeeId} → ${BASE_URL}`);
}

export function stopTaskAgent() {
  if (agentTimer) { clearInterval(agentTimer); agentTimer = null; }
  _employeeId = null;
  _token      = null;
  console.log("[TaskAgent] Stopped");
}

export function setTaskAgentEmployee(employeeId, token) {
  _employeeId = employeeId ? String(employeeId) : null;
  if (token) _token = token;
}