"use client";

import React, { useEffect } from "react";
import { createPortal } from "react-dom";
import type { Profile } from "./UsersSection";
import { EMPTY_VISIT_STATS, type UserVisitStats } from "./user-visit-stats";
import { getUserPlaceholderAvatar } from "@/lib/user-avatar";

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
  accent,
  children,
}: {
  label: string;
  value: React.ReactNode;
  accent?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </div>
      <div className={`mt-1 text-3xl font-bold tabular-nums ${accent ?? "text-gray-800 dark:text-white"}`}>
        {value}
      </div>
      {children}
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
  useEffect(() => {
    if (!profile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profile, onClose]);

  if (!profile) return null;

  const s = stats ?? EMPTY_VISIT_STATS;
  const hasVisits = s.total > 0;

  return createPortal(
    <div className="fixed inset-0 z-[99999]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">
        {/* Header */}
        <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.06]">
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
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.06] dark:hover:text-gray-200"
            title="Хаах"
          >
            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <h4 className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-300">
            Ирцийн идэвх
          </h4>

          {loading && !stats ? (
            <div className="flex items-center justify-center py-12">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            </div>
          ) : (
            <div className="space-y-3">
              {/* Total visits */}
              <StatCard label="Нийт ирц" value={s.total.toLocaleString()} accent="text-brand-600 dark:text-brand-400" />

              {/* This month / This week */}
              <div className="grid grid-cols-2 gap-3">
                <StatCard label="Энэ сар" value={s.thisMonth.toLocaleString()} />
                <StatCard label="Энэ 7 хоног" value={s.thisWeek.toLocaleString()} />
              </div>

              {/* Streak */}
              <StatCard
                label="Streak (дараалсан өдөр)"
                value={
                  <span className="inline-flex items-center gap-2">
                    <span aria-hidden>🔥</span>
                    {s.streakDays.toLocaleString()}
                  </span>
                }
                accent={s.streakDays > 0 ? "text-orange-500 dark:text-orange-400" : "text-gray-400 dark:text-gray-500"}
              >
                {s.streakDays === 0 && hasVisits && (
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Өнөөдөр эсвэл өчигдөр ирээгүй тул streak тасарсан.
                  </p>
                )}
              </StatCard>

              {/* Last visit */}
              <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/[0.06] dark:bg-white/[0.03]">
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Сүүлд ирсэн
                </div>
                {hasVisits ? (
                  <>
                    <div className="mt-1 text-sm font-semibold text-gray-800 dark:text-white">
                      {formatDateTime(s.lastVisitAt)}
                    </div>
                    {s.lastGymName && (
                      <div className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{s.lastGymName}</div>
                    )}
                  </>
                ) : (
                  <div className="mt-1 text-sm text-gray-400 dark:text-gray-500">Одоогоор ирц алга</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
