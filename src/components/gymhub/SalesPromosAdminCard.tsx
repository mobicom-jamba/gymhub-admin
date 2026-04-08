"use client";

import React, { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { featureFlags } from "@/lib/feature-flags";

type Row = {
  id: string;
  code: string;
  commission_rate: number;
  commission_percent: number;
  is_active: boolean;
  created_at: string;
  sales_user_id: string;
  sales_name: string | null;
  sales_phone: string | null;
  sales_role: string | null;
};
type PendingRequest = {
  id: string;
  sales_user_id: string;
  sales_name: string | null;
  sales_phone: string | null;
  requested_rate: number;
  requested_percent: number;
  note: string | null;
  created_at: string;
};

export default function SalesPromosAdminCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Нэвтэрнэ үү.");
        setRows([]);
        return;
      }
      const res = await fetch("/api/admin/sales-promos", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const data = (await res.json()) as { ok?: boolean; rows?: Row[]; pending_requests?: PendingRequest[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Ачаалахад алдаа");
        setRows([]);
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
      setPendingRequests(Array.isArray(data.pending_requests) ? data.pending_requests : []);
    } catch {
      setError("Сүлжээний алдаа");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const reviewRequest = useCallback(
    async (id: string, action: "approve" | "reject") => {
      setActingId(id);
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session?.access_token) {
          setError("Нэвтэрнэ үү.");
          return;
        }
        const res = await fetch(`/api/admin/commission-requests/${id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          setError(body.error ?? "Комисс хүсэлт шийдэхэд алдаа гарлаа.");
          return;
        }
        await load();
      } finally {
        setActingId(null);
      }
    },
    [load],
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <ComponentCard
      title="Борлуулалтын промо код"
      subtitle="Промо кодоор бүртгүүлсэн хэрэглэгч гишүүнчлэл төлөхөд борлуулагчид доорх хувиар комисс тооцогдоно (үндсэн 5%)."
    >
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Ачаалж байна…</p>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Промо код бүртгэгдээгүй байна. Борлуулагч апп дээрээс код үүсгэнэ.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="pb-2 pr-3 font-medium">Промо код</th>
                <th className="pb-2 pr-3 font-medium">Комисс</th>
                <th className="pb-2 pr-3 font-medium">Төлөв</th>
                <th className="pb-2 pr-3 font-medium">Борлуулагч</th>
                <th className="pb-2 pr-3 font-medium">Утас</th>
                <th className="pb-2 font-medium">Үүсгэсэн</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/[0.06]">
              {rows.map((r) => (
                <tr key={r.id} className="text-gray-800 dark:text-gray-200">
                  <td className="py-2.5 pr-3 font-mono text-xs sm:text-sm">{r.code}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {Number.isFinite(r.commission_percent)
                      ? `${r.commission_percent % 1 === 0 ? r.commission_percent.toFixed(0) : r.commission_percent.toFixed(2)}%`
                      : "—"}
                  </td>
                  <td className="py-2.5 pr-3">
                    {r.is_active ? (
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Идэвхтэй
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-400">
                        Идэвхгүй
                      </span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 max-w-[10rem] truncate" title={r.sales_name ?? ""}>
                    {r.sales_name ?? "—"}
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums text-gray-600 dark:text-gray-400">
                    {r.sales_phone ?? "—"}
                  </td>
                  <td className="py-2.5 text-xs text-gray-500 dark:text-gray-400">
                    {r.created_at ? new Date(r.created_at).toLocaleString("mn-MN", { hour12: false }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {featureFlags.commissionApprovalWorkflow && pendingRequests.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold text-gray-800 dark:text-gray-200">
            Хүлээгдэж буй комиссын хүсэлт
          </h3>
          <div className="space-y-2">
            {pendingRequests.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-800 dark:bg-amber-950/30"
              >
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">
                    {r.sales_name ?? "—"} · {r.requested_percent.toFixed(2)}%
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {r.sales_phone ?? "—"} · {new Date(r.created_at).toLocaleString("mn-MN", { hour12: false })}
                  </p>
                  {r.note ? (
                    <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{r.note}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={actingId === r.id}
                    onClick={() => reviewRequest(r.id, "reject")}
                    className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    Татгалзах
                  </button>
                  <button
                    type="button"
                    disabled={actingId === r.id}
                    onClick={() => reviewRequest(r.id, "approve")}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Зөвшөөрөх
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ComponentCard>
  );
}
