import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  DEFAULT_PACKAGES,
  PAYMENT_APP_SETTINGS_DEFAULTS,
  normalizePaymentAppSettingsRow,
  type PaymentAppSettingsRow,
} from "@/lib/membership-packages";

export type {
  MembershipPackage,
  PaymentAppSettingsRow,
  StoredMembershipTier,
} from "@/lib/membership-packages";

export {
  DEFAULT_PACKAGES,
  SYSTEM_PACKAGE_IDS,
  PAYMENT_APP_SETTINGS_DEFAULTS,
  findPackage,
  formatMonthsLabel,
  isValidStoredTier,
  membershipMonthsForTier,
  newBlankPackage,
  normalizePackage,
  normalizePackages,
  normalizePaymentAppSettingsRow,
  storedTierForPackageId,
  syncFlatFromPackages,
} from "@/lib/membership-packages";

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
      return {
        ...PAYMENT_APP_SETTINGS_DEFAULTS,
        packages: [...DEFAULT_PACKAGES],
        updated_at: new Date().toISOString(),
      };
    }
    if (!data) {
      return {
        ...PAYMENT_APP_SETTINGS_DEFAULTS,
        packages: [...DEFAULT_PACKAGES],
        updated_at: new Date().toISOString(),
      };
    }
    return normalizePaymentAppSettingsRow(data as Record<string, unknown>);
  } catch (e) {
    console.warn("[payment_app_settings]", e);
    return {
      ...PAYMENT_APP_SETTINGS_DEFAULTS,
      packages: [...DEFAULT_PACKAGES],
      updated_at: new Date().toISOString(),
    };
  }
}

export type PaymentChannel = "qpay" | "sono" | "pocket" | "carepay" | "monpay" | "gymfintech";

export async function requirePaymentChannel(
  channel: PaymentChannel
): Promise<NextResponse | null> {
  const s = await getPaymentAppSettings();
  const allowed =
    channel === "qpay"
      ? s.payment_qpay_enabled
      : channel === "sono"
        ? s.payment_sono_enabled
        : channel === "carepay"
          ? s.payment_carepay_enabled
          : channel === "monpay"
            ? s.payment_monpay_enabled
            : channel === "gymfintech"
              ? s.payment_gymfintech_enabled
              : s.payment_pocket_enabled;
  if (!allowed) {
    return NextResponse.json(
      { error: "Энэ төлбөрийн хэлбэр админы тохиргоогоор идэвхгүй байна." },
      { status: 403 }
    );
  }
  return null;
}
