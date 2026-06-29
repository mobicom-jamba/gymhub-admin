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
import { ChevronDownIcon, ChevronUpIcon } from "@/icons";
import type { VisitsSortColumn } from "./visits-sort";
import EmptyState from "@/components/ui/EmptyState";
import { getUserPlaceholderAvatar, buildAvatarThumbUrl } from "@/lib/user-avatar";
import { membershipExpiryStatus } from "./visits-membership";

type Visit = {
  id: string;
  user_id: string;
  gym_id: string;
  gym_name: string | null;
  method: string;
  checked_in_at: string;
  fullName: string | null;
  phone: string | null;
  avatarPath: string | null;
  membershipStatus: string | null;
  membershipExpiresAt: string | null;
  userTotal: number;
  userLastVisitAt: string | null;
};

function MembershipStatusBadge({
  membershipStatus,
  membershipExpiresAt,
}: {
  membershipStatus: string | null;
  membershipExpiresAt: string | null;
}) {
  const status = membershipExpiryStatus(membershipStatus, membershipExpiresAt);
  if (!status) {
    return <span className="text-gray-400 dark:text-gray-500">—</span>;
  }
  if (status === "expired") {
    return (
      <span className="inline-flex items-center rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-600 dark:bg-red-500/15 dark:text-red-400">
        Дууссан
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400">
      Эрх идэвхитэй
    </span>
  );
}

function MethodBadge({ method }: { method: string }) {
  const isQr = method === "qr";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
        isQr
          ? "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300"
          : "bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300"
      }`}
    >
      {isQr ? (
        <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4zM4 14h6v6H4zM14 4h6v6h-6zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z" />
        </svg>
      ) : (
        <svg className="size-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.5 8.5l-2-2M3 3l2 2M11 4.5V2M4.5 11H2" />
        </svg>
      )}
      {isQr ? "QR" : "Товч"}
    </span>
  );
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "" };
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return {
    date: `${y}/${mo}/${da}`,
    time: d.toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit", hour12: false }),
  };
}

function SortableTh({
  column,
  sortColumn,
  sortDir,
  onSort,
  className,
  align = "start",
  children,
}: {
  column: VisitsSortColumn;
  sortColumn: VisitsSortColumn;
  sortDir: "asc" | "desc";
  onSort: (c: VisitsSortColumn) => void;
  className: string;
  align?: "start" | "end";
  children: React.ReactNode;
}) {
  const active = sortColumn === column;
  const justify = align === "end" ? "justify-end" : "justify-start";
  return (
    <TableCell isHeader className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        title={
          active
            ? sortDir === "asc"
              ? "Өсөхөөр эрэмбэлэгдсэн — дарахад буурах"
              : "Буурахаар эрэмбэлэгдсэн — дарахад өсөх"
            : "Эрэмбэлэх"
        }
        className={`group inline-flex w-full min-w-0 items-center gap-1 text-left font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white ${justify}`}
      >
        <span className="truncate">{children}</span>
        <span className="inline-flex shrink-0 flex-col leading-[0.35]">
          <ChevronUpIcon
            className={`size-3 ${active && sortDir === "asc" ? "text-brand-500" : "text-gray-300 group-hover:text-gray-400 dark:text-gray-600 dark:group-hover:text-gray-500"}`}
            aria-hidden
          />
          <ChevronDownIcon
            className={`size-3 -mt-0.5 ${active && sortDir === "desc" ? "text-brand-500" : "text-gray-300 group-hover:text-gray-400 dark:text-gray-600 dark:group-hover:text-gray-500"}`}
            aria-hidden
          />
        </span>
      </button>
    </TableCell>
  );
}

export default function VisitsTable({
  visits,
  error,
  sortColumn = "userLastVisitAt",
  sortDir = "desc",
  onSort,
}: {
  visits: Visit[];
  error?: string;
  sortColumn?: VisitsSortColumn;
  sortDir?: "asc" | "desc";
  onSort?: (column: VisitsSortColumn) => void;
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
      <EmptyState
        icon="calendar"
        title="Ирц олдсонгүй"
        description="Сонгосон шүүлтүүрт тохирох ирц алга байна."
      />
    );
  }

  const hdr = "px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 text-start dark:text-gray-400";
  const hdrSortable = `${hdr} font-semibold`;

  const Th = ({
    col,
    className,
    align,
    label,
  }: {
    col: VisitsSortColumn;
    className: string;
    align?: "start" | "end";
    label: React.ReactNode;
  }) =>
    onSort ? (
      <SortableTh
        column={col}
        sortColumn={sortColumn}
        sortDir={sortDir}
        onSort={onSort}
        className={className}
        align={align}
      >
        {label}
      </SortableTh>
    ) : (
      <TableCell isHeader className={className}>
        {label}
      </TableCell>
    );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              <Th col="user" className={hdrSortable} label={t("user")} />
              <TableCell isHeader className={hdr}>Утас</TableCell>
              <Th col="gym" className={hdrSortable} label={t("gyms")} />
              <Th col="method" className={hdrSortable} label={t("method")} />
              <Th col="userTotal" className={`${hdrSortable} text-end`} align="end" label="Нийт ирц" />
              <Th col="userLastVisitAt" className={`${hdrSortable} text-end`} align="end" label="Сүүлд ирсэн" />
              <Th col="membershipStatus" className={hdrSortable} label="Төлөв" />
              <Th
                col="membershipExpiresAt"
                className={`${hdrSortable} text-end`}
                align="end"
                label="Гишүүнчлэл дуусах"
              />
            </TableRow>
          </TableHeader>
          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {visits.map((v) => {
              const name = v.fullName ?? "—";
              const avatar = buildAvatarThumbUrl(v.avatarPath) || getUserPlaceholderAvatar(v.user_id || name);
              const lastVisit = v.userLastVisitAt ? formatDateTime(v.userLastVisitAt) : null;
              const membershipExpires = v.membershipExpiresAt ? formatDateTime(v.membershipExpiresAt) : null;
              return (
                <TableRow key={v.id} className="transition hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                  <TableCell className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <img
                        src={avatar}
                        alt=""
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          const img = e.currentTarget;
                          const next = getUserPlaceholderAvatar(v.user_id || name);
                          if (img.src !== next) img.src = next;
                        }}
                      />
                      <span className="font-medium text-gray-800 text-theme-sm dark:text-white/90">{name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="px-5 py-3.5 font-mono text-gray-500 text-theme-sm dark:text-gray-400">
                    {v.phone ?? "—"}
                  </TableCell>
                  <TableCell className="px-5 py-3.5 text-gray-500 text-theme-sm dark:text-gray-400">
                    {v.gym_name || v.gym_id || "—"}
                  </TableCell>
                  <TableCell className="px-5 py-3.5">
                    {v.method ? (
                      <MethodBadge method={v.method} />
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-5 py-3.5 text-end">
                    <span className="font-medium text-gray-700 text-theme-sm dark:text-gray-200">
                      {v.userTotal.toLocaleString("mn-MN")}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500"> удаа</span>
                  </TableCell>
                  <TableCell className="px-5 py-3.5 text-end">
                    {lastVisit ? (
                      <>
                        <div className="text-theme-sm font-medium text-gray-700 dark:text-gray-200">{lastVisit.date}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500">{lastVisit.time}</div>
                      </>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
                  </TableCell>
                  <TableCell className="px-5 py-3.5">
                    <MembershipStatusBadge
                      membershipStatus={v.membershipStatus}
                      membershipExpiresAt={v.membershipExpiresAt}
                    />
                  </TableCell>
                  <TableCell className="px-5 py-3.5 text-end">
                    {membershipExpires ? (
                      <div className="text-theme-sm font-medium text-gray-700 dark:text-gray-200">{membershipExpires.date}</div>
                    ) : (
                      <span className="text-gray-400 dark:text-gray-500">—</span>
                    )}
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
