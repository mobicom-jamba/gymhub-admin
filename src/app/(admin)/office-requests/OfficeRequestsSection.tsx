"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import EmptyState from "@/components/ui/EmptyState";

type OfficeRequest = {
  id: string;
  package_label: string | null;
  plan_label: string | null;
  headcount: number | null;
  price_mnt: number | null;
  organization_name: string;
  contact_name: string | null;
  contact_phone: string;
  contact_email: string | null;
  note: string | null;
  status: "pending_payment" | "paid" | "underpaid" | "cancelled";
  booking_id: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  created_at: string;
};

const STATUS_LABELS: Record<OfficeRequest["status"], string> = {
  pending_payment: "Төлбөр хүлээж буй",
  paid: "Төлсөн",
  underpaid: "Дутуу төлөлт",
  cancelled: "Цуцалсан",
};

const STATUS_STYLES: Record<OfficeRequest["status"], string> = {
  pending_payment: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  underpaid: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

/** Улаанбаатарын календарийн огноо (YYYY-MM-DD). */
function ubDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ulaanbaatar" }).format(new Date(iso));
}

function formatMnt(value: number | null): string {
  if (!value) return "—";
  return `${value.toLocaleString("mn-MN")}₮`;
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default function OfficeRequestsSection() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { can } = useAuth();
  const { show: showToast } = useToast();
  const canManage = can("office.requests.manage");

  const [requests, setRequests] = useState<OfficeRequest[]>([]);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, [supabase]);

  const load = useCallback(async () => {
    setError("");
    try {
      const headers = await authHeader();
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const res = await fetch(`/api/admin/office-requests?${params.toString()}`, {
        headers,
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Захиалга татаж чадсангүй");
      setRequests(json.requests ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }, [authHeader, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const changeStatus = async (request: OfficeRequest, next: OfficeRequest["status"]) => {
    try {
      const headers = await authHeader();
      const res = await fetch("/api/admin/office-requests", {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ id: request.id, status: next }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Хадгалж чадсангүй");
      showToast(`Төлөв «${STATUS_LABELS[next]}» боллоо`, "success");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Алдаа гарлаа", "error");
    }
  };

  const pendingCount = requests.filter((r) => r.status === "pending_payment").length;

  // Орлого: зөвхөн төлөгдсөн захиалга, бодит орсон дүнгээр (байхгүй бол багцын үнэ).
  const income = useMemo(() => {
    const today = ubDate(new Date().toISOString());
    const month = today.slice(0, 7);
    const paidRows = requests.filter((r) => r.status === "paid" && r.paid_at);
    const amountOf = (r: OfficeRequest) => r.paid_amount ?? r.price_mnt ?? 0;

    const sum = (rows: OfficeRequest[]) => rows.reduce((total, r) => total + amountOf(r), 0);
    const todayRows = paidRows.filter((r) => ubDate(r.paid_at as string) === today);
    const monthRows = paidRows.filter((r) => ubDate(r.paid_at as string).startsWith(month));

    const byPackage = new Map<string, { count: number; amount: number }>();
    for (const r of paidRows) {
      const key = `${r.package_label ?? "—"} · ${r.plan_label ?? ""}`.trim();
      const entry = byPackage.get(key) ?? { count: 0, amount: 0 };
      byPackage.set(key, { count: entry.count + 1, amount: entry.amount + amountOf(r) });
    }

    return {
      today: { count: todayRows.length, amount: sum(todayRows) },
      month: { count: monthRows.length, amount: sum(monthRows) },
      total: { count: paidRows.length, amount: sum(paidRows) },
      byPackage: [...byPackage.entries()]
        .map(([label, value]) => ({ label, ...value }))
        .sort((a, b) => b.amount - a.amount),
    };
  }, [requests]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Оффис багцын захиалга ({requests.length})
          </h3>
          <p className="mt-0.5 text-xs text-gray-400">
            {pendingCount > 0
              ? `${pendingCount} захиалга төлбөр хүлээж байна.`
              : "Аппаас QPay-ээр төлсөн байгууллагын захиалгууд."}
          </p>
        </div>

        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800/80 dark:text-white/90"
        >
          <option value="">Бүх төлөв</option>
          {(Object.keys(STATUS_LABELS) as OfficeRequest["status"][]).map((key) => (
            <option key={key} value={key}>
              {STATUS_LABELS[key]}
            </option>
          ))}
        </select>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Өнөөдөр", value: income.today, tone: "text-gray-800 dark:text-white/90" },
          { label: "Энэ сар", value: income.month, tone: "text-gray-800 dark:text-white/90" },
          { label: "Нийт орлого", value: income.total, tone: "text-emerald-600 dark:text-emerald-400" },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-gray-100 bg-gray-50/70 p-4 dark:border-gray-800 dark:bg-white/[0.02]"
          >
            <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">
              {card.label}
            </p>
            <p className={`mt-1 text-xl font-bold tabular-nums ${card.tone}`}>
              {formatMnt(card.value.amount)}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">{card.value.count} захиалга</p>
          </div>
        ))}
      </div>

      {income.byPackage.length > 0 && (
        <div className="mb-5 rounded-xl border border-gray-100 p-4 dark:border-gray-800">
          <p className="mb-2.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
            Багцаар (төлөгдсөн)
          </p>
          <div className="space-y-1.5">
            {income.byPackage.map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-gray-500 dark:text-gray-400">{row.label}</span>
                <span className="shrink-0 tabular-nums text-gray-700 dark:text-gray-200">
                  {row.count} × · {formatMnt(row.amount)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : requests.length === 0 ? (
        <EmptyState
          icon="building"
          title={status ? "Энэ төлөвт захиалга алга" : "Захиалга алга"}
          description={status ? undefined : "Аппаас оффис багц худалдаж авахад энд харагдана."}
        />
      ) : (
        <div className="space-y-2.5">
          {requests.map((request) => (
            <div
              key={request.id}
              className="rounded-xl border border-gray-100 bg-white p-4 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-gray-800 dark:text-white/90">
                      {request.organization_name}
                    </p>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLES[request.status]}`}
                    >
                      {STATUS_LABELS[request.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {request.package_label ?? "—"}
                    {request.plan_label ? ` · ${request.plan_label}` : ""} ·{" "}
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {formatMnt(request.price_mnt)}
                    </span>
                    {request.paid_amount != null && request.paid_amount !== request.price_mnt && (
                      <span className="ml-1.5 font-medium text-red-600 dark:text-red-400">
                        (орсон: {formatMnt(request.paid_amount)})
                      </span>
                    )}
                  </p>
                  <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                    {request.contact_name ? `${request.contact_name} · ` : ""}
                    <a
                      href={`tel:${request.contact_phone}`}
                      className="font-medium text-brand-600 hover:underline dark:text-brand-400"
                    >
                      {request.contact_phone}
                    </a>
                    {request.contact_email ? (
                      <>
                        {" · "}
                        <a
                          href={`mailto:${request.contact_email}`}
                          className="hover:underline"
                        >
                          {request.contact_email}
                        </a>
                      </>
                    ) : null}
                  </p>
                  {request.note && (
                    <p className="mt-2 whitespace-pre-line rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600 dark:bg-white/5 dark:text-gray-300">
                      {request.note}
                    </p>
                  )}
                </div>

                <div className="flex shrink-0 flex-col items-end gap-2">
                  <span className="text-[11px] text-gray-400">
                    {formatDate(request.paid_at ?? request.created_at)}
                  </span>
                  {canManage && (request.status === "pending_payment" || request.status === "cancelled") && (
                    <select
                      value={request.status}
                      onChange={(e) =>
                        void changeStatus(request, e.target.value as OfficeRequest["status"])
                      }
                      className="h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800/80 dark:text-white/90"
                    >
                      {(["pending_payment", "cancelled"] as OfficeRequest["status"][]).map((key) => (
                        <option key={key} value={key}>
                          {STATUS_LABELS[key]}
                        </option>
                      ))}
                    </select>
                  )}
                  {canManage && (request.status === "paid" || request.status === "underpaid") && (
                    <span className="text-[11px] text-gray-400">QPay-ээр баталгаажсан</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
