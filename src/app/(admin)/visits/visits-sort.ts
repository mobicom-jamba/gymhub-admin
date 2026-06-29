export type VisitsSortColumn =
  | "user"
  | "gym"
  | "method"
  | "userTotal"
  | "userLastVisitAt"
  | "membershipStatus"
  | "membershipExpiresAt";

export const DESC_FIRST_VISITS_SORT_COLS = new Set<VisitsSortColumn>([
  "userTotal",
  "userLastVisitAt",
  "membershipStatus",
  "membershipExpiresAt",
]);

export const DATE_VISITS_SORT_COLS = new Set<VisitsSortColumn>([
  "userLastVisitAt",
  "membershipExpiresAt",
]);

export function compareNullableDates(
  a: string | null,
  b: string | null,
  ascending: boolean,
): number {
  const parse = (s: string | null) => {
    if (!s) return null;
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? null : t;
  };
  const ta = parse(a);
  const tb = parse(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  const raw = ta === tb ? 0 : ta < tb ? -1 : 1;
  return ascending ? raw : -raw;
}
