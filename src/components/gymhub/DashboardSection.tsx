"use client";

import React, { useEffect, useState, useCallback, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { GymHubMetrics } from "./GymHubMetrics";
import MemberGrowthChart from "./MemberGrowthChart";
import BookingsChart from "./BookingsChart";
import PaymentChannelsCard from "./PaymentChannelsCard";
import NewUsersCard from "./NewUsersCard";
import NewGymsCard from "./NewGymsCard";
import ComponentCard from "../common/ComponentCard";
import { t } from "@/lib/i18n";
import UserFormModal from "@/app/(admin)/users/UserFormModal";
import type { Profile } from "@/app/(admin)/users/UsersSection";

type MonthPoint = { month: string; count: number };
type UserRow = { id: string; full_name: string | null; phone: string | null; company?: string | null; created_at: string };
type GymRow = { id: string; name: string | null; address: string | null; phone?: string | null; image_url?: string | null; created_at?: string };
type PaymentChannels = { qpay: number; sono: number; pocket: number; gift: number };

export default function DashboardSection() {
  const [userCount, setUserCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [companyCount, setCompanyCount] = useState(0);
  const [fitnessCount, setFitnessCount] = useState(0);
  const [yogaCount, setYogaCount] = useState(0);
  const [usersByMonth, setUsersByMonth] = useState<MonthPoint[]>([]);
  const [paymentsByMonth, setPaymentsByMonth] = useState<MonthPoint[]>([]);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannels>({ qpay: 0, sono: 0, pocket: 0, gift: 0 });
  const [newUsers, setNewUsers] = useState<UserRow[]>([]);
  const [newGyms, setNewGyms] = useState<GymRow[]>([]);
  const [orgs, setOrgs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fast fetch: all count queries + recent lists + orgs ──────────────────
  // Resolves in ~50–100ms. Triggered on mount AND debounced realtime events.
  const fetchFast = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();

    const [
      usersRes, activeRes, gymsRes, orgsCountRes,
      qpayRes, sonoRes, pocketRes, giftRes,
      recentUsersRes, recentGymsRes, orgsListRes,
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("membership_status", "active"),
      supabase.from("gyms").select("id, name, amenities", { count: "exact" }),
      supabase.from("organizations").select("id", { count: "exact", head: true }),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "qpay"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "sono"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "pocket"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "gift"),
      supabase.from("profiles").select("id, full_name, phone, created_at").order("created_at", { ascending: false }).limit(10),
      supabase.from("gyms").select("id, name, address, image_url, created_at").order("created_at", { ascending: false }).limit(10),
      supabase.from("organizations").select("name").order("name", { ascending: true }),
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

    setPaymentChannels({
      qpay: qpayRes.count ?? 0,
      sono: sonoRes.count ?? 0,
      pocket: pocketRes.count ?? 0,
      gift: giftRes.count ?? 0,
    });

    setNewUsers((recentUsersRes.data ?? []) as UserRow[]);
    setNewGyms((recentGymsRes.data ?? []) as GymRow[]);
    setOrgs((orgsListRes.data ?? []).map((o: { name: string }) => o.name));
    setLoading(false);
  }, []);

  // ── Slow fetch: paginated chart data — only runs on mount ─────────────────
  const fetchChartData = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const allStartDates: string[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("profiles")
        .select("membership_started_at")
        .not("membership_started_at", "is", null)
        .order("membership_started_at", { ascending: true })
        .range(from, from + PAGE - 1);
      (data ?? []).forEach((p: { membership_started_at: string }) => {
        if (p.membership_started_at) allStartDates.push(p.membership_started_at.slice(0, 7));
      });
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    const monthMap: Record<string, number> = {};
    allStartDates.forEach(m => { monthMap[m] = (monthMap[m] ?? 0) + 1; });
    const sortedMonths = Object.entries(monthMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, count]) => ({ month, count: count as number }));
    setUsersByMonth(sortedMonths);
    setPaymentsByMonth(sortedMonths);
  }, []);

  useEffect(() => {
    fetchFast().then(() => fetchChartData());

    const supabase = createBrowserSupabaseClient();

    // Debounced handler — only refreshes fast counts, not the heavy chart loop
    const debouncedFast = () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchFast(), 2000);
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
  }, [fetchFast, fetchChartData]);

  const handleEditUser = useCallback(async (id: string) => {
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone, role, organization, membership_tier, membership_status, membership_started_at, membership_expires_at, created_at")
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
        <ComponentCard title="Гишүүнчлэл эхэлсэн огноо" subtitle="Төлбөр төлсөн огноо сараар">
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
        <ComponentCard title="Төлбөр төлсөн огноо" subtitle="Гишүүнчлэл эхэлсэн огноо сараар">
          <BookingsChart data={paymentsByMonth.map((d) => ({ date: d.month, count: d.count }))} />
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <ComponentCard title="Төлбөр төлсөн суваг" subtitle="Төлбөр төлсөн суваг">
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
    </div>

    <UserFormModal
      isOpen={editProfile !== null}
      onClose={() => setEditProfile(null)}
      profile={editProfile}
      organizations={orgs}
      onSuccess={() => { setEditProfile(null); fetchFast(); }}
    />
    </>
  );
}
