"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Profile } from "./UsersSection";
import { EMPTY_VISIT_STATS, type UserVisitStats } from "./user-visit-stats";
import { getUserPlaceholderAvatar } from "@/lib/user-avatar";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

async function getAuthHeader(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

type MonthRow = {
  key: string;        // "2026-06"
  label: string;      // "2026 оны 6-р сар"
  visits: number;     // нийт орсон удаа
  days: number;       // өвөрмөц өдрийн тоо
};

type VisitRow = {
  checked_in_at: string;
  gym_name: string | null;
};

function toMnMonthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-");
  return `${y} оны ${parseInt(m, 10)}-р сар`;
}

function buildMonthRows(rows: VisitRow[]): MonthRow[] {
  const map = new Map<string, { visits: number; daySet: Set<string> }>();
  for (const r of rows) {
    const d = new Date(r.checked_in_at);
    if (Number.isNaN(d.getTime())) continue;
    // Mongolia time UTC+8
    const mnMs = d.getTime() + 8 * 3600 * 1000;
    const mnD = new Date(mnMs);
    const key = `${mnD.getUTCFullYear()}-${String(mnD.getUTCMonth() + 1).padStart(2, "0")}`;
    const dayKey = `${mnD.getUTCFullYear()}-${mnD.getUTCMonth()}-${mnD.getUTCDate()}`;
    const existing = map.get(key) ?? { visits: 0, daySet: new Set() };
    existing.visits += 1;
    existing.daySet.add(dayKey);
    map.set(key, existing);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, { visits, daySet }]) => ({
      key,
      label: toMnMonthLabel(key),
      visits,
      days: daySet.size,
    }));
}

function countUniqueDays(rows: VisitRow[]): number {
  const set = new Set<string>();
  for (const r of rows) {
    const d = new Date(r.checked_in_at);
    if (Number.isNaN(d.getTime())) continue;
    const mnMs = d.getTime() + 8 * 3600 * 1000;
    const mnD = new Date(mnMs);
    set.add(`${mnD.getUTCFullYear()}-${mnD.getUTCMonth()}-${mnD.getUTCDate()}`);
  }
  return set.size;
}

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("mn-MN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/6 dark:bg-white/3">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${accent ?? "text-gray-800 dark:text-white"}`}>
        {value}
      </div>
      {sub && <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{sub}</div>}
    </div>
  );
}

export default function UserStatsPanel({
  profile,
  stats,
  loading,
  onClose,
}: {
  profile: Profile | null;
  stats: UserVisitStats | null;
  loading?: boolean;
  onClose: () => void;
}) {
  const [monthRows, setMonthRows] = useState<MonthRow[]>([]);
  const [uniqueDays, setUniqueDays] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);

  // ESC хаах
  useEffect(() => {
    if (!profile) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profile, onClose]);

  // Профайл солигдоход сарын дэлгэрэнгүйг fetch хий (admin API — RLS bypass)
  useEffect(() => {
    if (!profile) { setMonthRows([]); setUniqueDays(0); return; }
    let cancelled = false;
    setDetailLoading(true);
    getAuthHeader().then(async (authHeader) => {
      try {
        const res = await fetch(
          `/api/admin/user-visit-history?user_id=${encodeURIComponent(profile.id)}`,
          { headers: { Authorization: authHeader } },
        );
        if (cancelled) return;
        const json = await res.json();
        const rows = (json.visits ?? []) as VisitRow[];
        setMonthRows(buildMonthRows(rows));
        setUniqueDays(countUniqueDays(rows));
      } catch {
        // чимээгүй алдаа — 0 үлдэнэ
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [profile?.id]);

  if (!profile) return null;

  const s = stats ?? EMPTY_VISIT_STATS;
  const hasVisits = s.total > 0;
  const maxVisits = monthRows.length > 0 ? Math.max(...monthRows.map((r) => r.visits)) : 1;

  return createPortal(
    <div className="fixed inset-0 z-99999">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/6">
          <img
            src={profile.avatar_url || getUserPlaceholderAvatar(profile.id || profile.full_name)}
            alt="avatar"
            className="h-11 w-11 shrink-0 rounded-full object-cover"
            onError={(e) => {
              const img = e.currentTarget;
              const next = getUserPlaceholderAvatar(profile.id || profile.full_name);
              if (img.src !== next) img.src = next;
            }}
          />
          <div className="min-w-0 flex-1">
            <div className="truncate text-base font-bold text-gray-800 dark:text-white">
              {profile.full_name ?? "—"}
            </div>
            {profile.phone && (
              <div className="text-xs font-mono text-gray-500 dark:text-gray-400">{profile.phone}</div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/6 dark:hover:text-gray-200"
            title="Хаах"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">

          {/* ── Нийт статистик ── */}
          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              Нийт статистик
            </h4>

            {loading && !stats ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              </div>
            ) : (
              <div className="space-y-3">
                {/* Нийт ирц / Нийт өдөр */}
                <div className="grid grid-cols-2 gap-3">
                  <StatCard
                    label="Нийт ирц"
                    value={s.total.toLocaleString()}
                    sub="удаа"
                    accent="text-brand-600 dark:text-brand-400"
                  />
                  <StatCard
                    label="Нийт өдөр"
                    value={detailLoading ? "…" : uniqueDays.toLocaleString()}
                    sub="өвөрмөц өдөр"
                    accent="text-indigo-600 dark:text-indigo-400"
                  />
                </div>

                {/* Энэ сар / Энэ 7 хоног */}
                <div className="grid grid-cols-2 gap-3">
                  <StatCard label="Энэ сар" value={s.thisMonth.toLocaleString()} sub="удаа" />
                  <StatCard label="Энэ 7 хоног" value={s.thisWeek.toLocaleString()} sub="удаа" />
                </div>

                {/* Streak */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/6 dark:bg-white/3">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Streak
                  </div>
                  <div className={`mt-1 text-3xl font-bold tabular-nums inline-flex items-center gap-2 ${s.streakDays > 0 ? "text-orange-500 dark:text-orange-400" : "text-gray-400 dark:text-gray-500"}`}>
                    <span aria-hidden>🔥</span>
                    {s.streakDays.toLocaleString()}
                    <span className="text-base font-normal text-gray-500 dark:text-gray-400">дараалсан өдөр</span>
                  </div>
                  {s.streakDays === 0 && hasVisits && (
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      Өнөөдөр эсвэл өчигдөр ирээгүй тул streak тасарсан.
                    </p>
                  )}
                </div>

                {/* Сүүлд ирсэн */}
                <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/6 dark:bg-white/3">
                  <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Сүүлд ирсэн
                  </div>
                  {hasVisits ? (
                    <>
                      <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-white">
                        {formatDateTime(s.lastVisitAt)}
                      </div>
                      {s.lastGymName && (
                        <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{s.lastGymName}</div>
                      )}
                    </>
                  ) : (
                    <div className="mt-1 text-sm text-gray-400 dark:text-gray-500">Одоогоор ирц алга</div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ── Сар бүрийн ирц ── */}
          <section>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              Сар бүрийн ирц
            </h4>

            {detailLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
                ))}
              </div>
            ) : monthRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 py-8 text-center text-sm text-gray-400 dark:border-white/6 dark:text-gray-500">
                Ирцийн бүртгэл алга
              </div>
            ) : (
              <div className="space-y-2">
                {monthRows.map((row) => {
                  const pct = maxVisits > 0 ? Math.round((row.visits / maxVisits) * 100) : 0;
                  return (
                    <div
                      key={row.key}
                      className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 dark:border-white/4 dark:bg-white/3"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                          {row.label}
                        </span>
                        <div className="flex items-center gap-3 text-xs tabular-nums">
                          <span className="text-brand-600 font-semibold dark:text-brand-400">
                            {row.visits} удаа
                          </span>
                          <span className="text-gray-400 dark:text-gray-500">
                            {row.days} өдөр
                          </span>
                        </div>
                      </div>
                      {/* Mini progress bar */}
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-white/8">
                        <div
                          className="h-full rounded-full bg-brand-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>,
    document.body,
  );
}
