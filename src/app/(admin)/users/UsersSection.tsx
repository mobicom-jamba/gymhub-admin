"use client";

import React, { useState, useEffect, useMemo } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import UsersTable from "./UsersTable";
import UserFormModal from "./UserFormModal";
import Button from "@/components/ui/button/Button";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";
import SearchInput from "@/components/common/SearchInput";
import { PlusIcon } from "@/icons";
import { exportToCsv } from "@/lib/csv-export";

export type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  organization: string | null;
  membership_tier: string | null;
  membership_status: string | null;
  membership_started_at: string | null;
  membership_expires_at: string | null;
  created_at: string;
};

const PAGE_SIZE = 25;

export default function UsersSection() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"user" | "admin">("user");
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [formProfile, setFormProfile] = useState<Profile | null | "new">(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchProfiles = async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data, error: err } = await supabase
      .from("profiles")
      .select("id, full_name, phone, role, organization, membership_tier, membership_status, membership_started_at, membership_expires_at, created_at")
      .order("created_at", { ascending: false });
    setProfiles((data ?? []) as Profile[]);
    setError(err?.message ?? null);
    setLoading(false);
  };

  useEffect(() => { fetchProfiles(); }, []);

  const organizations = useMemo(() => {
    const orgs = [...new Set(profiles.map((p) => p.organization).filter(Boolean))] as string[];
    return orgs.sort((a, b) => a.localeCompare(b));
  }, [profiles]);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if ((p.role ?? "user") !== tab) return false;
      if (orgFilter && p.organization !== orgFilter) return false;
      if (statusFilter && (p.membership_status ?? "active") !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          p.full_name?.toLowerCase().includes(q) ||
          p.phone?.toLowerCase().includes(q) ||
          p.organization?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [profiles, search, tab, orgFilter, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProfiles.length / PAGE_SIZE));
  const pagedProfiles = filteredProfiles.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const resetPage = () => setPage(1);

  const handleRoleChange = async (profileId: string, newRole: string) => {
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", profileId);
    if (err) { alert(err.message); return; }
    fetchProfiles();
  };

  const handleDelete = async (profileId: string) => {
    if (!confirm(t("confirmDeleteUser"))) return;
    const res = await fetch(`/api/admin/users/${profileId}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? "Алдаа гарлаа"); return; }
    fetchProfiles();
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} хэрэглэгч устгах уу?`)) return;
    setBulkDeleting(true);
    try {
      await Promise.all(Array.from(selectedIds).map((id) =>
        fetch(`/api/admin/users/${id}`, { method: "DELETE" })
      ));
      setSelectedIds(new Set());
      fetchProfiles();
    } catch { alert("Устгахад алдаа гарлаа"); }
    finally { setBulkDeleting(false); }
  };

  const handleBulkRoleChange = async (newRole: string) => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} хэрэглэгчийн эрхийг ${newRole} болгох уу?`)) return;
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .in("id", Array.from(selectedIds));
    if (err) { alert(err.message); return; }
    setSelectedIds(new Set());
    fetchProfiles();
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pagedProfiles.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pagedProfiles.map((p) => p.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    newSet.has(id) ? newSet.delete(id) : newSet.add(id);
    setSelectedIds(newSet);
  };

  if (loading) {
    return (
      <ComponentCard title={t("users")}>
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      </ComponentCard>
    );
  }

  const adminCount = profiles.filter(p => (p.role ?? "user") === "admin").length;
  const userCount  = profiles.filter(p => (p.role ?? "user") === "user").length;

  return (
    <>
      {/* ── Role Tabs ── */}
      <div className="mb-4 flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-white/[0.08] dark:bg-gray-900" style={{ width: "fit-content" }}>
        {(["user", "admin"] as const).map((r) => {
          const label = r === "user" ? "Гишүүд" : "Админ";
          const count = r === "user" ? userCount : adminCount;
          const active = tab === r;
          return (
            <button
              key={r}
              onClick={() => { setTab(r); setPage(1); setSelectedIds(new Set()); }}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                active
                  ? "bg-brand-500 text-white shadow-sm"
                  : "text-gray-500 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/[0.06]"
              }`}
            >
              {label}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500 dark:bg-white/[0.08] dark:text-gray-400"
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <ComponentCard
        title={`${tab === "user" ? "Гишүүд" : "Админ"} — ${filteredProfiles.length.toLocaleString()}`}
      >
        {/* ── Filters row ── */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(v) => { setSearch(v); resetPage(); }}
            placeholder="Нэр, утас, байгууллага..."
            className="w-56"
          />

          {/* Organization filter */}
          <select
            value={orgFilter}
            onChange={(e) => { setOrgFilter(e.target.value); resetPage(); }}
            className="h-9 max-w-[200px] rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">Байгууллага: Бүгд</option>
            {organizations.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>

          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); resetPage(); }}
            className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
          >
            <option value="">Төлөв: Бүгд</option>
            <option value="active">Идэвхтэй</option>
            <option value="expired">Дууссан</option>
          </select>

          <div className="flex-1" />

          {selectedIds.size > 0 && (
            <>
              <span className="text-sm text-gray-600 dark:text-gray-400">{selectedIds.size} сонгосон</span>
              <select
                className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm dark:border-gray-600 dark:bg-gray-800"
                onChange={(e) => { if (e.target.value) { handleBulkRoleChange(e.target.value); e.target.value = ""; } }}
                defaultValue=""
              >
                <option value="" disabled>Эрх солих</option>
                <option value="user">Гишүүн</option>
                <option value="admin">Админ</option>
              </select>
              <button
                className="h-9 rounded-lg bg-red-600 px-3 text-sm text-white hover:bg-red-700 disabled:opacity-50"
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
              >
                {bulkDeleting ? "Устгаж байна..." : `${selectedIds.size} устгах`}
              </button>
            </>
          )}

          <Button size="sm" onClick={() => setFormProfile("new")} startIcon={<PlusIcon className="size-4" />}>
            {t("add")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              exportToCsv("users", filteredProfiles, [
                { key: "full_name", label: "Нэр" },
                { key: "phone", label: "Утас" },
                { key: "organization", label: "Байгууллага" },
                { key: "role", label: "Эрх" },
                { key: "membership_status", label: "Төлөв" },
                { key: "membership_expires_at", label: "Дуусах огноо" },
                { key: "created_at", label: "Бүртгүүлсэн" },
              ])
            }
          >
            CSV
          </Button>
        </div>

        <UsersTable
          profiles={pagedProfiles}
          error={error ?? undefined}
          onRoleChange={handleRoleChange}
          onEdit={(p) => setFormProfile(p)}
          onDelete={handleDelete}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />

        {/* ── Pagination ── */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>
              {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filteredProfiles.length)} / {filteredProfiles.length.toLocaleString()}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-white/[0.05]"
              >«</button>
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-white/[0.05]"
              >‹</button>
              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 3, totalPages - 6));
                const p = start + i;
                return (
                  <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`min-w-[32px] rounded px-2 py-1 text-sm ${
                      p === page
                        ? "bg-brand-500 text-white"
                        : "hover:bg-gray-100 dark:hover:bg-white/[0.05]"
                    }`}
                  >
                    {p}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-white/[0.05]"
              >›</button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="rounded px-2 py-1 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-white/[0.05]"
              >»</button>
            </div>
          </div>
        )}
      </ComponentCard>

      <UserFormModal
        isOpen={formProfile !== null}
        onClose={() => setFormProfile(null)}
        profile={formProfile === "new" ? null : formProfile}
        organizations={organizations}
        onSuccess={() => { fetchProfiles(); setFormProfile(null); }}
      />
    </>
  );
}
