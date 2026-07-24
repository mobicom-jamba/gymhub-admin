"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { useAuth } from "@/context/AuthContext";
import { TrashBinIcon } from "@/icons";
import SearchInput from "@/components/common/SearchInput";
import { canonicalPlanKey, planTierDisplayLabel } from "@/lib/membership-plan-label";

type Payment = {
  id: string;
  installment_no: number;
  amount: number;
  due_date: string;
  status: "pending" | "invoice_created" | "paid" | "overdue";
  paid_at: string | null;
};

type Plan = {
  id: string;
  user_id: string;
  booking_id: string;
  plan_tier: string;
  total_amount: number;
  installment_count: number;
  status: "active" | "completed" | "cancelled";
  created_at: string;
  profile: { full_name: string | null; phone: string | null } | null;
  payments: Payment[];
};

type PlanStatusFilter = "all" | Plan["status"];
type PayStatusFilter = "all" | "overdue" | "pending" | "paid";
type TierFilter = "all" | "premium1" | "premium2" | "early" | "standard" | "gymcore" | "other";

const PLAN_STATUS_OPTIONS: { value: PlanStatusFilter; label: string }[] = [
  { value: "all", label: "Бүгд" },
  { value: "active", label: "Идэвхтэй" },
  { value: "completed", label: "Дууссан" },
  { value: "cancelled", label: "Цуцлагдсан" },
];

const PAY_STATUS_OPTIONS: { value: PayStatusFilter; label: string }[] = [
  { value: "all", label: "Бүгд" },
  { value: "overdue", label: "Хэтэрсэн" },
  { value: "pending", label: "Хүлээгдэж буй" },
  { value: "paid", label: "Бүгд төлсөн" },
];

const TIER_OPTIONS: { value: TierFilter; label: string }[] = [
  { value: "all", label: "Бүгд" },
  { value: "premium1", label: "Premium 1" },
  { value: "premium2", label: "Premium 2" },
  { value: "early", label: "Early" },
  { value: "standard", label: "Standard" },
  { value: "gymcore", label: "GymCore" },
  { value: "other", label: "Бусад" },
];

function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap rounded-xl border border-gray-200 bg-white p-1 dark:border-gray-700 dark:bg-gray-800">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            value === opt.value
              ? "bg-brand-500 text-white"
              : "text-gray-600 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/5"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function matchesPayStatus(plan: Plan, filter: PayStatusFilter): boolean {
  if (filter === "all") return true;
  const hasOverdue = plan.payments.some((p) => p.status === "overdue");
  const allPaid =
    plan.payments.length > 0 && plan.payments.every((p) => p.status === "paid");
  const hasUnpaid = plan.payments.some((p) => p.status !== "paid");
  if (filter === "overdue") return hasOverdue;
  if (filter === "paid") return allPaid || plan.status === "completed";
  if (filter === "pending") return hasUnpaid && !hasOverdue;
  return true;
}

function matchesTier(plan: Plan, filter: TierFilter): boolean {
  if (filter === "all") return true;
  const key = canonicalPlanKey(plan.plan_tier);
  if (filter === "other") {
    return !["premium1", "premium2", "early", "standard", "gymcore"].includes(key);
  }
  return key === filter;
}

function formatMnt(n: number): string {
  return `${n.toLocaleString("mn-MN")}₮`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("mn-MN");
}

function isSameLocalDay(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function planStats(plan: Plan) {
  const paid = plan.payments.filter((p) => p.status === "paid");
  const unpaid = plan.payments.filter((p) => p.status !== "paid");
  const paidAmount = paid.reduce((s, p) => s + Number(p.amount), 0);
  const remainingAmount = unpaid.reduce((s, p) => s + Number(p.amount), 0);
  const next = unpaid[0] ?? null;
  const pct =
    plan.installment_count > 0
      ? Math.round((paid.length / plan.installment_count) * 100)
      : 0;
  return {
    paidCount: paid.length,
    unpaidCount: unpaid.length,
    paidAmount,
    remainingAmount,
    next,
    pct,
  };
}

function PlanCard({
  plan,
  isAdmin,
  actioningId,
  onCancel,
  onForceDelete,
  onMarkPaid,
}: {
  plan: Plan;
  isAdmin: boolean;
  actioningId: string | null;
  onCancel: (plan: Plan) => void;
  onForceDelete: (plan: Plan) => void;
  onMarkPaid: (payment: Payment) => void;
}) {
  const stats = useMemo(() => planStats(plan), [plan]);
  const nextId = stats.next?.id ?? null;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-gray-900 dark:text-white/90">
              {plan.profile?.full_name ?? plan.user_id.slice(0, 8)}
              {plan.profile?.phone ? ` · ${plan.profile.phone}` : ""}
            </p>
            <Badge
              size="sm"
              color={
                plan.status === "active"
                  ? "success"
                  : plan.status === "completed"
                    ? "primary"
                    : "light"
              }
            >
              {plan.status === "active"
                ? "Идэвхтэй"
                : plan.status === "completed"
                  ? "Дууссан"
                  : "Цуцлагдсан"}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {planTierDisplayLabel(plan.plan_tier)} · {formatMnt(plan.total_amount)} ·{" "}
            {plan.installment_count} хуваарь · Эхэлсэн:{" "}
            {formatDate(plan.created_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && plan.status === "active" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onCancel(plan)}
              disabled={actioningId !== null}
              className="text-error-600 hover:bg-error-50 dark:text-error-400"
            >
              Цуцлах
            </Button>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onForceDelete(plan)}
              disabled={actioningId !== null}
              aria-label="Force delete"
              title="Force delete"
              className="border-error-300 px-2.5 text-error-700 hover:bg-error-50 dark:border-error-800 dark:text-error-400 dark:hover:bg-error-950/40"
            >
              <TrashBinIcon className="size-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 px-5 pb-5 lg:grid-cols-4">
        <SummaryCard
          label="Нийт дүн"
          value={formatMnt(plan.total_amount)}
          hint={`${plan.installment_count} хуваарь`}
          tone="blue"
          icon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a2.25 2.25 0 00-2.25 2.25v6.75A2.25 2.25 0 0015 21h3.75A2.25 2.25 0 0021 18.75V12z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5A2.25 2.25 0 015.25 8.25H9A2.25 2.25 0 0111.25 10.5v6.75A2.25 2.25 0 019 19.5H5.25A2.25 2.25 0 013 17.25V10.5z" />
            </svg>
          }
        />
        <SummaryCard
          label="Төлөгдсөн"
          value={formatMnt(stats.paidAmount)}
          hint={`${stats.paidCount}/${plan.installment_count} төлөгдсөн (${stats.pct}%)`}
          tone="green"
          icon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          }
        />
        <SummaryCard
          label="Үлдэгдэл дүн"
          value={formatMnt(stats.remainingAmount)}
          hint={`${stats.unpaidCount} хуваарь үлдсэн`}
          tone="orange"
          icon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <SummaryCard
          label="Дараагийн төлөлт"
          value={stats.next ? formatDate(stats.next.due_date) : "—"}
          hint={
            stats.next
              ? isSameLocalDay(stats.next.due_date)
                ? "Өнөөдөр"
                : formatMnt(stats.next.amount)
              : "Бүгд төлөгдсөн"
          }
          tone="purple"
          icon={
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3.75 8.25h16.5M4.5 6.75h15A1.5 1.5 0 0121 8.25v11.25A1.5 1.5 0 0119.5 21h-15A1.5 1.5 0 013 19.5V8.25A1.5 1.5 0 014.5 6.75z" />
            </svg>
          }
        />
      </div>

      {/* Horizontal circled stepper */}
      <div className="overflow-x-auto px-5 pb-6">
        <div className="flex min-w-max items-start justify-between gap-0">
          {plan.payments.map((p, idx) => {
            const paid = p.status === "paid";
            const overdue = p.status === "overdue";
            const isNext = p.id === nextId;

            return (
              <div
                key={p.id}
                className="relative flex w-[7.25rem] flex-col items-center"
              >
                {/* Connector to next */}
                {idx < plan.payments.length - 1 && (
                  <div
                    className={`absolute top-[15px] left-[calc(50%+18px)] right-[calc(-50%+18px)] ${
                      overdue
                        ? "h-0.5 bg-error-500"
                        : paid
                          ? "h-0.5 bg-success-500"
                          : isNext
                            ? "h-0.5 bg-brand-500"
                            : "border-t-2 border-dashed border-gray-200 dark:border-gray-700"
                    }`}
                    aria-hidden
                  />
                )}

                <button
                  type="button"
                  disabled={paid || !isAdmin || actioningId !== null}
                  onClick={() => {
                    if (!isAdmin || paid) return;
                    const ok = window.confirm(
                      `${p.installment_no}-р хуваарь (${formatMnt(p.amount)})-г төлөгдсөнд тэмдэглэх үү?`,
                    );
                    if (ok) onMarkPaid(p);
                  }}
                  title={
                    paid
                      ? "Төлөгдсөн"
                      : !isAdmin
                        ? undefined
                        : overdue
                          ? "Хугацаа хэтэрсэн — төлөгдсөнд тэмдэглэх"
                          : "Төлөгдсөнд тэмдэглэх"
                  }
                  className={[
                    "relative z-10 flex size-8 items-center justify-center rounded-full text-sm font-bold transition",
                    paid
                      ? "bg-success-500 text-white shadow-[0_0_0_4px_rgba(34,197,94,0.22)]"
                      : overdue
                        ? "bg-error-500 text-white shadow-[0_0_0_4px_rgba(239,68,68,0.22)]"
                        : isNext
                          ? "bg-brand-500 text-white shadow-[0_0_0_4px_rgba(70,95,255,0.18)]"
                          : "border-2 border-gray-200 bg-white text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300",
                    isAdmin && !paid
                      ? "cursor-pointer hover:brightness-110"
                      : "cursor-default",
                    actioningId === p.id ? "opacity-60" : "",
                  ].join(" ")}
                >
                  {paid ? (
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : (
                    p.installment_no
                  )}
                </button>

                <div className="mt-2.5 flex flex-col items-center gap-0.5 text-center">
                  {overdue ? (
                    <span className="rounded-md bg-error-50 px-1.5 py-0.5 text-[10px] font-semibold text-error-600 dark:bg-error-500/15 dark:text-error-400">
                      Хэтэрсэн
                    </span>
                  ) : isNext && isSameLocalDay(p.due_date) ? (
                    <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                      Өнөөдөр
                    </span>
                  ) : null}
                  <span
                    className={`text-[11px] tabular-nums ${
                      overdue
                        ? "text-error-700 dark:text-error-300"
                        : paid
                          ? "text-success-700 dark:text-success-300"
                          : isNext
                            ? "text-gray-700 dark:text-gray-200"
                            : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {formatDate(p.due_date)}
                  </span>
                  <span
                    className={`text-xs font-semibold tabular-nums ${
                      overdue
                        ? "text-error-600 dark:text-error-400"
                        : paid
                          ? "text-success-600 dark:text-success-400"
                          : isNext
                            ? "text-brand-600 dark:text-brand-400"
                            : "text-gray-500 dark:text-gray-400"
                    }`}
                  >
                    {formatMnt(p.amount)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: string;
  hint: string;
  tone: "blue" | "green" | "orange" | "purple";
  icon: React.ReactNode;
}) {
  const tones = {
    blue: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    green: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-400",
    orange: "bg-orange-50 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400",
    purple: "bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300",
  };

  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <div className="flex items-center gap-2">
        <span className={`inline-flex size-7 items-center justify-center rounded-lg ${tones[tone]}`}>
          {icon}
        </span>
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
          {label}
        </span>
      </div>
      <p className="mt-2 text-base font-bold tabular-nums text-gray-900 dark:text-white">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{hint}</p>
    </div>
  );
}

function Pulse({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-gray-200/90 dark:bg-white/[0.08] ${className}`}
    />
  );
}

function PlanCardSkeleton({ delayMs = 0 }: { delayMs?: number }) {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]"
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-4">
        <div className="space-y-2">
          <Pulse className="h-4 w-48" />
          <Pulse className="h-3 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <Pulse className="h-8 w-16 rounded-lg" />
          <Pulse className="h-8 w-8 rounded-lg" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 px-5 pb-5 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-gray-100 bg-gray-50/60 px-3.5 py-3 dark:border-white/[0.06] dark:bg-white/[0.03]"
          >
            <div className="flex items-center gap-2">
              <Pulse className="size-7 rounded-lg" />
              <Pulse className="h-3 w-16" />
            </div>
            <Pulse className="mt-2 h-5 w-24" />
            <Pulse className="mt-1.5 h-3 w-20" />
          </div>
        ))}
      </div>

      <div className="overflow-x-auto px-5 pb-6">
        <div className="flex min-w-max items-start justify-between gap-0">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="relative flex w-[7.25rem] flex-col items-center">
              {i < 5 && (
                <div
                  className="absolute top-[15px] left-[calc(50%+18px)] right-[calc(-50%+18px)] border-t-2 border-dashed border-gray-200 dark:border-gray-700"
                  aria-hidden
                />
              )}
              <Pulse className="relative z-10 size-8 rounded-full" />
              <div className="mt-2.5 flex flex-col items-center gap-1.5">
                <Pulse className="h-3 w-14" />
                <Pulse className="h-3.5 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InstallmentsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Ачаалж байна">
      {Array.from({ length: count }).map((_, i) => (
        <PlanCardSkeleton key={i} delayMs={i * 80} />
      ))}
    </div>
  );
}

export default function InstallmentsSection() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const { role } = useAuth();
  const isAdmin = role === "admin";
  const [plans, setPlans] = useState<Plan[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [planStatus, setPlanStatus] = useState<PlanStatusFilter>("active");
  const [payStatus, setPayStatus] = useState<PayStatusFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");
  const hasLoadedOnce = useRef(false);

  const getAuthHeaders = useCallback(async (extra: Record<string, string> = {}): Promise<Record<string, string>> => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const auth: Record<string, string> = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
    return { ...extra, ...auth };
  }, []);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    const soft = opts?.soft === true || hasLoadedOnce.current;
    if (soft) setRefreshing(true);
    else setInitialLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/installments", { headers });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Ачаалахад алдаа гарлаа");
      setPlans(data.plans ?? []);
      hasLoadedOnce.current = true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ачаалахад алдаа гарлаа");
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredPlans = useMemo(() => {
    const q = search.trim().toLowerCase();
    return plans.filter((plan) => {
      if (planStatus !== "all" && plan.status !== planStatus) return false;
      if (!matchesPayStatus(plan, payStatus)) return false;
      if (!matchesTier(plan, tierFilter)) return false;
      if (q) {
        const name = (plan.profile?.full_name ?? "").toLowerCase();
        const phone = (plan.profile?.phone ?? "").toLowerCase();
        const tier = planTierDisplayLabel(plan.plan_tier).toLowerCase();
        const rawTier = plan.plan_tier.toLowerCase();
        if (
          !name.includes(q) &&
          !phone.includes(q) &&
          !tier.includes(q) &&
          !rawTier.includes(q) &&
          !plan.user_id.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [plans, search, planStatus, payStatus, tierFilter]);

  const markPaid = async (payment: Payment) => {
    setActioningId(payment.id);
    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch(`/api/admin/installments/${payment.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "mark_paid" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Алдаа гарлаа");
      toastRef.current.show("Хуваарь төлөгдсөнд тэмдэглэгдлээ.");
      await load({ soft: true });
    } catch (e) {
      toastRef.current.show(e instanceof Error ? e.message : "Алдаа гарлаа", "error");
    } finally {
      setActioningId(null);
    }
  };

  const cancelPlan = async (plan: Plan) => {
    const firstPayment = plan.payments[0];
    if (!firstPayment) return;
    setActioningId(plan.id);
    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch(`/api/admin/installments/${firstPayment.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "cancel_plan" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Алдаа гарлаа");
      toastRef.current.show("Багц цуцлагдлаа.");
      await load({ soft: true });
    } catch (e) {
      toastRef.current.show(e instanceof Error ? e.message : "Алдаа гарлаа", "error");
    } finally {
      setActioningId(null);
    }
  };

  const forceDeletePlan = async (plan: Plan) => {
    const name = plan.profile?.full_name ?? plan.user_id.slice(0, 8);
    const ok = window.confirm(
      `"${name}" — ${planTierDisplayLabel(plan.plan_tier)} багцыг бүрмөсөн устгах уу?\n\nЭнэ үйлдлийг буцаах боломжгүй. Хуваарьт төлбөрүүд мөн устна.`,
    );
    if (!ok) return;

    const targetId = plan.payments[0]?.id ?? plan.id;
    setActioningId(plan.id);
    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch(`/api/admin/installments/${targetId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "force_delete" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Алдаа гарлаа");
      // Optimistic remove for snappy UX
      setPlans((prev) => prev.filter((p) => p.id !== plan.id));
      toastRef.current.show("Багц бүрмөсөн устгагдлаа.");
      await load({ soft: true });
    } catch (e) {
      toastRef.current.show(e instanceof Error ? e.message : "Алдаа гарлаа", "error");
    } finally {
      setActioningId(null);
    }
  };

  if (error && !hasLoadedOnce.current) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        <p>{error}</p>
        <button
          type="button"
          onClick={() => load()}
          className="mt-3 text-sm font-semibold underline underline-offset-2"
        >
          Дахин ачаалах
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Нэр, утас хайх…"
            className="sm:max-w-xs"
          />
          <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
            {refreshing && (
              <span className="inline-flex items-center gap-1.5 text-brand-500 dark:text-brand-400">
                <span className="size-3.5 animate-spin rounded-full border-2 border-brand-500/30 border-t-brand-500" />
                Шинэчилж байна…
              </span>
            )}
            {!initialLoading && (
              <span>
                {filteredPlans.length}/{plans.length} багц
              </span>
            )}
          </div>
        </div>
        <div
          className={`flex flex-col gap-2 lg:flex-row lg:flex-wrap lg:items-center lg:gap-3 ${
            initialLoading ? "pointer-events-none opacity-60" : ""
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-gray-400">Төлөв</span>
            <FilterChips
              options={PLAN_STATUS_OPTIONS}
              value={planStatus}
              onChange={setPlanStatus}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-gray-400">Төлбөр</span>
            <FilterChips
              options={PAY_STATUS_OPTIONS}
              value={payStatus}
              onChange={setPayStatus}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-gray-400">Багц</span>
            <FilterChips
              options={TIER_OPTIONS}
              value={tierFilter}
              onChange={setTierFilter}
            />
          </div>
        </div>
      </div>

      {error && hasLoadedOnce.current && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
          Шинэчлэхэд алдаа гарлаа: {error}{" "}
          <button type="button" onClick={() => load({ soft: true })} className="font-semibold underline">
            Дахин оролдох
          </button>
        </div>
      )}

      {initialLoading ? (
        <InstallmentsSkeleton count={3} />
      ) : plans.length === 0 ? (
        <EmptyState
          title="Flexy багц олдсонгүй"
          description="Одоогоор Flexy хуваан төлөлтийн багц алга."
          icon="search"
        />
      ) : filteredPlans.length === 0 ? (
        <EmptyState
          title="Шүүлтүүрт таарах багц алга"
          description="Хайлт эсвэл шүүлтүүрээ өөрчилж үзнэ үү."
          icon="search"
        />
      ) : (
        <div
          className={`space-y-5 transition-opacity duration-200 ${
            refreshing ? "opacity-70" : "opacity-100"
          }`}
        >
          {filteredPlans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              isAdmin={isAdmin}
              actioningId={actioningId}
              onCancel={cancelPlan}
              onForceDelete={forceDeletePlan}
              onMarkPaid={markPaid}
            />
          ))}
        </div>
      )}
    </div>
  );
}
