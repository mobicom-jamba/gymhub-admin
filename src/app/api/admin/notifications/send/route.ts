import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { hasPermission } from "@/lib/permissions";
import { verifyBearerUser } from "@/lib/verify-gym-access";
import { isFcmConfigured, sendPushToTokens, sendPushToUserId } from "@/lib/fcm";

type Body = {
  title?: string;
  body?: string;
  /** "all" | "user" */
  target?: "all" | "user";
  user_id?: string;
  data?: Record<string, string>;
};

/**
 * POST /api/admin/notifications/send
 * Admin push: broadcast to all tokens, or one user.
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!hasPermission(auth.permissions, "users.manage")) {
      return NextResponse.json(
        { ok: false, error: "Мэдэгдэл илгээх эрхгүй." },
        { status: 403 },
      );
    }

    if (!isFcmConfigured()) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Firebase тохируулаагүй. Vercel env-д FIREBASE_SERVICE_ACCOUNT_JSON нэмнэ үү.",
        },
        { status: 503 },
      );
    }

    const body = (await request.json()) as Body;
    const title = (body.title ?? "").trim();
    const message = (body.body ?? "").trim();
    if (!title || !message) {
      return NextResponse.json(
        { ok: false, error: "title болон body шаардлагатай." },
        { status: 400 },
      );
    }
    if (title.length > 100 || message.length > 500) {
      return NextResponse.json(
        { ok: false, error: "Title ≤100, body ≤500 тэмдэгт." },
        { status: 400 },
      );
    }

    const target = body.target === "user" ? "user" : "all";
    const supabase = createAdminClient();
    const payload = {
      title,
      body: message,
      data: body.data,
    };

    if (target === "user") {
      const userId = (body.user_id ?? "").trim();
      if (!userId) {
        return NextResponse.json(
          { ok: false, error: "user_id шаардлагатай." },
          { status: 400 },
        );
      }
      const result = await sendPushToUserId(supabase, userId, payload);
      return NextResponse.json({ ok: true, target: "user", user_id: userId, ...result });
    }

    const { data: rows, error } = await supabase
      .from("profiles")
      .select("id, fcm_token")
      .not("fcm_token", "is", null);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const tokenRows = (rows ?? []).filter(
      (r) => typeof r.fcm_token === "string" && r.fcm_token.trim().length > 0,
    );
    const tokens = tokenRows.map((r) => r.fcm_token as string);
    const result = await sendPushToTokens(tokens, payload);

    if (result.invalidTokens.length) {
      const invalid = new Set(result.invalidTokens);
      const ids = tokenRows
        .filter((r) => invalid.has(r.fcm_token as string))
        .map((r) => r.id as string);
      if (ids.length) {
        await supabase.from("profiles").update({ fcm_token: null }).in("id", ids);
      }
    }

    return NextResponse.json({
      ok: true,
      target: "all",
      token_count: tokens.length,
      ...result,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!hasPermission(auth.permissions, "users.view")) {
      return NextResponse.json({ ok: false, error: "Эрхгүй." }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { count, error } = await supabase
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .not("fcm_token", "is", null);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      configured: isFcmConfigured(),
      devices_with_token: count ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
