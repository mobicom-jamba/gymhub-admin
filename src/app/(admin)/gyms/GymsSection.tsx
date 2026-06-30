"use client";

import React, { useState, useEffect } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import GymsTable from "./GymsTable";
import GymFormModal from "./GymFormModal";
import GymQRModal from "./GymQRModal";
import GymVisitMonthlyPanel from "./GymVisitMonthlyPanel";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";
import { PlusIcon, PencilIcon, TrashBinIcon } from "@/icons";
import SearchInput from "@/components/common/SearchInput";
import type { Gym, VisitPeriod } from "./types";
import { useToast } from "@/components/ui/Toast";
import { toMnErrorMessage } from "@/lib/error-message";
import TablePagination from "@/components/ui/TablePagination";

function sinceForPeriod(period: VisitPeriod): string {
  const now = new Date();
  const offset = 8 * 60 * 60 * 1000;
  const mnNow = new Date(now.getTime() + offset);
  if (period === "today") {
    const todayMn = new Date(
      Date.UTC(mnNow.getUTCFullYear(), mnNow.getUTCMonth(), mnNow.getUTCDate()),
    );
    return new Date(todayMn.getTime() - offset).toISOString();
  }
  if (period === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return d.toISOString();
  }
  // month
  const monthStart = new Date(
    Date.UTC(mnNow.getUTCFullYear(), mnNow.getUTCMonth(), 1),
  );
  return new Date(monthStart.getTime() - offset).toISOString();
}

export default function GymsSection() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGym, setEditingGym] = useState<Gym | null>(null);
  const [qrGym, setQrGym] = useState<Gym | null>(null);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<"ulaanbaatar" | "darkhan" | "all">(
    "ulaanbaatar",
  );
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [visitPeriod, setVisitPeriod] = useState<VisitPeriod>("today");
  const [visitCounts, setVisitCounts] = useState<Record<string, number>>({});
  const [visitLoading, setVisitLoading] = useState(false);
  const [monthlyGym, setMonthlyGym] = useState<Gym | null>(null);
  const toast = useToast();

  const fetchGyms = async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data, error: err } = await supabase
      .from("gyms")
      .select("*")
      .order("name");
    setGyms(data ?? []);
    setError(err?.message ?? null);
    setLoading(false);
  };

  const fetchVisitCounts = async (period: VisitPeriod) => {
    const since = sinceForPeriod(period);
    setVisitLoading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? `Bearer ${session.access_token}` : "";
      const res = await fetch(
        `/api/admin/gym-visit-counts?since=${encodeURIComponent(since)}`,
        { headers: { Authorization: authHeader } },
      );
      const json = await res.json();
      setVisitCounts(json.counts ?? {});
    } catch {
      setVisitCounts({});
    } finally {
      setVisitLoading(false);
    }
  };

  useEffect(() => {
    fetchGyms();
    fetchVisitCounts("today");
  }, []);

  useEffect(() => {
    fetchVisitCounts(visitPeriod);
  }, [visitPeriod]);

  const handleAdd = () => {
    setEditingGym(null);
    setModalOpen(true);
  };

  const handleEdit = (gym: Gym) => {
    setEditingGym(gym);
    setModalOpen(true);
  };

  const handleDelete = async (gym: Gym) => {
    if (!confirm(`"${gym.name}" ${t("confirmDelete")}`)) return;
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase.from("gyms").delete().eq("id", gym.id);
    if (err) {
      toast.show(toMnErrorMessage(err.message), "error");
      return;
    }
    fetchGyms();
  };

  if (loading) {
    return (
      <ComponentCard title={t("gyms")}>
        <div className="py-12 text-center text-gray-500">{t("loading")}</div>
      </ComponentCard>
    );
  }

  const filteredGyms = gyms.filter(
    (g) =>
      (cityFilter === "all" ||
        (cityFilter === "ulaanbaatar"
          ? !g.city || g.city === "ulaanbaatar"
          : g.city === cityFilter)) &&
      (!search ||
        (g.name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
        (g.address?.toLowerCase().includes(search.toLowerCase()) ?? false)),
  );
  const paginatedGyms = filteredGyms.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <ComponentCard title={t("gyms")}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={`${t("search")} ${t("gyms")}...`}
              className="sm:max-w-xs"
            />
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => {
                  setCityFilter("ulaanbaatar");
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  cityFilter === "ulaanbaatar"
                    ? "bg-brand-500 text-white"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                Улаанбаатар
              </button>
              <button
                type="button"
                onClick={() => {
                  setCityFilter("darkhan");
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  cityFilter === "darkhan"
                    ? "bg-brand-500 text-white"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                Дархан
              </button>
              <button
                type="button"
                onClick={() => {
                  setCityFilter("all");
                  setPage(1);
                }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  cityFilter === "all"
                    ? "bg-brand-500 text-white"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                Бүгд
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
              {(["today", "7d", "month"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setVisitPeriod(p)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    visitPeriod === p
                      ? "bg-brand-500 text-white"
                      : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                  }`}
                >
                  {p === "today" ? "Өнөөдөр" : p === "7d" ? "7 хоног" : "Сар"}
                </button>
              ))}
            </div>
            <Button size="sm" onClick={handleAdd} startIcon={<PlusIcon />}>
              {t("add")}
            </Button>
          </div>
        </div>
        <GymsTable
          gyms={paginatedGyms}
          error={error ?? undefined}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onQR={setQrGym}
          visitCounts={visitCounts}
          visitPeriod={visitPeriod}
          visitLoading={visitLoading}
          onVisitCountClick={setMonthlyGym}
        />
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={filteredGyms.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
          pageSizeOptions={[25, 50, 100]}
        />
      </ComponentCard>

      <GymFormModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingGym(null);
        }}
        gym={editingGym}
        onSuccess={fetchGyms}
      />
      <GymQRModal gym={qrGym} onClose={() => setQrGym(null)} />
      <GymVisitMonthlyPanel gym={monthlyGym} onClose={() => setMonthlyGym(null)} />
    </>
  );
}
