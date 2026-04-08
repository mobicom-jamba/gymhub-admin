"use client";

import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import { t } from "@/lib/i18n";
import EmptyState from "@/components/ui/EmptyState";

const statusLabels: Record<string, string> = {
  booked: t("booked"),
  cancelled: t("cancelled"),
  attended: t("attended"),
  no_show: t("noShow"),
};

const statusColors: Record<string, "success" | "warning" | "error" | "primary"> = {
  booked: "primary",
  cancelled: "error",
  attended: "success",
  no_show: "warning",
};

// Supabase returns nested relations as arrays or objects - use flexible type
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Booking = any;

export default function BookingsTable({
  bookings,
  profileMap,
  error,
  onCancel,
  onMarkAttended,
  visibleColumns,
}: {
  bookings: Booking[];
  profileMap: Record<string, string | null>;
  error?: string;
  onCancel?: (bookingId: string) => void;
  onMarkAttended?: (bookingId: string) => void;
  visibleColumns?: Record<string, boolean>;
}) {
  const [actioningId, setActioningId] = useState<string | null>(null);

  const handleCancel = async (b: Booking) => {
    if (!onCancel) return;
    setActioningId(b.id);
    await onCancel(b.id);
    setActioningId(null);
  };

  const handleMarkAttended = async (b: Booking) => {
    if (!onMarkAttended) return;
    setActioningId(b.id);
    await onMarkAttended(b.id);
    setActioningId(null);
  };

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        {t("error")}: {error}
      </div>
    );
  }

  if (bookings.length === 0) {
    return (
      <EmptyState title="Захиалга олдсонгүй" description="Шүүлтүүрээ өөрчлөөд дахин оролдоно уу." icon="calendar" />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              {(visibleColumns?.user ?? true) && <TableCell
                isHeader
                className="px-5 py-3 sticky top-0 bg-white dark:bg-gray-900 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 w-[180px]"
              >
                {t("user")}
              </TableCell>}
              {(visibleColumns?.class ?? true) && <TableCell
                isHeader
                className="px-5 py-3 sticky top-0 bg-white dark:bg-gray-900 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 w-[220px]"
              >
                {t("classTitle")}
              </TableCell>}
              {(visibleColumns?.time ?? true) && <TableCell
                isHeader
                className="px-5 py-3 sticky top-0 bg-white dark:bg-gray-900 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 w-[180px]"
              >
                {t("time")}
              </TableCell>}
              {(visibleColumns?.status ?? true) && <TableCell
                isHeader
                className="px-5 py-3 sticky top-0 bg-white dark:bg-gray-900 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 w-[110px]"
              >
                {t("status")}
              </TableCell>}
              {(onCancel || onMarkAttended) && (
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400"
                >
                  {t("actions")}
                </TableCell>
              )}
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {bookings.map((b) => {
              const schedule = Array.isArray(b.class_schedules)
                ? b.class_schedules[0]
                : b.class_schedules;
              const cls = Array.isArray(schedule?.classes)
                ? schedule?.classes[0]
                : schedule?.classes;
              const gym = Array.isArray(cls?.gyms)
                ? cls?.gyms[0]
                : cls?.gyms;
              const start = schedule?.start_time
                ? new Date(schedule.start_time).toLocaleString("mn-MN", { hour12: false })
                : "—";
              const canAct = b.status === "booked" && actioningId !== b.id;
              return (
                <TableRow key={b.id}>
                  {(visibleColumns?.user ?? true) && <TableCell className="px-5 py-4 font-medium text-gray-800 text-theme-sm dark:text-white/90">
                    {profileMap[b.user_id] ?? "—"}
                  </TableCell>}
                  {(visibleColumns?.class ?? true) && <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                    {cls?.title ?? "—"} ({gym?.name ?? "—"})
                  </TableCell>}
                  {(visibleColumns?.time ?? true) && <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                    {start}
                  </TableCell>}
                  {(visibleColumns?.status ?? true) && <TableCell className="px-5 py-4">
                    <Badge size="sm" color={statusColors[b.status] ?? "primary"}>
                      {statusLabels[b.status] ?? b.status}
                    </Badge>
                  </TableCell>}
                  {(onCancel || onMarkAttended) && (
                    <TableCell className="px-5 py-4 text-end">
                      {b.status === "booked" && (
                        <div className="flex justify-end gap-2">
                          {onMarkAttended && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleMarkAttended(b)}
                              disabled={!canAct}
                            >
                              {t("markAttended")}
                            </Button>
                          )}
                          {onCancel && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCancel(b)}
                              disabled={!canAct}
                              className="text-error-600 hover:bg-error-50 dark:text-error-400"
                            >
                              {t("cancel")}
                            </Button>
                          )}
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
