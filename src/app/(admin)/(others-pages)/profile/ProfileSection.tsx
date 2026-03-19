"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import UserMetaCard from "@/components/user-profile/UserMetaCard";
import UserInfoCard from "@/components/user-profile/UserInfoCard";
import { t } from "@/lib/i18n";

export type ProfileData = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  membership_tier: string | null;
};

export default function ProfileSection() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async () => {
    if (!user) return;
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone, role, membership_tier")
      .eq("id", user.id)
      .single();
    setProfile(data);
    setLoading(false);
  };

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  if (loading || !profile) {
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
    <div className="space-y-6">
      <UserMetaCard
        profile={profile}
        email={user?.email ?? ""}
        onUpdate={fetchProfile}
      />
      <UserInfoCard
        profile={profile}
        email={user?.email ?? ""}
        onUpdate={fetchProfile}
      />
    </div>
  );
}
