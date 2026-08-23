/** Smart багц: 6 сарын фитнес + хүүхдийн 7 хоногийн сургалт. Зөвхөн QPay. 2026-09-01 хүртэл. */
export const SMART_PACKAGE_ID = "smart";
export const SMART_PROMO_UNTIL = "2026-09-01";
export const SMART_PROMO_DEADLINE = new Date("2026-09-01T23:59:59+08:00");
export const SMART_PRICE_MNT = 300_000;

export function isSmartPromoActive(now: Date = new Date()): boolean {
  return now.getTime() <= SMART_PROMO_DEADLINE.getTime();
}

export function isQpayOnlyPackageId(id: string | null | undefined): boolean {
  return String(id ?? "").trim().toLowerCase() === SMART_PACKAGE_ID;
}

export function isPackageAvailableUntil(
  availableUntil: string | null | undefined,
  now: Date = new Date(),
): boolean {
  const raw = String(availableUntil ?? "").trim();
  if (!raw) return true;
  const day = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (!day) return true;
  const end = new Date(`${day[1]}-${day[2]}-${day[3]}T23:59:59+08:00`);
  return now.getTime() <= end.getTime();
}
