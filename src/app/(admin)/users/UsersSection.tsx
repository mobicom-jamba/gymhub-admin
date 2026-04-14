"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import UsersTable from "./UsersTable";
import UserFormModal from "./UserFormModal";
import type { UsersSortColumn } from "./users-sort";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";
import SearchInput from "@/components/common/SearchInput";
import { PlusIcon } from "@/icons";
import { exportToCsv } from "@/lib/csv-export";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import type { Density } from "./UsersTable";
import { toMnErrorMessage } from "@/lib/error-message";
import ColumnToggle from "@/components/ui/ColumnToggle";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import flatpickr from "flatpickr";
import { Mongolian } from "flatpickr/dist/l10n/mn.js";

export type Profile = {
  id: string;
  full_name: string | null;
  surname: string | null;
  given_name: string | null;
  phone: string | null;
  role: string | null;
  organization_id: string | null;
  organization: string | null;
  organizations?: { name: string | null } | Array<{ name: string | null }> | null;
  membership_tier: string | null;
  membership_status: string | null;
  membership_started_at: string | null;
  membership_expires_at: string | null;
  created_at: string;
};

export type OrganizationOption = { id: string; name: string };

type PaidBookingRow = {
  id: string;
  user_id: string | null;
  paid_at: string | null;
  created_at: string | null;
};

function buildOrganizationOptions(
  tableOrganizations: OrganizationOption[],
  profileRows: Profile[],
): OrganizationOption[] {
  const map = new Map<string, OrganizationOption>();
  for (const org of tableOrganizations) {
    const key = org.name.trim().toLowerCase();
    if (!key) continue;
    map.set(key, org);
  }
  for (const p of profileRows) {
    const name = profileOrgName(p)?.trim() ?? "";
    if (!name) continue;
    const key = name.toLowerCase();
    if (!map.has(key)) {
      map.set(key, { id: `legacy:${name}`, name });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name, "mn"));
}

function profileOrgName(p: Profile): string | null {
  const rel = p.organizations;
  if (Array.isArray(rel)) return rel[0]?.name ?? p.organization;
  return rel?.name ?? p.organization;
}

function profileDisplayName(p: Profile): string {
  const full = p.full_name?.trim();
  if (full) return full;
  const fromParts = [p.surname, p.given_name].filter(Boolean).join(" ").trim();
  if (fromParts) return fromParts;
  return p.phone ?? p.id;
}

function isMembershipExpired(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function profileStatus(p: Profile): "active" | "expired" | "inactive" {
  if (p.membership_status === "inactive") return "inactive";
  if (isMembershipExpired(p.membership_expires_at)) return "expired";
  if (p.membership_status === "expired") return "expired";
  return "active";
}

function formatFilterDateLabel(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("mn-MN");
}

function buildLocalDayRange(value: string): { startIso: string; endIso: string } | null {
  if (!value) return null;
  const start = new Date(`${value}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

function isMissingColumnError(message: string | null | undefined, column: string): boolean {
  const text = (message ?? "").toLowerCase();
  return text.includes(`column bookings.${column} does not exist`) || text.includes(`could not find the '${column}' column`);
}

function isMissingTableError(message: string | null | undefined, table: string): boolean {
  const text = (message ?? "").toLowerCase();
  return text.includes(`could not find the table 'public.${table.toLowerCase()}'`) || text.includes(`relation "public.${table.toLowerCase()}" does not exist`);
}

function isLegacyPaidStatus(status: string | null | undefined): boolean {
  const s = (status ?? "").trim().toLowerCase();
  return s === "paid" || s === "completed" || s === "success" || s === "succeeded" || s === "settled" || s === "approved" || s === "done";
}

const DATE_SORT_COLS = new Set<UsersSortColumn>(["startDate", "expireDate"]);

function compareNullableDates(a: string | null, b: string | null, ascending: boolean): number {
  const parse = (s: string | null) => {
    if (!s) return null;
    const t = new Date(s).getTime();
    return Number.isNaN(t) ? null : t;
  };
  const ta = parse(a);
  const tb = parse(b);
  if (ta === null && tb === null) return 0;
  if (ta === null) return 1;
  if (tb === null) return -1;
  const raw = ta === tb ? 0 : ta < tb ? -1 : 1;
  return ascending ? raw : -raw;
}

function tierRank(t: string | null): number {
  const x = (t ?? "").toLowerCase();
  if (x === "early") return 0;
  if (x === "premium") return 1;
  return 2;
}

const PAGE_SIZES = [25, 50, 100, 500];
const USERS_CACHE_TTL_MS = 30_000;
let usersSectionCache: { at: number; profiles: Profile[]; organizations: OrganizationOption[] } | null = null;

type UsersRoleTab = "user" | "admin" | "moderator" | "sales";

function usersTabLabel(tab: UsersRoleTab): string {
  if (tab === "user") return "Гишүүд";
  if (tab === "admin") return "Админ";
  if (tab === "moderator") return "Модератор";
  return "Борлуулалт";
}

export default function UsersSection() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<UsersRoleTab>("user");
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
  const [confirmResetCheckin, setConfirmResetCheckin] = useState<{ id: string; name: string } | null>(null);
  const [resettingCheckin, setResettingCheckin] = useState(false);
  const [density, setDensity] = useState<Density>("comfortable");
  const [visibleColumns, setVisibleColumns] = useLocalStorageState<Record<string, boolean>>("users.table.visibleColumns", {
    member: true, phone: true, organization: true, tier: true, startDate: true, expireDate: true,
  });
  const [sortColumn, setSortColumn] = useState<UsersSortColumn | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [organizationOptions, setOrganizationOptions] = useState<OrganizationOption[]>([]);
  const [paidOnDate, setPaidOnDate] = useState("");
  const [paidBookings, setPaidBookings] = useState<PaidBookingRow[]>([]);
  const [paidBookingsLoading, setPaidBookingsLoading] = useState(false);
  const [paidBookingsError, setPaidBookingsError] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initializedFromQuery = useRef(false);
  const paidDateInputRef = useRef<HTMLInputElement | null>(null);
  const paidDatePickerRef = useRef<flatpickr.Instance | null>(null);

  const PROFILE_SELECT = "id, full_name, phone, role, organization_id, organization, organizations!profiles_organization_id_fkey(name), membership_tier, membership_status, membership_started_at, membership_expires_at, created_at";
  const ORG_SELECT = "id,name";

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

  const fetchAllOrganizationPages = async (): Promise<OrganizationOption[]> => {
    const supabase = createBrowserSupabaseClient();
    const all: OrganizationOption[] = [];
    const PAGE = 1000;

    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("organizations")
        .select(ORG_SELECT)
        .order("name", { ascending: true })
        .range(from, from + PAGE - 1);
      all.push(...((data ?? []) as OrganizationOption[]));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  };

  const fetchProfiles = async () => {
    if (usersSectionCache && Date.now() - usersSectionCache.at < USERS_CACHE_TTL_MS) {
      setProfiles(usersSectionCache.profiles);
      setOrganizationOptions(usersSectionCache.organizations);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const [profilesRes, orgsRes] = await Promise.all([
      fetchAllProfilePages(),
      fetchAllOrganizationPages(),
    ]);
    const { data, error: err } = profilesRes;
    const organizations = buildOrganizationOptions(orgsRes, data);
    setProfiles(data);
    setError(err);
    setOrganizationOptions(organizations);
    usersSectionCache = { at: Date.now(), profiles: data, organizations };
    setLoading(false);
  };

  const silentRefresh = async () => {
    const [profilesRes, orgsRes] = await Promise.all([
      fetchAllProfilePages(),
      fetchAllOrganizationPages(),
    ]);
    const { data, error: err } = profilesRes;
    const organizations = buildOrganizationOptions(orgsRes, data);
    setProfiles(data);
    setOrganizationOptions(organizations);
    usersSectionCache = { at: Date.now(), profiles: data, organizations };
    if (err) setError(err);
  };

  useEffect(() => { fetchProfiles(); }, []);

  useEffect(() => {
    if (loading || tab !== "user" || !paidDateInputRef.current) return;

    paidDatePickerRef.current?.destroy();
    paidDatePickerRef.current = null;

    const instance = flatpickr(paidDateInputRef.current, {
      dateFormat: "Y-m-d",
      locale: Mongolian,
      disableMobile: true,
      allowInput: false,
      clickOpens: true,
      monthSelectorType: "static",
      position: "auto left",
      onChange: (_selectedDates, dateStr) => {
        setPaidOnDate((prev) => (prev === dateStr ? prev : dateStr));
        setPage(1);
        setSelectedIds(new Set());
      },
    });

    paidDatePickerRef.current = instance;

    return () => {
      instance.destroy();
      paidDatePickerRef.current = null;
    };
  }, [loading, tab]);

  useEffect(() => {
    const picker = paidDatePickerRef.current;
    if (!picker) return;

    if (paidOnDate) {
      picker.setDate(paidOnDate, false, "Y-m-d");
    } else {
      picker.clear(false);
    }
  }, [paidOnDate]);

  useEffect(() => {
    if (initializedFromQuery.current) return;
    const q = searchParams.get("q");
    const status = searchParams.get("status");
    const org = searchParams.get("org");
    const role = searchParams.get("role");
    const paidOn = searchParams.get("paidOn");
    if (q) setSearch(q);
    if (status) setStatusFilter(status);
    if (org) setOrgFilter(org);
    if (paidOn) setPaidOnDate(paidOn);
    if (role === "user" || role === "admin" || role === "moderator" || role === "sales") setTab(role);
    initializedFromQuery.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (!initializedFromQuery.current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (search) params.set("q", search); else params.delete("q");
    if (statusFilter) params.set("status", statusFilter); else params.delete("status");
    if (orgFilter) params.set("org", orgFilter); else params.delete("org");
    if (paidOnDate) params.set("paidOn", paidOnDate); else params.delete("paidOn");
    if (tab && tab !== "user") params.set("role", tab); else params.delete("role");
    params.delete("page");
    const next = params.toString();
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [search, statusFilter, orgFilter, paidOnDate, tab, pathname, router, searchParams]);

  const organizations = useMemo(() => {
    const orgs = [...new Set(
      profiles
        .map((p) => profileOrgName(p))
        .filter(Boolean)
    )] as string[];
    return orgs.sort((a, b) => a.localeCompare(b));
  }, [profiles]);

  useEffect(() => {
    let cancelled = false;

    if (!paidOnDate) {
      setPaidBookings([]);
      setPaidBookingsError(null);
      setPaidBookingsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const range = buildLocalDayRange(paidOnDate);
    if (!range) {
      setPaidBookings([]);
      setPaidBookingsError("Төлбөрийн огноо буруу байна.");
      setPaidBookingsLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const loadPaidBookings = async () => {
      setPaidBookingsLoading(true);
      setPaidBookingsError(null);

      const supabase = createBrowserSupabaseClient();
      let { data, error: bookingsError } = await supabase
        .from("bookings")
        .select("id, user_id, paid_at, created_at")
        .eq("payment_status", "paid")
        .gte("paid_at", range.startIso)
        .lt("paid_at", range.endIso)
        .order("paid_at", { ascending: false });

      if (bookingsError && isMissingColumnError(bookingsError.message, "paid_at")) {
        const fallback = await supabase
          .from("bookings")
          .select("id, user_id, created_at")
          .eq("payment_status", "paid")
          .gte("created_at", range.startIso)
          .lt("created_at", range.endIso)
          .order("created_at", { ascending: false });

        data = (fallback.data ?? []).map((row) => ({
          ...row,
          paid_at: row.created_at ?? null,
        }));
        bookingsError = fallback.error;
      }

      if (bookingsError && isMissingColumnError(bookingsError.message, "payment_status")) {
        let legacySelect = "id, user_id, status, paid_at, created_at";
        let legacyProbe = await supabase.from("lending_records").select(legacySelect).limit(1);

        if (legacyProbe.error?.message?.toLowerCase().includes("paid_at")) {
          legacySelect = "id, user_id, status, created_at";
          legacyProbe = await supabase.from("lending_records").select(legacySelect).limit(1);
        }

        if (!legacyProbe.error) {
          const legacyRows = await supabase
            .from("lending_records")
            .select(legacySelect)
            .gte("created_at", range.startIso)
            .lt("created_at", range.endIso)
            .order("created_at", { ascending: false });

          if (!legacyRows.error) {
            const legacyData = (legacyRows.data ?? []) as unknown as Record<string, unknown>[];
            data = legacyData.reduce<PaidBookingRow[]>((acc, row) => {
              if (!row || typeof row !== "object") return acc;

              const status = typeof row.status === "string" ? row.status : null;
              if (!isLegacyPaidStatus(typeof status === "string" ? status : null)) return acc;

              const id = typeof row.id === "string" ? row.id : null;
              if (!id) return acc;

              const userId = typeof row.user_id === "string" ? row.user_id : null;
              const paidAt = typeof row.paid_at === "string" ? row.paid_at : null;
              const createdAt = typeof row.created_at === "string" ? row.created_at : null;

              acc.push({
                id,
                user_id: userId,
                paid_at: paidAt ?? createdAt,
                created_at: createdAt,
              });
              return acc;
            }, []);
            bookingsError = null;
          } else {
            bookingsError = legacyRows.error;
          }
        }
      }

      if (
        bookingsError &&
        (
          isMissingColumnError(bookingsError.message, "payment_status") ||
          isMissingTableError(bookingsError.message, "lending_records")
        )
      ) {
        data = profiles
          .filter((profile) => {
            if ((profile.role ?? "user") !== "user") return false;
            if (!profile.membership_started_at) return false;
            const startedAt = new Date(profile.membership_started_at).toISOString();
            return startedAt >= range.startIso && startedAt < range.endIso;
          })
          .map((profile) => ({
            id: `profile-${profile.id}`,
            user_id: profile.id,
            paid_at: profile.membership_started_at,
            created_at: profile.membership_started_at,
          }));
        bookingsError = null;
      }

      if (cancelled) return;

      if (bookingsError) {
        setPaidBookings([]);
        setPaidBookingsError(bookingsError.message);
      } else {
        setPaidBookings((data ?? []) as PaidBookingRow[]);
        setPaidBookingsError(null);
      }

      setPaidBookingsLoading(false);
    };

    loadPaidBookings();

    return () => {
      cancelled = true;
    };
  }, [paidOnDate, profiles]);

  const paidUserIds = useMemo(() => {
    const ids = new Set<string>();
    for (const booking of paidBookings) {
      if (booking.user_id) ids.add(booking.user_id);
    }
    return ids;
  }, [paidBookings]);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if ((p.role ?? "user") !== tab) return false;
      if (tab === "user" && paidOnDate && !paidUserIds.has(p.id)) return false;
      const orgName = profileOrgName(p);
      if (orgFilter && orgName !== orgFilter) return false;
      if (statusFilter && profileStatus(p) !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matches =
          p.full_name?.toLowerCase().includes(q) ||
          p.surname?.toLowerCase().includes(q) ||
          p.given_name?.toLowerCase().includes(q) ||
          p.phone?.toLowerCase().includes(q) ||
          orgName?.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
  }, [profiles, search, tab, orgFilter, statusFilter, paidOnDate, paidUserIds]);

  const sortedFilteredProfiles = useMemo(() => {
    if (!sortColumn) return filteredProfiles;
    const list = [...filteredProfiles];
    const asc = sortDir === "asc";

    list.sort((a, b) => {
      let cmp = 0;
      switch (sortColumn) {
        case "member":
          cmp = (a.full_name ?? "").localeCompare(b.full_name ?? "", "mn", { sensitivity: "base" });
          break;
        case "phone":
          cmp = (a.phone ?? "").localeCompare(b.phone ?? "", undefined, { numeric: true });
          break;
        case "organization":
          cmp = (profileOrgName(a) ?? "").localeCompare(profileOrgName(b) ?? "", "mn", { sensitivity: "base" });
          break;
        case "tier": {
          const tr = tierRank(a.membership_tier) - tierRank(b.membership_tier);
          cmp = tr !== 0 ? tr : (a.membership_tier ?? "").localeCompare(b.membership_tier ?? "", "en", { sensitivity: "base" });
          break;
        }
        case "startDate":
          cmp = compareNullableDates(a.membership_started_at, b.membership_started_at, asc);
          break;
        case "expireDate":
          cmp = compareNullableDates(a.membership_expires_at, b.membership_expires_at, asc);
          break;
        default:
          break;
      }
      if (sortColumn === "startDate" || sortColumn === "expireDate") {
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      }
      if (cmp !== 0) return asc ? cmp : -cmp;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [filteredProfiles, sortColumn, sortDir]);

  const handleColumnSort = (column: UsersSortColumn) => {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir(DATE_SORT_COLS.has(column) ? "desc" : "asc");
    }
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(sortedFilteredProfiles.length / pageSize));
  const pagedProfiles = sortedFilteredProfiles.slice((page - 1) * pageSize, page * pageSize);

  const resetPage = () => setPage(1);

  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const auth: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    return auth;
  };

  const handleRoleChange = async (profileId: string, newRole: string) => {
    setProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p));
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const res = await fetch(`/api/admin/users/${profileId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } as Record<string, string> : {}),
      },
      body: JSON.stringify({ role: newRole }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
      toast.show(toMnErrorMessage(data.message || data.error || ""), "error");
      silentRefresh();
    }
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
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE", headers });
    const data = await res.json();
    if (!res.ok) { toast.show(toMnErrorMessage((data && (data.message || data.error)) ?? ""), "error"); silentRefresh(); }
  };

  const handleResetCheckinConfirm = async () => {
    if (!confirmResetCheckin) return;
    const { id, name } = confirmResetCheckin;
    setResettingCheckin(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        toast.show("Нэвтэрнэ үү.", "error");
        return;
      }
      const res = await fetch("/api/admin/reset-user-daily-checkin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ user_id: id }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; deleted?: number };
      if (!res.ok) {
        toast.show(toMnErrorMessage(data.error ?? ""), "error");
        return;
      }
      const n = data.deleted ?? 0;
      if (n > 0) {
        toast.show(`${n} ирцийн бүртгэл устгагдлаа. «${name}» өнөөдөр дахин орох боломжтой.`);
      } else {
        toast.show("Өнөөдрийн ирцийн бүртгэл байсангүй.");
      }
    } finally {
      setResettingCheckin(false);
      setConfirmResetCheckin(null);
    }
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
      const headers = await getAuthHeaders();
      await Promise.all(ids.map((id) =>
        fetch(`/api/admin/users/${id}`, { method: "DELETE", headers })
      ));
    } catch { toast.show("Хэрэглэгч устгах үед алдаа гарлаа. Дахин оролдоно уу.", "error"); silentRefresh(); }
    finally { setBulkDeleting(false); }
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
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        </div>
      </ComponentCard>
    );
  }

  const adminCount = profiles.filter(p => (p.role ?? "user") === "admin").length;
  const moderatorCount = profiles.filter(p => (p.role ?? "user") === "moderator").length;
  const userCount  = profiles.filter(p => (p.role ?? "user") === "user").length;
  const salesCount = profiles.filter(p => (p.role ?? "user") === "sales").length;
  const paidDayLabel = formatFilterDateLabel(paidOnDate);
  const paidUsersCount = paidUserIds.size;
  const paidCount = paidBookings.length;
  const filterChips = [
    search ? { key: "q", label: `Хайлт: ${search}`, clear: () => setSearch("") } : null,
    statusFilter
      ? {
          key: "status",
          label: `Төлөв: ${
            statusFilter === "active"
              ? "Идэвхтэй"
              : statusFilter === "inactive"
                  ? "Идэвхгүй"
                  : "Дууссан"
          }`,
          clear: () => setStatusFilter(""),
        }
      : null,
    orgFilter ? { key: "org", label: `Байгууллага: ${orgFilter}`, clear: () => setOrgFilter("") } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; clear: () => void }>;

  return (
    <>
      {/* ── Role Tabs ── */}
      <div className="mb-4 flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-white/[0.08] dark:bg-gray-900" style={{ width: "fit-content" }}>
        {(["user", "admin", "moderator", "sales"] as const).map((r) => {
          const label = usersTabLabel(r);
          const count = r === "user" ? userCount : r === "admin" ? adminCount : r === "moderator" ? moderatorCount : salesCount;
          const active = tab === r;
          return (
            <button
              key={r}
              onClick={() => {
                setTab(r);
                if (r !== "user") setPaidOnDate("");
                setPage(1);
                setPageSize(25);
                setSelectedIds(new Set());
              }}
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
        title={`${usersTabLabel(tab)} — ${sortedFilteredProfiles.length.toLocaleString()}`}
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
              {([
                ["", "Бүгд"],
                ["active", "✅ Идэвх"],
                ["inactive", "⏸ Идэвхгүй"],
                ["expired", "⛔ Дууссан"],
              ] as const).map(([v, label]) => (
                <button key={v} type="button"
                  onClick={() => { setStatusFilter(v); resetPage(); }}
                  className={`h-8 rounded-lg px-3 text-xs font-medium transition-all ${
                    statusFilter === v
                      ? v === "active" ? "bg-emerald-500 text-white shadow-sm"
                        : v === "inactive" ? "bg-amber-500 text-white shadow-sm"
                        : v === "expired" ? "bg-red-500 text-white shadow-sm"
                        : "bg-white text-gray-700 shadow-sm dark:bg-gray-700 dark:text-white"
                      : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  }`}>{label}
                </button>
              ))}
            </div>

            {tab === "user" && (
              <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 transition-all ${
                paidBookingsLoading
                  ? "border-brand-300 bg-brand-50/70 shadow-sm dark:border-brand-700 dark:bg-brand-900/20"
                  : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800/60"
              }`}>
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">Төлбөрийн өдөр</span>
                <div className="relative">
                  <input
                    ref={paidDateInputRef}
                    placeholder="YYYY-MM-DD"
                    onFocus={() => paidDatePickerRef.current?.open()}
                    onClick={() => paidDatePickerRef.current?.open()}
                    readOnly
                    className="h-9 rounded-lg border border-gray-200 bg-white px-3 pr-9 text-sm text-gray-700 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10m-13 9h16a1 1 0 001-1V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a1 1 0 001 1z" />
                    </svg>
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPaidOnDate(new Date().toISOString().slice(0, 10));
                    setPage(1);
                    setSelectedIds(new Set());
                  }}
                  disabled={paidBookingsLoading}
                  className="inline-flex h-8 items-center gap-2 rounded-lg border border-gray-200 px-3 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:cursor-wait disabled:opacity-70 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                >
                  {paidBookingsLoading && (
                    <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  )}
                  Өнөөдөр
                </button>
                {paidOnDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaidOnDate("");
                      setPage(1);
                      setSelectedIds(new Set());
                    }}
                    disabled={paidBookingsLoading}
                    className="h-8 rounded-lg border border-red-200 px-3 text-xs font-medium text-red-500 hover:bg-red-50 disabled:cursor-wait disabled:opacity-70 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                  >
                    Арилгах
                  </button>
                )}
                {paidOnDate && (
                  <span className={`text-xs ${paidBookingsLoading ? "font-semibold text-brand-600 dark:text-brand-300" : "text-gray-500 dark:text-gray-400"}`}>
                    {paidBookingsLoading
                      ? "Төлбөрийн мэдээлэл ачаалж байна..."
                      : `${paidUsersCount} хэрэглэгч · ${paidCount} төлбөр`}
                  </span>
                )}
              </div>
            )}

            {(search || orgFilter || statusFilter || paidOnDate) && (
              <button
                onClick={() => { setSearch(""); setOrgFilter(""); setStatusFilter(""); setPaidOnDate(""); setSelectedIds(new Set()); resetPage(); }}
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
            <ColumnToggle
              options={[
                { key: "member", label: "Гишүүн" },
                { key: "phone", label: "Утас" },
                { key: "organization", label: "Байгууллага" },
                { key: "tier", label: "Тариф · төрөл" },
                { key: "startDate", label: "Эхлэх огноо" },
                { key: "expireDate", label: "Дуусах огноо" },
              ]}
              visible={visibleColumns}
              onChange={setVisibleColumns}
            />

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
          {filterChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {filterChips.map((chip) => (
                <button
                  key={chip.key}
                  onClick={chip.clear}
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                >
                  {chip.label} ✕
                </button>
              ))}
              <button
                onClick={() => { setSearch(""); setOrgFilter(""); setStatusFilter(""); setPaidOnDate(""); setSelectedIds(new Set()); resetPage(); }}
                className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
              >
                Бүгдийг цэвэрлэх
              </button>
            </div>
          )}
          {tab === "user" && paidOnDate && paidBookingsLoading && (
            <div className="flex justify-center py-4">
              <div className="size-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent dark:border-brand-400" />
            </div>
          )}
          {tab === "user" && paidOnDate && !paidBookingsLoading && !paidBookingsError && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-900/20 dark:text-emerald-300">
              Нийт төлбөрийн тоо: {paidCount}.
            </div>
          )}
          {tab === "user" && paidBookingsError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
              Төлбөрийн огнооны шүүлтүүр ачаалахад алдаа гарлаа: {paidBookingsError}
            </div>
          )}
        </div>

        <UsersTable
          profiles={pagedProfiles}
          error={error ?? undefined}
          loading={loading}
          density={density}
          onRoleChange={handleRoleChange}
          onEdit={(p) => setFormProfile(p)}
          onDelete={handleDelete}
          onResetDailyCheckin={
            tab === "user" ? (p) => setConfirmResetCheckin({ id: p.id, name: profileDisplayName(p) }) : undefined
          }
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onToggleSelectAll={toggleSelectAll}
          visibleColumns={visibleColumns}
          sortColumn={sortColumn}
          sortDir={sortDir}
          onSort={handleColumnSort}
        />

        {/* ── Pagination ── */}
        {(totalPages > 1 || sortedFilteredProfiles.length > 25) && (
          <div className="mt-5 flex items-center justify-between">
            {/* Left: count + page size */}
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <span className="tabular-nums">
                {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, sortedFilteredProfiles.length)}
                <span className="mx-1 text-gray-300">/</span>
                {sortedFilteredProfiles.length.toLocaleString()}
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
        organizations={organizationOptions}
        onOrganizationsRefresh={silentRefresh}
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

      <ConfirmModal
        isOpen={confirmResetCheckin !== null}
        title="Өнөөдрийн ирц цэвэрлэх үү?"
        message={
          confirmResetCheckin
            ? `«${confirmResetCheckin.name}» хэрэглэгчийн өнөөдрийн ирцийн бүртгэлүүдийг бүрэн устгана. Устгасны дараа тухайн өдөрт фитнесэд дахин нэвтрэх боломжтой болно.`
            : undefined
        }
        confirmLabel={resettingCheckin ? "Түр хүлээнэ үү..." : "Цэвэрлэх"}
        onConfirm={handleResetCheckinConfirm}
        onCancel={() => !resettingCheckin && setConfirmResetCheckin(null)}
        loading={resettingCheckin}
      />
    </>
  );
}
