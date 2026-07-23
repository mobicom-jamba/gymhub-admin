"use client";

import React from "react";
import { getUserPlaceholderAvatar } from "@/lib/user-avatar";
import {
  getMembershipPaymentBadge,
  getMembershipPlanVisual,
  isUnpaidMembership,
  membershipPlanBadgeClass,
} from "@/lib/membership-plan-label";

type UserRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  company?: string | null;
  created_at: string;
  membership_status?: string | null;
  membership_tier?: string | null;
  membership_started_at?: string | null;
  membership_expires_at?: string | null;
};

export default function NewUsersCard({ users }: { users: UserRow[] }) {
  if (users.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 dark:text-gray-400">
        Шинээр бүртгэгдсэн хэрэглэгч байхгүй байна.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {users.map((u) => {
        const pay = getMembershipPaymentBadge(u.membership_status);
        const unpaid = isUnpaidMembership(u.membership_status);
        const plan = getMembershipPlanVisual({
          membership_tier: u.membership_tier ?? null,
          membership_started_at: u.membership_started_at ?? null,
          membership_expires_at: u.membership_expires_at ?? null,
          membership_status: u.membership_status ?? null,
        });
        return (
        <div
          key={u.id}
          className={[
            "flex items-center gap-3 rounded-lg px-2 py-2.5 transition",
            unpaid
              ? "bg-rose-50/40 hover:bg-rose-50/70 dark:bg-rose-950/10 dark:hover:bg-rose-950/20"
              : "hover:bg-gray-50 dark:hover:bg-white/[0.03]",
          ].join(" ")}
        >
          <img
            src={getUserPlaceholderAvatar(u.id || u.full_name)}
            alt="avatar"
            className="h-9 w-9 shrink-0 rounded-full object-cover"
          />
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-gray-800 dark:text-white/90 text-sm truncate">
                {u.full_name ?? "—"}
              </p>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${pay.className}`}>
                {pay.label}
              </span>
              {!unpaid && plan.shortLabel !== "—" && plan.variant !== "unpaid" && (
                <span
                  title={plan.title}
                  className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${membershipPlanBadgeClass(plan.variant)}`}
                >
                  {plan.shortLabel}
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              {u.company ?? "—"} · {new Date(u.created_at).toLocaleDateString("mn-MN")}
            </p>
          </div>
          <span className="shrink-0 rounded-lg bg-green-50 px-2 py-1 text-xs font-mono font-semibold text-green-700 dark:bg-green-900/20 dark:text-green-400">
            {u.phone ?? "—"}
          </span>
        </div>
      );
      })}
    </div>
  );
}
