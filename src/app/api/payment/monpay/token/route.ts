import { NextResponse } from "next/server";
import {
  exchangeAuthorizationCode,
  getMonpayRedirectUri,
  getUserInfo,
  isMonpayConfigured,
} from "@/lib/monpay";

/**
 * POST /api/payment/monpay/token — Exchange MonPay mini-app OAuth code for access token
 */
export async function POST(request: Request) {
  try {
    if (!isMonpayConfigured()) {
      return NextResponse.json({ error: "MonPay тохиргоо дутуу байна" }, { status: 500 });
    }

    const body = await request.json();
    const { code, redirect_uri } = body as { code?: string; redirect_uri?: string };

    if (!code?.trim()) {
      return NextResponse.json({ error: "code шаардлагатай" }, { status: 400 });
    }

    const token = await exchangeAuthorizationCode(
      code,
      redirect_uri?.trim() || getMonpayRedirectUri(),
    );

    let user: Awaited<ReturnType<typeof getUserInfo>> | undefined;
    try {
      user = await getUserInfo(token.access_token);
    } catch {
      /* userinfo optional */
    }

    return NextResponse.json({
      success: true,
      access_token: token.access_token,
      token_type: token.token_type,
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
