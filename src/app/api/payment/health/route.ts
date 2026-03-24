import { NextResponse } from "next/server";

const QPAY_BASE_URL = process.env.QPAY_BASE_URL ?? "https://merchant.qpay.mn/v2";
const QPAY_CLIENT_ID = process.env.QPAY_CLIENT_ID ?? process.env.QPAY_USERNAME ?? "";
const QPAY_CLIENT_SECRET =
  process.env.QPAY_CLIENT_SECRET ?? process.env.QPAY_PASSWORD ?? "";
const QPAY_INVOICE_CODE = process.env.QPAY_INVOICE_CODE ?? "";

const SONO_BASE_URL = process.env.SONO_BASE_URL ?? "https://rico.mn";
const SONO_AUTH_USER = process.env.SONO_AUTH_USER ?? "";
const SONO_AUTH_TOKEN = process.env.SONO_AUTH_TOKEN ?? "";

async function checkQPayHealth() {
  if (!QPAY_CLIENT_ID || !QPAY_CLIENT_SECRET || !QPAY_INVOICE_CODE) {
    return {
      enabled: false,
      message: "QPay одоогоор идэвхгүй байна",
      configured: false,
    };
  }

  try {
    const basic = Buffer.from(`${QPAY_CLIENT_ID}:${QPAY_CLIENT_SECRET}`).toString("base64");
    const res = await fetch(`${QPAY_BASE_URL}/auth/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      return {
        enabled: false,
        message: "QPay холболт амжилтгүй байна",
        configured: true,
      };
    }
    return {
      enabled: true,
      message: "QPay хэвийн",
      configured: true,
    };
  } catch {
    return {
      enabled: false,
      message: "QPay үйлчилгээ түр тасалдалтай байна",
      configured: true,
    };
  }
}

function checkSonoHealth() {
  if (!SONO_AUTH_USER || !SONO_AUTH_TOKEN) {
    return {
      enabled: false,
      message: "Sono одоогоор идэвхгүй байна",
      configured: false,
    };
  }
  return {
    enabled: true,
    message: "Sono тохиргоо бэлэн",
    configured: true,
    base_url: SONO_BASE_URL,
  };
}

export async function GET() {
  const qpay = await checkQPayHealth();
  const sono = checkSonoHealth();
  const pocket = { enabled: true, message: "Pocket идэвхтэй", configured: true };

  return NextResponse.json({
    ok: true,
    providers: {
      qpay,
      sono,
      pocket,
    },
  });
}
