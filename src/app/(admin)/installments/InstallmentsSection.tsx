"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import Badge from "@/components/ui/badge/Badge";
import Button from "@/components/ui/button/Button";
import EmptyState from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

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

const statusColors: Record<Payment["status"], "primary" | "warning" | "success" | "error"> = {
  pending: "primary",
  invoice_created: "warning",
  paid: "success",
  overdue: "error",
};

const statusLabels: Record<Payment["status"], string> = {
  pending: "Хүлээгдэж байна",
  invoice_created: "Нэхэмжлэл үүссэн",
  paid: "Төлөгдсөн",
  overdue: "Хугацаа хэтэрсэн",
};

function formatMnt(n: number): string {
  return `${n.toLocaleString("mn-MN")}₮`;
}

export default function InstallmentsSection() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actioningId, setActioningId] = useState<string | null>(null);

  const getAuthHeaders = useCallback(async (extra: Record<string, string> = {}): Promise<Record<string, string>> => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const auth: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    return { ...extra, ...auth };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/installments", { headers });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Ачаалахад алдаа гарлаа");
      setPlans(data.plans ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ачаалахад алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const markPaid = async (paymentId: string) => {
    setActioningId(paymentId);
    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch(`/api/admin/installments/${paymentId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action: "mark_paid" }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Алдаа гарлаа");
      toastRef.current.show("Хуваарь төлөгдсөнд тэмдэглэгдлээ.");
      await load();
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
      await load();
    } catch (e) {
      toastRef.current.show(e instanceof Error ? e.message : "Алдаа гарлаа", "error");
    } finally {
      setActioningId(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500 dark:text-gray-400">Ачаалж байна…</p>;
  }
  if (error) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-400">
        {error}
      </div>
    );
  }
  if (plans.length === 0) {
    return <EmptyState title="Flexy багц олдсонгүй" description="Одоогоор идэвхтэй Flexy хуваан төлөлтийн багц алга." icon="search" />;
  }

  return (
    <div className="space-y-6">
      {plans.map((plan) => (
        <div
          key={plan.id}
          className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-white/[0.05] dark:bg-white/[0.03]"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 dark:border-white/[0.05]">
            <div>
              <p className="font-medium text-gray-800 dark:text-white/90">
                {plan.profile?.full_name ?? plan.user_id.slice(0, 8)}
                {plan.profile?.phone ? ` · ${plan.profile.phone}` : ""}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {plan.plan_tier.toUpperCase()} · {formatMnt(plan.total_amount)} / {plan.installment_count} хуваарь ·{" "}
                {new Date(plan.created_at).toLocaleDateString("mn-MN")}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge size="sm" color={plan.status === "active" ? "primary" : plan.status === "completed" ? "success" : "light"}>
                {plan.status === "active" ? "Идэвхтэй" : plan.status === "completed" ? "Дууссан" : "Цуцлагдсан"}
              </Badge>
              {plan.status === "active" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cancelPlan(plan)}
                  disabled={actioningId !== null}
                  className="text-error-600 hover:bg-error-50 dark:text-error-400"
                >
                  Цуцлах
                </Button>
              )}
            </div>
          </div>
          <div className="max-w-full overflow-x-auto">
            <Table>
              <TableHeader className="border-b border-gray-100 dark:border-white/[0.05]">
                <TableRow>
                  <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Хуваарь
                  </TableCell>
                  <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Хугацаа
                  </TableCell>
                  <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Дүн
                  </TableCell>
                  <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-start text-theme-xs dark:text-gray-400">
                    Төлөв
                  </TableCell>
                  <TableCell isHeader className="px-5 py-3 font-medium text-gray-500 text-end text-theme-xs dark:text-gray-400">
                    Үйлдэл
                  </TableCell>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-gray-100 dark:divide-white/[0.05]">
                {plan.payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="px-5 py-3 text-gray-800 text-theme-sm dark:text-white/90">
                      {p.installment_no}/{plan.installment_count}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {new Date(p.due_date).toLocaleDateString("mn-MN")}
                    </TableCell>
                    <TableCell className="px-5 py-3 text-gray-500 text-theme-sm dark:text-gray-400">
                      {formatMnt(p.amount)}
                    </TableCell>
                    <TableCell className="px-5 py-3">
                      <Badge size="sm" color={statusColors[p.status]}>
                        {statusLabels[p.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="px-5 py-3 text-end">
                      {p.status !== "paid" && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => markPaid(p.id)}
                          disabled={actioningId !== null}
                        >
                          Төлөгдсөнд тэмдэглэх
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      ))}
    </div>
  );
}
