import crypto from "node:crypto";

/**
 * Cloudflare Stream-тэй ажиллах давхарга.
 *
 * Видеог админ панелаас ШУУД Cloudflare руу илгээнэ (direct creator upload):
 * сервер зөвхөн нэг удаагийн upload URL үүсгэж өгдөг тул Vercel-ийн
 * хүсэлтийн 4.5MB хязгаарт хичээлийн видео баригдахгүй.
 *
 * Бүх видео `requireSignedURLs: true` — токенгүйгээр үзэх боломжгүй.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

/** Signed URL-ийн анхдагч ашиглалтын хугацаа (секунд). */
export const DEFAULT_PLAYBACK_TTL_SECONDS = 4 * 60 * 60;

export type CloudflareVideo = {
  uid: string;
  state: "pending" | "uploading" | "processing" | "ready" | "error";
  errorText: string | null;
  durationSeconds: number | null;
  /** customer-<code>.cloudflarestream.com/<uid>/manifest/video.m3u8 */
  hlsUrl: string | null;
};

type CfEnvelope<T> = {
  success: boolean;
  result: T;
  errors?: Array<{ code: number; message: string }>;
};

export class CloudflareStreamError extends Error {}

function config() {
  const accountId = (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const apiToken = (process.env.CLOUDFLARE_STREAM_API_TOKEN ?? "").trim();
  if (!accountId || !apiToken) {
    throw new CloudflareStreamError(
      "Cloudflare Stream тохируулаагүй байна. CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN-г нэмнэ үү.",
    );
  }
  return { accountId, apiToken };
}

/** Cloudflare тохируулагдсан эсэх — UI дээр анхааруулга харуулахад. */
export function isCloudflareStreamConfigured(): boolean {
  return Boolean(
    (process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim() &&
      (process.env.CLOUDFLARE_STREAM_API_TOKEN ?? "").trim(),
  );
}

async function streamFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const { accountId, apiToken } = config();
  const res = await fetch(`${API_BASE}/accounts/${accountId}/stream${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as CfEnvelope<T> | null;
  if (!res.ok || !json?.success) {
    const message =
      json?.errors?.map((e) => e.message).join("; ") || `Cloudflare алдаа (HTTP ${res.status})`;
    throw new CloudflareStreamError(message);
  }
  return json.result;
}

// ─── Upload ──────────────────────────────────────────────────────────────────

export type DirectUpload = { uid: string; uploadUrl: string };

/**
 * Нэг удаагийн upload URL. Хөтөч энэ URL руу `file` талбартай multipart
 * POST хийхэд видео Cloudflare дээр буудаг.
 */
export async function createDirectUpload(args: {
  name: string;
  maxDurationSeconds?: number;
  creator?: string;
}): Promise<DirectUpload> {
  const result = await streamFetch<{ uid: string; uploadURL: string }>("/direct_upload", {
    method: "POST",
    body: JSON.stringify({
      // Cloudflare-ийн дээд хязгаар 21600 сек (6 цаг); хичээлд 3 цаг хангалттай.
      maxDurationSeconds: args.maxDurationSeconds ?? 3 * 60 * 60,
      requireSignedURLs: true,
      // Upload линк 2 цагийн дотор ашиглагдана.
      expiry: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
      creator: args.creator,
      meta: { name: args.name },
    }),
  });
  return { uid: result.uid, uploadUrl: result.uploadURL };
}

// ─── Мэдээлэл татах / устгах ────────────────────────────────────────────────

type RawVideo = {
  uid: string;
  status?: { state?: string; errorReasonText?: string | null } | null;
  duration?: number | null;
  readyToStream?: boolean | null;
  playback?: { hls?: string | null } | null;
};

function normalizeVideo(raw: RawVideo): CloudflareVideo {
  const state = String(raw.status?.state ?? "").toLowerCase();
  const mapped: CloudflareVideo["state"] =
    state === "ready" || raw.readyToStream
      ? "ready"
      : state === "error"
        ? "error"
        : state === "inprogress" || state === "queued" || state === "downloading"
          ? "processing"
          : "uploading";

  const duration = typeof raw.duration === "number" && raw.duration > 0 ? Math.round(raw.duration) : null;

  return {
    uid: raw.uid,
    state: mapped,
    errorText: raw.status?.errorReasonText?.trim() || null,
    durationSeconds: duration,
    hlsUrl: raw.playback?.hls ?? null,
  };
}

export async function getVideo(uid: string): Promise<CloudflareVideo> {
  return normalizeVideo(await streamFetch<RawVideo>(`/${encodeURIComponent(uid)}`));
}

export async function deleteVideo(uid: string): Promise<void> {
  const { accountId, apiToken } = config();
  const res = await fetch(`${API_BASE}/accounts/${accountId}/stream/${encodeURIComponent(uid)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${apiToken}` },
    cache: "no-store",
  });
  // Аль хэдийн устсан бол алдаа гэж үзэхгүй — DB-гээ цэвэрлэх нь чухал.
  if (!res.ok && res.status !== 404) {
    throw new CloudflareStreamError(`Cloudflare-оос устгаж чадсангүй (HTTP ${res.status})`);
  }
}

// ─── Signed playback token ──────────────────────────────────────────────────

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function localSigningKey(): { id: string; jwk: crypto.JsonWebKey } | null {
  const id = (process.env.CLOUDFLARE_STREAM_SIGNING_KEY_ID ?? "").trim();
  const raw = (process.env.CLOUDFLARE_STREAM_SIGNING_KEY_JWK ?? "").trim();
  if (!id || !raw) return null;
  try {
    // Cloudflare нь JWK-г base64-дсэн байдлаар өгдөг; түүхий JSON ч бас дэмжинэ.
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    return { id, jwk: JSON.parse(json) as crypto.JsonWebKey };
  } catch {
    return null;
  }
}

/**
 * Тоглуулах токен. Түлхүүрийг өөрсдөө хадгалсан бол локалоор гарын үсэг
 * зурна (сүлжээний дуудлагагүй тул жагсаалт бүрт хэдэн ч видео гарын үсэглэж
 * болно); байхгүй бол Cloudflare-ийн /token endpoint рүү фallback хийнэ.
 */
export async function signPlaybackToken(
  uid: string,
  ttlSeconds: number = DEFAULT_PLAYBACK_TTL_SECONDS,
): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const key = localSigningKey();

  if (key) {
    const header = base64url(JSON.stringify({ alg: "RS256", kid: key.id }));
    const payload = base64url(
      JSON.stringify({ sub: uid, kid: key.id, exp, nbf: Math.floor(Date.now() / 1000) - 60 }),
    );
    const privateKey = crypto.createPrivateKey({ key: key.jwk, format: "jwk" });
    const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey);
    return `${header}.${payload}.${base64url(signature)}`;
  }

  const result = await streamFetch<{ token: string }>(`/${encodeURIComponent(uid)}/token`, {
    method: "POST",
    body: JSON.stringify({ exp }),
  });
  return result.token;
}

/** Локал түлхүүр тохируулсан эсэх — жагсаалт бүрийг гарын үсэглэх боломжтой юу. */
export function canSignLocally(): boolean {
  return localSigningKey() !== null;
}

// ─── Playback URL-ууд ───────────────────────────────────────────────────────

export type PlaybackUrls = {
  hls: string;
  dash: string;
  iframe: string;
  thumbnail: string;
  expiresAt: string;
};

/**
 * Хадгалсан HLS URL дээрх uid-г токеноор сольж, бүх сувгийн хаягийг гаргана.
 * customer-<code>.cloudflarestream.com/<token>/... хэлбэртэй.
 */
export function playbackUrls(args: {
  hlsUrl: string | null;
  uid: string;
  token: string;
  ttlSeconds?: number;
}): PlaybackUrls | null {
  const base = customerBase(args.hlsUrl, args.uid);
  if (!base) return null;
  const ttl = args.ttlSeconds ?? DEFAULT_PLAYBACK_TTL_SECONDS;
  return {
    hls: `${base}/${args.token}/manifest/video.m3u8`,
    dash: `${base}/${args.token}/manifest/video.mpd`,
    iframe: `${base}/${args.token}/iframe`,
    thumbnail: `${base}/${args.token}/thumbnails/thumbnail.jpg?time=3s&height=360`,
    expiresAt: new Date(Date.now() + ttl * 1000).toISOString(),
  };
}

/** `https://customer-xxx.cloudflarestream.com` хэсгийг ялгаж авна. */
function customerBase(hlsUrl: string | null, uid: string): string | null {
  if (hlsUrl) {
    const idx = hlsUrl.indexOf(`/${uid}/`);
    if (idx > 0) return hlsUrl.slice(0, idx);
    try {
      return new URL(hlsUrl).origin;
    } catch {
      /* доорх fallback руу */
    }
  }
  const code = (process.env.CLOUDFLARE_STREAM_CUSTOMER_CODE ?? "").trim();
  return code ? `https://customer-${code}.cloudflarestream.com` : null;
}
