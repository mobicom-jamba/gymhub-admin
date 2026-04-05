import { NextResponse } from "next/server";
import { getPaymentAppSettings } from "@/lib/payment-app-settings";

const QPAY_BASE_URL = process.env.QPAY_BASE_URL ?? "https://merchant.qpay.mn/v2";
const QPAY_CLIENT_ID = process.env.QPAY_CLIENT_ID ?? process.env.QPAY_USERNAME ?? "";
const QPAY_CLIENT_SECRET =
  process.env.QPAY_CLIENT_SECRET ?? process.env.QPAY_PASSWORD ?? "";
const QPAY_INVOICE_CODE = process.env.QPAY_INVOICE_CODE ?? "";

const SONO_BASE_URL = process.env.SONO_BASE_URL ?? "https://rico.mn";
const SONO_AUTH_USER = process.env.SONO_AUTH_USER ?? "";
const SONO_AUTH_TOKEN = process.env.SONO_AUTH_TOKEN ?? "";

type ProviderPayload = {
  enabled: boolean;
  message: string;
  configured?: boolean;
  base_url?: string;
};

async function checkQPayHealth(): Promise<ProviderPayload> {
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

function checkSonoHealth(): ProviderPayload {
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

async function checkPocketHealth(): Promise<ProviderPayload> {
  const clientId = process.env.POCKET_CLIENT_ID ?? "";
  const clientSecret = process.env.POCKET_CLIENT_SECRET ?? "";
  const terminalId = process.env.POCKET_TERMINAL_ID ?? "";
  const oauthHost = process.env.POCKET_OAUTH_HOST ?? "";
  const merchantHost = process.env.POCKET_MERCHANT_HOST ?? "";

  if (!clientId || !clientSecret || !terminalId || !oauthHost || !merchantHost) {
    return {
      enabled: false,
      message: "Pocket тохиргоо дутуу байна",
      configured: false,
    };
  }

  try {
    const { healthCheck } = await import("@/lib/pocket");
    const result = await healthCheck();
    return {
      enabled: result.ok,
      message: result.message,
      configured: true,
    };
  } catch {
    return {
      enabled: false,
      message: "Pocket үйлчилгээ түр тасалдалтай байна",
      configured: true,
    };
  }
}

function applyAdminSwitch(
  technical: ProviderPayload,
  adminEnabled: boolean,
  nameMn: string
): ProviderPayload {
  if (!adminEnabled) {
    return {
      ...technical,
      enabled: false,
      message: `${nameMn} админы тохиргоогоор идэвхгүй байна`,
    };
  }
  return technical;
}

export async function GET() {
  const settings = await getPaymentAppSettings();

  const qpayTech = await checkQPayHealth();
  const sonoTech = checkSonoHealth();
  const pocketTech = await checkPocketHealth();

  const qpay = applyAdminSwitch(qpayTech, settings.payment_qpay_enabled, "QPay");
  const sono = applyAdminSwitch(sonoTech, settings.payment_sono_enabled, "Sono");
  const pocket = applyAdminSwitch(pocketTech, settings.payment_pocket_enabled, "Pocket");

  return NextResponse.json({
    ok: true,
    providers: {
      qpay,
      sono,
      pocket,
    },
    membership_prices: {
      early_mnt:
        settings.early_first_month_price_mnt + settings.early_remainder_price_mnt,
      early_legacy_full_mnt: settings.early_membership_price_mnt,
      early_first_month_mnt: settings.early_first_month_price_mnt,
      early_remainder_mnt: settings.early_remainder_price_mnt,
      premium_mnt: settings.premium_membership_price_mnt,
    },
  });
}
