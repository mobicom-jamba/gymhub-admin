import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  getPaymentAppSettings,
  normalizePackages,
  syncFlatFromPackages,
  type MembershipPackage,
  type PaymentAppSettingsRow,
} from "@/lib/payment-app-settings";
import { verifyBearerUser } from "@/lib/verify-gym-access";

function parsePrice(o: Record<string, unknown>, key: string, out: Partial<PaymentAppSettingsRow>): boolean {
  if (!(key in o)) return true;
  const n = Number(o[key]);
  if (!Number.isFinite(n) || n < 0 || n > 999_999_999) return false;
  (out as Record<string, number>)[key] = Math.floor(n);
  return true;
}

function parseBody(body: unknown): Partial<PaymentAppSettingsRow> | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const out: Partial<PaymentAppSettingsRow> = {};

  if (!parsePrice(o, "early_membership_price_mnt", out)) return null;
  if (!parsePrice(o, "early_remainder_price_mnt", out)) return null;

  if ("packages" in o) {
    if (!Array.isArray(o.packages)) return null;
    const packages = normalizePackages(o.packages);
    if (packages.length === 0) return null;
    // locked system ids must remain
    const ids = new Set(packages.map((p) => p.id));
    if (!ids.has("smart1") || !ids.has("standard3") || !ids.has("premium") || !ids.has("premium4")) {
      return null;
    }
    // unique ids
    if (ids.size !== packages.length) return null;
    out.packages = packages;
    Object.assign(out, syncFlatFromPackages(packages));
  }

  if ("payment_qpay_enabled" in o) out.payment_qpay_enabled = Boolean(o.payment_qpay_enabled);
  if ("payment_sono_enabled" in o) out.payment_sono_enabled = Boolean(o.payment_sono_enabled);
  if ("payment_pocket_enabled" in o) out.payment_pocket_enabled = Boolean(o.payment_pocket_enabled);
  if ("payment_carepay_enabled" in o) out.payment_carepay_enabled = Boolean(o.payment_carepay_enabled);
  if ("payment_monpay_enabled" in o) out.payment_monpay_enabled = Boolean(o.payment_monpay_enabled);
  if ("payment_gymfintech_enabled" in o) out.payment_gymfintech_enabled = Boolean(o.payment_gymfintech_enabled);

  return Object.keys(out).length ? out : null;
}

export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json({ ok: false, error: "Зөвхөн админ эрхтэй." }, { status: 403 });
    }
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
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin) {
      return NextResponse.json({ ok: false, error: "Зөвхөн админ эрхтэй." }, { status: 403 });
    }

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
      packages: (patch.packages as MembershipPackage[] | undefined) ?? current.packages,
      updated_at: new Date().toISOString(),
    };

    const admin = createAdminClient();
    const payload: Record<string, unknown> = {
      id: "default",
      early_membership_price_mnt: next.early_membership_price_mnt,
      early_first_month_price_mnt: next.early_first_month_price_mnt,
      early_remainder_price_mnt: next.early_remainder_price_mnt,
      premium_membership_price_mnt: next.premium_membership_price_mnt,
      smart1_price_mnt: next.smart1_price_mnt,
      standard3_price_mnt: next.standard3_price_mnt,
      premium4_price_mnt: next.premium4_price_mnt,
      smart1_months: next.smart1_months,
      standard3_months: next.standard3_months,
      premium_months: next.premium_months,
      premium4_months: next.premium4_months,
      smart1_pool_months: next.smart1_pool_months,
      premium_yoga_months: next.premium_yoga_months,
      premium4_pool_months: next.premium4_pool_months,
      premium4_yoga_months: next.premium4_yoga_months,
      packages: next.packages,
      payment_qpay_enabled: next.payment_qpay_enabled,
      payment_sono_enabled: next.payment_sono_enabled,
      payment_pocket_enabled: next.payment_pocket_enabled,
      payment_carepay_enabled: next.payment_carepay_enabled,
      payment_monpay_enabled: next.payment_monpay_enabled,
      payment_gymfintech_enabled: next.payment_gymfintech_enabled,
      updated_at: next.updated_at,
    };

    const { error } = await admin.from("payment_app_settings").upsert(payload, { onConflict: "id" });

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
      if (error.message?.includes("packages") || error.code === "42703") {
        return NextResponse.json(
          {
            ok: false,
            error:
              "packages багана байхгүй. Supabase дээр supabase/migrations/add_membership_packages_json.sql ажиллуулна уу.",
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, settings: await getPaymentAppSettings() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
