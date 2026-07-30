import { NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  getUserInfo,
  isMonpayConfigured,
} from "@/lib/monpay";

/**
 * POST /api/payment/monpay/token
 * Exchange MonPay mini-app OAuth authorization code for access token.
 * Uses server MONPAY_REDIRECT_URI only (must match mini-app registration).
 */
export async function POST(request: Request) {
  try {
    if (!isMonpayConfigured()) {
      return NextResponse.json({ error: "MonPay тохиргоо дутуу байна" }, { status: 500 });
    }

    const body = await request.json().catch(() => ({}));
    const { code } = body as { code?: string; redirect_uri?: string };

    if (!code?.trim()) {
      return NextResponse.json({ error: "code шаардлагатай" }, { status: 400 });
    }

    // Client-supplied redirect_uri is intentionally ignored — env is source of truth.
    const token = await exchangeAuthorizationCode(code);

    let user: Awaited<ReturnType<typeof getUserInfo>> | undefined;
    try {
      user = await getUserInfo(token.access_token);
    } catch {
      /* userinfo optional if scopes missing */
    }

    return NextResponse.json({
      success: true,
      access_token: token.access_token,
      token_type: token.token_type ?? "Bearer",
      expires_in: token.expires_in,
      scope: token.scope,
      user,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("MonPay token error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
