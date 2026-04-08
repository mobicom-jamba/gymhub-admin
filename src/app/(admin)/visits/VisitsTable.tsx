"use client";

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/lib/i18n";

type Visit = {
  id: string;
  user_id: string;
  gym_id: string;
  gym_name: string | null;
  method: string;
  checked_in_at: string;
};

export default function VisitsTable({
  visits,
  profileMap,
  error,
}: {
  visits: Visit[];
  profileMap: Record<string, string | null>;
  error?: string;
}) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        {t("error")}: {error}
      </div>
    );
  }

  if (visits.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        {t("visits")} {t("notFound")}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("user")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("gyms")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("method")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("date")} / {t("time")}
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {visits.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="px-5 py-4 font-medium text-gray-800 text-theme-sm dark:text-white/90">
                  {profileMap[v.user_id] ?? "—"}
                </TableCell>
                <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                  {v.gym_name ?? v.gym_id ?? "—"}
                </TableCell>
                <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                  {v.method === "qr" ? "QR" : "Товч"}
                </TableCell>
                <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                  {new Date(v.checked_in_at).toLocaleString("mn-MN", { hour12: false })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
