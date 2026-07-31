"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import UsersTable from "./UsersTable";
import UserFormModal from "./UserFormModal";
import UserStatsPanel from "./UserStatsPanel";
import UserNoteModal, { type UserSalesNote } from "./UserNoteModal";
import { fetchAllUserSalesNotes, patchUserSalesNotesCache } from "@/lib/user-sales-notes";
import { fetchAllPagesParallel } from "@/lib/fetch-all-pages";
import { fetchUserVisitStats, type UserVisitStatsMap } from "./user-visit-stats";
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
import { useAuth } from "@/context/AuthContext";

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
  avatar_path?: string | null;
  /** Precomputed public URL for avatar_path (best-effort) */
  avatar_url?: string | null;
  membership_tier: string | null;
  membership_status: string | null;
  membership_started_at: string | null;
  membership_expires_at: string | null;
  agreement_accepted_at?: string | null;
  agreement_version?: string | null;
  created_at: string;
};

export type OrganizationOption = { id: string; name: string };

type PaidBookingRow = {
  id: string;
  user_id: string | null;
  paid_at: string | null;
  created_at: string | null;
  payment_channel?: string | null;
  qpay_invoice_id?: string | null;
};

/** Early төлбөрийн төрөл: 150k эхний сар / 330k үлдэгдэл */
type EarlyPaymentFilter = "" | "early_first" | "early_rest";

function isEarlyFirstBookingId(id: string): boolean {
  return id.startsWith("membership-early-first-");
}

function isEarlyRestBookingId(id: string): boolean {
  return id.startsWith("membership-early-rest-");
}

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

function profileStatus(p: Profile): "active" | "expired" | "inactive" | "paused" {
  if (p.membership_status === "paused") return "paused";
  if (p.membership_status === "inactive") return "inactive";
  if (isMembershipExpired(p.membership_expires_at)) return "expired";
  if (p.membership_status === "expired") return "expired";
  return "active";
}

/** Mongolia calendar date YYYY-MM-DD (Asia/Ulaanbaatar). */
function getTodayDateStringUB(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ulaanbaatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function formatFilterDateLabel(value: string): string {
  if (!value) return "";
  const parsed = new Date(`${value}T12:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("mn-MN", { timeZone: "Asia/Ulaanbaatar" });
}

/** Day bounds for YYYY-MM-DD in Asia/Ulaanbaatar (UTC+8, no DST). */
function buildLocalDayRange(value: string): { startIso: string; endIso: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const start = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime())) return null;
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

/** Fallback only: paid-day evidence from active profiles (never include Төлөөгүй). */
function activeProfilesStartedInRange(
  profileRows: Profile[],
  range: { startIso: string; endIso: string },
): PaidBookingRow[] {
  const startMs = new Date(range.startIso).getTime();
  const endMs = new Date(range.endIso).getTime();
  return profileRows
    .filter((profile) => {
      if ((profile.role ?? "user") !== "user") return false;
      const status = (profile.membership_status ?? "inactive").trim().toLowerCase();
      if (status !== "active" && status !== "expired") return false;
      if (!profile.membership_started_at) return false;
      const t = new Date(profile.membership_started_at).getTime();
      return !Number.isNaN(t) && t >= startMs && t < endMs;
    })
    .map((profile) => ({
      id: `profile-start-${profile.id}`,
      user_id: profile.id,
      paid_at: profile.membership_started_at,
      created_at: profile.membership_started_at,
      payment_channel: null,
    }));
}

function isMissingColumnError(message: string | null | undefined, column: string): boolean {
  const text = (message ?? "").toLowerCase();
  return text.includes(`column bookings.${column} does not exist`) || text.includes(`could not find the '${column}' column`);
}

function isMissingProfilesColumnError(message: string | null | undefined, column: string): boolean {
  const text = (message ?? "").toLowerCase();
  return text.includes(`column profiles.${column} does not exist`) || text.includes(`could not find the '${column}' column`);
}

function isMissingTableError(message: string | null | undefined, table: string): boolean {
  const text = (message ?? "").toLowerCase();
  return text.includes(`could not find the table 'public.${table.toLowerCase()}'`) || text.includes(`relation "public.${table.toLowerCase()}" does not exist`);
}

const DATE_SORT_COLS = new Set<UsersSortColumn>(["startDate", "expireDate", "lastVisit"]);
const DESC_FIRST_SORT_COLS = new Set<UsersSortColumn>(["startDate", "expireDate", "lastVisit", "totalVisits", "streak"]);

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
  if (x === "early" || x === "standard" || x === "standard3") return 0;
  if (x === "smart1" || x === "premium1") return 1;
  if (x === "premium" || x === "premium2" || x === "smart2") return 2;
  if (x === "premium4" || x === "gymcore") return 3;
  return 4;
}

const PAGE_SIZES = [25, 50, 100, 500];
const USERS_CACHE_TTL_MS = 30_000;
let usersSectionCache: { at: number; profiles: Profile[]; organizations: OrganizationOption[] } | null = null;
let visitStatsCache: { at: number; stats: UserVisitStatsMap } | null = null;
const VISIT_STATS_CACHE_TTL_MS = 60_000;

type UsersRoleTab = "user" | "admin" | "moderator" | "sales";

function usersTabLabel(tab: UsersRoleTab): string {
  if (tab === "user") return "Гишүүд";
  if (tab === "admin") return "Админ";
  if (tab === "moderator") return "Модератор";
  return "Борлуулалт";
}

export default function UsersSection() {
  const { can } = useAuth();
  const canManageUsers = can("users.manage");
  // Зөвхөн модератор — админ UserFormModal-оор солино, шинэ reset товч харагдахгүй
  const canResetPassword = can("users.password.reset") && !canManageUsers;
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
  const [confirmResetPassword, setConfirmResetPassword] = useState<{ id: string; name: string } | null>(null);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [density, setDensity] = useState<Density>("comfortable");
  const [visibleColumns, setVisibleColumns] = useLocalStorageState<Record<string, boolean>>("users.table.visibleColumns", {
    member: true, phone: true, organization: true, tier: true, paymentChannel: true, agreement: true, startDate: true, expireDate: true,
    totalVisits: false, lastVisit: false, streak: false,
  });
  const [statsMap, setStatsMap] = useState<UserVisitStatsMap | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [panelProfile, setPanelProfile] = useState<Profile | null>(null);
  const [notesMap, setNotesMap] = useState<Record<string, UserSalesNote>>({});
  const [noteProfile, setNoteProfile] = useState<Profile | null>(null);
  const [sortColumn, setSortColumn] = useState<UsersSortColumn | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [organizationOptions, setOrganizationOptions] = useState<OrganizationOption[]>([]);
  const [paidOnDate, setPaidOnDate] = useState("");
  const [paidBookings, setPaidBookings] = useState<PaidBookingRow[]>([]);
  const [paidBookingsLoading, setPaidBookingsLoading] = useState(false);
  const [paidBookingsError, setPaidBookingsError] = useState<string | null>(null);
  const [paymentChannelByUser, setPaymentChannelByUser] = useState<Record<string, string>>({});
  const [earlyPaymentFilter, setEarlyPaymentFilter] = useState<EarlyPaymentFilter>("");
  const [earlyPaymentUserIds, setEarlyPaymentUserIds] = useState<Set<string>>(new Set());
  const [earlyPaymentLoading, setEarlyPaymentLoading] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initializedFromQuery = useRef(false);
  const paidDateInputRef = useRef<HTMLInputElement | null>(null);
  const paidDatePickerRef = useRef<flatpickr.Instance | null>(null);

  const PROFILE_SELECT_BASE = "id, full_name, phone, role, organization_id, organization, organizations!profiles_organization_id_fkey(name), avatar_path, membership_tier, membership_status, membership_started_at, membership_expires_at, created_at";
  const PROFILE_SELECT = `${PROFILE_SELECT_BASE}, agreement_accepted_at, agreement_version`;
  const ORG_SELECT = "id,name";

  const toAvatarUrl = (supabase: ReturnType<typeof createBrowserSupabaseClient>, raw: string | null | undefined): string | null => {
    const v = String(raw ?? "").trim();
    if (!v) return null;
    if (/^https?:\/\//i.test(v)) return v;
    let safePath = v.startsWith("/") ? v.slice(1) : v;
    if (safePath.startsWith("media-public/")) safePath = safePath.slice("media-public/".length);
    if (!safePath) return null;
    // Use Supabase image rendering endpoint for fast thumbnails (much smaller payload than original image).
    const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
    if (base) {
      const url =
        `${base}/storage/v1/render/image/public/media-public/${encodeURI(safePath)}` +
        `?width=96&height=96&resize=cover&quality=60`;
      return url;
    }
    return supabase.storage.from("media-public").getPublicUrl(safePath).data.publicUrl || null;
  };

  const fetchAllProfilePages = async (): Promise<{ data: Profile[]; error: string | null }> => {
    const supabase = createBrowserSupabaseClient();
    const PAGE = 1000;

    const load = (select: string, omitAgreement: boolean) =>
      fetchAllPagesParallel<Profile>({
        pageSize: PAGE,
        getCount: async () => {
          const res = await supabase.from("profiles").select("id", { count: "exact", head: true });
          return { count: res.count, error: res.error };
        },
        fetchPage: async (from, to) => {
          const res = await supabase
            .from("profiles")
            .select(select)
            .order("created_at", { ascending: false })
            .range(from, to);
          if (res.error) return { data: null, error: res.error };
          const rows = ((res.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => {
            const mapped = omitAgreement
              ? { ...row, agreement_accepted_at: null, agreement_version: null }
              : row;
            return {
              ...mapped,
              avatar_url: toAvatarUrl(supabase, mapped.avatar_path as string | null | undefined),
            } as Profile;
          });
          return { data: rows, error: null };
        },
      });

    const first = await load(PROFILE_SELECT, false);
    if (
      first.error &&
      isMissingProfilesColumnError(first.error, "agreement_accepted_at")
    ) {
      return load(PROFILE_SELECT_BASE, true);
    }
    return first;
  };

  const fetchAllOrganizationPages = async (): Promise<OrganizationOption[]> => {
    const supabase = createBrowserSupabaseClient();
    const { data } = await fetchAllPagesParallel<OrganizationOption>({
      pageSize: 1000,
      getCount: async () => {
        const res = await supabase.from("organizations").select("id", { count: "exact", head: true });
        return { count: res.count, error: res.error };
      },
      fetchPage: async (from, to) => {
        const res = await supabase
          .from("organizations")
          .select(ORG_SELECT)
          .order("name", { ascending: true })
          .range(from, to);
        return { data: (res.data as OrganizationOption[] | null) ?? null, error: res.error };
      },
    });
    return data;
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

  const fetchNotes = async () => {
    try {
      const map = await fetchAllUserSalesNotes();
      setNotesMap(map);
    } catch { /* чимээгүй алдаа */ }
  };

  useEffect(() => { fetchProfiles(); fetchNotes(); }, []);

  // Visit stats зөвхөн багана/panel/sort хэрэгтэй үед — эхний load-ийг хөнгөлнө.
  const needsVisitStats =
    !!panelProfile ||
    !!visibleColumns.totalVisits ||
    !!visibleColumns.lastVisit ||
    !!visibleColumns.streak ||
    sortColumn === "totalVisits" ||
    sortColumn === "lastVisit" ||
    sortColumn === "streak";

  useEffect(() => {
    if (profiles.length === 0 || !needsVisitStats) return;
    if (visitStatsCache && Date.now() - visitStatsCache.at < VISIT_STATS_CACHE_TTL_MS) {
      setStatsMap(visitStatsCache.stats);
      return;
    }
    let cancelled = false;
    setStatsLoading(true);
    (async () => {
      const { stats, error: err } = await fetchUserVisitStats(profiles.map((p) => p.id));
      if (cancelled) return;
      if (!err) {
        visitStatsCache = { at: Date.now(), stats };
        setStatsMap(stats);
      }
      setStatsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profiles, needsVisitStats]);

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
    const earlyPay = searchParams.get("earlyPay");
    if (q) setSearch(q);
    if (status) setStatusFilter(status);
    if (org) setOrgFilter(org);
    if (paidOn) setPaidOnDate(paidOn);
    if (earlyPay === "first") setEarlyPaymentFilter("early_first");
    if (earlyPay === "rest") setEarlyPaymentFilter("early_rest");
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
    if (earlyPaymentFilter === "early_first") params.set("earlyPay", "first");
    else if (earlyPaymentFilter === "early_rest") params.set("earlyPay", "rest");
    else params.delete("earlyPay");
    if (tab && tab !== "user") params.set("role", tab); else params.delete("role");
    params.delete("page");
    const next = params.toString();
    const current = searchParams.toString();
    if (next === current) return;
    router.replace(next ? `${pathname}?${next}` : pathname);
  }, [search, statusFilter, orgFilter, paidOnDate, earlyPaymentFilter, tab, pathname, router, searchParams]);

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
      let rows: PaidBookingRow[] = [];
      let bookingsError: string | null = null;

      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
        const qs = new URLSearchParams({
          start: range.startIso,
          end: range.endIso,
        });
        const res = await fetch(`/api/admin/paid-day?${qs}`, { headers });
        const json = (await res.json()) as {
          ok?: boolean;
          rows?: PaidBookingRow[];
          error?: string;
        };
        if (!res.ok) {
          throw new Error(json.error || "Төлбөрийн жагсаалт ачаалахад алдаа гарлаа.");
        }
        rows = Array.isArray(json.rows) ? json.rows : [];
      } catch (e) {
        // Fallback: browser bookings query (no Flexy) if admin API fails.
        bookingsError = e instanceof Error ? e.message : String(e);
        const res = await supabase
          .from("bookings")
          .select("id, user_id, paid_at, created_at, payment_channel, qpay_invoice_id")
          .eq("payment_status", "paid")
          .gte("paid_at", range.startIso)
          .lt("paid_at", range.endIso)
          .order("paid_at", { ascending: false });
        if (!res.error) {
          rows = (res.data as PaidBookingRow[] | null) ?? [];
          bookingsError = null;
        } else if (
          isMissingColumnError(res.error.message, "payment_status") ||
          isMissingTableError(res.error.message, "bookings")
        ) {
          // Last resort only — active members; never Төлөөгүй.
          rows = activeProfilesStartedInRange(profiles, range);
          bookingsError = null;
        } else {
          bookingsError = res.error.message;
        }
      }

      if (cancelled) return;

      if (bookingsError) {
        setPaidBookings([]);
        setPaidBookingsError(bookingsError);
      } else {
        // API already merges bookings + Flexy + activations; do not merge raw profile dates
        // (that pulled in admin-set / unpaid "Төлөөгүй" members).
        setPaidBookings(rows);
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

  /** From date-filter paid bookings: first (latest) channel per user. */
  const paidFilterChannelByUser = useMemo(() => {
    const map: Record<string, string> = {};
    for (const booking of paidBookings) {
      if (!booking.user_id || map[booking.user_id]) continue;
      const ch = (booking.payment_channel ?? "").trim();
      if (ch) map[booking.user_id] = ch;
      else if (booking.qpay_invoice_id) map[booking.user_id] = "qpay";
    }
    return map;
  }, [paidBookings]);

  /** Төлбөрийн өдөр шүүлт: тухайн өдрийн booking id (Early үлдэгдэл гэх мэт label-д). */
  const paidBookingIdByUser = useMemo(() => {
    const map: Record<string, string> = {};
    for (const booking of paidBookings) {
      if (!booking.user_id || !booking.id || map[booking.user_id]) continue;
      map[booking.user_id] = booking.id;
    }
    return map;
  }, [paidBookings]);

  /** Early 150k/330k: төлбөрийн өдөр сонгосон бол paidBookings-оос, үгүй бол API-аас. */
  const earlyFilteredUserIds = useMemo(() => {
    if (!earlyPaymentFilter) return null;
    if (paidOnDate) {
      const ids = new Set<string>();
      const match =
        earlyPaymentFilter === "early_first" ? isEarlyFirstBookingId : isEarlyRestBookingId;
      for (const booking of paidBookings) {
        if (booking.user_id && booking.id && match(booking.id)) {
          ids.add(booking.user_id);
        }
      }
      return ids;
    }
    return earlyPaymentUserIds;
  }, [earlyPaymentFilter, paidOnDate, paidBookings, earlyPaymentUserIds]);

  // Өдөргүй үед Early төлбөр төлсөн user_id-уудыг API-аас ачаална
  useEffect(() => {
    let cancelled = false;

    if (tab !== "user" || !earlyPaymentFilter || paidOnDate) {
      if (!earlyPaymentFilter) setEarlyPaymentUserIds(new Set());
      setEarlyPaymentLoading(false);
      return () => {
        cancelled = true;
      };
    }

    const load = async () => {
      setEarlyPaymentLoading(true);
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const headers: Record<string, string> = {};
        if (session?.access_token) {
          headers.Authorization = `Bearer ${session.access_token}`;
        }
        const res = await fetch(
          `/api/admin/early-payments?kind=${earlyPaymentFilter}`,
          { headers },
        );
        const json = (await res.json()) as { userIds?: string[]; error?: string };
        if (!res.ok) throw new Error(json.error || "Early төлбөрийн жагсаалт ачаалахад алдаа.");
        if (cancelled) return;
        setEarlyPaymentUserIds(new Set(Array.isArray(json.userIds) ? json.userIds : []));
      } catch {
        if (!cancelled) setEarlyPaymentUserIds(new Set());
      } finally {
        if (!cancelled) setEarlyPaymentLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [tab, earlyPaymentFilter, paidOnDate]);

  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if ((p.role ?? "user") !== tab) return false;
      if (tab === "user" && paidOnDate && !paidUserIds.has(p.id)) return false;
      if (tab === "user" && earlyFilteredUserIds && !earlyFilteredUserIds.has(p.id)) return false;
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
  }, [profiles, search, tab, orgFilter, statusFilter, paidOnDate, paidUserIds, earlyFilteredUserIds]);

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
        case "lastVisit": {
          const sa = statsMap?.[a.id]?.lastVisitAt ?? null;
          const sb = statsMap?.[b.id]?.lastVisitAt ?? null;
          cmp = compareNullableDates(sa, sb, asc);
          break;
        }
        case "totalVisits":
          cmp = (statsMap?.[a.id]?.total ?? 0) - (statsMap?.[b.id]?.total ?? 0);
          break;
        case "streak":
          cmp = (statsMap?.[a.id]?.streakDays ?? 0) - (statsMap?.[b.id]?.streakDays ?? 0);
          break;
        default:
          break;
      }
      if (DATE_SORT_COLS.has(sortColumn)) {
        if (cmp !== 0) return cmp;
        return a.id.localeCompare(b.id);
      }
      if (cmp !== 0) return asc ? cmp : -cmp;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [filteredProfiles, sortColumn, sortDir, statsMap]);

  const handleColumnSort = (column: UsersSortColumn) => {
    if (sortColumn === column) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDir(DESC_FIRST_SORT_COLS.has(column) ? "desc" : "asc");
    }
    setPage(1);
  };

  const totalPages = Math.max(1, Math.ceil(sortedFilteredProfiles.length / pageSize));
  const pagedProfiles = sortedFilteredProfiles.slice((page - 1) * pageSize, page * pageSize);
  const pagedProfileIdsKey = pagedProfiles.map((p) => p.id).join(",");

  // Latest paid payment channel for visible users (only after successful payment).
  useEffect(() => {
    if (tab !== "user") {
      setPaymentChannelByUser({});
      return;
    }

    if (paidOnDate) {
      setPaymentChannelByUser(paidFilterChannelByUser);
      return;
    }

    const ids = pagedProfileIdsKey ? pagedProfileIdsKey.split(",") : [];
    if (ids.length === 0) {
      setPaymentChannelByUser({});
      return;
    }

    let cancelled = false;
    const loadChannels = async () => {
      const supabase = createBrowserSupabaseClient();
      type ChannelRow = {
        user_id: string | null;
        payment_channel?: string | null;
        qpay_invoice_id?: string | null;
        paid_at?: string | null;
        created_at?: string | null;
      };
      let rows: ChannelRow[] | null = null;
      let error: { message: string } | null = null;

      {
        const res = await supabase
          .from("bookings")
          .select("user_id, payment_channel, qpay_invoice_id, paid_at, created_at")
          .eq("payment_status", "paid")
          .in("user_id", ids)
          .order("paid_at", { ascending: false });
        rows = (res.data as ChannelRow[] | null) ?? null;
        error = res.error;
      }

      if (error && isMissingColumnError(error.message, "paid_at")) {
        const fb = await supabase
          .from("bookings")
          .select("user_id, payment_channel, qpay_invoice_id, created_at")
          .eq("payment_status", "paid")
          .in("user_id", ids)
          .order("created_at", { ascending: false });
        rows = (fb.data as ChannelRow[] | null) ?? null;
        error = fb.error;
      }

      if (error && isMissingColumnError(error.message, "payment_channel")) {
        const fb = await supabase
          .from("bookings")
          .select("user_id, qpay_invoice_id, paid_at, created_at")
          .eq("payment_status", "paid")
          .in("user_id", ids)
          .order("paid_at", { ascending: false });
        rows = (fb.data as ChannelRow[] | null) ?? null;
        error = fb.error;
      }

      if (cancelled || error) return;

      const map: Record<string, string> = {};
      for (const row of rows ?? []) {
        const uid = row.user_id;
        if (!uid || map[uid]) continue;
        const ch = String(row.payment_channel ?? "").trim();
        const inv = String(row.qpay_invoice_id ?? "").trim();
        if (ch) map[uid] = ch;
        else if (inv) map[uid] = "qpay";
      }
      setPaymentChannelByUser(map);
    };

    loadChannels();
    return () => {
      cancelled = true;
    };
  }, [tab, paidOnDate, paidFilterChannelByUser, pagedProfileIdsKey]);

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

  const handleResetPasswordConfirm = async () => {
    if (!confirmResetPassword) return;
    const { id, name } = confirmResetPassword;
    setResettingPassword(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/users/${id}/reset-password`, {
        method: "POST",
        headers,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
        password?: string;
        data?: { password?: string };
      };
      if (!res.ok) {
        toast.show(toMnErrorMessage(data.message || data.error || ""), "error");
        return;
      }
      const newPass = data.data?.password ?? data.password ?? "123456";
      toast.show(
        `«${name}»-ийн нууц үг ${newPass} боллоо. Бүх төхөөрөмжөөс гарна.`,
      );
    } finally {
      setResettingPassword(false);
      setConfirmResetPassword(null);
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
              : statusFilter === "paused"
                ? "Түдгэлзүүлсэн"
                : statusFilter === "inactive"
                  ? "Идэвхгүй"
                  : "Дууссан"
          }`,
          clear: () => setStatusFilter(""),
        }
      : null,
    orgFilter ? { key: "org", label: `Байгууллага: ${orgFilter}`, clear: () => setOrgFilter("") } : null,
    earlyPaymentFilter
      ? {
          key: "earlyPay",
          label:
            earlyPaymentFilter === "early_first"
              ? "Early 150k (эхний сар)"
              : "Early 330k (үлдэгдэл)",
          clear: () => setEarlyPaymentFilter(""),
        }
      : null,
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
                if (r !== "user") {
                  setPaidOnDate("");
                  setEarlyPaymentFilter("");
                }
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
                ["paused", "⏸ Түдгэлзүүлсэн"],
                ["inactive", "Идэвхгүй"],
                ["expired", "⛔ Дууссан"],
              ] as const).map(([v, label]) => (
                <button key={v} type="button"
                  onClick={() => { setStatusFilter(v); resetPage(); }}
                  className={`h-8 rounded-lg px-3 text-xs font-medium transition-all ${
                    statusFilter === v
                      ? v === "active" ? "bg-emerald-500 text-white shadow-sm"
                        : v === "paused" ? "bg-orange-500 text-white shadow-sm"
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
                    setPaidOnDate(getTodayDateStringUB());
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

            {tab === "user" && (
              <div className={`flex items-center gap-1 rounded-xl border p-1 transition-all ${
                earlyPaymentLoading
                  ? "border-teal-300 bg-teal-50/70 dark:border-teal-700 dark:bg-teal-900/20"
                  : "border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800/60"
              }`}>
                {([
                  ["", "Бүгд"],
                  ["early_first", "Early 150k"],
                  ["early_rest", "Early 330k"],
                ] as const).map(([v, label]) => (
                  <button
                    key={v || "all"}
                    type="button"
                    title={
                      v === "early_first"
                        ? "Early эхний сарын төлбөр (150k)"
                        : v === "early_rest"
                          ? "Early 11 сар үлдэгдэл (330k)"
                          : "Early төлбөрийн шүүлтгүй"
                    }
                    onClick={() => {
                      setEarlyPaymentFilter(v);
                      setPage(1);
                      setSelectedIds(new Set());
                    }}
                    disabled={earlyPaymentLoading}
                    className={`h-8 rounded-lg px-3 text-xs font-medium transition-all disabled:opacity-70 ${
                      earlyPaymentFilter === v
                        ? v === "early_first"
                          ? "bg-teal-500 text-white shadow-sm"
                          : v === "early_rest"
                            ? "bg-sky-500 text-white shadow-sm"
                            : "bg-white text-gray-700 shadow-sm dark:bg-gray-700 dark:text-white"
                        : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    }`}
                  >
                    {label}
                  </button>
                ))}
                {earlyPaymentLoading && (
                  <span className="mx-1 size-3 animate-spin rounded-full border-2 border-teal-500 border-t-transparent" />
                )}
              </div>
            )}

            {(search || orgFilter || statusFilter || paidOnDate || earlyPaymentFilter) && (
              <button
                onClick={() => {
                  setSearch("");
                  setOrgFilter("");
                  setStatusFilter("");
                  setPaidOnDate("");
                  setEarlyPaymentFilter("");
                  setSelectedIds(new Set());
                  resetPage();
                }}
                className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-400 hover:border-red-300 hover:bg-red-50 hover:text-red-500 dark:border-gray-700 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              >
                ✕ Цэвэрлэх
              </button>
            )}

            <div className="flex-1" />

            {canManageUsers && selectedIds.size > 0 && (
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
                { key: "paymentChannel", label: "Төлбөрийн хэрэгсэл" },
                { key: "agreement", label: "Гэрээ" },
                { key: "startDate", label: "Эхлэх огноо" },
                { key: "expireDate", label: "Дуусах огноо" },
                { key: "totalVisits", label: "Нийт ирц" },
                { key: "lastVisit", label: "Сүүлд ирсэн" },
                { key: "streak", label: "Streak" },
              ]}
              visible={visibleColumns}
              onChange={setVisibleColumns}
            />

            {canManageUsers && (
              <button onClick={() => setFormProfile("new")}
                className="flex h-10 items-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white hover:bg-brand-600 transition-colors">
                <PlusIcon className="size-4" />
                Нэмэх
              </button>
            )}
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
                onClick={() => {
                  setSearch("");
                  setOrgFilter("");
                  setStatusFilter("");
                  setPaidOnDate("");
                  setEarlyPaymentFilter("");
                  setSelectedIds(new Set());
                  resetPage();
                }}
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
              {paidDayLabel}: {paidUsersCount} гишүүн · {paidCount} бичилт (төлбөр / Flexy / идэвхжүүлэлт).
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
          onRoleChange={canManageUsers ? handleRoleChange : undefined}
          onEdit={canManageUsers ? (p) => setFormProfile(p) : undefined}
          onDelete={canManageUsers ? handleDelete : undefined}
          onResetDailyCheckin={
            canManageUsers && tab === "user"
              ? (p) => setConfirmResetCheckin({ id: p.id, name: profileDisplayName(p) })
              : undefined
          }
          onResetPassword={
            canResetPassword && tab === "user"
              ? (p) => setConfirmResetPassword({ id: p.id, name: profileDisplayName(p) })
              : undefined
          }
          selectedIds={canManageUsers ? selectedIds : undefined}
          onToggleSelect={canManageUsers ? toggleSelect : undefined}
          onToggleSelectAll={canManageUsers ? toggleSelectAll : undefined}
          visibleColumns={visibleColumns}
          sortColumn={sortColumn}
          sortDir={sortDir}
          onSort={handleColumnSort}
          statsMap={statsMap ?? undefined}
          statsLoading={statsLoading}
          paymentChannelByUser={paymentChannelByUser}
          paidBookingIdByUser={paidOnDate ? paidBookingIdByUser : undefined}
          onRowClick={(p) => setPanelProfile(p)}
          notesMap={notesMap}
          onNoteClick={(p) => setNoteProfile(p)}
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

      <UserStatsPanel
        profile={panelProfile}
        stats={panelProfile ? (statsMap?.[panelProfile.id] ?? null) : null}
        loading={statsLoading}
        onClose={() => setPanelProfile(null)}
      />

      <UserNoteModal
        profile={noteProfile}
        note={noteProfile ? (notesMap[noteProfile.id] ?? null) : null}
        onClose={() => setNoteProfile(null)}
        onSave={(saved) => {
          patchUserSalesNotesCache(saved);
          setNotesMap((prev) => ({ ...prev, [saved.user_id]: saved }));
          setNoteProfile(null);
        }}
      />

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

      <ConfirmModal
        isOpen={confirmResetPassword !== null}
        title="Нууц үг шинэчлэх үү?"
        message={
          confirmResetPassword
            ? `«${confirmResetPassword.name}»-ийн нууц үгийг 123456 болгоно. Бүх төхөөрөмжөөс автоматаар гарна.`
            : undefined
        }
        confirmLabel={resettingPassword ? "Түр хүлээнэ үү..." : "123456 болгох"}
        onConfirm={handleResetPasswordConfirm}
        onCancel={() => !resettingPassword && setConfirmResetPassword(null)}
        loading={resettingPassword}
        variant="warning"
      />
    </>
  );
}
