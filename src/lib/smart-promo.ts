/** Smart багц: 6 сарын фитнес + хүүхдийн 7 хоногийн сургалт. Зөвхөн QPay. 2026-09-01 хүртэл. */
export const SMART_PACKAGE_ID = "smart";
/** GymGo: Smart-ийн байнгын залгамжлагч. 300,000₮, 6 сар, зөвхөн QPay/Pocket/Sono (Carepay, Flexy, MonPay байхгүй). */
export const GYMGO_PACKAGE_ID = "gymgo";
export const SMART_PROMO_UNTIL = "2026-09-01";
export const SMART_PROMO_DEADLINE = new Date("2026-09-01T23:59:59+08:00");
export const SMART_PRICE_MNT = 300_000;

export function isSmartPromoActive(now: Date = new Date()): boolean {
  return now.getTime() <= SMART_PROMO_DEADLINE.getTime();
}

export function isQpayOnlyPackageId(id: string | null | undefined): boolean {
  return String(id ?? "").trim().toLowerCase() === SMART_PACKAGE_ID;
}

/**
 * Smart болон GymGo — Flexy (хуваан төлөлт), Carepay, MonPay-д хориотой хоёр багц.
 * Smart: зөвхөн QPay. GymGo: QPay/Pocket/Sono, гэхдээ Flexy/Carepay/MonPay байхгүй.
 */
export function isRestrictedChannelPackageId(id: string | null | undefined): boolean {
  const v = String(id ?? "").trim().toLowerCase();
  return v === SMART_PACKAGE_ID || v === GYMGO_PACKAGE_ID;
}

/** booking_id (жишээ: membership-gymgo-1699999999) дотроос Smart/GymGo багцыг таньдаг. */
export function bookingIdHasRestrictedChannelPackage(bookingId: string | null | undefined): boolean {
  return /(?:^|-)(smart|gymgo)(?:-|$)/i.test(String(bookingId ?? ""));
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
