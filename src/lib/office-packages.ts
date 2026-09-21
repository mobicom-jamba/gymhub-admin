/** Оффис (байгууллагын) багц — админ тохиргоонд хадгалагдаж, аппд харагдана. */

export type OfficePlanKey = "weekly" | "intensive";

export type OfficePackage = {
  id: string;
  /** Жишээ нь «15 хүн» */
  label: string;
  plan_key: OfficePlanKey;
  /** Жишээ нь «1 сар — 7 хоногт 1 удаа явна» */
  plan_label: string;
  headcount: number;
  price_mnt: number;
  /** 1 хүний 1 удаагийн оролт */
  per_visit_mnt: number;
  enabled: boolean;
  sort_order: number;
};

export const OFFICE_PLAN_LABELS: Record<OfficePlanKey, string> = {
  weekly: "1 сар — 7 хоногт 1 удаа явна",
  intensive: "Эрчимжүүлсэн 10 хоног",
};

/** Анхны жагсаалт — «Оффис биелгээ, бясалгал хосолсон багц» үнийн хүснэгт. */
export const DEFAULT_OFFICE_PACKAGES: OfficePackage[] = [
  { headcount: 15, plan_key: "weekly", price_mnt: 1_200_000, per_visit_mnt: 20_000 },
  { headcount: 25, plan_key: "weekly", price_mnt: 2_000_000, per_visit_mnt: 20_000 },
  { headcount: 35, plan_key: "weekly", price_mnt: 2_800_000, per_visit_mnt: 20_000 },
  { headcount: 15, plan_key: "intensive", price_mnt: 3_000_000, per_visit_mnt: 20_000 },
  { headcount: 25, plan_key: "intensive", price_mnt: 3_750_000, per_visit_mnt: 15_000 },
  { headcount: 35, plan_key: "intensive", price_mnt: 4_200_000, per_visit_mnt: 12_000 },
].map((row, index) => ({
  id: `office-${row.headcount}-${row.plan_key}`,
  label: `${row.headcount} хүртэлх хүн`,
  plan_label: OFFICE_PLAN_LABELS[row.plan_key as OfficePlanKey],
  enabled: true,
  sort_order: index,
  ...row,
  plan_key: row.plan_key as OfficePlanKey,
}));

function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

export function normalizeOfficePackage(raw: unknown, index = 0): OfficePackage | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  const headcount = clampInt(o.headcount, 0, 0, 100_000);
  const planKey: OfficePlanKey = o.plan_key === "intensive" ? "intensive" : "weekly";
  const label = String(o.label ?? "").trim() || (headcount > 0 ? `${headcount} хүртэлх хүн` : "Багц");
  const id = String(o.id ?? "").trim() || `office-${headcount}-${planKey}-${index}`;

  return {
    id,
    label,
    plan_key: planKey,
    plan_label: String(o.plan_label ?? "").trim() || OFFICE_PLAN_LABELS[planKey],
    headcount,
    price_mnt: clampInt(o.price_mnt, 0, 0, 1_000_000_000),
    per_visit_mnt: clampInt(o.per_visit_mnt, 0, 0, 100_000_000),
    enabled: o.enabled !== false,
    sort_order: clampInt(o.sort_order, index, 0, 10_000),
  };
}

/** jsonb-ээс уншсан утгыг цэвэрлэнэ. Хоосон бол анхны хүснэгтийг өгнө. */
export function normalizeOfficePackages(raw: unknown): OfficePackage[] {
  if (!Array.isArray(raw)) return [...DEFAULT_OFFICE_PACKAGES];
  const rows = raw
    .map((item, index) => normalizeOfficePackage(item, index))
    .filter((row): row is OfficePackage => row !== null);
  if (rows.length === 0) return [];
  // Ижил id давхардвал сүүлийнх нь үлдэнэ.
  const byId = new Map(rows.map((row) => [row.id, row]));
  return [...byId.values()].sort((a, b) => a.sort_order - b.sort_order);
}

export function newBlankOfficePackage(sortOrder: number): OfficePackage {
  return {
    id: `office-${Date.now()}`,
    label: "Шинэ багц",
    plan_key: "weekly",
    plan_label: OFFICE_PLAN_LABELS.weekly,
    headcount: 0,
    price_mnt: 0,
    per_visit_mnt: 0,
    enabled: true,
    sort_order: sortOrder,
  };
}
