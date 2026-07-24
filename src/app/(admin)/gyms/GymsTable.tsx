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
import type { Gym, VisitPeriod } from "./types";
import { formatMnt, gymMonthAmountMnt } from "./types";

export default function GymsTable({
  gyms,
  error,
  onEdit,
  onDelete,
  onQR,
  visitCounts,
  visitPeriod,
  visitLoading,
  onVisitCountClick,
  showBilling = false,
}: {
  gyms: Gym[];
  error?: string;
  onEdit?: (gym: Gym) => void;
  onDelete?: (gym: Gym) => void;
  onQR?: (gym: Gym) => void;
  visitCounts?: Record<string, number>;
  visitPeriod?: VisitPeriod;
  visitLoading?: boolean;
  onVisitCountClick?: (gym: Gym) => void;
  /** Partner settlement amounts — admin only */
  showBilling?: boolean;
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
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400 w-12"
              >
                #
              </TableCell>
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
                Хот
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("status")}
              </TableCell>
              {visitCounts && (
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  {showBilling ? "Оролт / Төлбөр" : "Оролт"}{" "}
                  <span className="text-gray-400 font-normal">
                    ({visitPeriod === "today" ? "өнөөдөр" : visitPeriod === "7d" ? "7 хоног" : "сар"})
                  </span>
                </TableCell>
              )}
              {(onEdit || onDelete || onQR) && (
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
                <TableCell className="px-5 py-4 text-start tabular-nums text-gray-500 text-theme-sm dark:text-gray-400">
                  {gym.sort_order ?? "—"}
                </TableCell>
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
                <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                  {gym.city === "darkhan"
                    ? "Орон нутаг (Бүсчлэл)"
                    : gym.city === "ulaanbaatar" || !gym.city
                      ? "Улаанбаатар"
                      : gym.city}
                </TableCell>
                <TableCell className="px-5 py-4">
                  <Badge
                    size="sm"
                    color={gym.is_active ? "success" : "error"}
                  >
                    {gym.is_active ? t("active") : t("inactive")}
                  </Badge>
                </TableCell>
                {visitCounts && (
                  <TableCell className="px-5 py-4">
                    {visitLoading ? (
                      <div className="h-5 w-10 animate-pulse rounded-md bg-gray-200 dark:bg-white/10" />
                    ) : (
                      (() => {
                        const count = visitCounts[gym.id] ?? 0;
                        const showAmount =
                          showBilling &&
                          (gym.billing_mode === "monthly_fixed" ||
                            (gym.billing_mode === "per_entry" && visitPeriod === "month"));
                        const amount = showAmount
                          ? gymMonthAmountMnt(gym, count)
                          : null;
                        const rateHint =
                          showBilling &&
                          gym.billing_mode === "per_entry" &&
                          gym.billing_amount_mnt != null
                            ? `${formatMnt(gym.billing_amount_mnt)}/оролт`
                            : showBilling &&
                                gym.billing_mode === "monthly_fixed" &&
                                gym.billing_amount_mnt != null
                              ? `тогтмол ${formatMnt(gym.billing_amount_mnt)}`
                              : null;

                        const content = (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="flex flex-col items-start gap-0.5">
                              <span className="text-sm font-bold text-brand-600 tabular-nums dark:text-brand-400">
                                {count}
                              </span>
                              {amount != null ? (
                                <span className="text-[11px] font-semibold text-gray-700 tabular-nums dark:text-gray-200">
                                  {formatMnt(amount)}
                                </span>
                              ) : rateHint ? (
                                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                  {rateHint}
                                </span>
                              ) : null}
                            </span>
                            {onVisitCountClick && (
                              <svg
                                className="size-3.5 shrink-0 text-brand-400 dark:text-brand-500"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2.5}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            )}
                          </span>
                        );

                        if (onVisitCountClick) {
                          return (
                            <button
                              type="button"
                              onClick={() => onVisitCountClick(gym)}
                              className="rounded-lg px-2.5 py-1 text-left transition hover:bg-brand-50 dark:hover:bg-brand-500/10"
                              title="Сараар харах"
                            >
                              {content}
                            </button>
                          );
                        }

                        return content;
                      })()
                    )}
                  </TableCell>
                )}
                {(onEdit || onDelete || onQR) && (
                  <TableCell className="px-5 py-4 text-end">
                    <div className="flex justify-end gap-2">
                      {onQR && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onQR(gym)}
                        >
                          QR
                        </Button>
                      )}
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
