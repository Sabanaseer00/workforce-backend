// utils/smtpCheck.js
// ═══════════════════════════════════════════════════════════════
// REAL EMAIL VERIFICATION SYSTEM
//
// Strategy:
//   1. Username quality check  → blocks keyboard-mash instantly
//   2. Abstract API            → primary truth (DELIVERABLE/UNDELIVERABLE/UNKNOWN)
//   3. For UNKNOWN:            → strict scoring (quality_score + is_smtp_valid)
//   4. MX + SMTP fallback      → only when Abstract API is down
// ═══════════════════════════════════════════════════════════════

import dns  from "dns";
import net  from "net";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);

// ──────────────────────────────────────────────
// DISPOSABLE DOMAINS (instant reject)
// ──────────────────────────────────────────────
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com","guerrillamail.com","tempmail.com","yopmail.com",
  "10minutemail.com","trashmail.com","fakeinbox.com","mohmal.com",
  "temp-mail.org","throwaway.email","maildrop.cc","dispostable.com",
  "getairmail.com","mailnull.com","spamgourmet.com","trashmail.at",
  "trashmail.io","trashmail.me","trashmail.net","spambox.us",
  "discard.email","tempr.email","zetmail.com","moakt.com",
  "emlpro.com","emltmp.com","tempinbox.com","tempemail.net",
  "mytemp.email","emailondeck.com","spam4.me","sharklasers.com",
  "guerrillamail.info","guerrillamail.biz","guerrillamail.de",
  "guerrillamail.net","guerrillamail.org","grr.la","filzmail.com",
  "throwam.com","spamherelots.com","crazymailing.com",
]);

// ──────────────────────────────────────────────
// FREE / CATCH-ALL PROVIDERS
// ──────────────────────────────────────────────
const FREE_PROVIDERS = new Set([
  "gmail.com","googlemail.com",
  "yahoo.com","yahoo.co.uk","yahoo.co.in","yahoo.fr","yahoo.de","yahoo.es",
  "outlook.com","hotmail.com","hotmail.co.uk","live.com","msn.com",
  "icloud.com","me.com","mac.com",
  "protonmail.com","proton.me","pm.me",
  "zoho.com","aol.com",
]);

// ──────────────────────────────────────────────
// LAYER 1 — USERNAME QUALITY CHECK
// Blocks keyboard-mash before wasting API calls
// errfrt / asdfgh / qwerty / aaaa / 12345
// ──────────────────────────────────────────────
function checkUsernameQuality(username) {
  const u = username.toLowerCase();

  // Too short
  if (u.length < 4) {
    return { ok: false, reason: "Email address is too short to be valid" };
  }

  // Repeating same character 4+ times: aaaa, 1111
  if (/(.)\1{3,}/.test(u)) {
    return { ok: false, reason: "Email address does not appear to be real" };
  }

  // Keyboard-walk & mash patterns
  const BAD_PATTERNS = [
    "qwerty","qwert","werty","asdf","sdfg","dfgh","fghj","ghjk","hjkl",
    "zxcv","xcvb","cvbn","vbnm","qazwsx","wsxedc","edcrfv","rfvtgb",
    "tgbyhn","yhnujm","1234","2345","3456","4567","5678","6789","7890",
    "abcd","bcde","cdef","defg","efgh","fghi","ghij","hijk","ijkl",
  ];

  for (const p of BAD_PATTERNS) {
    if (u.includes(p)) {
      return { ok: false, reason: "Email address does not appear to be real" };
    }
  }

  // Consecutive consonants ≥ 5 = keyboard mash
  // errfrt → e(v) r(c) r(c) f(c) r(c) t(c) = 5 consecutive = FAKE
  // beenish → b(c) ee(v) n(c) i(v) sh(c) = max 2 = REAL
  const VOWELS = new Set(["a","e","i","o","u"]);
  let maxConsec = 0, cur = 0;
  for (const ch of u) {
    if (/[a-z]/.test(ch) && !VOWELS.has(ch)) {
      cur++;
      if (cur > maxConsec) maxConsec = cur;
    } else {
      cur = 0;
    }
  }
  if (maxConsec >= 5) {
    return { ok: false, reason: "Email address does not appear to be real" };
  }

  return { ok: true };
}

// ──────────────────────────────────────────────
// LAYER 2 — ABSTRACT API
//
// Abstract API response for gmail:
//
//   REAL email (beenishlatif1026@gmail.com):
//     deliverability : "DELIVERABLE"
//     quality_score  : "0.80"
//     is_smtp_valid  : { value: true }
//     is_mx_found    : { value: true }
//
//   FAKE email (errfrt@gmail.com):
//     deliverability : "UNKNOWN" or "UNDELIVERABLE"
//     quality_score  : "0.60" or lower
//     is_smtp_valid  : { value: false }
//     is_mx_found    : { value: true }  ← domain exists but mailbox doesn't
//
// RULE:
//   DELIVERABLE                          → ✅ VALID
//   UNDELIVERABLE                        → ❌ INVALID
//   UNKNOWN + score≥0.80 + smtp=true     → ✅ VALID  (real but catch-all server)
//   UNKNOWN + score<0.80 OR smtp=false   → ❌ INVALID (fake mailbox)
// ──────────────────────────────────────────────
async function checkViaAbstractAPI(email, domain) {
  const API_KEY = process.env.ABSTRACT_API_KEY || "";

  if (!API_KEY) {
    console.warn("⚠️  ABSTRACT_API_KEY missing in .env");
    return null;
  }

  try {
    console.log("🌐 Abstract API calling:", email);
    const url = `https://emailvalidation.abstractapi.com/v1/?api_key=${API_KEY}&email=${encodeURIComponent(email)}`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(15000) });

    console.log("📡 Abstract HTTP:", res.status);

    if (res.status === 429) { console.warn("⚠️  Rate limit"); return null; }
    if (!res.ok)            { console.warn("⚠️  API error");  return null; }

    const d = await res.json();
    console.log("📩 Abstract Full Response:", JSON.stringify(d, null, 2));

    // API returned error object
    if (d.error) { console.warn("⚠️  API error object:", d.error); return null; }

    // ── Hard blocks ─────────────────────────────────────────
    if (d.is_valid_format?.value     === false) return { valid: false, reason: "Invalid email format" };
    if (d.is_disposable_email?.value === true)  return { valid: false, reason: "Disposable emails are not allowed" };
    if (d.is_mx_found?.value         === false) return { valid: false, reason: "This email domain cannot receive emails" };

    // ── DELIVERABLE → confirmed real ─────────────────────────
    if (d.deliverability === "DELIVERABLE") {
      return { valid: true, reason: "Email verified ✅" };
    }

    // ── UNDELIVERABLE → confirmed fake ───────────────────────
    if (d.deliverability === "UNDELIVERABLE") {
      return { valid: false, reason: "This email address does not exist" };
    }

    // ── UNKNOWN → deep analysis ───────────────────────────────
    // Gmail/Yahoo are catch-all — SMTP never confirms individual mailboxes
    // So Abstract returns UNKNOWN. We use quality_score + is_smtp_valid together.
    if (d.deliverability === "UNKNOWN") {
      const score    = parseFloat(d.quality_score)    || 0;
      const smtpOk   = d.is_smtp_valid?.value         === true;
      const isFree   = FREE_PROVIDERS.has(domain);

      console.log(`ℹ️  UNKNOWN | score:${score} | smtp_valid:${smtpOk} | free_provider:${isFree}`);

      // For free providers (gmail etc):
      //   Need BOTH high score AND smtp valid to accept
      //   This is because domain itself inflates score
      if (isFree) {
        if (score >= 0.80 && smtpOk) {
          return { valid: true,  reason: "Email verified ✅" };
        } else {
          return { valid: false, reason: "This email address does not exist" };
        }
      }

      // For business/custom domains:
      //   Lower threshold ok since domain doesn't inflate score
      if (score >= 0.70 && smtpOk) {
        return { valid: true,  reason: "Email verified ✅" };
      } else {
        return { valid: false, reason: "This email address does not exist" };
      }
    }

    // Inconclusive — fall to MX
    console.log("ℹ️  Inconclusive — falling to MX");
    return null;

  } catch (err) {
    console.error("❌ Abstract API exception:", err.message);
    return null;
  }
}

// ──────────────────────────────────────────────
// LAYER 3A — MX CHECK (Abstract unavailable fallback)
// ──────────────────────────────────────────────
async function checkViaMX(domain) {
  if (FREE_PROVIDERS.has(domain.toLowerCase())) {
    return { valid: true, reason: "Known provider", mx: null };
  }
  try {
    const records = await resolveMx(domain);
    if (!records?.length) {
      return { valid: false, reason: "No MX records — domain cannot receive email" };
    }
    records.sort((a, b) => a.priority - b.priority);
    return { valid: true, reason: "MX verified", mx: records[0].exchange };
  } catch {
    return { valid: false, reason: "Could not verify email domain" };
  }
}

// ──────────────────────────────────────────────
// LAYER 3B — SMTP PROBE (port 25, often blocked)
// Returns null = "can't tell" → never rejects based on null
// ──────────────────────────────────────────────
function checkViaSMTP(mxHost, email) {
  return new Promise((resolve) => {
    let resolved = false, buffer = "", step = "connect";
    const socket = net.createConnection({ host: mxHost, port: 25 });
    socket.setTimeout(8000);

    const done = (r) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch {}
      resolve(r);
    };

    socket.on("timeout", () => { console.log("⚠️  SMTP timeout"); done(null); });
    socket.on("error",   (e) => { console.log("⚠️  SMTP err:", e.message); done(null); });

    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\r\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line) continue;
        const code = parseInt(line.slice(0, 3), 10);
        if (line[3] === "-") continue; // multi-line, wait for last

        if      (code === 220 && step === "connect")  { step = "ehlo";     socket.write("EHLO verify.local\r\n"); }
        else if (code === 250 && step === "ehlo")     { step = "mailfrom"; socket.write("MAIL FROM:<v@v.local>\r\n"); }
        else if (code === 250 && step === "mailfrom") { step = "rcptto";   socket.write(`RCPT TO:<${email}>\r\n`); }
        else if ((code === 250 || code === 251) && step === "rcptto") {
          socket.write("QUIT\r\n");
          done({ valid: true,  reason: "Mailbox confirmed via SMTP" });
        }
        else if ([550,551,552,553,554].includes(code) && step === "rcptto") {
          socket.write("QUIT\r\n");
          done({ valid: false, reason: "Mailbox does not exist" });
        }
        else if ([421,451,452].includes(code)) {
          socket.write("QUIT\r\n"); done(null);
        }
      }
    });
  });
}

// ══════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════
export async function verifyEmailExists(email) {
  try {
    const clean = email.trim().toLowerCase();

    // Format
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
      return { valid: false, reason: "Invalid email format" };
    }

    const [username, domain] = clean.split("@");

    // Disposable
    if (DISPOSABLE_DOMAINS.has(domain)) {
      return { valid: false, reason: "Disposable/temporary emails are not allowed" };
    }

    // ── LAYER 1: Username sanity (instant) ────────────────────
    const uCheck = checkUsernameQuality(username);
    if (!uCheck.ok) {
      console.log(`[Verify] ❌ Username rejected: "${username}" → ${uCheck.reason}`);
      return { valid: false, reason: uCheck.reason };
    }
    console.log(`[Verify] ✅ Username OK: "${username}"`);

    // ── LAYER 2: Abstract API ─────────────────────────────────
    const apiResult = await checkViaAbstractAPI(clean, domain);
    if (apiResult !== null) {
      console.log(`[Verify] Abstract → valid:${apiResult.valid} | ${apiResult.reason}`);
      return apiResult;
    }

    // ── LAYER 3: MX + SMTP (only if Abstract is down) ─────────
    console.log("[Verify] Abstract unavailable → MX fallback");
    const mxResult = await checkViaMX(domain);
    console.log(`[Verify] MX → valid:${mxResult.valid} | ${mxResult.reason}`);
    if (!mxResult.valid) return mxResult;

    if (mxResult.mx) {
      const smtpResult = await checkViaSMTP(mxResult.mx, clean);
      if (smtpResult !== null) {
        console.log(`[Verify] SMTP → valid:${smtpResult.valid} | ${smtpResult.reason}`);
        return smtpResult;
      }
    }

    // MX valid + SMTP blocked + username passed = accept
    return { valid: true, reason: "Domain verified (SMTP blocked — mailbox unconfirmable)" };

  } catch (err) {
    console.error("❌ verifyEmailExists crash:", err.message);
    return { valid: false, reason: "Verification failed — please try again" };
  }
}