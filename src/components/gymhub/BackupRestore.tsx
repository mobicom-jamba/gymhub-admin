"use client";

import React, { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import Button from "@/components/ui/button/Button";
import ComponentCard from "@/components/common/ComponentCard";

export default function BackupRestore() {
  const [backing, setBacking] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [backupData, setBackupData] = useState<any>(null);

  const handleBackup = async () => {
    setBacking(true);
    try {
      const supabase = createBrowserSupabaseClient();

      // Fetch all tables data
      const [profiles, gyms, classes, bookings, visits] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("gyms").select("*"),
        supabase.from("classes").select("*"),
        supabase.from("bookings").select("*"),
        supabase.from("visit_logs").select("*"),
      ]);

      const backup = {
        timestamp: new Date().toISOString(),
        version: "1.0",
        data: {
          profiles: profiles.data || [],
          gyms: gyms.data || [],
          classes: classes.data || [],
          bookings: bookings.data || [],
          visit_logs: visits.data || [],
        },
      };

      // Download as JSON file
      const blob = new Blob([JSON.stringify(backup, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gymhub-backup-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      alert("Нөөцлөлт амжилттай үүсгэгдлээ!");
    } catch (err) {
      console.error(err);
      alert("Нөөцлөлт үүсгэхэд алдаа гарлаа");
    } finally {
      setBacking(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string);
        setBackupData(data);
        alert("Нөөцлөлтийн файл уншигдлаа. 'Сэргээх' товч дээр дарна уу.");
      } catch (err) {
        alert("Буруу файл формат");
      }
    };
    reader.readAsText(file);
  };

  const handleRestore = async () => {
    if (!backupData) {
      alert("Эхлээд нөөцлөлтийн файл сонгоно уу");
      return;
    }

    if (
      !confirm(
        "⚠️ АНХААРУУЛГА: Энэ үйлдэл нь одоогийн өгөгдлийг БҮРЭН солих болно. Үргэлжлүүлэх үү?"
      )
    ) {
      return;
    }

    setRestoring(true);
    try {
      const supabase = createBrowserSupabaseClient();

      // Note: In production, you'd want to delete existing data first or use upsert
      // This is a simplified version
      const { data: restoredData } = backupData;

      if (restoredData.gyms?.length) {
        await supabase.from("gyms").upsert(restoredData.gyms);
      }
      if (restoredData.classes?.length) {
        await supabase.from("classes").upsert(restoredData.classes);
      }
      if (restoredData.bookings?.length) {
        await supabase.from("bookings").upsert(restoredData.bookings);
      }
      if (restoredData.visit_logs?.length) {
        await supabase.from("visit_logs").upsert(restoredData.visit_logs);
      }

      alert("Өгөгдөл амжилттай сэргээгдлээ!");
      setBackupData(null);
    } catch (err) {
      console.error(err);
      alert("Сэргээхэд алдаа гарлаа");
    } finally {
      setRestoring(false);
    }
  };

  return (
    <ComponentCard title="Нөөцлөлт / Сэргээлт">
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-gray-800 dark:text-white">
            Нөөцлөлт үүсгэх
          </h3>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Бүх өгөгдлийг JSON файл руу татаж авна. Энэ файлыг хадгалж
            хэрэгцээтэй үед сэргээж болно.
          </p>
          <Button onClick={handleBackup} disabled={backing}>
            {backing ? "Нөөцлөж байна..." : "🔽 Нөөцлөлт үүсгэх"}
          </Button>
        </div>

        <div className="border-t border-gray-200 pt-6 dark:border-gray-700">
          <h3 className="mb-2 text-sm font-semibold text-gray-800 dark:text-white">
            Нөөцлөлтөөс сэргээх
          </h3>
          <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
            Өмнө нь хадгалсан нөөцлөлтийн файлаас өгөгдлийг сэргээнэ.
          </p>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
              />
              <span className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700">
                📁 Файл сонгох
              </span>
            </label>
            {backupData && (
              <Button onClick={handleRestore} disabled={restoring}>
                {restoring ? "Сэргээж байна..." : "🔄 Сэргээх"}
              </Button>
            )}
          </div>
          {backupData && (
            <div className="mt-3 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-400">
              ✓ Файл бэлэн: {backupData.timestamp}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-900 dark:bg-yellow-950">
          <p className="text-sm text-yellow-800 dark:text-yellow-400">
            <strong>⚠️ Анхааруулга:</strong> Сэргээх үйлдэл нь бүх одоогийн
            өгөгдлийг солих болно. Үүнийг хийхээсээ өмнө нөөцлөлт үүсгэнэ үү.
          </p>
        </div>
      </div>
    </ComponentCard>
  );
}
