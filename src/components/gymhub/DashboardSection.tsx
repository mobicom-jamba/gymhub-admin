"use client";

import React, { useEffect, useState, useCallback } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { GymHubMetrics } from "./GymHubMetrics";
import BookingsChart from "./BookingsChart";
import PeakHoursChart from "./PeakHoursChart";
import GymUtilizationChart from "./GymUtilizationChart";
import MemberGrowthChart from "./MemberGrowthChart";
import ComponentCard from "../common/ComponentCard";
import { t } from "@/lib/i18n";

type ChartPoint = { date: string; count: number };
type HourPoint = { hour: number; count: number };
type GymVisitPoint = { gym: string; visits: number };

export default function DashboardSection() {
  const [gymCount, setGymCount] = useState(0);
  const [userCount, setUserCount] = useState(0);
  const [bookingCount, setBookingCount] = useState(0);
  const [chartData, setChartData] = useState<ChartPoint[]>([]);
  const [peakHours, setPeakHours] = useState<HourPoint[]>([]);
  const [gymUtilization, setGymUtilization] = useState<GymVisitPoint[]>([]);
  const [memberGrowth, setMemberGrowth] = useState<ChartPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCounts = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [gymsRes, usersRes, bookingsRes, bookingsByDateRes, schedulesRes, visitsRes, profilesRes] =
      await Promise.all([
        supabase.from("gyms").select("id", { count: "exact", head: true }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("bookings").select("id", { count: "exact", head: true }),
        supabase
          .from("bookings")
          .select("created_at")
          .gte("created_at", thirtyDaysAgo.toISOString()),
        supabase
          .from("class_schedules")
          .select("start_time")
          .gte("start_time", thirtyDaysAgo.toISOString()),
        supabase
          .from("gym_visits")
          .select("gym_name")
          .gte("checked_in_at", thirtyDaysAgo.toISOString()),
        supabase
          .from("profiles")
          .select("created_at")
          .gte("created_at", thirtyDaysAgo.toISOString()),
      ]);

    setGymCount(gymsRes.count ?? 0);
    setUserCount(usersRes.count ?? 0);
    setBookingCount(bookingsRes.count ?? 0);

    // Bookings by date chart
    const byDate = (bookingsByDateRes.data ?? []).reduce(
      (acc: Record<string, number>, b: { created_at: string }) => {
        const d = new Date(b.created_at).toISOString().slice(0, 10);
        acc[d] = (acc[d] ?? 0) + 1;
        return acc;
      },
      {}
    );
    setChartData(
      Object.entries(byDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count: count as number }))
    );

    // Peak hours chart
    const hourMap: Record<number, number> = {};
    (schedulesRes.data ?? []).forEach((s: { start_time: string }) => {
      const h = new Date(s.start_time).getHours();
      hourMap[h] = (hourMap[h] ?? 0) + 1;
    });
    setPeakHours(
      Array.from({ length: 24 }, (_, i) => i)
        .filter((h) => hourMap[h])
        .map((h) => ({ hour: h, count: hourMap[h] }))
    );

    // Gym utilization chart
    const gymMap: Record<string, number> = {};
    (visitsRes.data ?? []).forEach((v: { gym_name: string | null }) => {
      const name = v.gym_name ?? "Тодорхойгүй";
      gymMap[name] = (gymMap[name] ?? 0) + 1;
    });
    setGymUtilization(
      Object.entries(gymMap)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 10)
        .map(([gym, visits]) => ({ gym, visits: visits as number }))
    );

    // Member growth chart
    const memberByDate: Record<string, number> = {};
    (profilesRes.data ?? []).forEach((p: { created_at: string }) => {
      const d = new Date(p.created_at).toISOString().slice(0, 10);
      memberByDate[d] = (memberByDate[d] ?? 0) + 1;
    });
    setMemberGrowth(
      Object.entries(memberByDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count: count as number }))
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCounts();

    const supabase = createBrowserSupabaseClient();

    // Subscribe to realtime changes on key tables
    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gyms" },
        () => fetchCounts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "profiles" },
        () => fetchCounts()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings" },
        () => fetchCounts()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      <div className="col-span-12">
        <GymHubMetrics
          gymCount={gymCount}
          userCount={userCount}
          bookingCount={bookingCount}
        />
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="Захиалга (сүүлийн 30 хоног)">
          <BookingsChart data={chartData} />
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="Оргил цаг (сүүлийн 30 хоног)">
          <PeakHoursChart data={peakHours} />
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="Фитнес төвийн ашиглалт">
          <GymUtilizationChart data={gymUtilization} />
        </ComponentCard>
      </div>

      <div className="col-span-12 xl:col-span-6">
        <ComponentCard title="Шинэ гишүүд (сүүлийн 30 хоног)">
          <MemberGrowthChart data={memberGrowth} />
        </ComponentCard>
      </div>
    </div>
  );
}
