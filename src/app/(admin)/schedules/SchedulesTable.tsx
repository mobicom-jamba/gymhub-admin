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
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { TrashBinIcon, PencilIcon } from "@/icons";
import { useToast } from "@/components/ui/Toast";
import EmptyState from "@/components/ui/EmptyState";
import { toMnErrorMessage } from "@/lib/error-message";

type Schedule = {
  id: string;
  class_id: string;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
  classes?: { title?: string | null; gyms?: { name?: string | null } | null } | null;
};

export default function SchedulesTable({
  schedules,
  error,
  onRefresh,
  onEdit,
}: {
  schedules: Schedule[];
  error?: string;
  onRefresh: () => void;
  onEdit?: (schedule: Schedule) => void;
}) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const toast = useToast();

  const getClassInfo = (s: Schedule) => {
    const c = s.classes;
    const cls = Array.isArray(c) ? c[0] : c;
    const gym = Array.isArray(cls?.gyms) ? cls?.gyms[0] : cls?.gyms;
    return { title: cls?.title ?? "—", gym: gym?.name ?? "—" };
  };

  const handleDelete = async (s: Schedule) => {
    if (!confirm(t("confirmDeleteSchedule"))) return;
    setDeletingId(s.id);
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("class_schedules")
      .delete()
      .eq("id", s.id);
    setDeletingId(null);
    if (err) toast.show(toMnErrorMessage(err.message), "error");
    else onRefresh();
  };

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        {t("error")}: {error}
      </div>
    );
  }

  if (schedules.length === 0) {
    return (
      <EmptyState title="Хуваарь олдсонгүй" description="Одоогоор харуулах хуваарь алга." icon="calendar" />
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
                {t("classTitle")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("time")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("status")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400"
              >
                {t("actions")}
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {schedules.map((s) => {
              const { title, gym } = getClassInfo(s);
              const start = new Date(s.start_time).toLocaleString("mn-MN");
              const end = new Date(s.end_time).toLocaleString("mn-MN", {
                timeStyle: "short",
              });
              return (
                <TableRow key={s.id}>
                  <TableCell className="px-5 py-4 font-medium text-gray-800 text-theme-sm dark:text-white/90">
                    {title} ({gym})
                  </TableCell>
                  <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                    {start} – {end}
                  </TableCell>
                  <TableCell className="px-5 py-4">
                    <Badge
                      size="sm"
                      color={s.is_cancelled ? "error" : "success"}
                    >
                      {s.is_cancelled ? "Цуцлагдсан" : t("active")}
                    </Badge>
                  </TableCell>
                  <TableCell className="px-5 py-4 text-end">
                    <div className="flex justify-end gap-2">
                      {onEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(s)}
                          startIcon={<PencilIcon className="size-4" />}
                        >
                          {t("edit")}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(s)}
                        disabled={deletingId === s.id}
                        className="text-error-600 hover:bg-error-50 dark:text-error-400"
                        startIcon={<TrashBinIcon className="size-4" />}
                      >
                        {t("delete")}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
