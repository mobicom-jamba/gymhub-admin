"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import BookingsTable from "./BookingsTable";
import CreateBookingModal from "./CreateBookingModal";
import Button from "@/components/ui/button/Button";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { PlusIcon } from "@/icons";
import { t } from "@/lib/i18n";
import SearchInput from "@/components/common/SearchInput";
import { exportToCsv } from "@/lib/csv-export";
import { useToast } from "@/components/ui/Toast";
import ColumnToggle from "@/components/ui/ColumnToggle";
import { toMnErrorMessage } from "@/lib/error-message";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Booking = any;

export default function BookingsSection() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [profileMap, setProfileMap] = useState<Record<string, string | null>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [visibleColumns, setVisibleColumns] = useLocalStorageState<Record<string, boolean>>("bookings.table.visibleColumns", {
    user: true, class: true, time: true, status: true,
  });
  const PAGE_SIZE = 20;
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initializedFromQuery = useRef(false);

  const fetchBookings = async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data: bookingsData, error: bookingsError } = await supabase
      .from("bookings")
      .select(
        `
        id,
        user_id,
        status,
        created_at,
        class_schedules!inner(
          start_time,
          end_time,
          classes!inner(title, gyms!inner(name))
        )
      `
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (bookingsError) {
      setError(bookingsError.message);
      setLoading(false);
      return;
    }

    setBookings(bookingsData ?? []);
    const userIds = [...new Set((bookingsData ?? []).map((b) => b.user_id))];
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
    fetchBookings();
  }, []);

  useEffect(() => {
    if (initializedFromQuery.current) return;
    setSearch(searchParams.get("q") ?? "");
    setStatusFilter(searchParams.get("status") ?? "");
    initializedFromQuery.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (!initializedFromQuery.current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (search) params.set("q", search); else params.delete("q");
    if (statusFilter) params.set("status", statusFilter); else params.delete("status");
    params.delete("page");
    const next = params.toString();
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [search, statusFilter, pathname, router, searchParams]);

  const handleCancel = async (bookingId: string) => {
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("bookings")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", bookingId);
    if (err) {
      toast.show(toMnErrorMessage(err.message), "error");
      return;
    }
    fetchBookings();
  };

  const handleMarkAttended = async (bookingId: string) => {
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("bookings")
      .update({ status: "attended", checked_in_at: new Date().toISOString() })
      .eq("id", bookingId);
    if (err) {
      toast.show(toMnErrorMessage(err.message), "error");
      return;
    }
    fetchBookings();
  };

  if (loading) {
    return (
      <ComponentCard title={t("bookings")}>
        <div className="py-12 text-center text-gray-500">{t("loading")}</div>
      </ComponentCard>
    );
  }

  const getClassTitle = (b: Booking) => {
    const s = Array.isArray(b.class_schedules) ? b.class_schedules[0] : b.class_schedules;
    const c = Array.isArray(s?.classes) ? s?.classes[0] : s?.classes;
    const g = Array.isArray(c?.gyms) ? c?.gyms[0] : c?.gyms;
    return `${c?.title ?? ""} ${g?.name ?? ""}`.toLowerCase();
  };
  let filteredBookings = bookings.filter((b) => {
    if (search) {
      const matchSearch =
        (profileMap[b.user_id]?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
        getClassTitle(b).includes(search.toLowerCase());
      if (!matchSearch) return false;
    }
    if (statusFilter && b.status !== statusFilter) return false;
    return true;
  });
  const totalPages = Math.ceil(filteredBookings.length / PAGE_SIZE) || 1;
  const paginatedBookings = filteredBookings.slice(
    page * PAGE_SIZE,
    (page + 1) * PAGE_SIZE
  );
  const filterChips = useMemo(() => {
    const chips: Array<{ key: "q" | "status"; label: string; clear: () => void }> = [];
    if (search) chips.push({ key: "q", label: `Хайлт: ${search}`, clear: () => setSearch("") });
    if (statusFilter) chips.push({ key: "status", label: `Төлөв: ${statusFilter}`, clear: () => setStatusFilter("") });
    return chips;
  }, [search, statusFilter]);

  return (
    <>
      <ComponentCard title={t("bookings")}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`${t("search")} ${t("bookings")}...`}
            className="max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">{t("status")}: Бүгд</option>
            <option value="booked">{t("booked")}</option>
            <option value="cancelled">{t("cancelled")}</option>
            <option value="attended">{t("attended")}</option>
            <option value="no_show">{t("noShow")}</option>
          </select>
          <Button
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            startIcon={<PlusIcon className="size-4" />}
          >
            {t("add")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const rows = filteredBookings.map((b: Booking) => {
                const s = Array.isArray(b.class_schedules) ? b.class_schedules[0] : b.class_schedules;
                const c = Array.isArray(s?.classes) ? s?.classes[0] : s?.classes;
                const g = Array.isArray(c?.gyms) ? c?.gyms[0] : c?.gyms;
                return {
                  user: profileMap[b.user_id] ?? b.user_id,
                  class: c?.title ?? "",
                  gym: g?.name ?? "",
                  status: b.status,
                  start_time: s?.start_time ?? "",
                  created_at: b.created_at,
                };
              });
              exportToCsv("bookings", rows, [
                { key: "user", label: t("user") },
                { key: "class", label: t("classTitle") },
                { key: "gym", label: t("gymName") },
                { key: "status", label: t("status") },
                { key: "start_time", label: t("time") },
                { key: "created_at", label: t("date") },
              ]);
            }}
          >
            CSV
          </Button>
          <ColumnToggle
            options={[
              { key: "user", label: "Хэрэглэгч" },
              { key: "class", label: "Анги" },
              { key: "time", label: "Цаг" },
              { key: "status", label: "Төлөв" },
            ]}
            visible={visibleColumns}
            onChange={setVisibleColumns}
          />
        </div>
        {filterChips.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {filterChips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.clear}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              >
                {chip.label} ✕
              </button>
            ))}
            <button
              onClick={() => { setSearch(""); setStatusFilter(""); }}
              className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
            >
              Бүгдийг цэвэрлэх
            </button>
          </div>
        )}
        <BookingsTable
          bookings={paginatedBookings}
          profileMap={profileMap}
          error={error ?? undefined}
          onCancel={handleCancel}
          onMarkAttended={handleMarkAttended}
          visibleColumns={visibleColumns}
        />
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              {filteredBookings.length} нийт
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Өмнөх
              </Button>
              <span className="flex items-center px-2 text-sm">
                {page + 1} / {totalPages}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
              >
                Дараах
              </Button>
            </div>
          </div>
        )}
      </ComponentCard>
      <CreateBookingModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => {
          fetchBookings();
          setCreateModalOpen(false);
        }}
      />
    </>
  );
}
