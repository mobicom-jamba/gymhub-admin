"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import BackupRestore from "@/components/gymhub/BackupRestore";
import PaymentAppSettingsSection from "@/components/gymhub/PaymentAppSettingsSection";
import { useAuth } from "@/context/AuthContext";

export default function SettingsPage() {
  const { role, loading } = useAuth();
  const router = useRouter();
  const isStrictAdmin = role === "admin";

  useEffect(() => {
    if (!loading && !isStrictAdmin) {
      router.replace("/");
    }
  }, [loading, isStrictAdmin, router]);

  if (loading || !isStrictAdmin) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Тохиргоо</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {loading ? "Ачаалж байна…" : "Зөвхөн админ хандах эрхтэй."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
        Тохиргоо
      </h1>
      <PaymentAppSettingsSection />
      <BackupRestore />
    </div>
  );
}
