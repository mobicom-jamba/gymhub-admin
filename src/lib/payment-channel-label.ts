/** Canonical payment instrument keys stored on bookings.payment_channel */
export type PaymentChannelKey =
  | "qpay"
  | "sono"
  | "pocket"
  | "carepay"
  | "monpay"
  | "gymfintech"
  | "gift"
  | "other";

export type PaymentChannelVisual = {
  key: PaymentChannelKey;
  /** Short badge label */
  label: string;
  /** Tooltip / full name */
  title: string;
  /** Public path under /logos, or null when no asset */
  logo: string | null;
};

const LABELS: Record<
  PaymentChannelKey,
  { label: string; title: string; logo: string | null }
> = {
  qpay: { label: "QPay", title: "QPay — банк / QR", logo: "/logos/qpay.png" },
  sono: { label: "Sono", title: "Sono зээл", logo: "/logos/sono.png" },
  pocket: { label: "Pocket", title: "Pocket хуваалт", logo: "/logos/pocket.png" },
  carepay: { label: "Carepay", title: "Carepay зээл", logo: "/logos/carepay.png" },
  monpay: { label: "MonPay", title: "MonPay мини апп", logo: "/logos/monpay.png" },
  gymfintech: { label: "Flexy", title: "Flexy хуваан төлөлт", logo: "/logos/flexy.png" },
  gift: { label: "Gift", title: "Урамшуулал / бэлэг", logo: null },
  other: { label: "Бусад", title: "Суваг тодорхойгүй", logo: null },
};

/** Normalize raw DB / invoice hints → canonical key. */
export function normalizePaymentChannel(
  channel: string | null | undefined,
  invoiceId?: string | null,
): PaymentChannelKey {
  const raw = (channel ?? "").trim().toLowerCase();
  if (raw === "qpay" || raw === "q_pay" || raw === "q-pay") return "qpay";
  if (raw === "sono") return "sono";
  if (raw === "pocket") return "pocket";
  if (raw === "carepay" || raw === "care_pay") return "carepay";
  if (raw === "monpay" || raw === "mon_pay") return "monpay";
  if (
    raw === "gymfintech" ||
    raw === "flexy" ||
    raw === "gym_fintech" ||
    raw === "installment"
  ) {
    return "gymfintech";
  }
  if (raw === "gift") return "gift";

  const inv = String(invoiceId ?? "").trim();
  if (inv.startsWith("GH")) return "sono";
  if (inv.length > 0 && !raw) return "qpay";
  if (raw) return "other";
  return "other";
}

export function getPaymentChannelVisual(
  channel: string | null | undefined,
  invoiceId?: string | null,
): PaymentChannelVisual {
  const key = normalizePaymentChannel(channel, invoiceId);
  const meta = LABELS[key];
  return { key, label: meta.label, title: meta.title, logo: meta.logo };
}

export function paymentChannelLogo(key: PaymentChannelKey): string | null {
  return LABELS[key].logo;
}

export function paymentChannelBadgeClass(key: PaymentChannelKey): string {
  switch (key) {
    case "qpay":
      return "bg-sky-50 text-sky-700 dark:bg-sky-900/25 dark:text-sky-300";
    case "sono":
      return "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/25 dark:text-indigo-300";
    case "pocket":
      return "bg-violet-50 text-violet-700 dark:bg-violet-900/25 dark:text-violet-300";
    case "carepay":
      return "bg-fuchsia-50 text-fuchsia-700 dark:bg-fuchsia-900/25 dark:text-fuchsia-300";
    case "monpay":
      return "bg-rose-50 text-rose-700 dark:bg-rose-900/25 dark:text-rose-300";
    case "gymfintech":
      return "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300";
    case "gift":
      return "bg-amber-50 text-amber-800 dark:bg-amber-900/25 dark:text-amber-300";
    default:
      return "bg-gray-100 text-gray-600 dark:bg-white/[0.06] dark:text-gray-400";
  }
}
