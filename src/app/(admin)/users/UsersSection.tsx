"use client";

import React, { useState, useEffect } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import UsersTable from "./UsersTable";
import UserFormModal from "./UserFormModal";
import Button from "@/components/ui/button/Button";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";
import SearchInput from "@/components/common/SearchInput";
import { PlusIcon } from "@/icons";
import { exportToCsv } from "@/lib/csv-export";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  created_at: string;
};

export default function UsersSection() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [formProfile, setFormProfile] = useState<Profile | null | "new">(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchProfiles = async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data, error: err } = await supabase
      .from("profiles")
      .select("*")
      .order("created_at", { ascending: false });
    setProfiles(data ?? []);
    setError(err?.message ?? null);
    setLoading(false);
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  const handleRoleChange = async (profileId: string, newRole: string) => {
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", profileId);
    if (err) {
      alert(err.message);
      return;
    }
    fetchProfiles();
  };

  const handleDelete = async (profileId: string) => {
    if (!confirm(t("confirmDeleteUser"))) return;
    const res = await fetch(`/api/admin/users/${profileId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error ?? "Алдаа гарлаа");
      return;
    }
    fetchProfiles();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} хэрэглэгч устгах уу?`)) return;
    setBulkDeleting(true);
    try {
      const promises = Array.from(selectedIds).map((id) =>
        fetch(`/api/admin/users/${id}`, { method: "DELETE" })
      );
      await Promise.all(promises);
      setSelectedIds(new Set());
      fetchProfiles();
    } catch (err) {
      alert("Устгахад алдаа гарлаа");
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkRoleChange = async (newRole: string) => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} хэрэглэгчийн эрхийг ${newRole} болгох уу?`)) return;
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .in("id", Array.from(selectedIds));
    if (err) {
      alert(err.message);
      return;
    }
    setSelectedIds(new Set());
    fetchProfiles();
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProfiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProfiles.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  if (loading) {
    return (
      <ComponentCard title={t("users")}>
        <div className="py-12 text-center text-gray-500">{t("loading")}</div>
      </ComponentCard>
    );
  }

  const filteredProfiles = profiles.filter((p) => {
    if (roleFilter && (p.role ?? "user") !== roleFilter) return false;
    if (
      search &&
      !(p.full_name?.toLowerCase().includes(search.toLowerCase()) ?? false) &&
      !(p.phone?.toLowerCase().includes(search.toLowerCase()) ?? false)
    )
      return false;
    return true;
  });

  return (
    <>
      <ComponentCard title={t("users")}>
        <div className="mb-4 flex items-center gap-3">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`${t("search")} ${t("users")}...`}
            className="max-w-xs"
          />
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">{t("role")}: Бүгд</option>
            <option value="user">Гишүүн</option>
            <option value="admin">Админ</option>
          </select>
          <div className="flex-1" />
          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {selectedIds.size} сонгосон
              </span>
              <select
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm dark:border-gray-600 dark:bg-gray-800"
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkRoleChange(e.target.value);
                    e.target.value = "";
                  }
                }}
                defaultValue=""
              >
                <option value="" disabled>
                  Эрх солих
                </option>
                <option value="user">Гишүүн</option>
                <option value="admin">Админ</option>
              </select>
              <button
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Устгаж байна..." : "Устгах"}
              </button>
            </>
          )}
          <Button
            size="sm"
            onClick={() => setFormProfile("new")}
            startIcon={<PlusIcon className="size-4" />}
          >
            {t("add")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              exportToCsv("users", filteredProfiles, [
                { key: "full_name", label: t("fullName") },
                { key: "phone", label: t("phone") },
                { key: "role", label: t("role") },
                { key: "created_at", label: t("date") },
              ])
            }
          >
            CSV
          </Button>
        </div>
        <UsersTable
          profiles={filteredProfiles}
          error={error ?? undefined}
          onRoleChange={handleRoleChange}
          onEdit={(p) => setFormProfile(p)}
          onDelete={handleDelete}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />
      </ComponentCard>
      <UserFormModal
        isOpen={formProfile !== null}
        onClose={() => setFormProfile(null)}
        profile={formProfile === "new" ? null : formProfile}
        onSuccess={() => {
          fetchProfiles();
          setFormProfile(null);
        }}
      />
    </>
  );
}
