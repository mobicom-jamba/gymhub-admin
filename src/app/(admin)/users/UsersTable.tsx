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
import { PencilIcon, TrashBinIcon } from "@/icons";
import type { Profile } from "./UsersSection";
import TableSkeleton from "@/components/ui/TableSkeleton";
import EmptyState from "@/components/ui/EmptyState";

const roleLabels: Record<string, string> = {
  user: "Гишүүн",
  admin: "Админ",
};

const ROLES = ["user", "admin"] as const;

const avatarColors = [
  "bg-violet-500", "bg-blue-500", "bg-emerald-500", "bg-orange-500",
  "bg-pink-500", "bg-cyan-500", "bg-fuchsia-500", "bg-rose-500",
];

function getInitials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

function daysUntil(expiresAt: string | null) {
  if (!expiresAt) return null;
  return Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000);
}

export type Density = "comfortable" | "compact";

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

  const hdr = `px-4 ${py} text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400`;

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
              <TableCell isHeader className={`sticky left-0 z-10 bg-white dark:bg-gray-900 ${hdr}`}>Гишүүн</TableCell>
              <TableCell isHeader className={hdr}>Утас</TableCell>
              <TableCell isHeader className={hdr}>Байгууллага</TableCell>
              <TableCell isHeader className={hdr}>Тариф</TableCell>
              <TableCell isHeader className={hdr}>Эхлэх огноо</TableCell>
              <TableCell isHeader className={hdr}>Дуусах огноо</TableCell>
              {(onEdit || onDelete) && (
                <TableCell isHeader className={`${hdr} text-end`}>Үйлдлүүд</TableCell>
              )}
            </TableRow>
          </TableHeader>

          <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
            {profiles.map((p, i) => {
              const colorClass = avatarColors[i % avatarColors.length];
              return (
                <TableRow key={p.id} className="transition hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                  {selectedIds && onToggleSelect && (
                    <TableCell className={`w-10 px-4 ${py}`}>
                      <input type="checkbox" checked={selectedIds.has(p.id)}
                        onChange={() => onToggleSelect(p.id)} className="size-4 cursor-pointer" />
                    </TableCell>
                  )}

                  {/* Name + avatar — sticky */}
                  <TableCell className={`sticky left-0 z-10 bg-white px-4 dark:bg-gray-900 ${py}`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${colorClass}`}>
                        {getInitials(p.full_name)}
                      </div>
                      <span className="font-medium text-gray-800 text-sm dark:text-white/90 whitespace-nowrap">{p.full_name ?? "—"}</span>
                    </div>
                  </TableCell>

                  <TableCell className={`px-4 ${py}`}>
                    <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700 dark:bg-white/[0.06] dark:text-gray-300">{p.phone ?? "—"}</span>
                  </TableCell>

                  <TableCell className={`px-4 ${py} max-w-[160px] text-sm text-gray-600 dark:text-gray-400`}>
                    <span className="block truncate" title={p.organization ?? ""}>{p.organization ?? "—"}</span>
                  </TableCell>

                  <TableCell className={`px-4 ${py}`}>
                    {p.membership_tier === "premium" ? (
                      <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-900/20 dark:text-violet-400">Premium</span>
                    ) : p.membership_tier === "early" ? (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">Early</span>
                    ) : <span className="text-gray-400 text-xs">—</span>}
                  </TableCell>

                  <TableCell className={`px-4 ${py} text-sm whitespace-nowrap text-gray-500 dark:text-gray-400`}>
                    {p.membership_started_at ? new Date(p.membership_started_at).toLocaleDateString("mn-MN") : "—"}
                  </TableCell>

                  <TableCell className={`px-4 ${py} text-sm whitespace-nowrap`}>
                    {p.membership_expires_at ? (() => {
                      const days = daysUntil(p.membership_expires_at);
                      if (days !== null && days < 0)
                        return <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">⚠️ {new Date(p.membership_expires_at).toLocaleDateString("mn-MN")}</span>;
                      if (days !== null && days <= 30)
                        return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">⏳ {days} өдөр</span>;
                      return <span className="text-gray-500 dark:text-gray-400">{new Date(p.membership_expires_at).toLocaleDateString("mn-MN")}</span>;
                    })() : <span className="text-gray-400">—</span>}
                  </TableCell>


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
