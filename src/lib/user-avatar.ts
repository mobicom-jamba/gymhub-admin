const USER_PLACEHOLDERS = [
  "/images/user/groom_928045.png",
  "/images/user/groom_927999.png",
  "/images/user/bride_928034.png",
  "/images/user/bride_927998.png",
];

function hashSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

export function getUserPlaceholderAvatar(seed?: string | null) {
  const value = seed?.trim() || "default-user";
  return USER_PLACEHOLDERS[hashSeed(value) % USER_PLACEHOLDERS.length];
}

/**
 * Build a small thumbnail URL for a stored avatar path (Supabase media-public
 * bucket), using the image-render endpoint for a light payload. Returns null
 * when there is no usable path so callers can fall back to a placeholder.
 */
export function buildAvatarThumbUrl(raw: string | null | undefined, size = 96): string | null {
  const v = String(raw ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  let safePath = v.startsWith("/") ? v.slice(1) : v;
  if (safePath.startsWith("media-public/")) safePath = safePath.slice("media-public/".length);
  if (!safePath) return null;
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "").replace(/\\n$/, "").trim();
  if (!base) return null;
  return (
    `${base}/storage/v1/render/image/public/media-public/${encodeURI(safePath)}` +
    `?width=${size}&height=${size}&resize=cover&quality=60`
  );
}

