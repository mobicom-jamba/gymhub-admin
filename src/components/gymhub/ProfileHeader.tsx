"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import Link from "next/link";

type ProfileData = {
  full_name: string | null;
  phone: string | null;
  role: string | null;
};

const roleLabels: Record<string, string> = {
  user: "Гишүүн",
  admin: "Админ",
  moderator: "Модератор",
  sales: "Борлуулалт",
  gym_owner: "Фитнес эзэмшигч",
};

export default function ProfileHeader() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);

  useEffect(() => {
    if (!user) return;
    const supabase = createBrowserSupabaseClient();
    supabase
      .from("profiles")
      .select("full_name, phone, role")
      .eq("id", user.id)
      .single()
      .then(({ data }) => setProfile(data));
  }, [user]);

  const displayName = profile?.full_name ?? user?.email ?? "Админ";
  const initials = displayName
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="rounded-2xl bg-gradient-to-r from-[#4f46e5] via-[#6d28d9] to-[#7c3aed] p-6 text-white">
      <p className="mb-4 text-center text-sm font-medium text-white/70">
        GymHub – Удирдагын хуудас
      </p>
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-xl font-bold backdrop-blur-sm">
              {initials}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-green-400 ring-2 ring-[#6d28d9]">
              <svg className="h-3 w-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
          <div>
            <h3 className="text-lg font-bold">{displayName}</h3>
            <p className="text-sm text-white/70">
              {roleLabels[profile?.role ?? "user"] ?? "Гишүүн"}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link
            href="/profile"
            className="rounded-full border border-white/30 bg-white/10 px-5 py-2 text-sm font-medium backdrop-blur-sm transition hover:bg-white/20"
          >
            Миний профайл
          </Link>
          <Link
            href="/settings"
            className="rounded-full border border-yellow-400/60 bg-yellow-400/20 px-5 py-2 text-sm font-medium text-yellow-200 backdrop-blur-sm transition hover:bg-yellow-400/30"
          >
            Нууц үг солих
          </Link>
        </div>
      </div>
    </div>
  );
}
