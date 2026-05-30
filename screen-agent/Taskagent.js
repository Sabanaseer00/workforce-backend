// Taskagent.js — WorkTrack Electron Agent Task Tracker

import { powerMonitor } from "electron";

const BASE_URL = process.env.BACKEND_URL || "https://workforce-backend-production-cc13.up.railway.app";
const INTERVAL = 30 * 1000;

console.log("[TaskAgent] Backend:", BASE_URL);

let agentTimer  = null;
let _employeeId = null;
let _token      = null;

// ── Active window get karo ──
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

// ── Idle check ──
function isUserIdle() {
  try {
    const idleSecs = powerMonitor.getSystemIdleTime();
    return idleSecs > 300;
  } catch {
    return false;
  }
}

// ── Server ping ──
async function pingServer() {
  if (!_employeeId) return;

  const { app, title } = await getActiveWindow();
  const idle = isUserIdle();

  const payload = {
    employeeId:  _employeeId,
    activeApp:   app,
    windowTitle: title,
    isWorking:   !idle,
  };

  const endpoints = [
    "/api/tasks/agent/update",
    "/api/tasks/agent/ping",
    "/api/tasks/ping",
    "/api/agent/update",
  ];

  for (const endpoint of endpoints) {
    try {
      const res = await fetch(`${BASE_URL}${endpoint}`, {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.updated > 0) {
          console.log(`[TaskAgent] ${data.updated} tasks updated:`, data.changes);
        }
        return;
      }
      console.log(`[TaskAgent] ${endpoint} → ${res.status}, trying next...`);
    } catch (err) {
      console.log(`[TaskAgent] ${endpoint} failed:`, err.message);
    }
  }
  console.log("[TaskAgent] Koi bhi task endpoint nahi mila backend pe — ping skip");
}

export function startTaskAgent(employeeId, token) {
  if (!employeeId) {
    console.warn("[TaskAgent] employeeId nahi diya — agent start nahi hoga");
    return;
  }
  _employeeId = employeeId;
  _token      = token;
  console.log(`[TaskAgent] Started: ${employeeId} → ${BASE_URL}`);
  pingServer();
  agentTimer = setInterval(pingServer, INTERVAL);
}

export function stopTaskAgent() {
  if (agentTimer) { clearInterval(agentTimer); agentTimer = null; }
  _employeeId = null;
  _token      = null;
  console.log("[TaskAgent] Stopped");
}

export function setTaskAgentEmployee(employeeId, token) {
  _employeeId = employeeId;
  _token      = token;
}