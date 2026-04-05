/**
 * Next.js 16+: middleware.ts болон proxy.ts зэрэгцэж болохгүй.
 * Зөвхөн src/proxy.ts ашиглана — legacy middleware устгана уу.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const candidates = [
  "middleware.ts",
  "middleware.js",
  "middleware.tsx",
  path.join("src", "middleware.ts"),
  path.join("src", "middleware.js"),
  path.join("src", "middleware.tsx"),
  path.join("src", "src", "middleware.ts"),
  path.join("src", "src", "middleware.js"),
];

const found = [];
for (const rel of candidates) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) found.push(rel);
}

if (found.length) {
  console.error(
    "\n[gymhub-admin] Next.js 16: middleware.ts ашиглахгүй. Устгана уу:\n  " +
      found.join("\n  ") +
      "\n\nЗөвхөн src/proxy.ts (export async function proxy) үлдээнэ.\n" +
      "Vercel → Settings → General → Root Directory нь хоосон (репогийн үндэс) байх ёстой.\n",
  );
  process.exit(1);
}
