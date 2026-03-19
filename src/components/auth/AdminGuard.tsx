"use client";

import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { t } from "@/lib/i18n";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { user, isAdmin, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/signin");
      return;
    }
    if (isAdmin === false) {
      router.replace("/signin?error=unauthorized");
    }
  }, [user, isAdmin, loading, router]);

  if (loading || !user || isAdmin === false) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          <p className="text-gray-500 dark:text-gray-400">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
