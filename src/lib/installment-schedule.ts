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

/** `from`-оос хойш `intervalDays` хоног тутам N огноо (жишээ: 15 хоногт нэг). */
export function everyNDaysDates(
  from: Date,
  count: number,
  intervalDays = 15,
): Date[] {
  const dates: Date[] = [];
  if (count <= 0) return dates;
  let cursor = startOfLocalDay(from);
  for (let i = 0; i < count; i++) {
    cursor = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + intervalDays,
    );
    dates.push(cursor);
  }
  return dates;
}

/**
 * @deprecated Use everyNDaysDates — kept for any callers expecting 1/15 calendar days.
 * Сар бүрийн тогтмол өдрүүд (1, 15) дээр `from`-оос хойших ирэх N огноо.
 */
export function nextFixedDayDates(
  from: Date,
  count: number,
  fixedDays: number[] = [1, 15],
  minGapDays = 14,
): Date[] {
  const dates: Date[] = [];
  if (count <= 0) return dates;

  function calendarDaysBetween(a: Date, b: Date): number {
    const ms = startOfLocalDay(b).getTime() - startOfLocalDay(a).getTime();
    return Math.round(ms / 86_400_000);
  }

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

/** 480k / богино хугацааны багцууд хамгийн ихдээ 6, бусад нь 8 хүртэл. */
const MAX_INSTALLMENTS_BY_TIER: Record<string, number> = {
  standard3: 6,
  early_year: 6,
};

export function maxInstallmentsForTier(tier: string, months?: number): number {
  if (typeof months === "number" && Number.isFinite(months) && months > 0 && months <= 6) {
    return 6;
  }
  return MAX_INSTALLMENTS_BY_TIER[tier] ?? 8;
}

/**
 * Шинэ Flexy багцын албан ёсны хуваалт («GYMHUB ТӨЛБӨРХ ХУВААЛТ»).
 * Зөвхөн шинээр үүсэх хуваарьт хэрэглэнэ — хуучин installment_payments хөндөгдөхгүй.
 *
 * 780,000 × 3: хүснэгтэд 380+260+240=880 гэж байсан тул сүүлийн дүнг 140,000 болгосон
 * (нийт 780,000-д тааруулсан).
 */
const PRESET_SPLIT_AMOUNTS: Record<number, Record<number, readonly number[]>> = {
  480_000: {
    2: [260_000, 220_000],
    3: [180_000, 160_000, 140_000],
    4: [160_000, 140_000, 120_000, 60_000],
  },
  780_000: {
    2: [480_000, 300_000],
    3: [380_000, 260_000, 140_000],
    4: [360_000, 220_000, 120_000, 80_000],
    5: [300_000, 200_000, 130_000, 80_000, 70_000],
    6: [260_000, 200_000, 120_000, 100_000, 60_000, 40_000],
  },
  980_000: {
    2: [580_000, 400_000],
    3: [400_000, 300_000, 280_000],
    4: [380_000, 300_000, 200_000, 100_000],
    5: [300_000, 280_000, 200_000, 120_000, 80_000],
    6: [280_000, 260_000, 240_000, 120_000, 60_000, 20_000],
  },
};

export function presetSplitAmounts(
  totalAmount: number,
  installmentCount: number,
): number[] | null {
  const total = Math.floor(totalAmount);
  const row = PRESET_SPLIT_AMOUNTS[total]?.[installmentCount];
  if (!row || row.length !== installmentCount) return null;
  return row.slice();
}

/** Хүснэгттэй дүн бол түүний max, эсвэл fallback (хуучин тэгш хуваалт). */
export function maxInstallmentsForAmount(totalAmount: number, fallbackMax: number): number {
  const row = PRESET_SPLIT_AMOUNTS[Math.floor(totalAmount)];
  if (!row) return fallbackMax;
  return Math.max(...Object.keys(row).map(Number));
}

export function maxInstallmentsForPlan(args: {
  tier: string;
  months?: number;
  totalAmount?: number;
}): number {
  const fallback = maxInstallmentsForTier(args.tier, args.months);
  if (typeof args.totalAmount === "number" && Number.isFinite(args.totalAmount)) {
    return maxInstallmentsForAmount(args.totalAmount, fallback);
  }
  return fallback;
}

function equalSplitAmounts(totalAmount: number, installmentCount: number): number[] {
  const total = Math.floor(totalAmount);
  const rawBase = Math.floor(total / installmentCount);
  const base = Math.floor(rawBase / 1000) * 1000;
  const firstAmount = total - base * (installmentCount - 1);
  return Array.from({ length: installmentCount }, (_, i) => (i === 0 ? firstAmount : base));
}

/** Шинэ багц: хүснэгтийн дүн байвал түүгээр, үгүй бол тэгш хуваана. */
export function splitInstallmentAmounts(totalAmount: number, installmentCount: number): number[] {
  return (
    presetSplitAmounts(totalAmount, installmentCount) ??
    equalSplitAmounts(totalAmount, installmentCount)
  );
}

export type InstallmentScheduleItem = {
  installment_no: number;
  amount: number;
  due_date: string; // YYYY-MM-DD
};

/**
 * Эхний хуваарь өнөөдөр (UB), дараагийнх 15 хоног тутам.
 * 480/780/980 мянгатын шинэ багцад албан ёсны хуваалтын хүснэгт хэрэглэнэ.
 * Бусад дүнд: бусад хуваарийг мянгаас нааш тэгшилж, үлдэгдлийг эхнийхэд нэмнэ.
 */
export function buildInstallmentSchedule(args: {
  totalAmount: number;
  installmentCount: number;
  startDate?: Date;
  /** Хоёр хуваарийн хоорондын хоног (default 15). */
  intervalDays?: number;
}): InstallmentScheduleItem[] {
  const { totalAmount, installmentCount } = args;
  const intervalDays = args.intervalDays ?? 15;
  const start = startOfLocalDay(args.startDate ?? todayInUlaanbaatar());
  const amounts = splitInstallmentAmounts(totalAmount, installmentCount);
  const restDates = everyNDaysDates(start, installmentCount - 1, intervalDays);
  const dueDates = [start, ...restDates];

  return amounts.map((amount, i) => ({
    installment_no: i + 1,
    amount,
    due_date: toLocalDateString(dueDates[i]),
  }));
}
