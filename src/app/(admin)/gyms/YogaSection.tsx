"use client";

import React, { useState, useEffect } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import GymsTable from "./GymsTable";
import GymFormModal from "./GymFormModal";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { PlusIcon } from "@/icons";
import SearchInput from "@/components/common/SearchInput";
import type { Gym } from "./types";
import { useToast } from "@/components/ui/Toast";
import { toMnErrorMessage } from "@/lib/error-message";
import TablePagination from "@/components/ui/TablePagination";

export default function YogaSection() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGym, setEditingGym] = useState<Gym | null>(null);
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState<"ulaanbaatar" | "darkhan" | "all">("ulaanbaatar");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const toast = useToast();

  const fetchGyms = async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data, error: err } = await supabase
      .from("gyms")
      .select("*")
      .eq("type", "yoga")   // ← yoga filter
      .order("name");
    setGyms(data ?? []);
    setError(err?.message ?? null);
    setLoading(false);
  };

  useEffect(() => {
    fetchGyms();
  }, []);

  const handleAdd = () => {
    setEditingGym(null);
    setModalOpen(true);
  };

  const handleEdit = (gym: Gym) => {
    setEditingGym(gym);
    setModalOpen(true);
  };

  const handleDelete = async (gym: Gym) => {
    if (!confirm(`"${gym.name}" устгахдаа итгэлтэй байна уу?`)) return;
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
      <ComponentCard title="Йога төвүүд">
        <div className="py-12 text-center text-gray-500">Ачаалж байна...</div>
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
      <ComponentCard title="Йога төвүүд">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder="Йога хайх..."
              className="sm:max-w-xs"
            />
            <div className="inline-flex rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
              {(["ulaanbaatar", "darkhan", "all"] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setCityFilter(c); setPage(1); }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                    cityFilter === c
                      ? "bg-brand-500 text-white"
                      : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
                  }`}
                >
                  {c === "ulaanbaatar" ? "Улаанбаатар" : c === "darkhan" ? "Дархан" : "Бүгд"}
                </button>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={handleAdd} startIcon={<PlusIcon />}>
            Нэмэх
          </Button>
        </div>
        <GymsTable
          gyms={paginatedGyms}
          error={error ?? undefined}
          onEdit={handleEdit}
          onDelete={handleDelete}
        />
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalItems={filteredGyms.length}
          onPageChange={setPage}
          onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
          pageSizeOptions={[25, 50, 100]}
        />
      </ComponentCard>
      <GymFormModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditingGym(null); }}
        gym={editingGym}
        onSuccess={fetchGyms}
        defaultType="yoga"   // ← шинэ prop
      />
    </>
  );
}