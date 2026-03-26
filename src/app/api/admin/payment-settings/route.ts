import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getPaymentAppSettings, type PaymentAppSettingsRow } from "@/lib/payment-app-settings";

function parseBody(body: unknown): Partial<PaymentAppSettingsRow> | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const out: Partial<PaymentAppSettingsRow> = {};

  if ("early_membership_price_mnt" in o) {
    const n = Number(o.early_membership_price_mnt);
    if (!Number.isFinite(n) || n < 0 || n > 999_999_999) return null;
    out.early_membership_price_mnt = Math.floor(n);
  }
  if ("premium_membership_price_mnt" in o) {
    const n = Number(o.premium_membership_price_mnt);
    if (!Number.isFinite(n) || n < 0 || n > 999_999_999) return null;
    out.premium_membership_price_mnt = Math.floor(n);
  }
  if ("payment_qpay_enabled" in o) out.payment_qpay_enabled = Boolean(o.payment_qpay_enabled);
  if ("payment_sono_enabled" in o) out.payment_sono_enabled = Boolean(o.payment_sono_enabled);
  if ("payment_pocket_enabled" in o) out.payment_pocket_enabled = Boolean(o.payment_pocket_enabled);

  return Object.keys(out).length ? out : null;
}

export async function GET() {
  try {
    const row = await getPaymentAppSettings();
    return NextResponse.json({ ok: true, settings: row });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceKey) {
      return NextResponse.json({ ok: false, error: "Service role key missing" }, { status: 500 });
    }

    let json: unknown;
    try {
      json = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }

    const current = await getPaymentAppSettings();
    const patch = parseBody(json);
    if (!patch) {
      return NextResponse.json(
        { ok: false, error: "Өөрчлөлт олдсонгүй эсвэл буруу утга." },
        { status: 400 }
      );
    }

    const next: PaymentAppSettingsRow = {
      ...current,
      ...patch,
      updated_at: new Date().toISOString(),
    };

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("payment_app_settings")
      .upsert(
        {
          id: "default",
          early_membership_price_mnt: next.early_membership_price_mnt,
          premium_membership_price_mnt: next.premium_membership_price_mnt,
          payment_qpay_enabled: next.payment_qpay_enabled,
          payment_sono_enabled: next.payment_sono_enabled,
          payment_pocket_enabled: next.payment_pocket_enabled,
          updated_at: next.updated_at,
        },
        { onConflict: "id" }
      )
      .select("*")
      .single();

    if (error) {
      if (error.message?.includes("does not exist") || error.code === "42P01") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Хүснэгт байхгүй байна. Supabase дээр sql/payment_app_settings.sql ажиллуулна уу.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, settings: normalizeFromDb(data) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}

function normalizeFromDb(data: Record<string, unknown>): PaymentAppSettingsRow {
  return {
    id: (data.id as string) || "default",
    early_membership_price_mnt: Number(data.early_membership_price_mnt) || 480_000,
    premium_membership_price_mnt: Number(data.premium_membership_price_mnt) || 780_000,
    payment_qpay_enabled: data.payment_qpay_enabled !== false,
    payment_sono_enabled: data.payment_sono_enabled !== false,
    payment_pocket_enabled: data.payment_pocket_enabled !== false,
    updated_at: (data.updated_at as string) || new Date().toISOString(),
  };
}
