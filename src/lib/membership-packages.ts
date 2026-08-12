/** profiles.membership_tier enum-д байгаа утгууд */
export type StoredMembershipTier = "standard" | "premium1" | "premium2" | "gymcore" | "early";

export type MembershipPackage = {
  /** Booking slug: membership-{id}-{ts} */
  id: string;
  name: string;
  price_mnt: number;
  /** Үндсэн фитнес эрх — сар */
  months: number;
  pool_months: number;
  yoga_months: number;
  /** Profile дээр хадгалагдах tier */
  stored_tier: StoredMembershipTier;
  enabled: boolean;
  featured: boolean;
  sort_order: number;
  /** Системийн багц — id солих/устгахгүй */
  locked: boolean;
};

export type PaymentAppSettingsRow = {
  id: string;
  early_membership_price_mnt: number;
  early_first_month_price_mnt: number;
  early_remainder_price_mnt: number;
  premium_membership_price_mnt: number;
  smart1_price_mnt: number;
  standard3_price_mnt: number;
  premium4_price_mnt: number;
  smart1_months: number;
  standard3_months: number;
  premium_months: number;
  premium4_months: number;
  smart1_pool_months: number;
  premium_yoga_months: number;
  premium4_pool_months: number;
  premium4_yoga_months: number;
  packages: MembershipPackage[];
  payment_qpay_enabled: boolean;
  payment_sono_enabled: boolean;
  payment_pocket_enabled: boolean;
  payment_carepay_enabled: boolean;
  payment_monpay_enabled: boolean;
  payment_gymfintech_enabled: boolean;
  updated_at: string;
};

export const SYSTEM_PACKAGE_IDS = ["smart1", "standard3", "premium", "premium4"] as const;

export const DEFAULT_PACKAGES: MembershipPackage[] = [
  {
    id: "smart1",
    name: "Premium 1",
    price_mnt: 780_000,
    months: 12,
    pool_months: 3,
    yoga_months: 0,
    stored_tier: "premium1",
    enabled: true,
    featured: true,
    sort_order: 1,
    locked: true,
  },
  {
    id: "standard3",
    name: "Standard",
    price_mnt: 480_000,
    months: 6,
    pool_months: 0,
    yoga_months: 0,
    stored_tier: "standard",
    enabled: true,
    featured: false,
    sort_order: 2,
    locked: true,
  },
  {
    id: "premium",
    name: "Premium 2",
    price_mnt: 780_000,
    months: 12,
    pool_months: 0,
    yoga_months: 3,
    stored_tier: "premium2",
    enabled: true,
    featured: false,
    sort_order: 3,
    locked: true,
  },
  {
    id: "premium4",
    name: "GymCore",
    price_mnt: 980_000,
    months: 12,
    pool_months: 3,
    yoga_months: 3,
    stored_tier: "gymcore",
    enabled: true,
    featured: false,
    sort_order: 4,
    locked: true,
  },
];

export const PAYMENT_APP_SETTINGS_DEFAULTS: Omit<PaymentAppSettingsRow, "updated_at"> = {
  id: "default",
  early_membership_price_mnt: 480_000,
  early_first_month_price_mnt: 150_000,
  early_remainder_price_mnt: 330_000,
  premium_membership_price_mnt: 780_000,
  smart1_price_mnt: 780_000,
  standard3_price_mnt: 480_000,
  premium4_price_mnt: 980_000,
  smart1_months: 12,
  standard3_months: 6,
  premium_months: 12,
  premium4_months: 12,
  smart1_pool_months: 3,
  premium_yoga_months: 3,
  premium4_pool_months: 3,
  premium4_yoga_months: 3,
  packages: DEFAULT_PACKAGES,
  payment_qpay_enabled: true,
  payment_sono_enabled: true,
  payment_pocket_enabled: true,
  payment_carepay_enabled: true,
  payment_monpay_enabled: true,
  payment_gymfintech_enabled: true,
};

function clampInt(n: number, fallback: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function slugifyPackageId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 40);
}

export function isValidStoredTier(v: unknown): v is StoredMembershipTier {
  return v === "standard" || v === "premium1" || v === "premium2" || v === "gymcore" || v === "early";
}

export function normalizePackage(raw: unknown, index: number): MembershipPackage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const idRaw = String(o.id ?? "").trim();
  const id = slugifyPackageId(idRaw);
  if (!id) return null;
  const locked =
    Boolean(o.locked) || (SYSTEM_PACKAGE_IDS as readonly string[]).includes(id);
  const name = String(o.name ?? "").trim() || id;
  const price = clampInt(Number(o.price_mnt), 0, 0, 999_999_999);
  const months = clampInt(Number(o.months), 6, 1, 60);
  const pool = clampInt(Number(o.pool_months), 0, 0, 60);
  const yoga = clampInt(Number(o.yoga_months), 0, 0, 60);
  const stored = isValidStoredTier(o.stored_tier)
    ? o.stored_tier
    : locked
      ? (DEFAULT_PACKAGES.find((p) => p.id === id)?.stored_tier ?? "standard")
      : "standard";
  return {
    id,
    name,
    price_mnt: price,
    months,
    pool_months: pool,
    yoga_months: yoga,
    stored_tier: stored,
    enabled: o.enabled !== false,
    featured: Boolean(o.featured),
    sort_order: clampInt(Number(o.sort_order), index + 1, 0, 9999),
    locked,
  };
}

export function normalizePackages(raw: unknown, fallbackFlat?: Partial<PaymentAppSettingsRow>): MembershipPackage[] {
  if (Array.isArray(raw) && raw.length > 0) {
    const list = raw
      .map((item, i) => normalizePackage(item, i))
      .filter((p): p is MembershipPackage => !!p);
    if (list.length === 0) return buildPackagesFromFlat(fallbackFlat);
    // Ensure locked system packages exist
    const byId = new Map(list.map((p) => [p.id, p]));
    for (const sys of DEFAULT_PACKAGES) {
      if (!byId.has(sys.id)) {
        list.push({ ...sys });
        byId.set(sys.id, sys);
      } else {
        const cur = byId.get(sys.id)!;
        cur.locked = true;
        if (!cur.stored_tier) cur.stored_tier = sys.stored_tier;
      }
    }
    return list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name, "mn"));
  }
  return buildPackagesFromFlat(fallbackFlat);
}

function buildPackagesFromFlat(flat?: Partial<PaymentAppSettingsRow>): MembershipPackage[] {
  return DEFAULT_PACKAGES.map((p) => {
    if (p.id === "smart1") {
      return {
        ...p,
        price_mnt: flat?.smart1_price_mnt ?? p.price_mnt,
        months: flat?.smart1_months ?? p.months,
        pool_months: flat?.smart1_pool_months ?? p.pool_months,
      };
    }
    if (p.id === "standard3") {
      return {
        ...p,
        price_mnt: flat?.standard3_price_mnt ?? p.price_mnt,
        months: flat?.standard3_months ?? p.months,
      };
    }
    if (p.id === "premium") {
      return {
        ...p,
        price_mnt: flat?.premium_membership_price_mnt ?? p.price_mnt,
        months: flat?.premium_months ?? p.months,
        yoga_months: flat?.premium_yoga_months ?? p.yoga_months,
      };
    }
    if (p.id === "premium4") {
      return {
        ...p,
        price_mnt: flat?.premium4_price_mnt ?? p.price_mnt,
        months: flat?.premium4_months ?? p.months,
        pool_months: flat?.premium4_pool_months ?? p.pool_months,
        yoga_months: flat?.premium4_yoga_months ?? p.yoga_months,
      };
    }
    return { ...p };
  });
}

/** packages → flat columns (хуучин API/кодтой нийцүүлэх) */
export function syncFlatFromPackages(packages: MembershipPackage[]): Partial<PaymentAppSettingsRow> {
  const byId = new Map(packages.map((p) => [p.id, p]));
  const smart1 = byId.get("smart1");
  const standard3 = byId.get("standard3");
  const premium = byId.get("premium");
  const premium4 = byId.get("premium4");
  return {
    smart1_price_mnt: smart1?.price_mnt ?? PAYMENT_APP_SETTINGS_DEFAULTS.smart1_price_mnt,
    smart1_months: smart1?.months ?? PAYMENT_APP_SETTINGS_DEFAULTS.smart1_months,
    smart1_pool_months: smart1?.pool_months ?? PAYMENT_APP_SETTINGS_DEFAULTS.smart1_pool_months,
    standard3_price_mnt: standard3?.price_mnt ?? PAYMENT_APP_SETTINGS_DEFAULTS.standard3_price_mnt,
    standard3_months: standard3?.months ?? PAYMENT_APP_SETTINGS_DEFAULTS.standard3_months,
    premium_membership_price_mnt: premium?.price_mnt ?? PAYMENT_APP_SETTINGS_DEFAULTS.premium_membership_price_mnt,
    premium_months: premium?.months ?? PAYMENT_APP_SETTINGS_DEFAULTS.premium_months,
    premium_yoga_months: premium?.yoga_months ?? PAYMENT_APP_SETTINGS_DEFAULTS.premium_yoga_months,
    premium4_price_mnt: premium4?.price_mnt ?? PAYMENT_APP_SETTINGS_DEFAULTS.premium4_price_mnt,
    premium4_months: premium4?.months ?? PAYMENT_APP_SETTINGS_DEFAULTS.premium4_months,
    premium4_pool_months: premium4?.pool_months ?? PAYMENT_APP_SETTINGS_DEFAULTS.premium4_pool_months,
    premium4_yoga_months: premium4?.yoga_months ?? PAYMENT_APP_SETTINGS_DEFAULTS.premium4_yoga_months,
  };
}

export function normalizePaymentAppSettingsRow(row: Record<string, unknown>): PaymentAppSettingsRow {
  const early = Number(row.early_membership_price_mnt);
  const earlyFirst = Number(row.early_first_month_price_mnt);
  const earlyRest = Number(row.early_remainder_price_mnt);
  const premium = Number(row.premium_membership_price_mnt);
  const smart1 = Number(row.smart1_price_mnt);
  const standard3 = Number(row.standard3_price_mnt);
  const premium4 = Number(row.premium4_price_mnt);

  const flatPartial: Partial<PaymentAppSettingsRow> = {
    smart1_price_mnt:
      Number.isFinite(smart1) && smart1 >= 0 ? Math.floor(smart1) : PAYMENT_APP_SETTINGS_DEFAULTS.smart1_price_mnt,
    standard3_price_mnt:
      Number.isFinite(standard3) && standard3 >= 0 ? Math.floor(standard3) : PAYMENT_APP_SETTINGS_DEFAULTS.standard3_price_mnt,
    premium_membership_price_mnt:
      Number.isFinite(premium) && premium >= 0 ? Math.floor(premium) : PAYMENT_APP_SETTINGS_DEFAULTS.premium_membership_price_mnt,
    premium4_price_mnt:
      Number.isFinite(premium4) && premium4 >= 0 ? Math.floor(premium4) : PAYMENT_APP_SETTINGS_DEFAULTS.premium4_price_mnt,
    smart1_months: clampInt(Number(row.smart1_months), PAYMENT_APP_SETTINGS_DEFAULTS.smart1_months, 1, 60),
    standard3_months: clampInt(Number(row.standard3_months), PAYMENT_APP_SETTINGS_DEFAULTS.standard3_months, 1, 60),
    premium_months: clampInt(Number(row.premium_months), PAYMENT_APP_SETTINGS_DEFAULTS.premium_months, 1, 60),
    premium4_months: clampInt(Number(row.premium4_months), PAYMENT_APP_SETTINGS_DEFAULTS.premium4_months, 1, 60),
    smart1_pool_months: clampInt(Number(row.smart1_pool_months), PAYMENT_APP_SETTINGS_DEFAULTS.smart1_pool_months, 0, 60),
    premium_yoga_months: clampInt(Number(row.premium_yoga_months), PAYMENT_APP_SETTINGS_DEFAULTS.premium_yoga_months, 0, 60),
    premium4_pool_months: clampInt(Number(row.premium4_pool_months), PAYMENT_APP_SETTINGS_DEFAULTS.premium4_pool_months, 0, 60),
    premium4_yoga_months: clampInt(Number(row.premium4_yoga_months), PAYMENT_APP_SETTINGS_DEFAULTS.premium4_yoga_months, 0, 60),
  };

  const packages = normalizePackages(row.packages, flatPartial);
  const synced = syncFlatFromPackages(packages);

  return {
    id: (row.id as string) || "default",
    early_membership_price_mnt:
      Number.isFinite(early) && early >= 0 ? Math.floor(early) : PAYMENT_APP_SETTINGS_DEFAULTS.early_membership_price_mnt,
    early_first_month_price_mnt:
      Number.isFinite(earlyFirst) && earlyFirst >= 0
        ? Math.floor(earlyFirst)
        : PAYMENT_APP_SETTINGS_DEFAULTS.early_first_month_price_mnt,
    early_remainder_price_mnt:
      Number.isFinite(earlyRest) && earlyRest >= 0
        ? Math.floor(earlyRest)
        : PAYMENT_APP_SETTINGS_DEFAULTS.early_remainder_price_mnt,
    smart1_price_mnt: flatPartial.smart1_price_mnt!,
    standard3_price_mnt: flatPartial.standard3_price_mnt!,
    premium_membership_price_mnt: flatPartial.premium_membership_price_mnt!,
    premium4_price_mnt: flatPartial.premium4_price_mnt!,
    smart1_months: flatPartial.smart1_months!,
    standard3_months: flatPartial.standard3_months!,
    premium_months: flatPartial.premium_months!,
    premium4_months: flatPartial.premium4_months!,
    smart1_pool_months: flatPartial.smart1_pool_months!,
    premium_yoga_months: flatPartial.premium_yoga_months!,
    premium4_pool_months: flatPartial.premium4_pool_months!,
    premium4_yoga_months: flatPartial.premium4_yoga_months!,
    ...synced,
    packages,
    payment_qpay_enabled: row.payment_qpay_enabled !== false,
    payment_sono_enabled: row.payment_sono_enabled !== false,
    payment_pocket_enabled: row.payment_pocket_enabled !== false,
    payment_carepay_enabled: row.payment_carepay_enabled !== false,
    payment_monpay_enabled: row.payment_monpay_enabled !== false,
    payment_gymfintech_enabled: row.payment_gymfintech_enabled !== false,
    updated_at: (row.updated_at as string) || new Date().toISOString(),
  };
}

export function findPackage(
  settings: Pick<PaymentAppSettingsRow, "packages">,
  packageId: string,
): MembershipPackage | undefined {
  return settings.packages.find((p) => p.id === packageId);
}

/** Booking tier slug → үндсэн фитнес сар */
export function membershipMonthsForTier(
  tier: string,
  settings: Pick<
    PaymentAppSettingsRow,
    | "packages"
    | "smart1_months"
    | "standard3_months"
    | "premium_months"
    | "premium4_months"
  >,
): number {
  const fromPkg = settings.packages?.find((p) => p.id === tier);
  if (fromPkg) return fromPkg.months;

  switch (tier) {
    case "smart1":
    case "premium1":
    case "plus":
      return settings.smart1_months;
    case "premium":
    case "premium2":
    case "smart2":
      return settings.premium_months;
    case "premium4":
    case "gymcore":
    case "prime":
      return settings.premium4_months;
    case "standard3":
    case "standard":
    case "basic":
    case "early":
      return settings.standard3_months;
    default:
      return settings.standard3_months;
  }
}

/** Booking package id → profile-д хадгалах tier */
export function storedTierForPackageId(
  packageId: string,
  settings: Pick<PaymentAppSettingsRow, "packages">,
): StoredMembershipTier {
  const pkg = findPackage(settings, packageId);
  if (pkg) return pkg.stored_tier;
  switch (packageId) {
    case "smart1":
    case "premium1":
    case "plus":
      return "premium1";
    case "premium":
    case "premium2":
    case "smart2":
      return "premium2";
    case "premium4":
    case "gymcore":
    case "prime":
      return "gymcore";
    case "standard3":
    case "standard":
    case "basic":
      return "standard";
    case "early":
      return "early";
    default:
      return "standard";
  }
}

export function formatMonthsLabel(months: number): string {
  if (months === 12) return "1 жил";
  return `${months} сар`;
}

export function newBlankPackage(existing: MembershipPackage[]): MembershipPackage {
  const base = `pkg${Date.now().toString(36)}`;
  let id = base;
  const ids = new Set(existing.map((p) => p.id));
  let n = 1;
  while (ids.has(id)) {
    id = `${base}${n++}`;
  }
  return {
    id,
    name: "Шинэ багц",
    price_mnt: 480_000,
    months: 6,
    pool_months: 0,
    yoga_months: 0,
    stored_tier: "standard",
    enabled: true,
    featured: false,
    sort_order: (existing.reduce((m, p) => Math.max(m, p.sort_order), 0) || 0) + 1,
    locked: false,
  };
}


