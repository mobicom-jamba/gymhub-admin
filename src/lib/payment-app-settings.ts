import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export type PaymentAppSettingsRow = {
  id: string;
  early_membership_price_mnt: number;
  premium_membership_price_mnt: number;
  payment_qpay_enabled: boolean;
  payment_sono_enabled: boolean;
  payment_pocket_enabled: boolean;
  updated_at: string;
};

const DEFAULTS: Omit<PaymentAppSettingsRow, "updated_at"> = {
  id: "default",
  early_membership_price_mnt: 480_000,
  premium_membership_price_mnt: 780_000,
  payment_qpay_enabled: true,
  payment_sono_enabled: true,
  payment_pocket_enabled: true,
};

function normalizeRow(row: Record<string, unknown>): PaymentAppSettingsRow {
  const early = Number(row.early_membership_price_mnt);
  const premium = Number(row.premium_membership_price_mnt);
  return {
    id: (row.id as string) || "default",
    early_membership_price_mnt:
      Number.isFinite(early) && early >= 0 ? Math.floor(early) : DEFAULTS.early_membership_price_mnt,
    premium_membership_price_mnt:
      Number.isFinite(premium) && premium >= 0
        ? Math.floor(premium)
        : DEFAULTS.premium_membership_price_mnt,
    payment_qpay_enabled: row.payment_qpay_enabled !== false,
    payment_sono_enabled: row.payment_sono_enabled !== false,
    payment_pocket_enabled: row.payment_pocket_enabled !== false,
    updated_at: (row.updated_at as string) || new Date().toISOString(),
  };
}

export async function getPaymentAppSettings(): Promise<PaymentAppSettingsRow> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("payment_app_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();

    if (error) {
      console.warn("[payment_app_settings]", error.message);
      return { ...DEFAULTS, updated_at: new Date().toISOString() };
    }
    if (!data) {
      return { ...DEFAULTS, updated_at: new Date().toISOString() };
    }
    return normalizeRow(data as Record<string, unknown>);
  } catch (e) {
    console.warn("[payment_app_settings]", e);
    return { ...DEFAULTS, updated_at: new Date().toISOString() };
  }
}

export type PaymentChannel = "qpay" | "sono" | "pocket";

export async function requirePaymentChannel(
  channel: PaymentChannel
): Promise<NextResponse | null> {
  const s = await getPaymentAppSettings();
  const allowed =
    channel === "qpay"
      ? s.payment_qpay_enabled
      : channel === "sono"
        ? s.payment_sono_enabled
        : s.payment_pocket_enabled;
  if (!allowed) {
    return NextResponse.json(
      { error: "Энэ төлбөрийн хэлбэр админы тохиргоогоор идэвхгүй байна." },
      { status: 403 }
    );
  }
  return null;
}
