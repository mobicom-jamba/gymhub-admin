"use client";

import React, { useState, useEffect, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import GymsTable from "./GymsTable";
import GymFormModal from "./GymFormModal";
import GymQRModal from "./GymQRModal";
import GymVisitMonthlyPanel from "./GymVisitMonthlyPanel";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";
import { PlusIcon } from "@/icons";
import SearchInput from "@/components/common/SearchInput";
import type { Gym, VisitPeriod } from "./types";
import { useToast } from "@/components/ui/Toast";
import { toMnErrorMessage } from "@/lib/error-message";
import TablePagination from "@/components/ui/TablePagination";
import { useAuth } from "@/context/AuthContext";

export type VenueTab = "gym" | "yoga" | "pool";

const VENUE_TABS: { id: VenueTab; label: string }[] = [
  { id: "gym", label: "Фитнес" },
  { id: "yoga", label: "Йога" },
  { id: "pool", label: "Бассейн" },
];

function normalizeTab(raw: string | null): VenueTab {
  if (raw === "yoga" || raw === "pool" || raw === "gym") return raw;
  if (raw === "bassein") return "pool";
  return "gym";
}

function venueTypeOf(g: Gym): VenueTab {
  const v = g.type ?? "gym";
  if (v === "yoga" || v === "pool") return v;
  return "gym";
}

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
  const monthStart = new Date(
    Date.UTC(mnNow.getUTCFullYear(), mnNow.getUTCMonth(), 1),
  );
  return new Date(monthStart.getTime() - offset).toISOString();
}

export default function GymsSection() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const typeTab = normalizeTab(searchParams.get("type"));

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
  const { role } = useAuth();
  const showBilling = role === "admin";

  const setTypeTab = (next: VenueTab) => {
    setPage(1);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "gym") params.delete("type");
    else params.set("type", next);
    const q = params.toString();
    router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const fetchGyms = async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data, error: err } = await supabase
      .from("gyms")
      .select("*")
      .order("sort_order", { ascending: true })
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
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const authHeader = session?.access_token
        ? `Bearer ${session.access_token}`
        : "";
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

  const tabCounts = useMemo(() => {
    const counts: Record<VenueTab, number> = { gym: 0, yoga: 0, pool: 0 };
    for (const g of gyms) counts[venueTypeOf(g)] += 1;
    return counts;
  }, [gyms]);

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

  const filteredGyms = gyms.filter((g) => {
    if (venueTypeOf(g) !== typeTab) return false;
    if (
      cityFilter !== "all" &&
      (cityFilter === "ulaanbaatar"
        ? g.city && g.city !== "ulaanbaatar"
        : g.city !== cityFilter)
    ) {
      return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (g.name?.toLowerCase().includes(q) ?? false) ||
      (g.address?.toLowerCase().includes(q) ?? false)
    );
  });
  const paginatedGyms = filteredGyms.slice((page - 1) * pageSize, page * pageSize);

  const searchPlaceholder =
    typeTab === "yoga"
      ? "Йога хайх..."
      : typeTab === "pool"
        ? "Бассейн хайх..."
        : `${t("search")} ${t("gyms")}...`;

  return (
    <>
      <ComponentCard title={t("gyms")}>
        <div className="mb-4 flex flex-col gap-3">
          <div className="inline-flex w-fit rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
            {VENUE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTypeTab(tab.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  typeTab === tab.id
                    ? "bg-brand-500 text-white"
                    : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                }`}
              >
                {tab.label}
                <span
                  className={`ml-1.5 tabular-nums ${
                    typeTab === tab.id ? "text-white/80" : "text-gray-400"
                  }`}
                >
                  {tabCounts[tab.id]}
                </span>
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
              <SearchInput
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="sm:max-w-xs"
              />
              <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
                {(
                  [
                    ["ulaanbaatar", "Улаанбаатар"],
                    ["darkhan", "Орон нутаг (Бүсчлэл)"],
                    ["all", "Бүгд"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setCityFilter(id);
                      setPage(1);
                    }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      cityFilter === id
                        ? "bg-brand-500 text-white"
                        : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
                {(["today", "7d", "month"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setVisitPeriod(p)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
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
          showBilling={showBilling}
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
        defaultType={typeTab}
        showBilling={showBilling}
      />
      <GymQRModal gym={qrGym} onClose={() => setQrGym(null)} />
      <GymVisitMonthlyPanel
        gym={monthlyGym}
        onClose={() => setMonthlyGym(null)}
        showBilling={showBilling}
      />
    </>
  );
}
