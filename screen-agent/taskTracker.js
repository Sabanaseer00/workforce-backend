<<<<<<< HEAD
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
=======
// taskAgent.js — Task status auto-updater
import axios from "axios";
import pkg   from "electron";

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
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
    return { app: "", title: "" };
  }
}

<<<<<<< HEAD
// ── Idle check (5 min idle = not working) ──
function isUserIdle() {
  try {
    const { powerMonitor } = require("electron");
    const idleSecs = powerMonitor.getSystemIdleTime();
    return idleSecs > 300; // 5 minutes
=======
function isUserIdle() {
  try {
    const { powerMonitor } = pkg;
    return powerMonitor.getSystemIdleTime() > 300;
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
  } catch {
    return false;
  }
}

async function pingServer() {
  if (!_employeeId) return;
<<<<<<< HEAD

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
=======
  const { app, title } = await getActiveWindow();
  try {
    const res = await axios.post(
      `${BASE_URL}/api/tasks/agent/update`,
      { employeeId: _employeeId, activeApp: app, windowTitle: title, isWorking: !isUserIdle() },
      {
        headers: { "Content-Type": "application/json", ...(_token && { Authorization: `Bearer ${_token}` }) },
        timeout: 10_000,
      }
    );
    if (res.data?.updated > 0)
      console.log(`[TaskAgent] ${res.data.updated} tasks updated`);
  } catch (err) {
    console.warn(`[TaskAgent] Ping failed:`, err?.response?.status || err.message);
  }
}

export function startTaskAgent(employeeId, token) {
  if (!employeeId) { console.warn("[TaskAgent] No employeeId"); return; }
  if (agentTimer)  { clearInterval(agentTimer); agentTimer = null; }
  _employeeId = String(employeeId);
  _token      = token || null;
  pingServer();
  agentTimer = setInterval(pingServer, INTERVAL);
  console.log(`[TaskAgent] Started: ${_employeeId}`);
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
>>>>>>> 9946b18a919f250714a3bb09d2c48c1e7e27f31f
}