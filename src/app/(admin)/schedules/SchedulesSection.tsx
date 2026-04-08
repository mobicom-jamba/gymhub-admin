"use client";

import React, { useState, useEffect } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import SchedulesTable from "./SchedulesTable";
import ScheduleFormModal from "./ScheduleFormModal";
import ScheduleEditModal from "./ScheduleEditModal";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";
import { PlusIcon } from "@/icons";
import SearchInput from "@/components/common/SearchInput";
import TablePagination from "@/components/ui/TablePagination";

type Schedule = {
  id: string;
  class_id: string;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
  classes?: { title?: string | null; gyms?: { name?: string | null } | null } | null;
};

type ClassOption = { id: string; title: string | null; gyms?: { name?: string | null } | null };

export default function SchedulesSection() {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editSchedule, setEditSchedule] = useState<Schedule | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const fetchData = async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const [schedRes, classesRes] = await Promise.all([
      supabase
        .from("class_schedules")
        .select("id, class_id, start_time, end_time, is_cancelled, classes!inner(title, gyms(name))")
        .order("start_time", { ascending: false })
        .limit(200),
      supabase
        .from("classes")
        .select("id, title, gyms(name)")
        .eq("is_active", true)
        .order("title"),
    ]);
    setSchedules((schedRes.data ?? []) as Schedule[]);
    setClasses((classesRes.data ?? []) as ClassOption[]);
    setError(schedRes.error?.message ?? null);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  if (loading) {
    return (
      <ComponentCard title={t("schedules")}>
        <div className="py-12 text-center text-gray-500">{t("loading")}</div>
      </ComponentCard>
    );
  }

  const getClassInfo = (s: Schedule) => {
    const cls = Array.isArray(s.classes) ? s.classes[0] : s.classes;
    const gym = Array.isArray(cls?.gyms) ? cls?.gyms[0] : cls?.gyms;
    return `${cls?.title ?? ""} ${gym?.name ?? ""}`.toLowerCase();
  };

  const filteredSchedules = schedules.filter((s) => {
    if (search && !getClassInfo(s).includes(search.toLowerCase())) return false;
    if (statusFilter === "active" && s.is_cancelled) return false;
    if (statusFilter === "cancelled" && !s.is_cancelled) return false;
    const start = new Date(s.start_time);
    if (dateFrom && start < new Date(dateFrom)) return false;
    if (dateTo) {
      const toEnd = new Date(dateTo);
      toEnd.setHours(23, 59, 59, 999);
      if (start > toEnd) return false;
    }
    return true;
  });
  const totalPages = Math.ceil(filteredSchedules.length / pageSize) || 1;
  const paginatedSchedules = filteredSchedules.slice(
    (page - 1) * pageSize,
    page * pageSize
  );

  return (
    <>
      <ComponentCard title={t("schedules")}>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder={`${t("search")} ${t("schedules")}...`}
            className="max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">{t("status")}: Бүгд</option>
            <option value="active">{t("active")}</option>
            <option value="cancelled">Цуцлагдсан</option>
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          />
          <div className="flex-1" />
          <Button size="sm" onClick={() => setModalOpen(true)} startIcon={<PlusIcon />}>
            {t("add")}
          </Button>
        </div>
        <SchedulesTable
          schedules={paginatedSchedules}
          error={error ?? undefined}
          onRefresh={fetchData}
          onEdit={(s) => setEditSchedule(s)}
        />
        {totalPages > 1 && (
          <TablePagination
            page={page}
            pageSize={pageSize}
            totalItems={filteredSchedules.length}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            pageSizeOptions={[20, 50, 100]}
          />
        )}
      </ComponentCard>
      <ScheduleEditModal
        isOpen={!!editSchedule}
        onClose={() => setEditSchedule(null)}
        schedule={editSchedule}
        onSuccess={() => {
          fetchData();
          setEditSchedule(null);
        }}
      />
      <ScheduleFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        classes={classes}
        onSuccess={() => {
          fetchData();
          setModalOpen(false);
        }}
      />
    </>
  );
}
