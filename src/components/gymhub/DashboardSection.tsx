"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { GymHubMetrics } from "./GymHubMetrics";
import MemberGrowthChart from "./MemberGrowthChart";
import BookingsChart from "./BookingsChart";
import PaymentChannelsCard from "./PaymentChannelsCard";
import NewUsersCard from "./NewUsersCard";
import NewGymsCard from "./NewGymsCard";
import SalesPromosAdminCard from "./SalesPromosAdminCard";
import ComponentCard from "../common/ComponentCard";
import { t } from "@/lib/i18n";
import UserFormModal from "@/app/(admin)/users/UserFormModal";
import type { OrganizationOption, Profile } from "@/app/(admin)/users/UsersSection";

type MonthPoint = { month: string; count: number };
type UserRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  company?: string | null;
  created_at: string;
  membership_status?: string | null;
  membership_tier?: string | null;
  membership_started_at?: string | null;
  membership_expires_at?: string | null;
};
type GymRow = { id: string; name: string | null; address: string | null; phone?: string | null; image_url?: string | null; created_at?: string };
type PaymentChannels = { qpay: number; sono: number; pocket: number; gift: number; other?: number };
type PaymentsMonthsSource = "bookings" | "lending" | "membership_starts";

export default function DashboardSection() {
  const [userCount, setUserCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [companyCount, setCompanyCount] = useState(0);
  const [fitnessCount, setFitnessCount] = useState(0);
  const [yogaCount, setYogaCount] = useState(0);
  const [usersByMonth, setUsersByMonth] = useState<MonthPoint[]>([]);
  const [paymentsByMonth, setPaymentsByMonth] = useState<MonthPoint[]>([]);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannels>({ qpay: 0, sono: 0, pocket: 0, gift: 0 });
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [paymentsMonthsSource, setPaymentsMonthsSource] = useState<PaymentsMonthsSource>("bookings");
  const [newUsers, setNewUsers] = useState<UserRow[]>([]);
  const [newGyms, setNewGyms] = useState<GymRow[]>([]);
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fast fetch: all count queries + recent lists + orgs ──────────────────
  // Resolves in ~50–100ms. Triggered on mount AND debounced realtime events.
  const fetchFast = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();

    const [
      usersRes, activeRes, gymsRes, orgsCountRes,
      recentUsersRes, recentGymsRes, orgsListRes,
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("membership_status", "active"),
      supabase.from("gyms").select("id, name, amenities", { count: "exact" }),
      supabase.from("organizations").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id, full_name, phone, organization, membership_status, membership_tier, membership_started_at, membership_expires_at, created_at")
        .order("created_at", { ascending: false })
        .limit(10),
      supabase.from("gyms").select("id, name, address, image_url, created_at").order("created_at", { ascending: false }).limit(10),
      supabase.from("organizations").select("id,name").order("name", { ascending: true }),
    ]);

    setUserCount(usersRes.count ?? 0);
    setActiveCount(activeRes.count ?? 0);

    const orgTableCount = orgsCountRes.count ?? 0;
    if (orgTableCount > 0) {
      setCompanyCount(orgTableCount);
    } else {
      const { data: orgsData } = await supabase
        .from("profiles").select("organization")
        .not("organization", "is", null).neq("organization", "");
      const distinctOrgs = new Set((orgsData ?? []).map((p: { organization: string }) => p.organization));
      setCompanyCount(distinctOrgs.size);
    }

    const allGyms = gymsRes.data ?? [];
    const totalGyms = gymsRes.count ?? allGyms.length;
    const yogaGyms = allGyms.filter((g: { name?: string | null; amenities?: string[] | null }) => {
      const nameMatch = (g.name ?? "").toLowerCase().includes("yoga") || (g.name ?? "").toLowerCase().includes("йога");
      const amenityMatch = (g.amenities ?? []).some((a: string) => a.toLowerCase().includes("yoga") || a.toLowerCase().includes("йога"));
      return nameMatch || amenityMatch;
    }).length;
    setFitnessCount(totalGyms - yogaGyms);
    setYogaCount(yogaGyms);

    setNewUsers(
      (recentUsersRes.data ?? []).map(
        (r: {
          id: string;
          full_name: string | null;
          phone: string | null;
          organization?: string | null;
          membership_status?: string | null;
          membership_tier?: string | null;
          membership_started_at?: string | null;
          membership_expires_at?: string | null;
          created_at: string;
        }) => ({
          id: r.id,
          full_name: r.full_name,
          phone: r.phone,
          company: r.organization ?? null,
          membership_status: r.membership_status,
          membership_tier: r.membership_tier ?? null,
          membership_started_at: r.membership_started_at ?? null,
          membership_expires_at: r.membership_expires_at ?? null,
          created_at: r.created_at,
        }),
      ),
    );
    setNewGyms((recentGymsRes.data ?? []) as GymRow[]);
    setOrgs((orgsListRes.data ?? []) as OrganizationOption[]);
    setLoading(false);
  }, []);

  /** Charts + payment channels: service-role API so booking aggregates work under RLS. */
  const fetchAnalytics = useCallback(async () => {
    try {
      setAnalyticsError(null);
      const res = await fetch("/api/admin/dashboard-analytics", {
        cache: "no-store",
        credentials: "include",
      });
      const body = (await res.json().catch(() => ({}))) as {
        usersByMonth?: MonthPoint[];
        paymentsByMonth?: MonthPoint[];
        paymentsMonthsSource?: PaymentsMonthsSource;
        paymentChannels?: PaymentChannels;
        error?: string;
      };
      if (!res.ok) {
        const msg =
          body.error ||
          (res.status === 401 || res.status === 403
            ? "Статистик ачаалах эрхгүй эсвэл нэвтрээгүй байна. Дахин нэвтэрнэ үү."
            : `Статистик ачаалахад алдаа (${res.status}).`);
        setAnalyticsError(msg);
        console.warn("[dashboard] dashboard-analytics failed:", res.status, body.error ?? "");
        return;
      }
      if (body.error) {
        setAnalyticsError(body.error);
        console.warn("[dashboard] dashboard-analytics:", body.error);
        return;
      }
      if (Array.isArray(body.usersByMonth)) setUsersByMonth(body.usersByMonth);
      if (Array.isArray(body.paymentsByMonth)) setPaymentsByMonth(body.paymentsByMonth);
      if (
        body.paymentsMonthsSource === "bookings" ||
        body.paymentsMonthsSource === "lending" ||
        body.paymentsMonthsSource === "membership_starts"
      ) {
        setPaymentsMonthsSource(body.paymentsMonthsSource);
      } else {
        setPaymentsMonthsSource("bookings");
      }
      if (body.paymentChannels) setPaymentChannels(body.paymentChannels);
    } catch (e) {
      setAnalyticsError("Сүлжээний алдаа. Дахин оролдоно уу.");
      console.warn("[dashboard] dashboard-analytics", e);
    }
  }, []);

  useEffect(() => {
    void fetchFast();
    void fetchAnalytics();

    const supabase = createBrowserSupabaseClient();

    // Debounced handler — only refreshes fast counts, not the heavy chart loop
    const debouncedFast = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void fetchFast();
        void fetchAnalytics();
      }, 2000);
    };

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "gyms" }, debouncedFast)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, debouncedFast)
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, debouncedFast)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchFast, fetchAnalytics]);

  const handleEditUser = useCallback(async (id: string) => {
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, surname, given_name, phone, role, organization, membership_tier, membership_status, membership_started_at, membership_expires_at, created_at")
      .eq("id", id)
      .single();
    if (data) setEditProfile(data as Profile);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-gray-500 dark:text-gray-400">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {/* ── Metrics Row ──────────────────────────────────────── */}
      <div className="col-span-12">
        <GymHubMetrics
          userCount={userCount}
          activeCount={activeCount}
          companyCount={companyCount}
          fitnessCount={fitnessCount}
          yogaCount={yogaCount}
          hrefs={{ userCount: "/users", companyCount: "/organizations" }}
        />
      </div>

      {/* ── Charts Row ───────────────────────────────────────── */}
      <div className="col-span-12 xl:col-span-4">
        <ComponentCard title="Гишүүнчлэл эхэлсэн огноо" subtitle="Гишүүнчлэл эхэлсэн сараар">
          <MemberGrowthChart data={usersByMonth.map((d) => ({ date: d.month, count: d.count }))} />
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
            {usersByMonth.slice(-3).reverse().map((m) => (
              <div key={m.month} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-sm bg-violet-500" />
                  <span className="text-gray-600 dark:text-gray-400">{m.month.slice(0,4)}он {Number(m.month.slice(5,7))}-р сар</span>
                </div>
                <span className="font-bold text-violet-600 dark:text-violet-400">{m.count}</span>
              </div>
            ))}
          </div>
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <ComponentCard
          title="Төлбөр төлсөн огноо"
          subtitle={
            paymentsMonthsSource === "membership_starts"
              ? "Захиалгын төлбөрийн багц олдсонгүй — гишүүнчлэл эхэлсэн сараар (илэрхийлэл)"
              : paymentsMonthsSource === "lending"
                ? "Lending бүртгэл — төлөгдсөн сараар"
                : "Төлбөр баталгаажсан сараар (захиалга)"
          }
        >
          <BookingsChart
            data={paymentsByMonth.map((d) => ({ date: d.month, count: d.count }))}
            seriesName={
              paymentsMonthsSource === "membership_starts" ? "Гишүүнчлэл эхэлсэн" : "Төлбөр"
            }
          />
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
            {paymentsByMonth.slice(-3).reverse().map((m) => (
              <div key={m.month} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-sm bg-indigo-500" />
                  <span className="text-gray-600 dark:text-gray-400">{m.month.slice(0, 4)}он {Number(m.month.slice(5, 7))}-р сар</span>
                </div>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{m.count}</span>
              </div>
            ))}
          </div>
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <ComponentCard title="Төлбөр төлсөн суваг" subtitle="Төлбөр төлсөн суваг">
          {analyticsError && (
            <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              {analyticsError}
            </div>
          )}
          <PaymentChannelsCard channels={paymentChannels} />
        </ComponentCard>
      </div>

      {/* ── Bottom: New Users | New Fitness ──────────────────── */}
      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="Шинэ хэрэглэгчид" subtitle="Хамгийн сүүлд бүртгүүлсэн 10 хэрэглэгч">
          <NewUsersCard users={newUsers} onEdit={handleEditUser} />
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="Шинэ фитнес" subtitle="Хамгийн сүүлд бүртгүүлсэн 10 фитнес">
          <NewGymsCard gyms={newGyms} />
        </ComponentCard>
      </div>

      <div className="col-span-12">
        <SalesPromosAdminCard />
      </div>
    </div>

    <UserFormModal
      isOpen={editProfile !== null}
      onClose={() => setEditProfile(null)}
      profile={editProfile}
      organizations={orgs}
      onOrganizationsRefresh={fetchFast}
      onSuccess={() => { setEditProfile(null); fetchFast(); }}
    />
    </>
  );
}
