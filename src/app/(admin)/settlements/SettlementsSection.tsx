"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import * as XLSX from "xlsx";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/components/ui/Toast";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type BillingMode = "per_entry" | "monthly_fixed";

type SettlementRow = {
  gym_id: string;
  name: string | null;
  city: string | null;
  type: string | null;
  is_active: boolean | null;
  image_url: string | null;
  billing_mode: BillingMode | null;
  unit_amount_mnt: number | null;
  visit_count: number;
  computed_amount_mnt: number;
  amount_mnt: number;
  notes: string | null;
  status: "draft" | "confirmed";
  settlement_id: string | null;
  is_edited: boolean;
  has_billing: boolean;
};

type DraftRow = SettlementRow & {
  modeInput: BillingMode | "";
  unitInput: string;
  amountInput: string;
  notesInput: string;
  dirty: boolean;
  amountLocked: boolean;
};

type EditForm = {
  gym_id: string;
  name: string;
  visit_count: number;
  modeInput: BillingMode | "";
  unitInput: string;
  amountInput: string;
  notesInput: string;
  amountLocked: boolean;
};

function formatMnt(n: number): string {
  const abs = Math.abs(n).toLocaleString("mn-MN");
  return n < 0 ? `−${abs}₮` : `${abs}₮`;
}

function computeAmount(
  mode: BillingMode | "" | null,
  unit: number | null,
  visits: number,
): number {
  if (!mode || unit == null || unit < 0) return 0;
  if (mode === "per_entry") return visits * unit;
  if (mode === "monthly_fixed") return unit;
  return 0;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map((x) => parseInt(x, 10));
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${y} оны ${parseInt(m, 10)} сар`;
}

const MONTH_OPTIONS = [
  { value: "01", label: "1 сар" },
  { value: "02", label: "2 сар" },
  { value: "03", label: "3 сар" },
  { value: "04", label: "4 сар" },
  { value: "05", label: "5 сар" },
  { value: "06", label: "6 сар" },
  { value: "07", label: "7 сар" },
  { value: "08", label: "8 сар" },
  { value: "09", label: "9 сар" },
  { value: "10", label: "10 сар" },
  { value: "11", label: "11 сар" },
  { value: "12", label: "12 сар" },
] as const;

function cityLabel(city: string | null): string {
  if (city === "darkhan") return "Дархан";
  if (city === "ulaanbaatar" || !city) return "Улаанбаатар";
  return city;
}

/** Unit rates stay ≥ 0. Settlement amount may be negative. */
function parseUnit(raw: string): number | null {
  const n = parseInt(raw.replace(/[,\s]/g, ""), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,\s₮]/g, "").replace("−", "-").replace("–", "-");
  if (cleaned === "" || cleaned === "-") return null;
  const n = parseInt(cleaned, 10);
  if (!Number.isFinite(n)) return null;
  return n;
}

function modeLabel(mode: BillingMode | "" | null): string {
  if (mode === "per_entry") return "Оролт";
  if (mode === "monthly_fixed") return "Тогтмол";
  return "Үгүй";
}

export default function SettlementsSection() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const [month, setMonth] = useState<string>("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyBilled, setOnlyBilled] = useState(false);
  const [search, setSearch] = useState("");
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [exporting, setExporting] = useState(false);
  const [meta, setMeta] = useState({
    total_amount_mnt: 0,
    total_visits: 0,
    billed_count: 0,
    current_month: "",
    previous_month: "",
  });

  const getAuthHeaders = useCallback(async (extra: Record<string, string> = {}) => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return {
      ...extra,
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  }, []);

  const load = useCallback(
    async (targetMonth?: string) => {
      setLoading(true);
      setError(null);
      try {
        const headers = await getAuthHeaders();
        const q = targetMonth ? `?month=${encodeURIComponent(targetMonth)}` : "";
        const res = await fetch(`/api/admin/settlements${q}`, { headers });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Ачаалахад алдаа гарлаа");

        setMonth(json.month);
        setMeta({
          total_amount_mnt: json.total_amount_mnt ?? 0,
          total_visits: json.total_visits ?? 0,
          billed_count: json.billed_count ?? 0,
          current_month: json.current_month ?? "",
          previous_month: json.previous_month ?? "",
        });
        setRows(
          ((json.rows ?? []) as SettlementRow[]).map((r) => ({
            ...r,
            modeInput: r.billing_mode ?? "",
            unitInput: r.unit_amount_mnt != null ? String(r.unit_amount_mnt) : "",
            amountInput: String(r.amount_mnt),
            notesInput: r.notes ?? "",
            dirty: false,
            amountLocked: r.amount_mnt !== r.computed_amount_mnt,
          })),
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Алдаа гарлаа");
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [getAuthHeaders],
  );

  useEffect(() => {
    load();
  }, [load]);

  const dirtyCount = useMemo(() => rows.filter((r) => r.dirty).length, [rows]);

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const hasRate = !!r.modeInput && parseUnit(r.unitInput) != null;
      if (onlyBilled && !hasRate && !r.settlement_id) return false;
      if (!q) return true;
      return (r.name ?? "").toLowerCase().includes(q);
    });
  }, [rows, onlyBilled, search]);

  const draftTotal = useMemo(
    () =>
      visibleRows.reduce((s, r) => {
        if (!r.modeInput && !r.settlement_id) return s;
        const n = parseAmount(r.amountInput);
        return s + (n ?? 0);
      }, 0),
    [visibleRows],
  );

  const openEdit = (row: DraftRow) => {
    setEditForm({
      gym_id: row.gym_id,
      name: row.name ?? "Фитнес",
      visit_count: row.visit_count,
      modeInput: row.modeInput,
      unitInput: row.unitInput,
      amountInput: row.amountInput,
      notesInput: row.notesInput,
      amountLocked: row.amountLocked,
    });
  };

  const editComputed = useMemo(() => {
    if (!editForm) return 0;
    const unit = editForm.modeInput ? parseUnit(editForm.unitInput) : null;
    return computeAmount(editForm.modeInput, unit, editForm.visit_count);
  }, [editForm]);

  const patchEdit = (patch: Partial<EditForm>) => {
    setEditForm((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      const modeChanged = patch.modeInput !== undefined;
      const unitChanged = patch.unitInput !== undefined;
      if ((modeChanged || unitChanged) && !next.amountLocked) {
        const unit = next.modeInput ? parseUnit(next.unitInput) : null;
        const computed = computeAmount(next.modeInput, unit, next.visit_count);
        next.amountInput = String(computed);
      }
      if (!next.modeInput) {
        next.unitInput = "";
        if (!next.amountLocked) next.amountInput = "0";
      }
      return next;
    });
  };

  const saveEdit = async () => {
    if (!editForm) return;
    if (editForm.modeInput) {
      const unit = parseUnit(editForm.unitInput);
      if (unit == null) {
        toastRef.current.show("Үнийн дүн оруулна уу.");
        return;
      }
    }
    const amount = parseAmount(editForm.amountInput);
    if (amount == null) {
      toastRef.current.show("Дүн буруу байна.");
      return;
    }

    const mode = editForm.modeInput || null;
    const unit = mode ? parseUnit(editForm.unitInput) : null;
    const computed = computeAmount(mode, unit, editForm.visit_count);

    setSaving(true);
    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/admin/settlements", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          month,
          update_gym_billing: true,
          rows: [
            {
              gym_id: editForm.gym_id,
              amount_mnt: amount,
              notes: editForm.notesInput.trim() || null,
              status: "draft",
              visit_count: editForm.visit_count,
              billing_mode: mode,
              unit_amount_mnt: unit,
              computed_amount_mnt: computed,
            },
          ],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Хадгалахад алдаа гарлаа");
      toastRef.current.show(`${editForm.name} хадгаллаа.`);
      setEditForm(null);
      await load(month);
    } catch (e) {
      toastRef.current.show(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setSaving(false);
    }
  };

  const save = async (confirmAll = false) => {
    const toSave = rows.filter(
      (r) => r.dirty || (confirmAll && (!!r.modeInput || r.settlement_id)),
    );
    if (toSave.length === 0) {
      toastRef.current.show("Хадгалах өөрчлөлт байхгүй.");
      return;
    }

    for (const r of toSave) {
      if (r.modeInput) {
        const unit = parseUnit(r.unitInput);
        if (unit == null) {
          toastRef.current.show(`${r.name ?? "Фитнес"}: үнийн дүн оруулна уу.`);
          return;
        }
      }
      const amount = parseAmount(r.amountInput);
      if (amount == null) {
        toastRef.current.show(`${r.name ?? "Фитнес"}: дүн буруу байна.`);
        return;
      }
    }

    setSaving(true);
    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/admin/settlements", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          month,
          update_gym_billing: true,
          rows: toSave.map((r) => {
            const mode = r.modeInput || null;
            const unit = mode ? parseUnit(r.unitInput) : null;
            const computed = computeAmount(mode, unit, r.visit_count);
            return {
              gym_id: r.gym_id,
              amount_mnt: parseAmount(r.amountInput) ?? 0,
              notes: r.notesInput.trim() || null,
              status: confirmAll ? "confirmed" : r.status,
              visit_count: r.visit_count,
              billing_mode: mode,
              unit_amount_mnt: unit,
              computed_amount_mnt: computed,
            };
          }),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Хадгалахад алдаа гарлаа");
      toastRef.current.show(
        confirmAll
          ? `${json.saved} мөрийг баталгаажууллаа.`
          : `${json.saved} мөр хадгаллаа.`,
      );
      await load(month);
    } catch (e) {
      toastRef.current.show(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setSaving(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/settlements?all=1", { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Excel өгөгдөл ачаалахад алдаа гарлаа");

      type MonthBlock = {
        month: string;
        total_amount_mnt: number;
        total_visits: number;
        billed_count: number;
        rows: SettlementRow[];
      };

      const months = ((json.months ?? []) as MonthBlock[]).filter(
        (m) => m.rows.some((r) => r.has_billing || r.settlement_id || r.visit_count > 0),
      );

      if (months.length === 0) {
        toastRef.current.show("Экспортлох өгөгдөл байхгүй.");
        return;
      }

      const detailHeader = [
        "Сар",
        "№",
        "Фитнес",
        "Хот",
        "Төрөл",
        "Оролт",
        "Төлбөрийн төрөл",
        "Нэгж үнэ (₮)",
        "Тооцоолсон (₮)",
        "Эцсийн дүн (₮)",
        "Төлөв",
        "Тэмдэглэл",
      ];

      const colWidths = [
        { wch: 10 },
        { wch: 5 },
        { wch: 28 },
        { wch: 14 },
        { wch: 10 },
        { wch: 10 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 14 },
        { wch: 28 },
      ];

      const monthSheetHeader = detailHeader.slice(1);

      const wb = XLSX.utils.book_new();

      // —— Хураангуй sheet ——
      const grandVisits = months.reduce((s, m) => s + m.total_visits, 0);
      const grandAmount = months.reduce((s, m) => s + m.total_amount_mnt, 0);
      const summaryAoA: (string | number)[][] = [
        ["GymHub — Бүх сарын төлбөрийн тооцоо"],
        [`Тайлан гаргасан: ${new Date().toLocaleString("mn-MN")}`],
        [`Хамрах хугацаа: ${monthLabel(months[0].month)} — ${monthLabel(months[months.length - 1].month)}`],
        [],
        ["Хураангуй (сар бүр)"],
        ["Сар", "Оролт", "Төлбөртэй төв", "Нийт дүн (₮)"],
        ...months.map((m) => [
          monthLabel(m.month),
          m.total_visits,
          m.billed_count,
          m.total_amount_mnt,
        ]),
        [],
        ["НИЙТ", grandVisits, "", grandAmount],
      ];
      const wsSummary = XLSX.utils.aoa_to_sheet(summaryAoA);
      wsSummary["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 16 }];
      wsSummary["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
        { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      ];
      XLSX.utils.book_append_sheet(wb, wsSummary, "Хураангуй");

      // —— Бүгд sheet (all months stacked) ——
      const allDetail: (string | number)[][] = [
        ["GymHub — Фитнес бүрийн дэлгэрэнгүй (бүх сар)"],
        [`Тайлан гаргасан: ${new Date().toLocaleString("mn-MN")}`],
        [],
        detailHeader,
      ];
      for (const block of months) {
        const billed = block.rows.filter(
          (r) => r.has_billing || r.settlement_id || r.visit_count > 0,
        );
        billed.forEach((r, idx) => {
          allDetail.push([
            monthLabel(block.month),
            idx + 1,
            r.name ?? "",
            cityLabel(r.city),
            r.type === "yoga" ? "Йога" : "Фитнес",
            r.visit_count,
            modeLabel(r.billing_mode),
            r.unit_amount_mnt ?? "",
            r.has_billing ? r.computed_amount_mnt : "",
            r.has_billing || r.settlement_id ? r.amount_mnt : "",
            r.status === "confirmed" ? "Баталгаажсан" : "Ноорог",
            r.notes ?? "",
          ]);
        });
      }
      allDetail.push([]);
      allDetail.push(["НИЙТ", "", "", "", "", grandVisits, "", "", "", grandAmount, "", ""]);
      const wsAll = XLSX.utils.aoa_to_sheet(allDetail);
      wsAll["!cols"] = colWidths;
      wsAll["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
        { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
      ];
      XLSX.utils.book_append_sheet(wb, wsAll, "Бүгд");

      // —— One sheet per month ——
      for (const block of months) {
        const billed = block.rows.filter(
          (r) => r.has_billing || r.settlement_id || r.visit_count > 0,
        );
        const sheetData: (string | number)[][] = [
          ["GymHub — Сарын төлбөрийн тооцоо"],
          [monthLabel(block.month)],
          [],
          ["Хураангуй"],
          ["Нийт фитнес", billed.length],
          ["Нийт оролт", block.total_visits],
          ["Нийт дүн (₮)", block.total_amount_mnt],
          [],
          monthSheetHeader,
          ...billed.map((r, idx) => [
            idx + 1,
            r.name ?? "",
            cityLabel(r.city),
            r.type === "yoga" ? "Йога" : "Фитнес",
            r.visit_count,
            modeLabel(r.billing_mode),
            r.unit_amount_mnt ?? "",
            r.has_billing ? r.computed_amount_mnt : "",
            r.has_billing || r.settlement_id ? r.amount_mnt : "",
            r.status === "confirmed" ? "Баталгаажсан" : "Ноорог",
            r.notes ?? "",
          ]),
          [],
          ["НИЙТ", "", "", "", block.total_visits, "", "", "", block.total_amount_mnt, "", ""],
        ];
        const ws = XLSX.utils.aoa_to_sheet(sheetData);
        ws["!cols"] = colWidths.slice(1);
        ws["!merges"] = [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 10 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: 10 } },
        ];
        // Excel sheet name max 31 chars; YYYY-MM is fine
        XLSX.utils.book_append_sheet(wb, ws, block.month);
      }

      const from = months[0].month;
      const to = months[months.length - 1].month;
      XLSX.writeFile(wb, `GymHub-settlements-${from}_${to}.xlsx`);
      toastRef.current.show(`${months.length} сарын Excel татагдлаа.`);
    } catch (e) {
      toastRef.current.show(e instanceof Error ? e.message : "Excel алдаа");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Month + actions */}
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => load(shiftMonth(month || meta.previous_month, -1))}
            disabled={loading || !month}
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
            title="Өмнөх сар"
          >
            ←
          </button>
          <div className="min-w-[180px] text-center">
            <div className="text-base font-bold text-gray-900 dark:text-white">
              {month ? monthLabel(month) : "—"}
            </div>
            <div className="text-[11px] text-gray-400">
              {month === meta.current_month
                ? "Одоогийн сар"
                : month === meta.previous_month
                  ? "Өмнөх сар"
                  : "Өнгөрсөн сар"}
            </div>
          </div>
          <button
            type="button"
            onClick={() => load(shiftMonth(month || meta.previous_month, 1))}
            disabled={
              loading || !month || !meta.current_month || month >= meta.current_month
            }
            className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
            title="Дараагийн сар"
          >
            →
          </button>
          {month && (
            <div className="ml-1 flex items-center gap-1.5">
              <select
                aria-label="Он"
                value={month.slice(0, 4)}
                onChange={(e) => {
                  const next = `${e.target.value}-${month.slice(5, 7)}`;
                  if (!meta.current_month || next <= meta.current_month) load(next);
                }}
                className="h-10 rounded-xl border border-gray-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-gray-900 dark:text-white"
              >
                {Array.from({ length: 4 }, (_, i) => {
                  const y = (meta.current_month
                    ? parseInt(meta.current_month.slice(0, 4), 10)
                    : new Date().getFullYear()) - i;
                  return (
                    <option key={y} value={String(y)}>
                      {y} он
                    </option>
                  );
                })}
              </select>
              <select
                aria-label="Сар"
                value={month.slice(5, 7)}
                onChange={(e) => {
                  const next = `${month.slice(0, 4)}-${e.target.value}`;
                  if (!meta.current_month || next <= meta.current_month) load(next);
                }}
                className="h-10 rounded-xl border border-gray-200 bg-white px-2 text-sm dark:border-white/10 dark:bg-gray-900 dark:text-white"
              >
                {MONTH_OPTIONS.map((opt) => {
                  const next = `${month.slice(0, 4)}-${opt.value}`;
                  const disabled = !!meta.current_month && next > meta.current_month;
                  return (
                    <option key={opt.value} value={opt.value} disabled={disabled}>
                      {opt.label}
                    </option>
                  );
                })}
              </select>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={loading || exporting}
            onClick={() => void exportExcel()}
          >
            {exporting ? "Excel бэлдэж байна..." : "Excel татах (бүх сар)"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={loading || dirtyCount === 0 || saving}
            onClick={() => save(false)}
          >
            {saving ? "Хадгалж байна..." : `Хадгалах${dirtyCount ? ` (${dirtyCount})` : ""}`}
          </Button>
          <Button
            size="sm"
            disabled={loading || saving || visibleRows.length === 0}
            onClick={() => save(true)}
          >
            Сарыг баталгаажуулах
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-brand-50 to-white p-4 dark:border-white/10 dark:from-brand-500/10 dark:to-transparent">
          <div className="text-xs font-medium uppercase tracking-wide text-brand-600/80 dark:text-brand-400">
            Сарын нийт дүн
          </div>
          <div
            className={`mt-1 text-2xl font-bold tabular-nums ${
              (dirtyCount > 0 ? draftTotal : meta.total_amount_mnt) < 0
                ? "text-red-600 dark:text-red-400"
                : "text-gray-900 dark:text-white"
            }`}
          >
            {formatMnt(dirtyCount > 0 ? draftTotal : meta.total_amount_mnt)}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Нийт оролт
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
            {meta.total_visits.toLocaleString("mn-MN")}
          </div>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Төлбөртэй төв
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
            {meta.billed_count}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Фитнес хайх..."
          className="h-11 w-full max-w-sm rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-gray-900 dark:text-white"
        />
        <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
          <input
            type="checkbox"
            checked={onlyBilled}
            onChange={(e) => setOnlyBilled(e.target.checked)}
            className="size-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          Зөвхөн төлбөр тохируулсан
        </label>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
        <div className="max-w-full overflow-x-auto">
          <Table>
            <TableHeader className="border-b border-gray-100 dark:border-white/5">
              <TableRow>
                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Фитнес
                </TableCell>
                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Оролт
                </TableCell>
                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Төрөл / Үнэ
                </TableCell>
                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Тооцоолсон
                </TableCell>
                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Эцсийн дүн
                </TableCell>
                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Төлөв
                </TableCell>
                <TableCell isHeader className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Засах
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-5 py-4" colSpan={7}>
                      <div className="h-10 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
                    </TableCell>
                  </TableRow>
                ))
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell className="px-5 py-12 text-center text-sm text-gray-400" colSpan={7}>
                    Фитнес олдсонгүй. Шүүлтийг унтраагаад үнэ тохируулна уу.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => {
                  const unit = row.modeInput ? parseUnit(row.unitInput) : null;
                  const computed = computeAmount(row.modeInput, unit, row.visit_count);
                  const amountVal = parseAmount(row.amountInput) ?? row.amount_mnt;
                  const isLoss = amountVal < 0;
                  return (
                    <TableRow
                      key={row.gym_id}
                      className={
                        isLoss
                          ? "bg-red-50/40 dark:bg-red-950/20"
                          : row.dirty
                            ? "bg-brand-50/40 dark:bg-brand-500/5"
                            : undefined
                      }
                    >
                      <TableCell className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          {row.image_url ? (
                            <div className="relative size-10 shrink-0 overflow-hidden rounded-lg border border-gray-100 dark:border-white/[0.05]">
                              <Image
                                src={row.image_url}
                                alt={row.name ?? "gym"}
                                fill
                                className="object-cover"
                                unoptimized
                              />
                            </div>
                          ) : (
                            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                              {row.name?.charAt(0)?.toUpperCase() ?? "G"}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium text-gray-900 dark:text-white">
                              {row.name ?? "—"}
                            </div>
                            <div className="text-[11px] text-gray-400">
                              {cityLabel(row.city)}
                              {row.type === "yoga" ? " · йога" : ""}
                              {!row.is_active ? " · идэвхгүй" : ""}
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3 text-sm font-semibold tabular-nums text-brand-600 dark:text-brand-400">
                        {row.visit_count.toLocaleString("mn-MN")}
                      </TableCell>
                      <TableCell className="px-5 py-3">
                        <div className="min-w-[200px] overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50 to-white shadow-sm dark:border-white/10 dark:from-white/[0.04] dark:to-transparent">
                          <div className="grid grid-cols-3 gap-0.5 p-1">
                            {(
                              [
                                { value: "", label: "Үгүй" },
                                { value: "per_entry", label: "Оролт" },
                                { value: "monthly_fixed", label: "Тогтмол" },
                              ] as const
                            ).map((opt) => {
                              const active = row.modeInput === opt.value;
                              return (
                                <div
                                  key={opt.value || "none"}
                                  className={`rounded-xl px-2 py-1.5 text-center text-[11px] font-semibold ${
                                    active
                                      ? opt.value === ""
                                        ? "bg-white text-gray-500 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-800 dark:text-gray-300 dark:ring-white/10"
                                        : opt.value === "per_entry"
                                          ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25"
                                          : "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25"
                                      : "text-gray-300 dark:text-gray-600"
                                  }`}
                                >
                                  {opt.label}
                                </div>
                              );
                            })}
                          </div>
                          {row.modeInput && unit != null ? (
                            <div className="border-t border-gray-100 px-3 py-2 text-sm font-semibold tabular-nums text-gray-900 dark:border-white/8 dark:text-white">
                              {unit.toLocaleString("mn-MN")}
                              <span className="ml-1 text-[10px] font-bold text-gray-400">
                                {row.modeInput === "per_entry" ? "₮ / оролт" : "₮ / сар"}
                              </span>
                            </div>
                          ) : (
                            <div className="border-t border-gray-100 px-3 py-2.5 text-[11px] text-gray-400 dark:border-white/8 dark:text-gray-500">
                              Төлбөр тохируулаагүй
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3 text-sm tabular-nums text-gray-500 dark:text-gray-400">
                        {row.modeInput ? formatMnt(computed) : "—"}
                      </TableCell>
                      <TableCell className="px-5 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              isLoss
                                ? "text-red-600 dark:text-red-400"
                                : "text-gray-900 dark:text-white"
                            }`}
                          >
                            {row.modeInput || row.settlement_id ? formatMnt(amountVal) : "—"}
                          </span>
                          {row.notesInput && (
                            <span className="max-w-[160px] truncate text-[10px] text-gray-400">
                              {row.notesInput}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3">
                        <Badge
                          size="sm"
                          color={row.status === "confirmed" ? "success" : "warning"}
                        >
                          {row.status === "confirmed" ? "Баталгаажсан" : "Ноорог"}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-5 py-3 text-end">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm transition hover:border-brand-300 hover:text-brand-700 dark:border-white/10 dark:bg-gray-900 dark:text-gray-200 dark:hover:border-brand-500/40 dark:hover:text-brand-300"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Засах
                        </button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="text-xs text-gray-400 dark:text-gray-500">
        Баруун талын «Засах» дарж popup-оор хадгална. «Excel татах» нь бүх сарыг нэг файлд
        (Хураангуй + Бүгд + сар бүрийн sheet) татна.
      </p>

      {/* Edit popup */}
      {editForm && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 dark:border-white/10">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">
                  Төлбөр засах
                </h3>
                <p className="text-xs text-gray-400">
                  {editForm.name} · {editForm.visit_count.toLocaleString("mn-MN")} оролт
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditForm(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-white/10"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 px-5 py-5">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Төрөл
                </label>
                <div className="grid grid-cols-3 gap-1 rounded-2xl border border-gray-100 bg-gray-50 p-1 dark:border-white/10 dark:bg-white/[0.04]">
                  {(
                    [
                      { value: "", label: "Үгүй" },
                      { value: "per_entry", label: "Оролт" },
                      { value: "monthly_fixed", label: "Тогтмол" },
                    ] as const
                  ).map((opt) => {
                    const active = editForm.modeInput === opt.value;
                    return (
                      <button
                        key={opt.value || "none"}
                        type="button"
                        onClick={() =>
                          patchEdit({
                            modeInput: opt.value,
                            amountLocked: false,
                          })
                        }
                        className={`rounded-xl px-2 py-2 text-xs font-semibold transition ${
                          active
                            ? opt.value === ""
                              ? "bg-white text-gray-600 shadow-sm ring-1 ring-gray-200 dark:bg-gray-800 dark:text-gray-200"
                              : opt.value === "per_entry"
                                ? "bg-brand-500 text-white shadow-sm"
                                : "bg-emerald-500 text-white shadow-sm"
                            : "text-gray-400 hover:text-gray-600"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {editForm.modeInput && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    {editForm.modeInput === "per_entry"
                      ? "Оролт бүрийн үнэ (₮)"
                      : "Сарын тогтмол (₮)"}
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editForm.unitInput}
                    onChange={(e) =>
                      patchEdit({ unitInput: e.target.value, amountLocked: false })
                    }
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm tabular-nums outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    Тооцоолсон: {formatMnt(editComputed)}
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Эцсийн дүн (₮)
                </label>
                <input
                  type="number"
                  value={editForm.amountInput}
                  onChange={(e) =>
                    patchEdit({ amountInput: e.target.value, amountLocked: true })
                  }
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm tabular-nums outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Тэмдэглэл
                </label>
                <input
                  value={editForm.notesInput}
                  onChange={(e) => patchEdit({ notesInput: e.target.value })}
                  placeholder="Жишээ: хөнгөлөлт..."
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-gray-950 dark:text-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-5 py-4 dark:border-white/10">
              <Button variant="outline" size="sm" onClick={() => setEditForm(null)}>
                Болих
              </Button>
              <Button size="sm" disabled={saving} onClick={() => void saveEdit()}>
                {saving ? "Хадгалж байна..." : "Хадгалах"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
