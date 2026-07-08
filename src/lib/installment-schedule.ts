export function addCalendarMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  if (d.getDate() < day) d.setDate(0);
  return d;
}

/** YYYY-MM-DD, орон нутгийн цагийн бүсээр (toISOString ашиглавал UTC руу хөрвүүлэгдэж огноо шилжиж болзошгүй). */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Сар бүрийн тогтмол өдрүүд (1, 15) дээр `from`-оос хойших ирэх N огноог буцаана. */
export function nextFixedDayDates(from: Date, count: number, fixedDays: number[] = [1, 15]): Date[] {
  const dates: Date[] = [];
  let year = from.getFullYear();
  let month = from.getMonth();
  const days = [...fixedDays].sort((a, b) => a - b);

  while (dates.length < count) {
    for (const day of days) {
      const candidate = new Date(year, month, day);
      if (candidate > from) {
        dates.push(candidate);
        if (dates.length === count) break;
      }
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
 * нэмнэ — ингэснээр давтагдах хуваарь бүр "000"-оор төгссөн цэвэр тоо харагдана. Эхний хуваарь
 * өнөөдөр, дараагийнх сар бүрийн тогтмол өдрүүдэд (1, 15 — сард 2 удаа) төлдөг.
 */
export function buildInstallmentSchedule(args: {
  totalAmount: number;
  installmentCount: number;
  startDate?: Date;
}): InstallmentScheduleItem[] {
  const { totalAmount, installmentCount } = args;
  const start = args.startDate ?? new Date();
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
