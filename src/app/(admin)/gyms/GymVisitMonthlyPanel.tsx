"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { formatMnt, gymMonthAmountMnt, type Gym } from "./types";

type MonthEntry = { month: string; label: string; count: number };

async function getAuthHeader(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

export default function GymVisitMonthlyPanel({
  gym,
  onClose,
  showBilling = false,
}: {
  gym: Gym | null;
  onClose: () => void;
  showBilling?: boolean;
}) {
  const [months, setMonths] = useState<MonthEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!gym) { setMonths([]); setError(null); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMonths([]);

    getAuthHeader().then(async (authHeader) => {
      try {
        const res = await fetch(
          `/api/admin/gym-visit-monthly?gym_id=${encodeURIComponent(gym.id)}`,
          { headers: { Authorization: authHeader } },
        );
        if (cancelled) return;
        const json = await res.json();
        if (!res.ok) { setError(json.error ?? "Алдаа гарлаа."); return; }
        setMonths(json.months ?? []);
      } catch {
        if (!cancelled) setError("Сүлжээний алдаа.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    });

    return () => { cancelled = true; };
  }, [gym?.id]);

  useEffect(() => {
    if (!gym) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [gym, onClose]);

  if (!gym) return null;

  const maxCount = months.length > 0 ? Math.max(...months.map((m) => m.count)) : 1;
  const hasBilling =
    showBilling &&
    !!gym.billing_mode &&
    gym.billing_amount_mnt != null &&
    gym.billing_amount_mnt >= 0;
  const totalVisits = months.reduce((s, m) => s + m.count, 0);
  const totalAmount = hasBilling
    ? months.reduce((s, m) => s + (gymMonthAmountMnt(gym, m.count) ?? 0), 0)
    : null;

  return createPortal(
    <div className="fixed inset-0 z-99999">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-gray-200 bg-white shadow-2xl dark:border-gray-800 dark:bg-gray-900">

        {/* Header */}
        <div className="flex items-start justify-between border-b border-gray-100 px-6 py-5 dark:border-white/6">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {showBilling ? "Сараар оролт / төлбөр" : "Сараар оролт"}
            </h3>
            <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
              {gym.name ?? "—"}
            </p>
            {hasBilling && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {gym.billing_mode === "per_entry"
                  ? `Оролт бүрт ${formatMnt(gym.billing_amount_mnt!)}`
                  : `Сарын тогтмол ${formatMnt(gym.billing_amount_mnt!)}`}
              </p>
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
        <div className="flex-1 overflow-y-auto px-6 py-4">

          {/* Column headers */}
          <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-2 dark:border-white/6">
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              Сар
            </span>
            <span className="text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              {hasBilling ? "Оролт / Дүн" : "Оролт"}
            </span>
          </div>

          {loading ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
              ))}
            </div>
          ) : error ? (
            <div className="pt-6 text-center text-sm text-red-500 dark:text-red-400">{error}</div>
          ) : months.length === 0 ? (
            <div className="pt-8 text-center text-sm text-gray-400 dark:text-gray-500">
              Ирцийн бүртгэл олдсонгүй.
            </div>
          ) : (
            <div className="space-y-1 pt-1">
              {months.map((row) => {
                const pct = maxCount > 0 ? Math.round((row.count / maxCount) * 100) : 0;
                const amount = hasBilling ? gymMonthAmountMnt(gym, row.count) : null;
                return (
                  <div
                    key={row.month}
                    className="group rounded-xl px-4 py-3 transition hover:bg-gray-50 dark:hover:bg-white/4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-700 dark:text-gray-200">
                        {row.label}
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-bold text-brand-600 dark:text-brand-400 tabular-nums">
                          {row.count.toLocaleString()}
                        </span>
                        {amount != null && (
                          <div className="text-xs font-semibold text-gray-700 dark:text-gray-200 tabular-nums">
                            {formatMnt(amount)}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-white/8">
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
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-6 py-4 dark:border-white/6 space-y-2">
          {!loading && months.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Нийт ({months.length} сар)</span>
              <div className="text-right">
                <span className="font-bold text-gray-900 dark:text-white tabular-nums">
                  {totalVisits.toLocaleString()} оролт
                </span>
                {totalAmount != null && (
                  <div className="text-sm font-bold text-brand-600 dark:text-brand-400 tabular-nums">
                    {formatMnt(totalAmount)}
                  </div>
                )}
              </div>
            </div>
          )}
          {!hasBilling && showBilling && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              Төлбөр тохируулаагүй. Засах дээрээс оролт бүрийн үнэ эсвэл сарын тогтмол төлбөр оруулна уу.
            </p>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            Татгалзсан хүсэлт тоолохгүй. Сар нь Улаанбаатар цагийн бүсээр.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
