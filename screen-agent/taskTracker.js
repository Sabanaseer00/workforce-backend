// ─────────────────────────────────────────────────────────────
// taskAgent.js  —  Electron main process mein require karo
//
// Ye module har 30 seconds mein server ko batata hai:
//   - Employee kaun sa app use kar raha hai
//   - Kya woh kaam kar raha hai ya idle hai
//
// Setup (main.js mein):
//   import { startTaskAgent } from "./taskAgent.js";
//   startTaskAgent(employeeId);   // login ke baad call karo
//   stopTaskAgent();              // logout pe
// ─────────────────────────────────────────────────────────────

const BASE_URL = "http://localhost:5000"; // apna server URL
const INTERVAL = 30 * 1000; // 30 seconds

let agentTimer   = null;
let _employeeId  = null;

// ── Active window title get karna (cross-platform) ──
async function getActiveWindow() {
  try {
    // active-win npm package use karo:  npm install active-win
    const activeWin = await import("active-win");
    const win = await activeWin.default();
    if (!win) return { app: "", title: "" };
    return {
      app:   win.owner?.name  || "",
      title: win.title        || "",
    };
  } catch {
    // active-win nahi hai — fallback
    return { app: "", title: "" };
  }
}

// ── Idle check (5 min idle = not working) ──
function isUserIdle() {
  try {
    const { powerMonitor } = require("electron");
    const idleSecs = powerMonitor.getSystemIdleTime();
    return idleSecs > 300; // 5 minutes
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
    const res = await fetch(`${BASE_URL}/api/tasks/agent/update`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      console.warn(`[TaskAgent] Server error: ${res.status}`);
      return;
    }

    const data = await res.json();
    if (data.updated > 0) {
      console.log(`[TaskAgent] ${data.updated} tasks updated:`, data.changes);
    }
  } catch (err) {
    // Server offline — silently ignore
    console.warn("[TaskAgent] Ping failed (server offline?):", err.message);
  }
}

export function startTaskAgent(employeeId) {
  if (!employeeId) {
    console.warn("[TaskAgent] employeeId nahi diya — agent start nahi hoga");
    return;
  }
  _employeeId = employeeId;

  // Foran ek ping karo
  pingServer();

  // Phir har 30s pe
  agentTimer = setInterval(pingServer, INTERVAL);
  console.log(`[TaskAgent] Started for employee: ${employeeId}`);
}

export function stopTaskAgent() {
  if (agentTimer) {
    clearInterval(agentTimer);
    agentTimer = null;
  }
  _employeeId = null;
  console.log("[TaskAgent] Stopped");
}

export function setTaskAgentEmployee(employeeId) {
  _employeeId = employeeId;
}