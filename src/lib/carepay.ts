/**
 * Carepay merchant integration (phone push invoice + status check).
 *
 * Flow: create-invoice-phone → user approves in Carepay app → check-invoice / callback.
 *
 * Environment:
 *   CAREPAY_BASE_URL   – default https://merchant.carepay.mn/api/int
 *   CAREPAY_USERNAME     – integration username (branch → Integration tab)
 *   CAREPAY_PASSWORD     – integration password
 *   CAREPAY_CALLBACK_URL – optional webhook base (booking_id appended as query)
 */

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

export type CarepayPhoneInvoice = {
  invoice_number: string;
  message: string;
};

/** Push invoice to the user's Carepay app (no merchant-side QR). */
export async function createPhoneInvoice(opts: {
  phone: number;
  price: number;
  callbackUrl?: string;
}): Promise<CarepayPhoneInvoice> {
  const token = await getAccessToken();
  const body: Record<string, unknown> = {
    phone: opts.phone,
    price: opts.price,
  };
  if (opts.callbackUrl) {
    body.call_back_url = opts.callbackUrl;
  }

  const res = await fetch(`${CAREPAY_BASE}/create-invoice-phone`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });

  const data = (await res.json().catch(() => ({}))) as CarepayApiResponse;
  if (!res.ok || !data.status) {
    throw new Error(data.msg || data.message || `Carepay invoice error (${res.status})`);
  }

  const invoiceNumber = data.invoice_number;
  if (!invoiceNumber) {
    throw new Error("Carepay-с invoice_number буцаагдсангүй");
  }

  return {
    invoice_number: invoiceNumber,
    message: data.msg || data.message || "Нэхэмжлэх бүртгэгдлээ",
  };
}

function carepayResponseMessage(data: CarepayApiResponse): string {
  return String(data.msg ?? data.message ?? "").trim();
}

/** Carepay may return status as bool, 1, or "true"; paid success text is also reliable. */
export function parseCarepayPaidStatus(data: CarepayApiResponse): boolean {
  const s = data.status as unknown;
  if (s === true || s === 1) return true;
  if (typeof s === "string" && (s === "true" || s === "1")) return true;
  const msg = carepayResponseMessage(data).toLowerCase();
  if (/амжилттай/.test(msg) && /төл/.test(msg)) return true;
  if (/төлөгдлөө/.test(msg) && !/төлөгдөөгүй/.test(msg)) return true;
  return false;
}

function isCarepayAuthErrorMessage(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    /token/.test(m) ||
    /authorization/.test(m) ||
    /мерчант/.test(m) ||
    /хандах эрх/.test(m)
  );
}

async function fetchCheckInvoiceOnce(
  token: string,
  invoiceNumber: string,
): Promise<{ httpOk: boolean; data: CarepayApiResponse }> {
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
  return { httpOk: res.ok, data };
}

export async function checkInvoice(invoiceNumber: string): Promise<{ paid: boolean; message: string }> {
  const trimmed = String(invoiceNumber ?? "").trim();
  if (!trimmed) {
    throw new Error("invoice_number хоосон байна");
  }

  let token = await getAccessToken();
  let { httpOk, data } = await fetchCheckInvoiceOnce(token, trimmed);
  let msg = carepayResponseMessage(data);

  if (!httpOk) {
    throw new Error(msg || "Carepay check error");
  }

  if (!parseCarepayPaidStatus(data) && isCarepayAuthErrorMessage(msg)) {
    _accessToken = null;
    _tokenExpiresAt = 0;
    token = await getAccessToken();
    ({ httpOk, data } = await fetchCheckInvoiceOnce(token, trimmed));
    msg = carepayResponseMessage(data);
    if (!httpOk) {
      throw new Error(msg || "Carepay check error");
    }
    if (isCarepayAuthErrorMessage(msg) && !parseCarepayPaidStatus(data)) {
      throw new Error(msg);
    }
  }

  return { paid: parseCarepayPaidStatus(data), message: msg };
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
