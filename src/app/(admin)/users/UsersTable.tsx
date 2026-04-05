"use client";

import React, { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { t } from "@/lib/i18n";
import { ChevronDownIcon, ChevronUpIcon, PencilIcon, TrashBinIcon } from "@/icons";
import type { Profile } from "./UsersSection";
import type { UsersSortColumn } from "./users-sort";
import TableSkeleton from "@/components/ui/TableSkeleton";
import EmptyState from "@/components/ui/EmptyState";
import { getUserPlaceholderAvatar } from "@/lib/user-avatar";

const roleLabels: Record<string, string> = {
  user: "Гишүүн",
  admin: "Админ",
};

const ROLES = ["user", "admin"] as const;

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function daysUntil(expiresAt: string | null) {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

function orgNameOfProfile(p: Profile): string | null {
  const rel = p.organizations;
  if (Array.isArray(rel)) return rel[0]?.name ?? p.organization;
  return rel?.name ?? p.organization;
}

export type Density = "comfortable" | "compact";

function SortableTh({
  column,
  sortColumn,
  sortDir,
  onSort,
  className,
  children,
}: {
  column: UsersSortColumn;
  sortColumn: UsersSortColumn | null;
  sortDir: "asc" | "desc";
  onSort: (c: UsersSortColumn) => void;
  className: string;
  children: React.ReactNode;
}) {
  const active = sortColumn === column;
  return (
    <TableCell isHeader className={className}>
      <button
        type="button"
        onClick={() => onSort(column)}
        title={active ? (sortDir === "asc" ? "Өсөхөөр эрэмбэлэгдсэн — дарахад буурах" : "Буурахаар эрэмбэлэгдсэн — дарахад өсөх") : "Эрэмбэлэх"}
        className="group inline-flex w-full min-w-0 items-center justify-start gap-1 text-left font-semibold text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
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

export default function UsersTable({
  profiles,
  error,
  loading,
  density = "comfortable",
  onRoleChange,
  onEdit,
  onDelete,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
  visibleColumns,
  sortColumn = null,
  sortDir = "asc",
  onSort,
}: {
  profiles: Profile[];
  error?: string;
  loading?: boolean;
  density?: Density;
  onRoleChange?: (profileId: string, newRole: string) => void;
  onEdit?: (profile: Profile) => void;
  onDelete?: (profileId: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
  visibleColumns?: Record<string, boolean>;
  sortColumn?: UsersSortColumn | null;
  sortDir?: "asc" | "desc";
  onSort?: (column: UsersSortColumn) => void;
}) {
  const py = density === "compact" ? "py-1.5" : "py-3";
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleRoleSelect = async (p: Profile, newRole: string) => {
    if (newRole === (p.role ?? "user") || !onRoleChange) return;
    setUpdatingId(p.id);
    await onRoleChange(p.id, newRole);
    setUpdatingId(null);
  };

  if (loading) return <TableSkeleton rows={8} cols={7} />;

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        {t("error")}: {error}
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <EmptyState
        icon="users"
        title="Хэрэглэгч олдсонгүй"
        description="Таны сонгосон шүүлтүүрт тохирох хэрэглэгч олдсонгүй."
      />
    );
  }

  const hdr = `px-4 ${py} text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400`;
  const hdrPlain = `${hdr} font-semibold`;
  const hdrSortable = `${hdr} font-semibold`;

  const Th = ({
    col,
    className,
    label,
  }: {
    col: UsersSortColumn;
    className: string;
    label: string;
  }) =>
    onSort ? (
      <SortableTh
        column={col}
        sortColumn={sortColumn}
        sortDir={sortDir}
        onSort={onSort}
        className={className}
      >
        {label}
      </SortableTh>
    ) : (
      <TableCell isHeader className={`${hdrPlain} ${className}`}>{label}</TableCell>
    );

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              {selectedIds && onToggleSelectAll && (
                <TableCell isHeader className={`w-10 px-4 ${py}`}>
                  <input type="checkbox"
                    checked={selectedIds.size === profiles.length && profiles.length > 0}
                    onChange={onToggleSelectAll}
                    className="size-4 cursor-pointer" />
                </TableCell>
              )}
              {(visibleColumns?.member ?? true) &&
                <Th col="member" className={`sticky top-0 left-0 z-20 bg-white dark:bg-gray-900 ${hdrSortable} w-[240px]`} label="Гишүүн" />}
              {(visibleColumns?.phone ?? true) &&
                <Th col="phone" className={`sticky top-0 bg-white dark:bg-gray-900 ${hdrSortable} w-[130px]`} label="Утас" />}
              {(visibleColumns?.organization ?? true) &&
                <Th col="organization" className={`sticky top-0 bg-white dark:bg-gray-900 ${hdrSortable} w-[180px]`} label="Байгууллага" />}
              {(visibleColumns?.tier ?? true) &&
                <Th col="tier" className={`sticky top-0 bg-white dark:bg-gray-900 ${hdrSortable} w-[120px]`} label="Тариф" />}
              {(visibleColumns?.startDate ?? true) &&
                <Th col="startDate" className={`sticky top-0 bg-white dark:bg-gray-900 ${hdrSortable} w-[130px]`} label="Эхлэх огноо" />}
              {(visibleColumns?.expireDate ?? true) &&
                <Th col="expireDate" className={`sticky top-0 bg-white dark:bg-gray-900 ${hdrSortable} w-[130px]`} label="Дуусах огноо" />}
              {(onEdit || onDelete) && (
                <TableCell isHeader className={`${hdrPlain} text-end sticky top-0 bg-white dark:bg-gray-900 w-[110px]`}>Үйлдлүүд</TableCell>
              )}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {profiles.map((p) => {
              return (
                <TableRow key={p.id} className="transition hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                  {selectedIds && onToggleSelect && (
                    <TableCell className={`w-10 px-4 ${py}`}>
                      <input type="checkbox" checked={selectedIds.has(p.id)}
                        onChange={() => onToggleSelect(p.id)} className="size-4 cursor-pointer" />
                    </TableCell>
                  )}

                  {/* Name + avatar — sticky */}
                  {(visibleColumns?.member ?? true) && <TableCell className={`sticky left-0 z-10 bg-white px-4 dark:bg-gray-900 ${py}`}>
                    <div className="flex items-center gap-3">
                      <img
                        src={getUserPlaceholderAvatar(p.id || p.full_name)}
                        alt="avatar"
                        className="h-9 w-9 shrink-0 rounded-full object-cover"
                      />
                      <span className="font-medium text-gray-800 text-sm dark:text-white/90 whitespace-nowrap">{p.full_name ?? "—"}</span>
                    </div>
                  </TableCell>}

                  {(visibleColumns?.phone ?? true) && <TableCell className={`px-4 ${py}`}>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">{p.phone ?? "—"}</span>
                  </TableCell>}

                  {(visibleColumns?.organization ?? true) && <TableCell className={`px-4 ${py} max-w-[160px] text-sm text-gray-600 dark:text-gray-400`}>
                    <span className="block truncate" title={orgNameOfProfile(p) ?? ""}>
                      {orgNameOfProfile(p) ?? "—"}
                    </span>
                  </TableCell>}

                  {(visibleColumns?.tier ?? true) && <TableCell className={`px-4 ${py}`}>
                    {p.membership_tier === "premium" ? (
                      <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-900/20 dark:text-violet-400">Premium</span>
                    ) : p.membership_tier === "early" ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">Early</span>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </TableCell>}

                  {(visibleColumns?.startDate ?? true) && <TableCell className={`px-4 ${py} text-sm whitespace-nowrap text-gray-500 dark:text-gray-400`}>
                    {p.membership_started_at ? new Date(p.membership_started_at).toLocaleDateString("mn-MN") : "—"}
                  </TableCell>}

                  {(visibleColumns?.expireDate ?? true) && <TableCell className={`px-4 ${py} text-sm whitespace-nowrap`}>
                    {p.membership_expires_at ? (() => {
                      const days = daysUntil(p.membership_expires_at);
                      if (days !== null && days < 0)
                        return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">⚠️ {new Date(p.membership_expires_at).toLocaleDateString("mn-MN")}</span>;
                      if (days !== null && days <= 30)
                        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">⏳ {days} өдөр</span>;
                      return <span className="text-gray-500 dark:text-gray-400">{new Date(p.membership_expires_at).toLocaleDateString("mn-MN")}</span>;
                    })() : <span className="text-gray-400">—</span>}
                  </TableCell>}


                  {(onEdit || onDelete) && (
                    <TableCell className={`px-4 ${py} text-end`}>
                      <div className="flex justify-end gap-2">
                        {onEdit && (
                          <button onClick={() => onEdit(p)}
                            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-white/[0.08] dark:hover:text-gray-200" title="Засах">
                            <PencilIcon className="size-5" />
                          </button>
                        )}
                        {onDelete && (
                          <button onClick={() => onDelete(p.id)}
                            className="rounded-xl p-2 text-red-400 hover:bg-red-50 hover:text-red-600 dark:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400" title="Устгах">
                            <TrashBinIcon className="size-5" />
                          </button>
                        )}
                      </div>
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
