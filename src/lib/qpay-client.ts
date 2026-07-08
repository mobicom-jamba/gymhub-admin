const QPAY_BASE = process.env.QPAY_BASE_URL ?? "https://merchant.qpay.mn/v2";
const QPAY_USERNAME = process.env.QPAY_CLIENT_ID ?? process.env.QPAY_USERNAME ?? "";
const QPAY_PASSWORD = process.env.QPAY_CLIENT_SECRET ?? process.env.QPAY_PASSWORD ?? "";
const QPAY_INVOICE_CODE = process.env.QPAY_INVOICE_CODE ?? "";

export class QPayError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

// ─── in-memory token cache (shared across all QPay call sites) ──────────────
let _token: string | null = null;
let _tokenExpiresAt = 0;

/** QPay sender_invoice_no max length is 45 chars. Deterministic-ish and unique per request. */
export function buildSenderInvoiceNo(bookingId: string): string {
  const ts = Date.now().toString();
  const safeBooking = bookingId.replace(/[^a-zA-Z0-9_-]/g, "");
  const maxBookingLen = Math.max(1, 45 - 1 - ts.length);
  const compactBooking = safeBooking.slice(0, maxBookingLen);
  return `${compactBooking}-${ts}`;
}

export async function getQpayToken(): Promise<string> {
  if (_token && Date.now() < _tokenExpiresAt) return _token;

  if (!QPAY_USERNAME || !QPAY_PASSWORD) {
    throw new QPayError("QPay credentials are not configured");
  }

  const basic = Buffer.from(`${QPAY_USERNAME}:${QPAY_PASSWORD}`).toString("base64");
  const res = await fetch(`${QPAY_BASE}/auth/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) {
    throw new QPayError(`QPay auth failed (${res.status})`);
  }
  const data = await res.json();
  _token = data.access_token as string;
  // QPay tokens are typically valid for 3600s; refresh 60s early
  _tokenExpiresAt = Date.now() + (data.expires_in ?? 3600) * 1000 - 60_000;
  return _token;
}

export async function createQpayInvoice(params: {
  senderInvoiceNo: string;
  receiverCode: string;
  description: string;
  amount: number;
  callbackUrl: string;
}): Promise<Record<string, unknown>> {
  if (!QPAY_INVOICE_CODE) {
    throw new QPayError("QPAY_INVOICE_CODE тохируулагдаагүй байна");
  }

  const token = await getQpayToken();
  const res = await fetch(`${QPAY_BASE}/invoice`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      invoice_code: QPAY_INVOICE_CODE,
      sender_invoice_no: params.senderInvoiceNo,
      invoice_receiver_code: params.receiverCode,
      invoice_description: params.description,
      amount: params.amount,
      callback_url: params.callbackUrl,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new QPayError(
      `QPay invoice үүсгэхэд алдаа гарлаа: ${errText || res.status}`,
      res.status,
    );
  }

  const invoice = (await res.json()) as Record<string, unknown>;
  if (!invoice?.invoice_id) {
    throw new QPayError("QPay-с invoice_id буцаагдсангүй", 502);
  }
  return invoice;
}

export type QpayCheckResult = {
  paid: boolean;
  payment_status?: string;
  count: number;
  paid_amount: number;
  rows: Array<{ payment_status?: string }>;
};

export async function checkQpayInvoice(invoiceId: string): Promise<QpayCheckResult> {
  const token = await getQpayToken();
  const res = await fetch(`${QPAY_BASE}/payment/check`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      object_type: "INVOICE",
      object_id: invoiceId,
      offset: {
        page_number: 1,
        page_limit: 100,
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new QPayError(
      `QPay төлбөр шалгахад алдаа гарлаа: ${errText || res.status}`,
      res.status,
    );
  }

  const result = (await res.json()) as {
    payment_status?: string;
    count?: number;
    paid_amount?: number;
    rows?: Array<{ payment_status?: string }>;
  };
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const paid =
    result.payment_status === "PAID" ||
    (typeof result.paid_amount === "number" && result.paid_amount > 0) ||
    rows.some((row) => row?.payment_status === "PAID");

  return {
    paid,
    payment_status: result.payment_status,
    count: result.count ?? rows.length,
    paid_amount: result.paid_amount ?? 0,
    rows,
  };
}
