const UB_TZ = "Asia/Ulaanbaatar";

/** Asia/Ulaanbaatar өнөөдөр (сар/өдөр) — сервер UTC байсан ч зөв. */
export function todayInUlaanbaatar(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: UB_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return new Date(y, m - 1, d);
}

export function addCalendarMonths(from: Date, months: number): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

/** YYYY-MM-DD — орон нутгийн Y/M/D (toISOString/UTC-ээс зайлсхий). */
export function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD (эсвэл ISO) → локал шөнийн Date; UTC off-by-one-ээс сэргийлнэ. */
export function parseLocalDateOnly(iso: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(iso);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function calendarDaysBetween(a: Date, b: Date): number {
  const ms = startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime();
  return Math.round(ms / 86_400_000);
}

/**
 * Сар бүрийн тогтмол өдрүүд (1, 15) дээр `from`-оос хойших ирэх N огноо.
 * Хоёр хуваарийн хооронд хамгийн багадаа `minGapDays` хоног байх ёстой —
 * эс бөгөөс сарын сүүлээр төлөхөд 2-р төлбөр маргааш (1-нд) болдог байсан.
 */
export function nextFixedDayDates(
  from: Date,
  count: number,
  fixedDays: number[] = [1, 15],
  minGapDays = 14,
): Date[] {
  const dates: Date[] = [];
  if (count <= 0) return dates;

  let after = startOfLocalDay(from);
  let year = after.getFullYear();
  let month = after.getMonth();
  const days = [...fixedDays].sort((a, b) => a - b);

  for (let guard = 0; guard < 240 && dates.length < count; guard++) {
    for (const day of days) {
      const candidate = new Date(year, month, day);
      if (candidate <= after) continue;
      if (calendarDaysBetween(after, candidate) < minGapDays) continue;
      dates.push(candidate);
      after = candidate;
      if (dates.length === count) break;
    }
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return dates;
}

/** 480k багцууд (Standard-3, EARLY) хамгийн ихдээ 6 хуваарьтай, бусад нь 8 хүртэл. */
const MAX_INSTALLMENTS_BY_TIER: Record<string, number> = {
  standard3: 6,
  early_year: 6,
};

export function maxInstallmentsForTier(tier: string): number {
  return MAX_INSTALLMENTS_BY_TIER[tier] ?? 8;
}

export type InstallmentScheduleItem = {
  installment_no: number;
  amount: number;
  due_date: string; // YYYY-MM-DD
};

/**
 * Бусад бүх хуваарийг мянгаас нааш тэгшилж (жишээ нь 111,000₮), үлдэгдлийг эхний хуваарьт
 * нэмнэ. Эхний хуваарь өнөөдөр (UB), дараагийнх сар бүрийн 1 / 15 — хамгийн багадаа ~14 хоногийн зайтай.
 */
export function buildInstallmentSchedule(args: {
  totalAmount: number;
  installmentCount: number;
  startDate?: Date;
}): InstallmentScheduleItem[] {
  const { totalAmount, installmentCount } = args;
  const start = startOfLocalDay(args.startDate ?? todayInUlaanbaatar());
  const rawBase = Math.floor(totalAmount / installmentCount);
  const base = Math.floor(rawBase / 1000) * 1000;
  const firstAmount = totalAmount - base * (installmentCount - 1);
  const restDates = nextFixedDayDates(start, installmentCount - 1);
  const dueDates = [start, ...restDates];

  return Array.from({ length: installmentCount }, (_, i) => {
    const no = i + 1;
    const amount = no === 1 ? firstAmount : base;
    return {
      installment_no: no,
      amount,
      due_date: toLocalDateString(dueDates[i]),
    };
  });
}
