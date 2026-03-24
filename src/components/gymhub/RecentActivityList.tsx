"use client";

import React from "react";
import { t } from "@/lib/i18n";

const typeLabels: Record<string, string> = {
  booking_created: t("bookingCreated"),
  booking_cancelled: t("bookingCancelled"),
  check_in: t("checkIn"),
  workout_completed: t("workoutCompleted"),
};

type Log = {
  id: string;
  type: string;
  created_at: string;
  user_id?: string;
};

export default function RecentActivityList({
  logs,
  profileMap = {},
}: {
  logs: Log[];
  profileMap?: Record<string, string | null>;
}) {
  if (logs.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-gray-400">
        Сүүлийн үйл ажиллагааны бүртгэл байхгүй байна.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex items-center justify-between rounded-lg border border-gray-100 p-3 dark:border-white/[0.05]"
        >
          <div>
            <span className="font-medium text-gray-800 text-theme-sm dark:text-white/90">
              {log.user_id ? profileMap[log.user_id] ?? "—" : "—"}
            </span>
            <span className="ml-2 text-gray-500 text-theme-sm dark:text-gray-400">
              {typeLabels[log.type] ?? log.type}
            </span>
          </div>
          <span className="text-gray-400 text-theme-xs dark:text-gray-500">
            {new Date(log.created_at).toLocaleString("mn-MN")}
          </span>
        </div>
      ))}
    </div>
  );
}
