"use client";

import React from "react";
import Image from "next/image";
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
import { PencilIcon, TrashBinIcon } from "@/icons";
import type { Gym } from "./types";

export default function GymsTable({
  gyms,
  error,
  onEdit,
  onDelete,
}: {
  gyms: Gym[];
  error?: string;
  onEdit?: (gym: Gym) => void;
  onDelete?: (gym: Gym) => void;
}) {
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        {t("error")}: {error}
      </div>
    );
  }

  if (gyms.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        Фитнес төвийн бүртгэл олдсонгүй.
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
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 w-14"
              >
                {t("logo")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("gymName")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("gymAddress")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("status")}
              </TableCell>
              {(onEdit || onDelete) && (
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
            {gyms.map((gym) => (
              <TableRow key={gym.id}>
                <TableCell className="px-5 py-4">
                  {gym.image_url ? (
                    <div className="relative size-10 overflow-hidden rounded-lg border border-gray-100 dark:border-white/[0.05]">
                      <Image
                        src={gym.image_url}
                        alt={gym.name ?? "gym"}
                        fill
                        className="object-cover"
                        unoptimized
                      />
                    </div>
                  ) : (
                    <div className="flex size-10 items-center justify-center rounded-lg bg-gray-100 text-xs font-medium text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                      {gym.name?.charAt(0)?.toUpperCase() ?? "G"}
                    </div>
                  )}
                </TableCell>
                <TableCell className="px-5 py-4 text-start font-medium text-gray-800 text-theme-sm dark:text-white/90">
                  {gym.name ?? "—"}
                </TableCell>
                <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                  {gym.address ?? "—"}
                </TableCell>
                <TableCell className="px-5 py-4">
                  <Badge
                    size="sm"
                    color={gym.is_active ? "success" : "error"}
                  >
                    {gym.is_active ? t("active") : t("inactive")}
                  </Badge>
                </TableCell>
                {(onEdit || onDelete) && (
                  <TableCell className="px-5 py-4 text-end">
                    <div className="flex justify-end gap-2">
                      {onEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(gym)}
                          startIcon={<PencilIcon className="size-4" />}
                        >
                          {t("edit")}
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDelete(gym)}
                          className="text-error-600 hover:bg-error-50 dark:text-error-400"
                          startIcon={<TrashBinIcon className="size-4" />}
                        >
                          {t("delete")}
                        </Button>
                      )}
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
