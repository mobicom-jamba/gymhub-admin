"use client";

import React, { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

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

export default function SalesPromosAdminCard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
      const data = (await res.json()) as { ok?: boolean; rows?: Row[]; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Ачаалахад алдаа");
        setRows([]);
        return;
      }
      setRows(Array.isArray(data.rows) ? data.rows : []);
    } catch {
      setError("Сүлжээний алдаа");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

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
                    {r.created_at ? new Date(r.created_at).toLocaleString("mn-MN") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ComponentCard>
  );
}
