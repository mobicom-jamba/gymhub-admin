"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { useToast } from "@/components/ui/Toast";

export type FlexyCallPerson = {
  payment_id: string;
  plan_id: string;
  user_id: string;
  user_name: string | null;
  user_phone: string | null;
  amount: number;
  due_date: string;
  days_until: number;
  installment_no: number;
  call_count: number;
  last_called_at: string | null;
};

type CallLog = {
  id: string;
  called_at: string;
  note: string;
  agent_name?: string | null;
};

function formatMnt(n: number): string {
  return `${n.toLocaleString("mn-MN")}₮`;
}

function flexyDaysLabel(daysUntil: number): string {
  if (daysUntil === 0) return "Өнөөдөр";
  if (daysUntil > 0) return `${daysUntil} хоног үлдлээ`;
  return `${Math.abs(daysUntil)} хоног хэтэрсэн`;
}

function fmtUbDateTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function authHeader(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

export default function FlexyCallPanel({
  people,
  onPeopleChange,
}: {
  people: FlexyCallPerson[];
  onPeopleChange: (next: FlexyCallPerson[]) => void;
}) {
  const [active, setActive] = useState<FlexyCallPerson | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [note, setNote] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loggingId, setLoggingId] = useState<string | null>(null);
  const { show: showToast } = useToast();

  const loadHistory = useCallback(async (paymentId: string) => {
    setLoadingHistory(true);
    setError(null);
    try {
      const header = await authHeader();
      const res = await fetch(
        `/api/admin/flexy-calls?payment_id=${encodeURIComponent(paymentId)}&history=1`,
        { headers: header ? { Authorization: header } : {} },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Түүх ачаалахад алдаа.");
      setLogs((json.logs ?? []) as CallLog[]);
    } catch (e) {
      setLogs([]);
      setError(e instanceof Error ? e.message : "Алдаа");
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    setNote("");
    void loadHistory(active.payment_id);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active?.payment_id, loadHistory]);

  const applySummary = (paymentId: string, callCount: number, lastCalledAt: string | null) => {
    onPeopleChange(
      people.map((p) =>
        p.payment_id === paymentId
          ? { ...p, call_count: callCount, last_called_at: lastCalledAt }
          : p,
      ),
    );
    setActive((cur) =>
      cur && cur.payment_id === paymentId
        ? { ...cur, call_count: callCount, last_called_at: lastCalledAt }
        : cur,
    );
  };

  const logCall = async (person: FlexyCallPerson, withNote: string) => {
    setSaving(true);
    setLoggingId(person.payment_id);
    setError(null);
    try {
      const header = await authHeader();
      const res = await fetch("/api/admin/flexy-calls", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(header ? { Authorization: header } : {}),
        },
        body: JSON.stringify({
          payment_id: person.payment_id,
          user_id: person.user_id,
          plan_id: person.plan_id,
          note: withNote,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Хадгалахад алдаа.");
      const summary = json.summary as {
        call_count: number;
        last_called_at: string | null;
      };
      applySummary(person.payment_id, summary.call_count, summary.last_called_at);
      showToast("Залгасан гэж тэмдэглэлээ", "success");
      if (active?.payment_id === person.payment_id) {
        setNote("");
        await loadHistory(person.payment_id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Алдаа";
      setError(msg);
      showToast(msg, "error");
    } finally {
      setSaving(false);
      setLoggingId(null);
    }
  };

  return (
    <>
      <div className="max-h-[28rem] space-y-1 overflow-y-auto">
        {people.map((p) => {
          const phoneDigits = (p.user_phone ?? "").replace(/\D/g, "");
          const called = p.call_count > 0;
          const lastLabel = fmtUbDateTime(p.last_called_at);
          return (
            <div
              key={p.payment_id}
              className={[
                "flex items-center justify-between gap-2 rounded-lg px-2 py-2.5",
                p.days_until < 0
                  ? "bg-rose-50/50 dark:bg-rose-950/15"
                  : p.days_until === 0
                    ? "bg-brand-50/60 dark:bg-brand-500/10"
                    : "hover:bg-gray-50 dark:hover:bg-white/[0.03]",
              ].join(" ")}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-gray-800 dark:text-white/90">
                  {p.user_name?.trim() || "—"}
                </p>
                <p className="mt-0.5 truncate font-mono text-xs text-gray-500 dark:text-gray-400">
                  {p.user_phone?.trim() || "—"}
                  {p.installment_no > 0 ? (
                    <span className="text-gray-400 dark:text-gray-500">
                      {" "}
                      · {p.installment_no}-р төлөлт
                    </span>
                  ) : null}
                </p>
                {called ? (
                  <button
                    type="button"
                    onClick={() => setActive(p)}
                    className="mt-1 text-left text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    Залгасан {p.call_count} удаа
                    {lastLabel ? ` · ${lastLabel}` : ""}
                  </button>
                ) : null}
              </div>

              <div className="shrink-0 text-right">
                <p
                  className={`text-sm font-bold tabular-nums ${
                    p.days_until < 0
                      ? "text-error-600 dark:text-error-400"
                      : p.days_until === 0
                        ? "text-brand-600 dark:text-brand-400"
                        : "text-indigo-600 dark:text-indigo-400"
                  }`}
                >
                  {formatMnt(p.amount)}
                </p>
                <p
                  className={`mt-0.5 text-[11px] font-medium ${
                    p.days_until < 0
                      ? "text-error-500 dark:text-error-400"
                      : p.days_until === 0
                        ? "text-brand-500 dark:text-brand-300"
                        : "text-gray-400 dark:text-gray-500"
                  }`}
                >
                  {flexyDaysLabel(p.days_until)}
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-1">
                {phoneDigits ? (
                  <a
                    href={`tel:${phoneDigits}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-brand-600 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-brand-300"
                    title="Залгах"
                  >
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"
                      />
                    </svg>
                  </a>
                ) : null}
                <button
                  type="button"
                  disabled={loggingId === p.payment_id}
                  onClick={() => void logCall(p, "")}
                  title={called ? "Дахин залгасан гэж тэмдэглэх" : "Залгасан гэж тэмдэглэх"}
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-50 ${
                    called
                      ? "text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/30"
                      : "text-amber-500 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/25"
                  }`}
                >
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setActive(p)}
                  title="Дуудлагын түүх / тэмдэглэл"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/10 dark:hover:text-gray-200"
                >
                  <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {active &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/40 p-4 sm:items-center"
            onClick={() => setActive(null)}
          >
            <div
              className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-gray-900"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    Flexy call — {active.user_name?.trim() || "Гишүүн"}
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-gray-500">
                    {active.user_phone?.trim() || "—"}
                    {active.installment_no > 0 ? ` · ${active.installment_no}-р төлөлт` : ""}
                    {" · "}
                    {formatMnt(active.amount)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActive(null)}
                  className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
                  aria-label="Хаах"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-xs font-medium text-gray-500">
                  Тэмдэглэл (заавал биш)
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Ж: Утсаа аваагүй, дахин зална..."
                  className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm outline-none focus:border-brand-400 dark:border-gray-700 dark:bg-white/5 dark:text-white"
                />
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void logCall(active, note)}
                  className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {saving ? "Хадгалж байна..." : "Залгасан гэж тэмдэглэх"}
                </button>
                {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
              </div>

              <div className="mt-5 border-t border-gray-100 pt-4 dark:border-white/10">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Дуудлагын түүх ({active.call_count})
                </p>
                {loadingHistory ? (
                  <p className="text-xs text-gray-400">Ачаалж байна...</p>
                ) : logs.length === 0 ? (
                  <p className="text-xs text-gray-400">Одоогоор дуудлага алга.</p>
                ) : (
                  <ul className="max-h-48 space-y-2 overflow-y-auto">
                    {logs.map((l) => (
                      <li
                        key={l.id}
                        className="rounded-xl border border-gray-100 px-3 py-2 dark:border-white/10"
                      >
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200">
                          {fmtUbDateTime(l.called_at)}
                          {l.agent_name ? (
                            <span className="font-normal text-gray-400"> · {l.agent_name}</span>
                          ) : null}
                        </p>
                        {l.note?.trim() ? (
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{l.note}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
