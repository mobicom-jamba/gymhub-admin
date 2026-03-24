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
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import type { Density } from "./UsersTable";

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

const PAGE_SIZES = [25, 50, 100, 500];

export default function UsersSection() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"user" | "admin">("user");
  const [search, setSearch] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [formProfile, setFormProfile] = useState<Profile | null | "new">(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [density, setDensity] = useState<Density>("comfortable");
  const toast = useToast();

  const PROFILE_SELECT = "id, full_name, phone, role, organization, membership_tier, membership_status, membership_started_at, membership_expires_at, created_at";

  const fetchAllProfilePages = async (): Promise<{ data: Profile[]; error: string | null }> => {
    const supabase = createBrowserSupabaseClient();
    const all: Profile[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data, error: err } = await supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (err) return { data: all, error: err.message };
      all.push(...((data ?? []) as Profile[]));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return { data: all, error: null };
  };

  const fetchProfiles = async () => {
    setLoading(true);
    const { data, error: err } = await fetchAllProfilePages();
    setProfiles(data);
    setError(err);
    setLoading(false);
  };

  const silentRefresh = async () => {
    const { data, error: err } = await fetchAllProfilePages();
    setProfiles(data);
    if (err) setError(err);
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

  const totalPages = Math.max(1, Math.ceil(filteredProfiles.length / pageSize));
  const pagedProfiles = filteredProfiles.slice((page - 1) * pageSize, page * pageSize);

  const resetPage = () => setPage(1);

  const handleRoleChange = async (profileId: string, newRole: string) => {
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p));
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .eq("id", profileId);
    if (err) { alert(err.message); silentRefresh(); }
  };

  const handleDelete = async (profileId: string) => {
    setConfirmDelete({ id: profileId, name: profiles.find(p => p.id === profileId)?.full_name ?? "" });
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDelete) return;
    const { id } = confirmDelete;
    setConfirmDelete(null);
    setProfiles(prev => prev.filter(p => p.id !== id));
    toast.show("Хэрэглэгчийн бүртгэл амжилттай устгагдлаа.");
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) { alert(data.error ?? "Алдаа гарлаа"); silentRefresh(); }
  };

  const handleBulkDeleteConfirmed = async () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const count = ids.length;
    setBulkDeleting(true);
    setConfirmBulk(false);
    setProfiles(prev => prev.filter(p => !selectedIds.has(p.id)));
    setSelectedIds(new Set());
    toast.show(`${count} хэрэглэгчийн бүртгэл амжилттай устгагдлаа.`);
    try {
      await Promise.all(ids.map((id) =>
        fetch(`/api/admin/users/${id}`, { method: "DELETE" })
      ));
    } catch { alert("Устгахад алдаа гарлаа"); silentRefresh(); }
    finally { setBulkDeleting(false); }
  };

  const handleBulkRoleChange = async (newRole: string) => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} хэрэглэгчийн эрхийг ${newRole} болгох уу?`)) return;
    const ids = Array.from(selectedIds);
    setProfiles(prev => prev.map(p => ids.includes(p.id) ? { ...p, role: newRole } : p));
    setSelectedIds(new Set());
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("profiles")
      .update({ role: newRole })
      .in("id", ids);
    if (err) { alert(err.message); silentRefresh(); }
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
              onClick={() => { setTab(r); setPage(1); setPageSize(25); setSelectedIds(new Set()); }}
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
        <div className="mb-4 space-y-2">
          {/* Row 1: search + filters + actions */}
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); resetPage(); }}
              placeholder="Нэр, утас, байгууллага..."
              className="w-56"
            />

            <select
              value={orgFilter}
              onChange={(e) => { setOrgFilter(e.target.value); resetPage(); }}
              className="h-10 max-w-[200px] rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-700 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
            >
              <option value="">🏢 Байгууллага: бүгд</option>
              {organizations.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>

            <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800/60">
              {([["", "Бүгд"], ["active", "✅ Идэвх"], ["expired", "⛔ Дууссан"]] as const).map(([v, label]) => (
                <button key={v} type="button"
                  onClick={() => { setStatusFilter(v); resetPage(); }}
                  className={`h-8 rounded-lg px-3 text-xs font-medium transition-all ${
                    statusFilter === v
                      ? v === "active" ? "bg-emerald-500 text-white shadow-sm"
                        : v === "expired" ? "bg-red-500 text-white shadow-sm"
                        : "bg-white text-gray-700 shadow-sm dark:bg-gray-700 dark:text-white"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}>{label}
                </button>
              ))}
            </div>

            {(search || orgFilter || statusFilter) && (
              <button
                onClick={() => { setSearch(""); setOrgFilter(""); setStatusFilter(""); resetPage(); }}
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-400 hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-gray-700 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              >
                ✕ Цэвэрлэх
              </button>
            )}

            <div className="flex-1" />

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 dark:border-amber-800 dark:bg-amber-900/20">
                <span className="text-sm font-semibold text-amber-700 dark:text-amber-400">{selectedIds.size} сонгосон</span>
                <button
                  className="rounded-lg bg-red-500 px-3 py-1 text-xs font-semibold text-white hover:bg-red-600 disabled:opacity-50"
                  onClick={() => setConfirmBulk(true)}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? "..." : "Устгах"}
                </button>
              </div>
            )}

            {/* Density toggle */}
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800/60">
              <button type="button" onClick={() => setDensity("comfortable")} title="Тэлэгдсэн"
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${density === "comfortable" ? "bg-white text-gray-700 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-400 hover:text-gray-600"}`}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/></svg>
              </button>
              <button type="button" onClick={() => setDensity("compact")} title="Нягтаралсан"
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${density === "compact" ? "bg-white text-gray-700 shadow-sm dark:bg-gray-700 dark:text-white" : "text-gray-400 hover:text-gray-600"}`}>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 9.75h16.5M3.75 13.5h16.5M3.75 17.25h16.5M3.75 21h16.5"/></svg>
              </button>
            </div>

            <button onClick={() => setFormProfile("new")}
              className="flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 transition-colors">
              <PlusIcon className="size-4" />
              Нэмэх
            </button>
            <button
              onClick={() => exportToCsv("users", filteredProfiles, [
                { key: "full_name", label: "Нэр" },
                { key: "phone", label: "Утас" },
                { key: "organization", label: "Байгууллага" },
                { key: "membership_status", label: "Төлөв" },
                { key: "membership_expires_at", label: "Дуусах огноо" },
              ])}
              className="flex h-10 items-center gap-1.5 rounded-xl border border-gray-200 px-3 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              CSV
            </button>
          </div>
        </div>

        <UsersTable
          profiles={pagedProfiles}
          error={error ?? undefined}
          loading={loading}
          density={density}
          onRoleChange={handleRoleChange}
          onEdit={(p) => setFormProfile(p)}
          onDelete={handleDelete}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
        />

        {/* ── Pagination ── */}
        {(totalPages > 1 || filteredProfiles.length > 25) && (
          <div className="mt-5 flex items-center justify-between">
            {/* Left: count + page size */}
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="tabular-nums">
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, filteredProfiles.length)}
                <span className="mx-1 text-gray-300">/</span>
                {filteredProfiles.length.toLocaleString()}
              </span>
              <select
                value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="h-8 rounded-lg border border-gray-200 bg-white px-2 text-xs dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
              >
                {PAGE_SIZES.map(s => <option key={s} value={s}>{s} / хуудас</option>)}
              </select>
            </div>

            {/* Right: page buttons */}
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(1)} disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:border-gray-700 dark:hover:bg-white/[0.06]">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M18.75 19.5l-7.5-7.5 7.5-7.5m-6 15L5.25 12l7.5-7.5"/></svg>
              </button>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:border-gray-700 dark:hover:bg-white/[0.06]">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5"/></svg>
              </button>

              {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                const start = Math.max(1, Math.min(page - 3, totalPages - 6));
                const p = start + i;
                return (
                  <button key={p} onClick={() => setPage(p)}
                    className={`flex h-8 min-w-[32px] items-center justify-center rounded-lg border text-sm font-medium transition-colors ${
                      p === page
                        ? "border-brand-500 bg-brand-500 text-white"
                        : "border-gray-200 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.06]"
                    }`}>{p}
                  </button>
                );
              })}

              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:border-gray-700 dark:hover:bg-white/[0.06]">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5"/></svg>
              </button>
              <button onClick={() => setPage(totalPages)} disabled={page === totalPages}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:border-gray-700 dark:hover:bg-white/[0.06]">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 4.5l7.5 7.5-7.5 7.5m6-15l7.5 7.5-7.5 7.5"/></svg>
              </button>
            </div>
          </div>
        )}
      </ComponentCard>

      <UserFormModal
        isOpen={formProfile !== null}
        onClose={() => setFormProfile(null)}
        profile={formProfile === "new" ? null : formProfile}
        organizations={organizations}
        onSuccess={() => { setFormProfile(null); toast.show("Хэрэглэгчийн мэдээлэл амжилттай хадгалагдлаа."); silentRefresh(); }}
      />

      <ConfirmModal
        isOpen={confirmDelete !== null}
        title="Хэрэглэгч устгах уу?"
        message={confirmDelete?.name ? `"${confirmDelete.name}" хэрэглэгчийг бүрмөсөн устгана. Энэ үйлдлийг буцаах боломжгүй.` : "Энэ үйлдлийг буцаах боломжгүй."}
        onConfirm={handleDeleteConfirmed}
        onCancel={() => setConfirmDelete(null)}
      />

      <ConfirmModal
        isOpen={confirmBulk}
        title={`${selectedIds.size} хэрэглэгч устгах уу?`}
        message="Сонгосон хэрэглэгчдийг бүрмөсөн устгана. Энэ үйлдлийг буцаах боломжгүй."
        confirmLabel={bulkDeleting ? "Түр хүлээнэ үү..." : `${selectedIds.size} хэрэглэгч устгах`}
        onConfirm={handleBulkDeleteConfirmed}
        onCancel={() => setConfirmBulk(false)}
        loading={bulkDeleting}
      />
    </>
  );
}
