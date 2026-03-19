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
import { PencilIcon, TrashBinIcon } from "@/icons";

const roleLabels: Record<string, string> = {
  user: t("member"),
  admin: t("admin"),
};

const ROLES = ["user", "admin"] as const;

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  created_at: string;
};

export default function UsersTable({
  profiles,
  error,
  onRoleChange,
  onEdit,
  onDelete,
  selectedIds,
  onToggleSelect,
  onToggleSelectAll,
}: {
  profiles: Profile[];
  error?: string;
  onRoleChange?: (profileId: string, newRole: string) => void;
  onEdit?: (profile: Profile) => void;
  onDelete?: (profileId: string) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
  onToggleSelectAll?: () => void;
}) {
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const handleRoleSelect = async (p: Profile, newRole: string) => {
    if (newRole === (p.role ?? "user")) return;
    if (!onRoleChange) return;
    setUpdatingId(p.id);
    await onRoleChange(p.id, newRole);
    setUpdatingId(null);
  };

  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        {t("error")}: {error}
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        {t("users")} олдсонгүй
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      <div className="max-w-full overflow-x-auto">
        <Table>
          <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
            <TableRow>
              {selectedIds && onToggleSelectAll && (
                <TableCell
                  isHeader
                  className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.size === profiles.length && profiles.length > 0}
                    onChange={onToggleSelectAll}
                    className="size-4 cursor-pointer"
                  />
                </TableCell>
              )}
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("fullName")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("phone")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("role")}
              </TableCell>
              <TableCell
                isHeader
                className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400"
              >
                {t("date")}
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
            {profiles.map((p) => (
              <TableRow key={p.id}>
                {selectedIds && onToggleSelect && (
                  <TableCell className="px-5 py-4">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(p.id)}
                      onChange={() => onToggleSelect(p.id)}
                      className="size-4 cursor-pointer"
                    />
                  </TableCell>
                )}
                <TableCell className="px-5 py-4 font-medium text-gray-800 text-theme-sm dark:text-white/90">
                  {p.full_name ?? "—"}
                </TableCell>
                <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                  {p.phone ?? "—"}
                </TableCell>
                <TableCell className="px-5 py-4">
                  {onRoleChange ? (
                    <select
                      value={p.role ?? "user"}
                      onChange={(e) => handleRoleSelect(p, e.target.value)}
                      disabled={updatingId === p.id}
                      className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20"
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {roleLabels[r]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Badge
                      size="sm"
                      color={p.role === "admin" ? "warning" : "primary"}
                    >
                      {roleLabels[p.role ?? "user"] ?? p.role}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="px-5 py-4 text-gray-500 text-theme-sm dark:text-gray-400">
                  {new Date(p.created_at).toLocaleDateString("mn-MN")}
                </TableCell>
                {(onEdit || onDelete) && (
                  <TableCell className="px-5 py-4 text-end">
                    <div className="flex justify-end gap-2">
                      {onEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(p)}
                          startIcon={<PencilIcon className="size-4" />}
                        >
                          {t("edit")}
                        </Button>
                      )}
                      {onDelete && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => onDelete(p.id)}
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
