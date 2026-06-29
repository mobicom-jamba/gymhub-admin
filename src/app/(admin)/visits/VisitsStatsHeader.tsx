"use client";

import React from "react";
import type { VisitsStats } from "./VisitsSection";

function StackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2.5" />
      <path strokeLinecap="round" d="M16 4H6a2 2 0 0 0-2 2v10" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path strokeLinecap="round" d="M8 3v4M16 3v4M3.5 10h17" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path strokeLinecap="round" d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MiniStat({
  label,
  value,
  loading,
  icon,
  tint,
}: {
  label: string;
  value: number;
  loading: boolean;
  icon: React.ReactNode;
  tint: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tint}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {label}
        </div>
        {loading ? (
          <div className="mt-1.5 h-7 w-16 animate-pulse rounded bg-gray-200 dark:bg-white/[0.08]" />
        ) : (
          <div className="mt-0.5 text-2xl font-bold tabular-nums text-gray-800 dark:text-white">
            {value.toLocaleString("mn-MN")}
          </div>
        )}
      </div>
    </div>
  );
}

export default function VisitsStatsHeader({ stats }: { stats: VisitsStats | null }) {
  const loading = stats === null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {/* Hero — Total visits */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-6 text-white shadow-lg shadow-brand-500/20 lg:row-span-1">
        {/* decorative glow */}
        <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-12 -left-6 h-36 w-36 rounded-full bg-white/10 blur-2xl" />

        <div className="relative flex items-start justify-between">
          <div>
            <div className="text-sm font-medium text-white/80">Нийт ирц</div>
            <div className="mt-2 flex items-end gap-2">
              {loading ? (
                <div className="h-12 w-32 animate-pulse rounded-lg bg-white/25" />
              ) : (
                <span className="text-5xl font-extrabold leading-none tabular-nums">
                  {stats.total.toLocaleString("mn-MN")}
                </span>
              )}
            </div>
            <div className="mt-3 text-xs text-white/70">
              Бүх цаг үеийн ирц · татгалзсанаас бусад
            </div>
          </div>
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 backdrop-blur-sm">
            <StackIcon className="h-7 w-7 text-white" />
          </div>
        </div>
      </div>

      {/* Supporting metrics */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
        <MiniStat
          label="Энэ сар"
          value={stats?.thisMonth ?? 0}
          loading={loading}
          tint="bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"
          icon={<CalendarIcon className="h-6 w-6" />}
        />
        <MiniStat
          label="Өнөөдөр"
          value={stats?.today ?? 0}
          loading={loading}
          tint="bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300"
          icon={<SunIcon className="h-6 w-6" />}
        />
      </div>
    </div>
  );
}
