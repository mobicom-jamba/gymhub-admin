"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import ProfileHeader from "./ProfileHeader";
import { GymHubMetrics } from "./GymHubMetrics";
import MemberGrowthChart from "./MemberGrowthChart";
import BookingsChart from "./BookingsChart";
import PaymentChannelsCard from "./PaymentChannelsCard";
import NewUsersCard from "./NewUsersCard";
import NewGymsCard from "./NewGymsCard";
import ComponentCard from "../common/ComponentCard";
import { t } from "@/lib/i18n";

type MonthPoint = { month: string; count: number };
type UserRow = { id: string; full_name: string | null; phone: string | null; company?: string | null; created_at: string };
type GymRow = { id: string; name: string | null; address: string | null; phone?: string | null; image_url?: string | null; created_at?: string };
type PaymentChannels = { qpay: number; sono: number; pocket: number; gift: number };

export default function DashboardSection() {
  const [userCount, setUserCount] = useState(0);
  const [paymentCount, setPaymentCount] = useState(0);
  const [companyCount, setCompanyCount] = useState(0);
  const [fitnessCount, setFitnessCount] = useState(0);
  const [yogaCount, setYogaCount] = useState(0);
  const [usersByMonth, setUsersByMonth] = useState<MonthPoint[]>([]);
  const [paymentsByMonth, setPaymentsByMonth] = useState<MonthPoint[]>([]);
  const [paymentChannels, setPaymentChannels] = useState<PaymentChannels>({ qpay: 0, sono: 0, pocket: 0, gift: 0 });
  const [newUsers, setNewUsers] = useState<UserRow[]>([]);
  const [newGyms, setNewGyms] = useState<GymRow[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const [
      usersRes, paidRes, gymsRes,
      qpayRes, sonoRes, pocketRes, giftRes,
      recentUsersRes, recentGymsRes,
      profilesByDateRes, bookingsByDateRes,
    ] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid"),
      supabase.from("gyms").select("id, amenities", { count: "exact" }),
      // Payment channels
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "qpay"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "sono"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "pocket"),
      supabase.from("bookings").select("id", { count: "exact", head: true }).eq("payment_status", "paid").eq("payment_channel", "gift"),
      // Recent users & gyms
      supabase.from("profiles").select("id, full_name, phone, created_at").order("created_at", { ascending: false }).limit(10),
      supabase.from("gyms").select("id, name, address, image_url, created_at").order("created_at", { ascending: false }).limit(10),
      // Monthly charts data
      supabase.from("profiles").select("created_at").gte("created_at", sixMonthsAgo.toISOString()),
      supabase.from("bookings").select("created_at").eq("payment_status", "paid").gte("created_at", sixMonthsAgo.toISOString()),
    ]);

    // Counts
    setUserCount(usersRes.count ?? 0);
    setPaymentCount(paidRes.count ?? 0);

    // Gym type counts — fitness vs yoga
    const allGyms = gymsRes.data ?? [];
    const totalGyms = gymsRes.count ?? allGyms.length;
    const yogaGyms = allGyms.filter((g: { amenities?: string[] | null }) =>
      (g.amenities ?? []).some((a: string) => a.toLowerCase().includes("yoga") || a.toLowerCase().includes("йога"))
    ).length;
    setFitnessCount(totalGyms - yogaGyms);
    setYogaCount(yogaGyms);

    // Company count — distinct companies from profiles or fallback to gym count
    // We'll use the gym count as a proxy for "companies" since the screenshot shows "Компани"
    setCompanyCount(totalGyms);

    // Payment channels
    setPaymentChannels({
      qpay: qpayRes.count ?? 0,
      sono: sonoRes.count ?? 0,
      pocket: pocketRes.count ?? 0,
      gift: giftRes.count ?? 0,
    });

    setNewUsers((recentUsersRes.data ?? []) as UserRow[]);
    setNewGyms((recentGymsRes.data ?? []) as GymRow[]);

    // User registrations by month
    const userMonthMap: Record<string, number> = {};
    (profilesByDateRes.data ?? []).forEach((p: { created_at: string }) => {
      const m = p.created_at.slice(0, 7); // "YYYY-MM"
      userMonthMap[m] = (userMonthMap[m] ?? 0) + 1;
    });
    setUsersByMonth(
      Object.entries(userMonthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count: count as number }))
    );

    // Payments by month
    const payMonthMap: Record<string, number> = {};
    (bookingsByDateRes.data ?? []).forEach((b: { created_at: string }) => {
      const m = b.created_at.slice(0, 7);
      payMonthMap[m] = (payMonthMap[m] ?? 0) + 1;
    });
    setPaymentsByMonth(
      Object.entries(payMonthMap)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count: count as number }))
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCounts();

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "gyms" }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => fetchCounts())
      .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, () => fetchCounts())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchCounts]);

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
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      {/* ── Profile Header ─────────────────────────────────── */}
      <div className="col-span-12">
        <ProfileHeader />
      </div>

      {/* ── 5 Metrics Row ──────────────────────────────────── */}
      <div className="col-span-12">
        <GymHubMetrics
          userCount={userCount}
          paymentCount={paymentCount}
          companyCount={companyCount}
          fitnessCount={fitnessCount}
          yogaCount={yogaCount}
        />
      </div>

      {/* ── Charts Row: User registrations | Payments | Channels ── */}
      <div className="col-span-12 xl:col-span-4">
        <ComponentCard title="Хэрэглэгч бүртгүүлсэн огноо" subtitle="Бүртгүүлсэн огноо сараар">
          <MemberGrowthChart data={usersByMonth.map((d) => ({ date: d.month, count: d.count }))} />
          {/* Monthly summary below chart */}
          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3 dark:border-white/[0.06]">
            {usersByMonth.slice(-3).reverse().map((m) => (
              <div key={m.month} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2 w-2 rounded-sm bg-violet-500" />
                  <span className="text-gray-600 dark:text-gray-400">{m.month.replace("-", "-р сар ")}</span>
                </div>
                <span className="font-bold text-violet-600 dark:text-violet-400">{m.count}</span>
              </div>
            ))}
          </div>
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <ComponentCard title="Төлбөр төлсөн огноо" subtitle="Төлбөр төлөлт">
          <BookingsChart data={paymentsByMonth.map((d) => ({ date: d.month, count: d.count }))} />
          <div className="mt-3 flex justify-center border-t border-gray-100 pt-3 dark:border-white/[0.06]">
            <button className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400">
              Дэлгэрэнгүй
            </button>
          </div>
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-4">
        <ComponentCard title="Төлбөр төлсөн суваг" subtitle="Төлбөр төлсөн суваг">
          <PaymentChannelsCard channels={paymentChannels} />
          <div className="mt-3 flex justify-center border-t border-gray-100 pt-3 dark:border-white/[0.06]">
            <button className="text-sm font-medium text-brand-500 hover:text-brand-600 dark:text-brand-400">
              Дэлгэрэнгүй
            </button>
          </div>
        </ComponentCard>
      </div>

      {/* ── Bottom: New Users | New Fitness ─────────────────── */}
      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="Шинэ хэрэглэгчид" subtitle="Хамгийн сүүлд бүртгүүлсэн 10 хэрэглэгч">
          <NewUsersCard users={newUsers} />
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="Шинэ фитнес" subtitle="Хамгийн сүүлд бүртгүүлсэн 10 фитнес">
          <NewGymsCard gyms={newGyms} />
        </ComponentCard>
      </div>
    </div>
  );
}
