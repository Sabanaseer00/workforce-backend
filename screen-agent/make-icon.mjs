import sharp from "sharp";
import pngToIco from "png-to-ico";
import fs from "fs";

const svg = Buffer.from(`<svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" fill="#0f172a" rx="40"/>
  <path d="M128 20 L220 65 L220 155 C220 210 128 240 128 240 C128 240 36 210 36 155 L36 65 Z" fill="#1e3a5f" stroke="#3b82f6" stroke-width="4"/>
  <text x="128" y="175" text-anchor="middle" font-family="Arial" font-size="110" font-weight="800" fill="#60a5fa">W</text>
  <polyline points="60,148 80,148 95,120 115,175 128,135 141,158 155,132 172,148 196,148" fill="none" stroke="#34d399" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`);

console.log("Generating icon...");

const p256 = await sharp(svg).resize(256,256).png().toBuffer();
const p64  = await sharp(svg).resize(64,64).png().toBuffer();
const p48  = await sharp(svg).resize(48,48).png().toBuffer();
const p32  = await sharp(svg).resize(32,32).png().toBuffer();
const p16  = await sharp(svg).resize(16,16).png().toBuffer();

fs.writeFileSync("assets/icon.png", p256);
console.log("assets/icon.png saved");

const ico = await pngToIco([p16, p32, p48, p64, p256]);
fs.writeFileSync("assets/icon.ico", ico);
console.log("assets/icon.ico saved");

console.log("Icon ready!");
