// blocking.js  —  Employee Agent Side
// Run as Administrator / with elevated privileges (hosts file write karne ke liye)

import fs from "fs";
import os from "os";
import path from "path";
import { io } from "socket.io-client";

const SERVER_URL   = "http://YOUR_SERVER_IP:5000";   // ← apna server URL lagao
const POLL_INTERVAL = 30_000;                         // 30 seconds fallback poll
const HOSTS_PATH   = "C:\\Windows\\System32\\drivers\\etc\\hosts";

// Markers to identify our injected block entries
const BLOCK_START = "# <<WORKTRACK_BLOCK_START>>";
const BLOCK_END   = "# <<WORKTRACK_BLOCK_END>>";

/* ─────────────────────────────────────────
   HOSTS FILE HELPERS
───────────────────────────────────────── */

function readHosts() {
  try { return fs.readFileSync(HOSTS_PATH, "utf8"); }
  catch { return ""; }
}

function writeHosts(content) {
  try {
    fs.writeFileSync(HOSTS_PATH, content, "utf8");
    return true;
  } catch (err) {
    console.error("[Blocking] hosts file write failed (run as admin?):", err.message);
    return false;
  }
}

// Remove our block section from hosts file
function clearBlockSection(content) {
  const startIdx = content.indexOf(BLOCK_START);
  const endIdx   = content.indexOf(BLOCK_END);
  if (startIdx === -1 || endIdx === -1) return content;
  return content.slice(0, startIdx) + content.slice(endIdx + BLOCK_END.length + 1);
}

// Apply a fresh list of domains to hosts file
function applyBlockedDomains(domains) {
  let hosts = readHosts();

  // Remove old block section first
  hosts = clearBlockSection(hosts).trimEnd();

  if (!domains || domains.length === 0) {
    writeHosts(hosts + "\n");
    console.log("[Blocking] All blocks removed from hosts file.");
    return;
  }

  // Build new block section
  const lines = [];
  for (const domain of domains) {
    const clean = domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
    lines.push(`127.0.0.1 ${clean}`);
    lines.push(`127.0.0.1 www.${clean}`);    // also block www variant
  }

  const blockSection = [
    "",
    BLOCK_START,
    `# Auto-managed by WorkTrack Agent — do not edit manually`,
    `# Last updated: ${new Date().toISOString()}`,
    ...lines,
    BLOCK_END,
    "",
  ].join("\n");

  const ok = writeHosts(hosts + blockSection);
  if (ok) {
    console.log(`[Blocking] ${domains.length} domain(s) blocked in hosts file:`, domains);
  }
}

// Flush DNS cache so changes take effect immediately
function flushDns() {
  try {
    const { execSync } = await import("child_process");
    execSync("ipconfig /flushdns", { stdio: "ignore" });
    console.log("[Blocking] DNS cache flushed.");
  } catch {
    console.warn("[Blocking] Could not flush DNS cache.");
  }
}

/* ─────────────────────────────────────────
   FETCH BLOCKED LIST FROM SERVER
───────────────────────────────────────── */

let authToken = null;   // set this after agent login

export function setAuthToken(token) {
  authToken = token;
}

async function fetchAndApply() {
  try {
    const res = await fetch(`${SERVER_URL}/api/settings/blocking/domains`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });

    if (!res.ok) {
      console.warn("[Blocking] Server returned:", res.status);
      return;
    }

    const data = await res.json();

    if (!data.enabled) {
      // Admin ne blocking band ki — clear hosts
      applyBlockedDomains([]);
    } else {
      applyBlockedDomains(data.domains || []);
    }

    await flushDns();
  } catch (err) {
    console.error("[Blocking] fetchAndApply error:", err.message);
  }
}

/* ─────────────────────────────────────────
   VIOLATION REPORTER
   Jab employee koi blocked site try kare
───────────────────────────────────────── */

export async function reportViolation({ employeeId, domain, screenshotBase64 }) {
  try {
    await fetch(`${SERVER_URL}/api/settings/blocking/violation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        employeeId,
        domain,
        screenshotBase64: screenshotBase64 || null,
        timestamp: new Date().toISOString(),
      }),
    });
    console.log(`[Blocking] Violation reported: ${domain}`);
  } catch (err) {
    console.error("[Blocking] reportViolation error:", err.message);
  }
}

/* ─────────────────────────────────────────
   WEBSOCKET — realtime updates from admin
───────────────────────────────────────── */

function connectWebSocket() {
  const socket = io(SERVER_URL, {
    auth: { token: authToken },
    reconnection: true,
    reconnectionDelay: 3000,
  });

  socket.on("connect", () => {
    console.log("[Blocking] WebSocket connected — realtime blocking active.");
    // Immediately sync on connect
    fetchAndApply();
  });

  // Admin ne settings save ki → turant apply karo
  socket.on("blocking:updated", async (data) => {
    console.log("[Blocking] Realtime update received from admin.");
    if (!data.enabled) {
      applyBlockedDomains([]);
    } else {
      applyBlockedDomains(data.domains || []);
    }
    await flushDns();
  });

  socket.on("disconnect", () => {
    console.warn("[Blocking] WebSocket disconnected — falling back to polling.");
  });

  socket.on("connect_error", (err) => {
    console.warn("[Blocking] WebSocket error:", err.message);
  });

  return socket;
}

/* ─────────────────────────────────────────
   MAIN — call this from your agent startup
───────────────────────────────────────── */

let _pollTimer   = null;
let _socket      = null;

export function startBlocking(token) {
  if (token) authToken = token;

  console.log("[Blocking] Starting blocking module...");

  // 1️⃣ Initial fetch immediately
  fetchAndApply();

  // 2️⃣ WebSocket for realtime
  _socket = connectWebSocket();

  // 3️⃣ Polling every 30s as fallback
  _pollTimer = setInterval(fetchAndApply, POLL_INTERVAL);

  console.log(`[Blocking] Polling every ${POLL_INTERVAL / 1000}s as fallback.`);
}

export function stopBlocking() {
  if (_pollTimer) clearInterval(_pollTimer);
  if (_socket)    _socket.disconnect();

  // Remove all blocks when agent stops
  applyBlockedDomains([]);
  console.log("[Blocking] Blocking stopped, hosts file cleared.");
}