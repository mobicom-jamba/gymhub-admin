/** Gyms with a future `opens_at` are "coming soon": listed with a countdown, check-ins blocked. */
export function isGymComingSoon(
  opensAt: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!opensAt) return false;
  const t = new Date(opensAt).getTime();
  return Number.isFinite(t) && t > now;
}

export type Countdown = { days: number; hours: number; minutes: number; seconds: number };

export function countdownParts(ms: number): Countdown {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86400),
    hours: Math.floor((total % 86400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

const pad = (n: number) => String(n).padStart(2, "0");

/** e.g. "29 хоног 23:59:59" */
export function formatCountdown(ms: number): string {
  const { days, hours, minutes, seconds } = countdownParts(ms);
  return `${days} хоног ${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}
