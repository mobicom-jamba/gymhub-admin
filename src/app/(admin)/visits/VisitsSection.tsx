"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import VisitsTable from "./VisitsTable";
import VisitsStatsHeader from "./VisitsStatsHeader";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { exportToCsv } from "@/lib/csv-export";
import { fetchVisitsOverview, type OverviewVisit } from "./visits-overview";
import {
  compareNullableDates,
  DATE_VISITS_SORT_COLS,
  DESC_FIRST_VISITS_SORT_COLS,
  type VisitsSortColumn,
} from "./visits-sort";
import { membershipExpiryStatusLabel, membershipExpiryStatusRank } from "./visits-membership";
import SearchInput from "@/components/common/SearchInput";
import TablePagination from "@/components/ui/TablePagination";
import flatpickr from "flatpickr";
import { Mongolian } from "flatpickr/dist/l10n/mn.js";

type Visit = OverviewVisit;

type MemberProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  avatar_path: string | null;
  membership_status: string | null;
  membership_expires_at: string | null;
};

export type VisitsStats = {
  total: number;
  thisMonth: number;
  today: number;
};

function ymd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

type Preset = "today" | "7d" | "30d" | "month" | "";

function presetRange(preset: Preset): { from: string; to: string } | null {
  if (!preset) return null;
  const now = new Date();
  const to = ymd(now);
  if (preset === "today") return { from: to, to };
  if (preset === "7d") {
    const f = new Date(now);
    f.setDate(f.getDate() - 6);
    return { from: ymd(f), to };
  }
  if (preset === "30d") {
    const f = new Date(now);
    f.setDate(f.getDate() - 29);
    return { from: ymd(f), to };
  }
  // month
  return { from: ymd(new Date(now.getFullYear(), now.getMonth(), 1)), to };
}

export default function VisitsSection() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<VisitsStats | null>(null);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [activePreset, setActivePreset] = useState<Preset>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortColumn, setSortColumn] = useState<VisitsSortColumn>("userLastVisitAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const rangeInputRef = useRef<HTMLInputElement | null>(null);
  const pickerRef = useRef<flatpickr.Instance | null>(null);
  const fetchedRef = useRef(false);

  const fetchData = async () => {
    setLoading(true);
    const [overview, memberProfiles] = await Promise.all([
      fetchVisitsOverview(),
      fetchAllMembers(),
    ]);
    if (overview.error) {
      setError(overview.error);
      setLoading(false);
      return;
    }
    setStats(overview.stats);
    setVisits(mergeWithMembers(overview.visits, memberProfiles));
    setError(null);
    setLoading(false);
  };

  // All members (role "user"), so people who have never checked in can also be
  // listed. Also used to fill phone / membership-expiry when the deployed RPC
  // doesn't return them yet. Paginated to cover large member counts.
  const fetchAllMembers = async (): Promise<MemberProfile[]> => {
    const supabase = createBrowserSupabaseClient();
    const all: MemberProfile[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error: err } = await supabase
        .from("profiles")
        .select("id, full_name, phone, avatar_path, membership_status, membership_expires_at")
        .eq("role", "user")
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (err || !data) break;
      all.push(...(data as unknown as MemberProfile[]));
      if (data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  // Enrich visited rows with profile details (when missing) and append a
  // zero-visit row for every member who has never checked in.
  const mergeWithMembers = (rows: Visit[], memberProfiles: MemberProfile[]): Visit[] => {
    const memberById = new Map(memberProfiles.map((m) => [m.id, m]));
    const enriched = rows.map((v) => {
      const m = memberById.get(v.user_id);
      if (!m) return v;
      return {
        ...v,
        fullName: v.fullName ?? m.full_name,
        phone: v.phone ?? m.phone,
        avatarPath: v.avatarPath ?? m.avatar_path,
        membershipStatus: v.membershipStatus ?? m.membership_status,
        membershipExpiresAt: v.membershipExpiresAt ?? m.membership_expires_at,
      };
    });
    const visitedIds = new Set(rows.map((v) => v.user_id));
    const neverVisited: Visit[] = memberProfiles
      .filter((m) => !visitedIds.has(m.id))
      .map((m) => ({
        id: `novisit-${m.id}`,
        user_id: m.id,
        gym_id: "",
        gym_name: null,
        method: "",
        checked_in_at: "",
        fullName: m.full_name,
        phone: m.phone,
        avatarPath: m.avatar_path,
        membershipStatus: m.membership_status,
        membershipExpiresAt: m.membership_expires_at,
        userTotal: 0,
        userLastVisitAt: null,
      }));
    return [...enriched, ...neverVisited];
  };

  // StrictMode double-invokes effects in dev; guard against a duplicate RPC call.
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchData();
  }, []);

  useEffect(() => {
    if (loading || !rangeInputRef.current) return;
    const instance = flatpickr(rangeInputRef.current, {
      mode: "range",
      dateFormat: "Y-m-d",
      locale: Mongolian,
      disableMobile: true,
      allowInput: false,
      monthSelectorType: "static",
      onChange: (dates) => {
        if (dates.length === 2) {
          setDateFrom(ymd(dates[0]));
          setDateTo(ymd(dates[1]));
          setActivePreset("");
          setPage(1);
        } else if (dates.length === 0) {
          setDateFrom("");
          setDateTo("");
          setPage(1);
        }
      },
    });
    pickerRef.current = instance;
    return () => {
      instance.destroy();
      pickerRef.current = null;
    };
  }, [loading]);

  // Keep the picker in sync when presets / clear change the range.
  useEffect(() => {
    const picker = pickerRef.current;
    if (!picker) return;
    if (dateFrom && dateTo) {
      picker.setDate([dateFrom, dateTo], false, "Y-m-d");
    } else {
      picker.clear(false);
    }
  }, [dateFrom, dateTo]);

  const applyPreset = (preset: Preset) => {
    const r = presetRange(preset);
    setActivePreset(preset);
    setDateFrom(r?.from ?? "");
    setDateTo(r?.to ?? "");
    setPage(1);
  };

  const clearRange = () => {
    setActivePreset("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  // Collapse the raw check-in rows to one entry per user, keeping that user's
  // most-recent visit. The RPC already returns rows ordered by checked_in_at
  // desc, but we compare explicitly so dedupe is robust to ordering changes.
  const dedupedVisits = useMemo(() => {
    const byUser = new Map<string, Visit>();
    for (const v of visits) {
      const existing = byUser.get(v.user_id);
      if (!existing || new Date(v.checked_in_at) > new Date(existing.checked_in_at)) {
        byUser.set(v.user_id, v);
      }
    }
    return Array.from(byUser.values());
  }, [visits]);

  const filteredVisits = useMemo(() => {
    return dedupedVisits.filter((v) => {
      if (search) {
        const name = v.fullName?.toLowerCase() ?? "";
        const gym = (v.gym_name ?? v.gym_id)?.toLowerCase() ?? "";
        const phone = v.phone?.toLowerCase() ?? "";
        const q = search.toLowerCase();
        if (!name.includes(q) && !gym.includes(q) && !phone.includes(q)) return false;
      }
      // Never-checked-in members have no visit date; hide them when filtering by range.
      if ((dateFrom || dateTo) && !v.checked_in_at) return false;
      const checked = new Date(v.checked_in_at);
      if (dateFrom && checked < new Date(`${dateFrom}T00:00:00`)) return false;
      if (dateTo) {
        const toEnd = new Date(`${dateTo}T23:59:59.999`);
        if (checked > toEnd) return false;
      }
      return true;
    });
  }, [dedupedVisits, search, dateFrom, dateTo]);

  const sortedFilteredVisits = useMemo(() => {
    const list = [...filteredVisits];
    const asc = sortDir === "asc";

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "user":
          cmp = (a.fullName ?? a.user_id).localeCompare(b.fullName ?? b.user_id, "mn", {
            sensitivity: "base",
          });
          break;
        case "gym":
          cmp = (a.gym_name ?? a.gym_id).localeCompare(b.gym_name ?? b.gym_id, "mn", {
            sensitivity: "base",
          });
          break;
        case "method":
          cmp = a.method.localeCompare(b.method);
          break;
        case "userTotal":
          cmp = a.userTotal - b.userTotal;
          break;
        case "userLastVisitAt":
          cmp = compareNullableDates(a.userLastVisitAt, b.userLastVisitAt, asc);
          break;
        case "membershipExpiresAt":
          cmp = compareNullableDates(a.membershipExpiresAt, b.membershipExpiresAt, asc);
          break;
        case "membershipStatus":
          cmp =
            membershipExpiryStatusRank(a.membershipStatus, a.membershipExpiresAt) -
            membershipExpiryStatusRank(b.membershipStatus, b.membershipExpiresAt);
          break;
        default:
          break;
      }
      if (DATE_VISITS_SORT_COLS.has(sortColumn)) {
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      }
      if (cmp !== 0) return asc ? cmp : -cmp;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [filteredVisits, sortColumn, sortDir]);

  const handleColumnSort = (column: VisitsSortColumn) => {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir(DESC_FIRST_VISITS_SORT_COLS.has(column) ? "desc" : "asc");
    }
    setPage(1);
  };

  const totalPages = Math.ceil(sortedFilteredVisits.length / pageSize) || 1;
  const paginatedVisits = sortedFilteredVisits.slice((page - 1) * pageSize, page * pageSize);

  const rangeLabel =
    dateFrom && dateTo
      ? dateFrom === dateTo
        ? new Date(`${dateFrom}T00:00:00`).toLocaleDateString("mn-MN")
        : `${new Date(`${dateFrom}T00:00:00`).toLocaleDateString("mn-MN")} – ${new Date(`${dateTo}T00:00:00`).toLocaleDateString("mn-MN")}`
      : "";

  const presetTabs: Array<{ key: Preset; label: string }> = [
    { key: "today", label: "Өнөөдөр" },
    { key: "7d", label: "7 хоног" },
    { key: "30d", label: "30 хоног" },
    { key: "month", label: "Энэ сар" },
  ];

  return (
    <div className="space-y-6">
      <VisitsStatsHeader stats={stats} />

      <ComponentCard title="Ирц (Gym check-ins)">
        {/* Filter bar */}
        <div className="mb-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder="Хэрэглэгч эсвэл фитнес төв..."
              className="max-w-xs"
            />

            {/* Calendar range */}
            <div className="relative">
              <input
                ref={rangeInputRef}
                placeholder="Огнооны муж сонгох"
                readOnly
                onClick={() => pickerRef.current?.open()}
                className="h-10 w-[230px] cursor-pointer rounded-xl border border-gray-200 bg-white px-3 pr-9 text-sm text-gray-700 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10m-13 9h16a1 1 0 001-1V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a1 1 0 001 1z" />
                </svg>
              </span>
            </div>

            {/* Presets */}
            <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800/60">
              {presetTabs.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  className={`h-8 rounded-lg px-3 text-xs font-medium transition-all ${
                    activePreset === p.key
                      ? "bg-brand-500 text-white shadow-sm"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {(dateFrom || dateTo || search) && (
              <button
                onClick={() => {
                  setSearch("");
                  clearRange();
                }}
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-400 hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-gray-700 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              >
                ✕ Цэвэрлэх
              </button>
            )}

            <div className="flex-1" />

            <button
              type="button"
              onClick={() =>
                exportToCsv(
                  "visits",
                  filteredVisits.map((v) => ({
                    user: v.fullName ?? v.user_id,
                    phone: v.phone ?? "",
                    gym: v.gym_name ?? v.gym_id,
                    method: v.method,
                    checked_in_at: v.checked_in_at,
                    user_total: v.userTotal,
                    user_last_visit_at: v.userLastVisitAt ?? "",
                    membership_status: membershipExpiryStatusLabel(v.membershipStatus, v.membershipExpiresAt),
                    membership_expires_at: v.membershipExpiresAt ?? "",
                  })),
                  [
                    { key: "user", label: "Хэрэглэгч" },
                    { key: "phone", label: "Утас" },
                    { key: "gym", label: "Фитнес" },
                    { key: "method", label: "Арга" },
                    { key: "checked_in_at", label: "Огноо" },
                    { key: "user_total", label: "Нийт ирц" },
                    { key: "user_last_visit_at", label: "Сүүлд ирсэн" },
                    { key: "membership_status", label: "Төлөв" },
                    { key: "membership_expires_at", label: "Гишүүнчлэл дуусах" },
                  ],
                )
              }
              className="flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              CSV
            </button>
          </div>

          {rangeLabel && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 font-medium text-brand-600 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300">
                📅 {rangeLabel}
                <button onClick={clearRange} className="ml-1 text-brand-400 hover:text-brand-700 dark:hover:text-brand-200">✕</button>
              </span>
              <span className="text-gray-500 dark:text-gray-400">
                {filteredVisits.length.toLocaleString("mn-MN")} ирц
              </span>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : (
          <VisitsTable
            visits={paginatedVisits}
            error={error ?? undefined}
            sortColumn={sortColumn}
            sortDir={sortDir}
            onSort={handleColumnSort}
          />
        )}

        {!loading && totalPages > 1 && (
          <div className="mt-5">
            <TablePagination
              page={page}
              pageSize={pageSize}
              totalItems={sortedFilteredVisits.length}
              onPageChange={setPage}
              onPageSizeChange={(size) => {
                setPageSize(size);
                setPage(1);
              }}
              pageSizeOptions={[25, 50, 100]}
            />
          </div>
        )}
      </ComponentCard>
    </div>
  );
}
