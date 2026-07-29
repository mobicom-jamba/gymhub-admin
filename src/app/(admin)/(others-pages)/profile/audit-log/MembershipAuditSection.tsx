"use client";

import React, { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import SearchInput from "@/components/common/SearchInput";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { planTierDisplayLabel } from "@/lib/membership-plan-label";
import { t } from "@/lib/i18n";
import { useAuth } from "@/context/AuthContext";
import { canAccessAuditLog } from "@/lib/audit-log-access";

type ProfileRef = {
  id: string;
  full_name: string | null;
  phone: string | null;
  surname?: string | null;
  given_name?: string | null;
  role?: string | null;
} | null;

type AuditRow = {
  id: string;
  profile_id: string;
  changed_by: string | null;
  old_membership_tier: string | null;
  new_membership_tier: string | null;
  old_membership_status: string | null;
  new_membership_status: string | null;
  old_membership_started_at: string | null;
  new_membership_started_at: string | null;
  old_membership_expires_at: string | null;
  new_membership_expires_at: string | null;
  source: string;
  booking_id: string | null;
  payment_channel: string | null;
  created_at: string;
  profile: ProfileRef | ProfileRef[];
  actor: ProfileRef | ProfileRef[];
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function displayName(p: ProfileRef): string {
  if (!p) return "—";
  const full = p.full_name?.trim();
  if (full) return full;
  const parts = [p.surname, p.given_name].filter(Boolean).join(" ").trim();
  if (parts) return parts;
  return p.phone?.trim() || p.id.slice(0, 8);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("mn-MN", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(s: string | null): string {
  const v = (s ?? "").toLowerCase();
  if (v === "active") return "Идэвхтэй";
  if (v === "inactive") return "Идэвхгүй";
  if (v === "paused") return "Түдгэлзүүлсэн";
  if (v === "expired") return "Дууссан";
  return s || "—";
}

function sourceLabel(source: string): string {
  if (source === "admin") return "Админ";
  if (source === "payment") return "Төлбөр";
  if (source === "user") return "Хэрэглэгч";
  if (source === "system") return "Систем";
  return source;
}

function channelLabel(channel: string | null): string {
  if (!channel) return "";
  const map: Record<string, string> = {
    qpay: "QPay",
    monpay: "MonPay",
    sono: "Sono",
    pocket: "Pocket",
    carepay: "Carepay",
    gymfintech: "Flexy",
    gift: "Gift",
  };
  return map[channel.toLowerCase()] ?? channel;
}

function roleLabel(role: string | null | undefined): string {
  if (role === "admin") return "Админ";
  if (role === "moderator") return "Модератор";
  if (role === "sales") return "Борлуулалт";
  return "Ажилтан";
}

function ChangeCell({
  oldVal,
  newVal,
  format = (v: string | null) => v || "—",
}: {
  oldVal: string | null;
  newVal: string | null;
  format?: (v: string | null) => string;
}) {
  if (oldVal === newVal || (oldVal == null && newVal == null)) {
    return <span className="text-gray-400 dark:text-gray-500">{format(newVal)}</span>;
  }
  return (
    <span className="inline-flex flex-col gap-0.5 text-xs leading-tight">
      <span className="text-gray-400 line-through dark:text-gray-500">{format(oldVal)}</span>
      <span className="font-medium text-gray-800 dark:text-white/90">{format(newVal)}</span>
    </span>
  );
}

const PAGE_SIZE = 50;

export default function MembershipAuditSection() {
  const { user } = useAuth();
  const allowed = canAccessAuditLog(user?.email);
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const tmr = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(tmr);
  }, [search]);

  useEffect(() => {
    setOffset(0);
  }, [debouncedSearch]);

  const fetchRows = useCallback(async () => {
    if (!allowed) {
      setError("Эрх хүрэлцэхгүй.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const sb = createBrowserSupabaseClient();
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData.session?.access_token;
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (debouncedSearch) params.set("q", debouncedSearch);

      const res = await fetch(`/api/admin/membership-audit?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Алдаа гарлаа");
        setRows([]);
        setTotal(0);
        return;
      }
      setRows(json.rows ?? []);
      setTotal(json.total ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }, [allowed, debouncedSearch, offset]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <ComponentCard
      title="Membership Audit Log"
      desc="Гишүүнчлэлийн бүх өөрчлөлт (багц, төлөв, эхлэх/дуусах огноо)"
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Нэр эсвэл утас хайх..."
          className="w-full sm:max-w-sm"
        />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Нийт: {total}
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
            <p className="text-gray-500 dark:text-gray-400">{t("loading")}</p>
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
          Бүртгэл олдсонгүй.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400 dark:border-gray-800">
                <th className="px-3 py-3 font-medium">Огноо</th>
                <th className="px-3 py-3 font-medium">Гишүүн</th>
                <th className="px-3 py-3 font-medium">Багц</th>
                <th className="px-3 py-3 font-medium">Төлөв</th>
                <th className="px-3 py-3 font-medium">Эхлэх</th>
                <th className="px-3 py-3 font-medium">Дуусах</th>
                <th className="px-3 py-3 font-medium">Өөрчилсөн</th>
                <th className="px-3 py-3 font-medium">Төлбөр</th>
                <th className="px-3 py-3 font-medium">Эх сурвалж</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const profile = one(row.profile);
                const actor = one(row.actor);
                return (
                  <tr
                    key={row.id}
                    className="border-b border-gray-50 dark:border-gray-800/60"
                  >
                    <td className="whitespace-nowrap px-3 py-3 text-gray-600 dark:text-gray-300">
                      {fmtDateTime(row.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-gray-800 dark:text-white/90">
                        {displayName(profile)}
                      </div>
                      {profile?.phone && (
                        <div className="text-xs text-gray-400">{profile.phone}</div>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <ChangeCell
                        oldVal={row.old_membership_tier}
                        newVal={row.new_membership_tier}
                        format={(v) => (v ? planTierDisplayLabel(v) : "—")}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <ChangeCell
                        oldVal={row.old_membership_status}
                        newVal={row.new_membership_status}
                        format={statusLabel}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <ChangeCell
                        oldVal={row.old_membership_started_at}
                        newVal={row.new_membership_started_at}
                        format={fmtDate}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <ChangeCell
                        oldVal={row.old_membership_expires_at}
                        newVal={row.new_membership_expires_at}
                        format={fmtDate}
                      />
                    </td>
                    <td className="px-3 py-3">
                      {row.source === "admin" && actor ? (
                        <div>
                          <div className="font-medium text-gray-800 dark:text-white/90">
                            {displayName(actor)}
                          </div>
                          <div className="text-xs text-gray-400">
                            {roleLabel(actor.role)}
                            {actor.phone ? ` · ${actor.phone}` : ""}
                          </div>
                        </div>
                      ) : row.source === "user" && actor ? (
                        <div>
                          <div className="font-medium text-gray-800 dark:text-white/90">
                            {displayName(actor)}
                          </div>
                          <div className="text-xs text-gray-400">Гишүүн өөрөө</div>
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {row.payment_channel || row.booking_id ? (
                        <div className="max-w-[180px]">
                          {row.payment_channel && (
                            <div className="font-medium text-gray-800 dark:text-white/90">
                              {channelLabel(row.payment_channel)}
                            </div>
                          )}
                          {row.booking_id && (
                            <div
                              className="truncate text-xs text-gray-400"
                              title={row.booking_id}
                            >
                              {row.booking_id}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-flex rounded-md bg-gray-50 px-2 py-0.5 text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                        {sourceLabel(row.source)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            disabled={offset <= 0 || loading}
            onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
          >
            Өмнөх
          </button>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={offset + PAGE_SIZE >= total || loading}
            onClick={() => setOffset((o) => o + PAGE_SIZE)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-700 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300"
          >
            Дараах
          </button>
        </div>
      )}
    </ComponentCard>
  );
}
