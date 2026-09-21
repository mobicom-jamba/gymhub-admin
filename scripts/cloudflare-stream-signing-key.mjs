#!/usr/bin/env node
/**
 * Cloudflare Stream-ийн signed URL түлхүүр үүсгэнэ.
 *
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_STREAM_API_TOKEN=... \
 *     node scripts/cloudflare-stream-signing-key.mjs
 *
 * Гарсан хоёр мөрийг .env.local (болон Vercel-ийн Environment Variables)-д
 * хуулж тавина. Ингэснээр сервер токенийг локалоор гарын үсэглэдэг болж,
 * видео бүрт Cloudflare API дуудахаа больдог.
 */

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_STREAM_API_TOKEN;

if (!accountId || !apiToken) {
  console.error("CLOUDFLARE_ACCOUNT_ID болон CLOUDFLARE_STREAM_API_TOKEN шаардлагатай.");
  process.exit(1);
}

const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/keys`, {
  method: "POST",
  headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
  body: "{}",
});

const json = await res.json();
if (!res.ok || !json.success) {
  console.error("Алдаа:", json.errors ?? res.statusText);
  process.exit(1);
}

console.log("# .env.local-д нэмнэ үү:");
console.log(`CLOUDFLARE_STREAM_SIGNING_KEY_ID=${json.result.id}`);
console.log(`CLOUDFLARE_STREAM_SIGNING_KEY_JWK=${json.result.jwk}`);
