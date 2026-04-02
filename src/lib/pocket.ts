/**
 * Pocket Payment Gateway client library
 * Handles OAuth2 token management, invoice creation, and status checking.
 *
 * Environment variables:
 *   POCKET_OAUTH_HOST      – e.g. sso.invescore.mn
 *   POCKET_MERCHANT_HOST   – e.g. service.invescore.mn/merchant
 *   POCKET_REALM           – e.g. invescore
 *   POCKET_CLIENT_ID       – merchant client ID
 *   POCKET_CLIENT_SECRET   – merchant client secret
 *   POCKET_TERMINAL_ID     – terminal ID (number as string)
 */

import QRCode from "qrcode";

/* ---------- config ---------- */

const POCKET_OAUTH_HOST = process.env.POCKET_OAUTH_HOST ?? "";
const POCKET_MERCHANT_HOST = process.env.POCKET_MERCHANT_HOST ?? "";
const POCKET_REALM = process.env.POCKET_REALM ?? "invescore";
const POCKET_CLIENT_ID = process.env.POCKET_CLIENT_ID ?? "";
const POCKET_CLIENT_SECRET = process.env.POCKET_CLIENT_SECRET ?? "";
const POCKET_TERMINAL_ID = process.env.POCKET_TERMINAL_ID ?? "";

export function isPocketConfigured(): boolean {
  return !!(
    POCKET_OAUTH_HOST &&
    POCKET_MERCHANT_HOST &&
    POCKET_CLIENT_ID &&
    POCKET_CLIENT_SECRET &&
    POCKET_TERMINAL_ID
  );
}

/* ---------- token cache ---------- */

let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _tokenExpiresAt = 0;
let _refreshExpiresAt = 0;

function tokenUrl(): string {
  return `https://${POCKET_OAUTH_HOST}/auth/realms/${POCKET_REALM}/protocol/openid-connect/token`;
}

function merchantUrl(path: string): string {
  return `https://${POCKET_MERCHANT_HOST}${path.startsWith("/") ? path : `/${path}`}`;
}

/**
 * Get a valid access token, refreshing or re-acquiring as needed.
 */
export async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Return cached token if still valid (with 30s buffer)
  if (_accessToken && now < _tokenExpiresAt - 30_000) {
    return _accessToken;
  }

  // Try refresh token if available
  if (_refreshToken && now < _refreshExpiresAt - 30_000) {
    try {
      return await refreshAccessToken();
    } catch {
      // Fallback to client_credentials if refresh fails
    }
  }

  // Acquire new token via client_credentials
  const params = new URLSearchParams();
  params.set("client_id", POCKET_CLIENT_ID);
  params.set("client_secret", POCKET_CLIENT_SECRET);
  params.set("grant_type", "client_credentials");

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pocket token error (${res.status}): ${text}`);
  }

  const data = await res.json();
  _accessToken = data.access_token as string;
  _refreshToken = data.refresh_token as string | null;
  _tokenExpiresAt = now + (data.expires_in ?? 600) * 1000;
  _refreshExpiresAt = now + (data.refresh_expires_in ?? 900) * 1000;

  return _accessToken;
}

async function refreshAccessToken(): Promise<string> {
  const params = new URLSearchParams();
  params.set("client_id", POCKET_CLIENT_ID);
  params.set("client_secret", POCKET_CLIENT_SECRET);
  params.set("grant_type", "refresh_token");
  params.set("refresh_token", _refreshToken!);

  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    _refreshToken = null;
    throw new Error(`Pocket refresh failed (${res.status})`);
  }

  const now = Date.now();
  const data = await res.json();
  _accessToken = data.access_token as string;
  _refreshToken = data.refresh_token as string | null;
  _tokenExpiresAt = now + (data.expires_in ?? 600) * 1000;
  _refreshExpiresAt = now + (data.refresh_expires_in ?? 900) * 1000;

  return _accessToken;
}

/* ---------- invoice ---------- */

export type PocketInvoiceResponse = {
  id: number;
  qr: string;
  orderNumber: string;
  deeplink: string;
};

/**
 * Create a Pocket invoice.
 * Returns the raw Pocket response (id, qr string, orderNumber, deeplink).
 */
export async function createInvoice(opts: {
  amount: number;
  orderNumber: string;
  info?: string;
  invoiceType?: "ZERO" | "LEASING";
  channel?: "ecommerce" | "pos";
}): Promise<PocketInvoiceResponse> {
  const token = await getAccessToken();
  const terminalId = Number(POCKET_TERMINAL_ID);

  const body = {
    terminalId,
    amount: opts.amount,
    info: opts.info ?? `GymHub-${opts.orderNumber}`,
    orderNumber: opts.orderNumber,
    invoiceType: opts.invoiceType ?? "ZERO",
    channel: opts.channel ?? "ecommerce",
  };

  const res = await fetch(merchantUrl("/v2/invoicing/generate-invoice"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const errJson = JSON.parse(text);
      detail = errJson.message || errJson.detail || text;
    } catch { /* use raw text */ }
    throw new Error(`Pocket invoice error (${res.status}): ${detail}`);
  }

  return (await res.json()) as PocketInvoiceResponse;
}

/* ---------- invoice status ---------- */

export type PocketInvoiceStatus = {
  state: string;
  description: string;
  senderName: string | null;
  receiverName: string | null;
  amount: number;
  info: string | null;
  holdId: number | null;
  id: number;
  createdAt: string;
  aliasName: string | null;
  terminalId: number;
  branchName: string | null;
  branchId: number | null;
  orderNumber: string;
  invoiceType: string;
};

/**
 * Check invoice status by order number.
 */
export async function checkByOrderNumber(orderNumber: string): Promise<PocketInvoiceStatus> {
  const token = await getAccessToken();
  const terminalId = Number(POCKET_TERMINAL_ID);

  const res = await fetch(merchantUrl("/v2/invoicing/invoices/order-number"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ terminalId, orderNumber }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pocket check error (${res.status}): ${text}`);
  }

  return (await res.json()) as PocketInvoiceStatus;
}

/**
 * Check invoice status by Pocket invoice ID.
 */
export async function checkByInvoiceId(invoiceId: number): Promise<PocketInvoiceStatus> {
  const token = await getAccessToken();
  const terminalId = Number(POCKET_TERMINAL_ID);

  const res = await fetch(merchantUrl("/v2/invoicing/invoices/invoice-id"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ terminalId, invoiceId }),
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pocket check error (${res.status}): ${text}`);
  }

  return (await res.json()) as PocketInvoiceStatus;
}

/* ---------- QR helper ---------- */

/**
 * Generate a base64 PNG QR code from the Pocket QR string.
 * The Pocket `qr` field is a gzipped payload that the Pocket app reads.
 */
export async function generateQrImage(qrContent: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(qrContent, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 400,
    color: { dark: "#000000", light: "#ffffff" },
  });
  // Strip "data:image/png;base64," prefix to return raw base64
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

/* ---------- health check ---------- */

/**
 * Verify Pocket credentials by attempting to get a token.
 */
export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
  if (!isPocketConfigured()) {
    return { ok: false, message: "Pocket тохиргоо дутуу байна" };
  }
  try {
    await getAccessToken();
    return { ok: true, message: "Pocket хэвийн" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return { ok: false, message: `Pocket холболт амжилтгүй: ${msg}` };
  }
}
