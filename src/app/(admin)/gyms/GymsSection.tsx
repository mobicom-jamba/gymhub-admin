"use client";

import React, { useState, useEffect } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import GymsTable from "./GymsTable";
import GymFormModal from "./GymFormModal";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";
import { PlusIcon, PencilIcon, TrashBinIcon } from "@/icons";
import SearchInput from "@/components/common/SearchInput";
import type { Gym } from "./types";
import { useToast } from "@/components/ui/Toast";
import { toMnErrorMessage } from "@/lib/error-message";
import TablePagination from "@/components/ui/TablePagination";

export default function GymsSection() {
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingGym, setEditingGym] = useState<Gym | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
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
      !search ||
      (g.name?.toLowerCase().includes(search.toLowerCase()) ?? false) ||
      (g.address?.toLowerCase().includes(search.toLowerCase()) ?? false),
  );
  const paginatedGyms = filteredGyms.slice((page - 1) * pageSize, page * pageSize);

  return (
    <>
      <ComponentCard title={t("gyms")}>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder={`${t("search")} ${t("gyms")}...`}
            className="sm:max-w-xs"
          />
          <Button size="sm" onClick={handleAdd} startIcon={<PlusIcon />}>
            {t("add")}
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
    </>
  );
}
