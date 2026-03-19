"use client";

import React, { useState, useEffect } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import VisitsTable from "./VisitsTable";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";
import SearchInput from "@/components/common/SearchInput";
import { exportToCsv } from "@/lib/csv-export";

type Visit = {
  id: string;
  user_id: string;
  gym_id: string;
  gym_name: string | null;
  method: string;
  checked_in_at: string;
};

export default function VisitsSection() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 25;

  const fetchData = async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    let query = supabase
      .from("gym_visits")
      .select("id, user_id, gym_id, gym_name, method, checked_in_at")
      .order("checked_in_at", { ascending: false })
      .limit(500);

    const { data: visitsData, error: visitsError } = await query;

    if (visitsError) {
      setError(visitsError.message);
      setLoading(false);
      return;
    }

    setVisits(visitsData ?? []);
    const userIds = [...new Set((visitsData ?? []).map((v) => v.user_id))];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", userIds);
      setProfileMap(
        Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]))
      );
    } else {
      setProfileMap({});
    }
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  let filteredVisits = visits.filter((v) => {
    if (search) {
      const name = profileMap[v.user_id]?.toLowerCase() ?? "";
      const gym = (v.gym_name ?? v.gym_id)?.toLowerCase() ?? "";
      if (
        !name.includes(search.toLowerCase()) &&
        !gym.includes(search.toLowerCase())
      )
        return false;
    }
    const checked = new Date(v.checked_in_at);
    if (dateFrom && checked < new Date(dateFrom)) return false;
    if (dateTo) {
      const toEnd = new Date(dateTo);
      toEnd.setHours(23, 59, 59, 999);
      if (checked > toEnd) return false;
    }
    return true;
  });
  const totalPages = Math.ceil(filteredVisits.length / PAGE_SIZE) || 1;
  const paginatedVisits = filteredVisits.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE
  );

  if (loading) {
    return (
      <ComponentCard title="Ирц">
        <div className="py-12 text-center text-gray-500">{t("loading")}</div>
      </ComponentCard>
    );
  }

  return (
    <ComponentCard title="Ирц (Gym check-ins)">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Хэрэглэгч эсвэл фитнес төв..."
          className="max-w-xs"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(0);
          }}
          className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(0);
          }}
          className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        />
        <button
          type="button"
          onClick={() =>
            exportToCsv(
              "visits",
              filteredVisits.map((v) => ({
                user: profileMap[v.user_id] ?? v.user_id,
                gym: v.gym_name ?? v.gym_id,
                method: v.method,
                checked_in_at: v.checked_in_at,
              })),
              [
                { key: "user", label: "Хэрэглэгч" },
                { key: "gym", label: "Фитнес" },
                { key: "method", label: "Арга" },
                { key: "checked_in_at", label: "Огноо" },
              ]
            )
          }
          className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]"
        >
          CSV
        </button>
      </div>
      <VisitsTable
        visits={paginatedVisits}
        profileMap={profileMap}
        error={error ?? undefined}
      />
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-gray-500">
            {filteredVisits.length} нийт
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-white/[0.03]"
            >
              Өмнөх
            </button>
            <span className="flex items-center px-2 text-sm">
              {page + 1} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-white/[0.03]"
            >
              Дараах
            </button>
          </div>
        </div>
      )}
    </ComponentCard>
  );
}
