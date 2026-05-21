/**
 * Carepay merchant integration (QR / phone invoice).
 *
 * Environment:
 *   CAREPAY_BASE_URL   – default https://merchant.carepay.mn/api/int
 *   CAREPAY_USERNAME     – integration username (branch → Integration tab)
 *   CAREPAY_PASSWORD     – integration password
 *   CAREPAY_CALLBACK_URL – optional webhook base (booking_id appended as query)
 */

import QRCode from "qrcode";

const CAREPAY_BASE = (process.env.CAREPAY_BASE_URL ?? "https://merchant.carepay.mn/api/int").replace(
  /\/$/,
  "",
);
const CAREPAY_USERNAME = process.env.CAREPAY_USERNAME ?? "";
const CAREPAY_PASSWORD = process.env.CAREPAY_PASSWORD ?? "";

export function isCarepayConfigured(): boolean {
  return !!(CAREPAY_USERNAME && CAREPAY_PASSWORD);
}

export function normalizeCarepayPhone(input: string): number {
  const digits = input.replace(/\D/g, "");
  let local = digits;
  if (local.startsWith("976") && local.length >= 11) {
    local = local.slice(3);
  }
  if (local.length !== 8) {
    throw new Error("Carepay-д 8 оронтой утасны дугаар шаардлагатай (жишээ: 99119911).");
  }
  return Number(local);
}

type CarepayApiResponse<T = Record<string, unknown>> = {
  status: boolean;
  msg?: string;
  message?: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  invoice_number?: string;
  data?: T;
  errors?: Record<string, string[]>;
};

let _accessToken: string | null = null;
let _tokenExpiresAt = 0;

function parseExpiresAt(expiresIn: number | undefined): number {
  if (!expiresIn || !Number.isFinite(expiresIn)) {
    return Date.now() + 3600_000;
  }
  // Carepay may return Unix timestamp (e.g. 1763364022) instead of TTL seconds.
  if (expiresIn > 1_000_000_000) {
    return expiresIn * 1000 - 60_000;
  }
  return Date.now() + expiresIn * 1000 - 60_000;
}

export async function getAccessToken(): Promise<string> {
  if (_accessToken && Date.now() < _tokenExpiresAt) {
    return _accessToken;
  }
  if (!isCarepayConfigured()) {
    throw new Error("Carepay credentials are not configured");
  }

  const basic = Buffer.from(`${CAREPAY_USERNAME}:${CAREPAY_PASSWORD}`).toString("base64");
  const res = await fetch(`${CAREPAY_BASE}/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
    signal: AbortSignal.timeout(15_000),
  });

  const data = (await res.json().catch(() => ({}))) as CarepayApiResponse;
  if (!res.ok || !data.status || !data.access_token) {
    const msg = data.msg || data.message || `Carepay auth failed (${res.status})`;
    throw new Error(msg);
  }

  _accessToken = data.access_token;
  _tokenExpiresAt = parseExpiresAt(data.expires_in);
  return _accessToken;
}

export type CarepayQrInvoice = {
  invoice_number: string;
  encrypted: string;
};

export async function createQrInvoice(opts: {
  phone: number;
  price: number;
  callbackUrl?: string;
}): Promise<CarepayQrInvoice> {
  const token = await getAccessToken();
  const body: Record<string, unknown> = {
    phone: opts.phone,
    price: opts.price,
  };
  if (opts.callbackUrl) {
    body.call_back_url = opts.callbackUrl;
  }

  const res = await fetch(`${CAREPAY_BASE}/create-qr-data`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await res.json().catch(() => ({}))) as CarepayApiResponse<{ encrypted?: string }>;
  if (!res.ok || !data.status) {
    throw new Error(data.msg || data.message || `Carepay invoice error (${res.status})`);
  }

  const encrypted = data.data?.encrypted;
  const invoiceNumber = data.invoice_number;
  if (!invoiceNumber || !encrypted) {
    throw new Error("Carepay-с invoice_number эсвэл QR өгөгдөл буцаагдсангүй");
  }

  return { invoice_number: invoiceNumber, encrypted };
}

export async function checkInvoice(invoiceNumber: string): Promise<{ paid: boolean; message: string }> {
  const token = await getAccessToken();
  const res = await fetch(`${CAREPAY_BASE}/check-invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ invoice_number: invoiceNumber }),
    signal: AbortSignal.timeout(15_000),
  });

  const data = (await res.json().catch(() => ({}))) as CarepayApiResponse;
  const msg = data.msg || data.message || "";
  if (!res.ok) {
    throw new Error(msg || `Carepay check error (${res.status})`);
  }

  return { paid: data.status === true, message: msg };
}

export async function generateQrImage(encryptedPayload: string): Promise<string> {
  const dataUrl = await QRCode.toDataURL(encryptedPayload, {
    errorCorrectionLevel: "M",
    margin: 2,
    width: 400,
    color: { dark: "#000000", light: "#ffffff" },
  });
  return dataUrl.replace(/^data:image\/png;base64,/, "");
}

export async function healthCheck(): Promise<{ ok: boolean; message: string }> {
  if (!isCarepayConfigured()) {
    return { ok: false, message: "Carepay тохиргоо дутуу байна" };
  }
  try {
    await getAccessToken();
    return { ok: true, message: "Carepay хэвийн" };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown";
    return { ok: false, message: `Carepay холболт амжилтгүй: ${msg}` };
  }
}
