"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import ConfirmModal from "@/components/ui/ConfirmModal";
import EmptyState from "@/components/ui/EmptyState";
import HrFormModal, { type OrgOption } from "./HrFormModal";

type HrAdmin = {
  user_id: string;
  organization_id: string;
  organization_name: string;
  role: string;
  created_at: string;
  full_name: string | null;
  phone: string | null;
};

const avatarColors = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-fuchsia-500", "bg-rose-500",
];

function initials(name: string | null, phone: string | null): string {
  const source = (name ?? "").trim() || (phone ?? "").trim();
  if (!source) return "?";
  return source.slice(0, 1).toUpperCase();
}

function colorFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash << 5) - hash + seed.charCodeAt(i);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export default function HrSection() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { can } = useAuth();
  const { show: showToast } = useToast();
  const canManage = can("org.admins.manage");

  const [admins, setAdmins] = useState<HrAdmin[]>([]);
  const [organizations, setOrganizations] = useState<OrgOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrAdmin | null>(null);
  const [removing, setRemoving] = useState<HrAdmin | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await authHeader();
      const [adminsRes, orgsRes] = await Promise.all([
        fetch("/api/admin/org-admins", { headers }),
        fetch("/api/organizations"),
      ]);
      const adminsJson = await adminsRes.json();
      if (!adminsRes.ok) throw new Error(adminsJson?.error || "HR жагсаалт татаж чадсангүй");
      setAdmins(adminsJson.admins ?? []);

      const orgsJson = await orgsRes.json();
      setOrganizations(orgsRes.ok ? (orgsJson.organizations ?? []) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }, [authHeader]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return admins;
    return admins.filter((a) =>
      [a.full_name, a.phone, a.organization_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [admins, query]);

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveLoading(true);
    try {
      const headers = await authHeader();
      const res = await fetch(
        `/api/admin/org-admins?user_id=${encodeURIComponent(removing.user_id)}` +
          `&organization_id=${encodeURIComponent(removing.organization_id)}`,
        { method: "DELETE", headers },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Устгаж чадсангүй");
      showToast("HR эрх хаслаа", "success");
      setRemoving(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Алдаа гарлаа", "error");
    } finally {
      setRemoveLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            HR эрх ({admins.length})
          </h3>
          <p className="mt-0.5 text-xs text-gray-400">
            HR нэвтрэхэд{" "}
            <span className="font-medium text-gray-500 dark:text-gray-400">gymhub.mn/hr</span>{" "}
            дээр зөвхөн өөрийн байгууллагын ажилчид харагдана.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Нэр, утас, байгууллагаар хайх..."
            className="h-10 w-56 rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800/80 dark:text-white/90"
          />
          {canManage && (
            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              + HR нэмэх
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="users"
          title={query ? "Хайлтад тохирох HR олдсонгүй" : "HR бүртгэл алга"}
          description={
            query
              ? undefined
              : "«HR нэмэх» товчоор байгууллагад хариуцсан ажилтан бүртгэнэ."
          }
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((admin) => (
            <div
              key={`${admin.user_id}:${admin.organization_id}`}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white p-3.5 transition hover:border-gray-200 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white ${colorFor(admin.user_id)}`}
              >
                {initials(admin.full_name, admin.phone)}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                  {admin.full_name?.trim() || "Нэргүй"}
                </p>
                <p className="truncate text-xs text-gray-400">{admin.phone || "—"}</p>
              </div>

              <Link
                href="/organizations"
                className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-600 hover:bg-brand-100 dark:bg-brand-500/10 dark:text-brand-400"
              >
                {admin.organization_name}
              </Link>

              {admin.role === "owner" && (
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  Удирдлага
                </span>
              )}

              {canManage && (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      setEditing(admin);
                      setModalOpen(true);
                    }}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                  >
                    Засах
                  </button>
                  <button
                    onClick={() => setRemoving(admin)}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-900/20"
                  >
                    Хасах
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <HrFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        organizations={organizations}
        editing={editing}
        onSuccess={() => {
          showToast(editing ? "HR мэдээлэл шинэчлэгдлээ" : "HR нэмэгдлээ", "success");
          void load();
        }}
      />

      <ConfirmModal
        isOpen={Boolean(removing)}
        title="HR эрх хасах уу?"
        message={
          removing
            ? `${removing.full_name?.trim() || removing.phone || "Энэ хэрэглэгч"} — «${removing.organization_name}» байгууллагын мэдээлэлд хандах эрхгүй болно.`
            : undefined
        }
        confirmLabel="Хасах"
        loading={removeLoading}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
