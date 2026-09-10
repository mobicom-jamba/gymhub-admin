/** Монголын цагаар (Asia/Ulaanbaatar) огнооны муж боловсруулах туслах. */

const TZ = "Asia/Ulaanbaatar";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Тухайн агшин дахь Монголын орон нутгийн огноо (YYYY-MM-DD). */
export function todayInUlaanbaatar(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function shiftDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export type DateRange = { from: string; to: string };

/**
 * ?from=YYYY-MM-DD&to=YYYY-MM-DD уншина. Байхгүй/буруу бол сүүлийн 30 хоног.
 * Урвуу муж ирвэл сольж, хамгийн ихдээ 366 хоногоор хязгаарлана.
 */
export function parseDateRange(searchParams: URLSearchParams): DateRange {
  const today = todayInUlaanbaatar();
  const rawFrom = (searchParams.get("from") ?? "").trim();
  const rawTo = (searchParams.get("to") ?? "").trim();

  let to = DATE_RE.test(rawTo) ? rawTo : today;
  let from = DATE_RE.test(rawFrom) ? rawFrom : shiftDays(to, -29);

  if (from > to) [from, to] = [to, from];
  const earliest = shiftDays(to, -365);
  if (from < earliest) from = earliest;

  return { from, to };
}
