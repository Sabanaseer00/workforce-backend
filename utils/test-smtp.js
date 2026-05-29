// test-smtp.js — run this to see exact error
// node test-smtp.js gmail.com test@gmail.com

import dns from "dns";
import net from "net";
import { promisify } from "util";

const resolveMx = promisify(dns.resolveMx);

const domain = process.argv[2] || "gmail.com";
const email  = process.argv[3] || "test@gmail.com";

console.log(`\n🔍 Testing: ${email}`);
console.log(`📡 Domain: ${domain}\n`);

// Step 1: MX check
try {
  const records = await resolveMx(domain);
  records.sort((a, b) => a.priority - b.priority);
  console.log("✅ MX Records found:");
  records.forEach(r => console.log(`   ${r.priority} → ${r.exchange}`));
  const mxHost = records[0].exchange;

  // Step 2: Port 25 reachable?
  console.log(`\n🔌 Testing port 25 on ${mxHost}...`);
  const socket = net.createConnection(25, mxHost);
  socket.setTimeout(8000);

  socket.on("connect", () => {
    console.log("✅ Port 25 OPEN — SMTP connection successful");
    socket.destroy();
  });

  socket.on("timeout", () => {
    console.log("❌ Port 25 TIMEOUT — Port is BLOCKED by your ISP/hosting");
    console.log("💡 Solution: Use Abstract API or ZeroBounce for email verification");
    socket.destroy();
  });

  socket.on("error", (err) => {
    console.log(`❌ Port 25 ERROR: ${err.message}`);
    console.log("💡 Solution: Use Abstract API or ZeroBounce for email verification");
    socket.destroy();
  });

} catch (err) {
  console.log(`❌ MX lookup failed: ${err.message}`);
}