import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * MonPay mini-app OAuth + invoice API (z-wallet.monpay.mn).
 *
 * Environment:
 *   MONPAY_BASE_URL        – default https://z-wallet.monpay.mn
 *   MONPAY_CLIENT_ID
 *   MONPAY_CLIENT_SECRET
 *   MONPAY_REDIRECT_URI    – OAuth redirect (must match mini-app registration)
 *   MONPAY_RECEIVER        – P2B branch name (dev: partnerBayas)
 *   MONPAY_WEBHOOK_SECRET  – HMAC key for X-MonPay-Signature
 *   MONPAY_WEBHOOK_URL     – optional; defaults to API /api/payment/monpay/webhook
 */

const MONPAY_BASE = (process.env.MONPAY_BASE_URL ?? "https://z-wallet.monpay.mn").replace(
  /\/$/,
  "",
);
const MONPAY_CLIENT_ID = process.env.MONPAY_CLIENT_ID ?? "";
const MONPAY_CLIENT_SECRET = process.env.MONPAY_CLIENT_SECRET ?? "";
const MONPAY_REDIRECT_URI = (process.env.MONPAY_REDIRECT_URI ?? "").trim();
const MONPAY_RECEIVER = (process.env.MONPAY_RECEIVER ?? "partnerBayas").trim();
const MONPAY_WEBHOOK_SECRET = (process.env.MONPAY_WEBHOOK_SECRET ?? "").trim();

/** Env names missing on the server (safe to expose in /api/payment/health). */
export function getMonpayMissingEnvKeys(): string[] {
  const missing: string[] = [];
  if (!MONPAY_CLIENT_ID.trim()) missing.push("MONPAY_CLIENT_ID");
  if (!MONPAY_CLIENT_SECRET.trim()) missing.push("MONPAY_CLIENT_SECRET");
  if (!MONPAY_REDIRECT_URI.trim()) missing.push("MONPAY_REDIRECT_URI");
  return missing;
}

export function isMonpayConfigured(): boolean {
  return getMonpayMissingEnvKeys().length === 0;
}

export function monpayConfigStatusMessage(): string {
  const missing = getMonpayMissingEnvKeys();
  if (missing.length === 0) return "MonPay тохиргоо бэлэн";
  return `MonPay: Vercel дээр нэмнэ үү — ${missing.join(", ")}`;
}

export function getMonpayRedirectUri(): string {
  return MONPAY_REDIRECT_URI;
}

export function getMonpayReceiver(): string {
  return MONPAY_RECEIVER;
}

type MonpayEnvelope<T> = {
  code?: string;
  intCode?: number;
  info?: string;
  result?: T;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

function monpayAuthHeader(accessToken: string): Record<string, string> {
  const t = accessToken.trim();
  return { Authorization: t.toLowerCase().startsWith("bearer") ? t : `Bearer ${t}` };
}

function unwrapResult<T>(data: MonpayEnvelope<unknown>): T {
  if (data.result != null && typeof data.result === "object") {
    return data.result as T;
  }
  return data as unknown as T;
}

function monpayErrorMessage(data: MonpayEnvelope<unknown>, fallback: string): string {
  return (
    data.info?.trim() ||
    data.error_description?.trim() ||
    data.error?.trim() ||
    data.code?.trim() ||
    fallback
  );
}

async function parseJson(res: Response): Promise<MonpayEnvelope<unknown>> {
  try {
    return (await res.json()) as MonpayEnvelope<unknown>;
  } catch {
    return {};
  }
}

/** Exchange OAuth authorization code (mini-app entry) for user access token. */
export async function exchangeAuthorizationCode(
  code: string,
  redirectUri?: string,
): Promise<{ access_token: string; token_type?: string; expires_in?: number; scope?: string }> {
  if (!isMonpayConfigured()) {
    throw new Error("MonPay credentials are not configured");
  }
  const redirect = (redirectUri ?? MONPAY_REDIRECT_URI).trim();
  if (!redirect) {
    throw new Error("MONPAY_REDIRECT_URI тохируулаагүй байна");
  }

  const body = new URLSearchParams({
    redirect_uri: redirect,
    client_id: MONPAY_CLIENT_ID,
    client_secret: MONPAY_CLIENT_SECRET,
    code: code.trim(),
    grant_type: "authorization_code",
  });

  const res = await fetch(`${MONPAY_BASE}/v2/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    signal: AbortSignal.timeout(20_000),
  });

  const data = await parseJson(res);
  const token = data.access_token ?? (unwrapResult(data) as { access_token?: string }).access_token;
  if (!res.ok || !token) {
    throw new Error(monpayErrorMessage(data, `MonPay token алдаа (${res.status})`));
  }

  return {
    access_token: String(token),
    token_type: data.token_type,
    expires_in: data.expires_in,
    scope: data.scope,
  };
}

export type MonpayUserInfo = {
  userId: number;
  userPhone?: number;
  userEmail?: string;
  userFirstname?: string;
  userLastname?: string;
};

export async function getUserInfo(accessToken: string): Promise<MonpayUserInfo> {
  const res = await fetch(`${MONPAY_BASE}/v2/api/oauth/userinfo`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...monpayAuthHeader(accessToken),
    },
    signal: AbortSignal.timeout(15_000),
  });

  const data = await parseJson(res);
  const result = unwrapResult<MonpayUserInfo>(data);
  if (!res.ok || result.userId == null) {
    throw new Error(monpayErrorMessage(data, `MonPay userinfo алдаа (${res.status})`));
  }
  return result;
}

export type MonpayInvoice = {
  id: number;
  amount: number;
  status: string;
  statusInfo?: string;
  redirectUri?: string;
  description?: string;
  receiver?: string;
  invoiceType?: string;
  txnId?: string;
};

export async function createInvoice(
  accessToken: string,
  opts: {
    amount: number;
    redirectUri: string;
    clientServiceUrl?: string;
    description: string;
    receiver?: string;
    invoiceType?: "P2B" | "P2P" | "B2B";
  },
): Promise<MonpayInvoice> {
  const payload: Record<string, unknown> = {
    amount: opts.amount,
    redirectUri: opts.redirectUri,
    receiver: opts.receiver ?? MONPAY_RECEIVER,
    invoiceType: opts.invoiceType ?? "P2B",
    description: opts.description,
  };
  if (opts.clientServiceUrl) {
    payload.clientServiceUrl = opts.clientServiceUrl;
  }

  const res = await fetch(`${MONPAY_BASE}/v2/api/oauth/invoice`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...monpayAuthHeader(accessToken),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  const data = await parseJson(res);
  const result = unwrapResult<MonpayInvoice>(data);
  if (!res.ok || result.id == null) {
    throw new Error(monpayErrorMessage(data, `MonPay invoice алдаа (${res.status})`));
  }
  return result;
}

export async function checkInvoice(
  accessToken: string,
  invoiceId: string | number,
): Promise<{ paid: boolean; status: string; message: string; invoice: MonpayInvoice }> {
  const id = encodeURIComponent(String(invoiceId).trim());
  const res = await fetch(`${MONPAY_BASE}/v2/api/oauth/invoice/${id}`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...monpayAuthHeader(accessToken),
    },
    signal: AbortSignal.timeout(15_000),
  });

  const data = await parseJson(res);
  const result = unwrapResult<MonpayInvoice>(data);
  if (!res.ok || result.id == null) {
    throw new Error(monpayErrorMessage(data, `MonPay check алдаа (${res.status})`));
  }

  const status = String(result.status ?? "").toUpperCase();
  const paid = status === "PAID";
  const msg = paid
    ? result.statusInfo?.trim() || "Төлбөр амжилттай төлөгдлөө"
    : result.statusInfo?.trim() || `Төлөв: ${status || "NEW"}`;

  return { paid, status, message: msg, invoice: result };
}

export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!MONPAY_WEBHOOK_SECRET) return true;
  if (!signatureHeader?.trim()) return false;
  const expected = createHmac("sha256", MONPAY_WEBHOOK_SECRET).update(rawBody).digest("hex");
  const received = signatureHeader.trim().toLowerCase();
  try {
    return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(received, "hex"));
  } catch {
    return expected === received;
  }
}

export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
  if (!isMonpayConfigured()) {
    return { ok: false, message: "MonPay тохиргоо дутуу байна" };
  }
  return { ok: true, message: "MonPay тохиргоо бэлэн" };
}
