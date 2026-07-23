"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
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
  /** amount was manually typed after last rate change */
  amountLocked: boolean;
};

function formatMnt(n: number): string {
  return `${n.toLocaleString("mn-MN")}₮`;
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

function parseMoney(raw: string): number | null {
  const n = parseInt(raw.replace(/[,\s]/g, ""), 10);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
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
      const hasRate = !!r.modeInput && parseMoney(r.unitInput) != null;
      if (onlyBilled && !hasRate && !r.settlement_id) return false;
      if (!q) return true;
      return (r.name ?? "").toLowerCase().includes(q);
    });
  }, [rows, onlyBilled, search]);

  const draftTotal = useMemo(
    () =>
      visibleRows.reduce((s, r) => {
        if (!r.modeInput && !r.settlement_id) return s;
        const n = parseMoney(r.amountInput);
        return s + (n ?? 0);
      }, 0),
    [visibleRows],
  );

  const applyRateChange = (
    gymId: string,
    patch: { modeInput?: BillingMode | ""; unitInput?: string },
  ) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.gym_id !== gymId) return r;
        const modeInput = patch.modeInput !== undefined ? patch.modeInput : r.modeInput;
        const unitInput = patch.unitInput !== undefined ? patch.unitInput : r.unitInput;
        const unit = modeInput ? parseMoney(unitInput) : null;
        const computed = computeAmount(modeInput, unit, r.visit_count);
        const next: DraftRow = {
          ...r,
          modeInput,
          unitInput: modeInput ? unitInput : "",
          billing_mode: modeInput || null,
          unit_amount_mnt: unit,
          computed_amount_mnt: computed,
          has_billing: !!modeInput && unit != null,
          dirty: true,
        };
        if (!r.amountLocked) {
          next.amountInput = String(computed);
          next.amount_mnt = computed;
        }
        return next;
      }),
    );
  };

  const updateAmount = (gymId: string, amountInput: string) => {
    setRows((prev) =>
      prev.map((r) =>
        r.gym_id === gymId
          ? { ...r, amountInput, dirty: true, amountLocked: true }
          : r,
      ),
    );
  };

  const updateNotes = (gymId: string, notesInput: string) => {
    setRows((prev) =>
      prev.map((r) => (r.gym_id === gymId ? { ...r, notesInput, dirty: true } : r)),
    );
  };

  const resetRow = (gymId: string) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.gym_id !== gymId) return r;
        const unit = r.modeInput ? parseMoney(r.unitInput) : null;
        const computed = computeAmount(r.modeInput, unit, r.visit_count);
        return {
          ...r,
          computed_amount_mnt: computed,
          amountInput: String(computed),
          amount_mnt: computed,
          notesInput: "",
          notes: null,
          status: "draft",
          dirty: true,
          amountLocked: false,
        };
      }),
    );
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
        const unit = parseMoney(r.unitInput);
        if (unit == null) {
          toastRef.current.show(`${r.name ?? "Фитнес"}: үнийн дүн оруулна уу.`);
          return;
        }
      }
      const amount = parseMoney(r.amountInput);
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
            const unit = mode ? parseMoney(r.unitInput) : null;
            const computed = computeAmount(mode, unit, r.visit_count);
            return {
              gym_id: r.gym_id,
              amount_mnt: parseMoney(r.amountInput) ?? 0,
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
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-br from-brand-50 to-white p-4 dark:border-white/10 dark:from-brand-500/10 dark:to-transparent">
          <div className="text-xs font-medium uppercase tracking-wide text-brand-600/80 dark:text-brand-400">
            Сарын нийт дүн
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-gray-900 dark:text-white">
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
                  Дүн (засварлах)
                </TableCell>
                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Тэмдэглэл
                </TableCell>
                <TableCell isHeader className="px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  Төлөв
                </TableCell>
                <TableCell isHeader className="px-5 py-3 text-end text-theme-xs font-medium text-gray-500 dark:text-gray-400">
                  
                </TableCell>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-gray-100 dark:divide-white/5">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell className="px-5 py-4" colSpan={8}>
                      <div className="h-10 animate-pulse rounded-xl bg-gray-100 dark:bg-white/5" />
                    </TableCell>
                  </TableRow>
                ))
              ) : visibleRows.length === 0 ? (
                <TableRow>
                  <TableCell className="px-5 py-12 text-center text-sm text-gray-400" colSpan={8}>
                    Фитнес олдсонгүй. Шүүлтийг унтраагаад үнэ тохируулна уу.
                  </TableCell>
                </TableRow>
              ) : (
                visibleRows.map((row) => {
                  const unit = row.modeInput ? parseMoney(row.unitInput) : null;
                  const computed = computeAmount(row.modeInput, unit, row.visit_count);
                  const amountVal = parseMoney(row.amountInput);
                  const amountChanged = amountVal != null && amountVal !== computed;
                  return (
                    <TableRow
                      key={row.gym_id}
                      className={row.dirty ? "bg-brand-50/40 dark:bg-brand-500/5" : undefined}
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
                        <div className="min-w-[240px] overflow-hidden rounded-2xl border border-gray-100 bg-gradient-to-b from-gray-50 to-white shadow-sm dark:border-white/10 dark:from-white/[0.04] dark:to-transparent">
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
                                <button
                                  key={opt.value || "none"}
                                  type="button"
                                  onClick={() =>
                                    applyRateChange(row.gym_id, {
                                      modeInput: opt.value,
                                    })
                                  }
                                  className={`rounded-xl px-2 py-1.5 text-[11px] font-semibold transition ${
                                    active
                                      ? opt.value === ""
                                        ? "bg-white text-gray-500 shadow-sm ring-1 ring-gray-200/80 dark:bg-gray-800 dark:text-gray-300 dark:ring-white/10"
                                        : opt.value === "per_entry"
                                          ? "bg-brand-500 text-white shadow-sm shadow-brand-500/25"
                                          : "bg-emerald-500 text-white shadow-sm shadow-emerald-500/25"
                                      : "text-gray-400 hover:bg-white/70 hover:text-gray-600 dark:hover:bg-white/5 dark:hover:text-gray-200"
                                  }`}
                                >
                                  {opt.label}
                                </button>
                              );
                            })}
                          </div>
                          {row.modeInput ? (
                            <div className="border-t border-gray-100 px-2.5 pb-2.5 pt-2 dark:border-white/8">
                              <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-inset ring-gray-200/80 focus-within:ring-2 focus-within:ring-brand-500/35 dark:bg-gray-900/60 dark:ring-white/10">
                                <input
                                  type="number"
                                  min={0}
                                  value={row.unitInput}
                                  onChange={(e) =>
                                    applyRateChange(row.gym_id, {
                                      unitInput: e.target.value,
                                    })
                                  }
                                  placeholder={
                                    row.modeInput === "per_entry"
                                      ? "15,000"
                                      : "300,000"
                                  }
                                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold tabular-nums text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-300 dark:text-white dark:placeholder:text-gray-600"
                                />
                                <span
                                  className={`shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-bold tracking-wide ${
                                    row.modeInput === "per_entry"
                                      ? "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"
                                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
                                  }`}
                                >
                                  {row.modeInput === "per_entry"
                                    ? "₮ / оролт"
                                    : "₮ / сар"}
                                </span>
                              </div>
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
                        <div className="relative max-w-[140px]">
                          <input
                            type="number"
                            min={0}
                            value={row.amountInput}
                            onChange={(e) => updateAmount(row.gym_id, e.target.value)}
                            disabled={!row.modeInput}
                            className={`h-10 w-full rounded-xl border bg-white px-3 pr-7 text-sm tabular-nums outline-none focus:ring-2 focus:ring-brand-500/30 disabled:opacity-40 dark:bg-gray-900 dark:text-white ${
                              amountChanged
                                ? "border-brand-400 dark:border-brand-500"
                                : "border-gray-200 dark:border-white/10"
                            }`}
                          />
                          <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                            ₮
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3">
                        <input
                          value={row.notesInput}
                          onChange={(e) => updateNotes(row.gym_id, e.target.value)}
                          placeholder="Жишээ: хөнгөлөлт..."
                          className="h-10 w-full min-w-[140px] rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-white/10 dark:bg-gray-900 dark:text-white"
                        />
                      </TableCell>
                      <TableCell className="px-5 py-3">
                        <div className="flex flex-col items-start gap-1">
                          <Badge
                            size="sm"
                            color={row.status === "confirmed" ? "success" : "warning"}
                          >
                            {row.status === "confirmed" ? "Баталгаажсан" : "Ноорог"}
                          </Badge>
                          {amountChanged && (
                            <span className="text-[10px] text-brand-600 dark:text-brand-400">
                              дүн зассан
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="px-5 py-3 text-end">
                        {amountChanged && (
                          <button
                            type="button"
                            onClick={() => resetRow(row.gym_id)}
                            className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            title="Тооцоолсон дүн рүү буцаах"
                          >
                            Буцаах
                          </button>
                        )}
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
        Төрөл болон үнийг эндээс засаад хадгалбал фитнесийн үнэ шинэчлэгдэнэ. Үнэ солиход дүн
        автоматаар тооцогдоно. Дүнг гараар засварлаж болно. «Сарыг баталгаажуулах» дарвал мөрүүдийг
        баталгаажуулна.
      </p>
    </div>
  );
}
