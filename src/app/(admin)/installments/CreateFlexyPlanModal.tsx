"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  DEFAULT_PACKAGES,
  type MembershipPackage,
} from "@/lib/membership-packages";
import {
  buildInstallmentSchedule,
  maxInstallmentsForTier,
} from "@/lib/installment-schedule";

type ProfileHit = {
  id: string;
  full_name: string | null;
  phone: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

function formatMnt(n: number): string {
  return `${Math.floor(n).toLocaleString("mn-MN")}₮`;
}

function parseMnt(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return 0;
  return Math.min(999_999_999, Math.floor(Number(digits) || 0));
}

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white";

export default function CreateFlexyPlanModal({ isOpen, onClose, onSuccess }: Props) {
  const [packages, setPackages] = useState<MembershipPackage[]>(DEFAULT_PACKAGES.filter((p) => p.enabled));
  const [userQuery, setUserQuery] = useState("");
  const [userHits, setUserHits] = useState<ProfileHit[]>([]);
  const [selectedUser, setSelectedUser] = useState<ProfileHit | null>(null);
  const [planTier, setPlanTier] = useState("standard3");
  const [amount, setAmount] = useState(480_000);
  const [installmentCount, setInstallmentCount] = useState(2);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const selectedPkg = packages.find((p) => p.id === planTier) ?? null;
  const maxCount = maxInstallmentsForTier(planTier, selectedPkg?.months);

  const schedule = useMemo(() => {
    if (amount <= 0 || installmentCount < 2) return [];
    try {
      return buildInstallmentSchedule({ totalAmount: amount, installmentCount });
    } catch {
      return [];
    }
  }, [amount, installmentCount]);

  useEffect(() => {
    if (!isOpen) return;
    setUserQuery("");
    setUserHits([]);
    setSelectedUser(null);
    setError("");
    setSubmitting(false);
    setInstallmentCount(2);

    const loadPackages = async () => {
      try {
        const supabase = createBrowserSupabaseClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const headers: Record<string, string> = session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {};
        const res = await fetch("/api/admin/payment-settings", { headers });
        const data = await res.json();
        if (data.ok && Array.isArray(data.settings?.packages)) {
          const enabled = (data.settings.packages as MembershipPackage[]).filter((p) => p.enabled);
          setPackages(enabled.length ? enabled : DEFAULT_PACKAGES);
          const first = enabled[0] ?? DEFAULT_PACKAGES[0];
          if (first) {
            setPlanTier(first.id);
            setAmount(first.price_mnt);
          }
        } else {
          const first = DEFAULT_PACKAGES.find((p) => p.id === "standard3") ?? DEFAULT_PACKAGES[0];
          setPlanTier(first.id);
          setAmount(first.price_mnt);
        }
      } catch {
        const first = DEFAULT_PACKAGES.find((p) => p.id === "standard3") ?? DEFAULT_PACKAGES[0];
        setPlanTier(first.id);
        setAmount(first.price_mnt);
      }
    };
    void loadPackages();
  }, [isOpen]);

  useEffect(() => {
    if (installmentCount > maxCount) setInstallmentCount(maxCount);
  }, [maxCount, installmentCount]);

  const searchUsers = useCallback(async (q: string) => {
    const term = q.trim();
    if (term.length < 2) {
      setUserHits([]);
      return;
    }
    setSearching(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`)
        .limit(12);
      setUserHits((data as ProfileHit[]) ?? []);
    } catch {
      setUserHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || selectedUser) return;
    const t = window.setTimeout(() => {
      void searchUsers(userQuery);
    }, 250);
    return () => window.clearTimeout(t);
  }, [userQuery, isOpen, selectedUser, searchUsers]);

  const onSelectPackage = (id: string) => {
    setPlanTier(id);
    const pkg = packages.find((p) => p.id === id);
    if (pkg) setAmount(pkg.price_mnt);
  };

  const submit = async () => {
    if (!selectedUser) {
      setError("Хэрэглэгч сонгоно уу.");
      return;
    }
    if (!planTier) {
      setError("Багц сонгоно уу.");
      return;
    }
    if (amount <= 0) {
      setError("Дүн буруу байна.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      };
      const res = await fetch("/api/admin/installments", {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_id: selectedUser.id,
          plan_tier: planTier,
          total_amount: amount,
          installment_count: installmentCount,
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "Үүсгэхэд алдаа");
      onSuccess();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Үүсгэхэд алдаа гарлаа");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg m-4 p-6 sm:p-8">
      <div className="pr-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Шинэ Flexy багц</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Хэрэглэгчид хуваан төлөлтийн багц үүсгэнэ. Эхний хуваарийг дараа нь төлөгдсөнд тэмдэглэж болно.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Хэрэглэгч
          </label>
          {selectedUser ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                  {selectedUser.full_name || "Нэргүй"}
                </p>
                <p className="text-xs text-gray-500">{selectedUser.phone || selectedUser.id.slice(0, 8)}</p>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-brand-500 hover:underline"
                onClick={() => {
                  setSelectedUser(null);
                  setUserQuery("");
                  setUserHits([]);
                }}
              >
                Солих
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                className={inputClass}
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="Нэр эсвэл утас хайх…"
                autoFocus
              />
              {(searching || userHits.length > 0 || userQuery.trim().length >= 2) && (
                <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
                  {searching && (
                    <p className="px-3 py-2 text-xs text-gray-400">Хайж байна…</p>
                  )}
                  {!searching && userHits.length === 0 && (
                    <p className="px-3 py-2 text-xs text-gray-400">Олдсонгүй</p>
                  )}
                  {userHits.map((u) => (
                    <button
                      key={u.id}
                      type="button"
                      className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-white/5"
                      onClick={() => {
                        setSelectedUser(u);
                        setUserHits([]);
                        setUserQuery("");
                      }}
                    >
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {u.full_name || "Нэргүй"}
                      </span>
                      <span className="text-xs text-gray-500">{u.phone || "—"}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Багц
          </label>
          <select
            className={inputClass}
            value={planTier}
            onChange={(e) => onSelectPackage(e.target.value)}
          >
            {packages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {formatMnt(p.price_mnt)} ({p.months} сар)
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Нийт дүн (₮)
            </label>
            <input
              type="text"
              inputMode="numeric"
              className={`${inputClass} tabular-nums text-right`}
              value={amount.toLocaleString("mn-MN")}
              onChange={(e) => setAmount(parseMnt(e.target.value))}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Хуваарь (2–{maxCount})
            </label>
            <select
              className={inputClass}
              value={installmentCount}
              onChange={(e) => setInstallmentCount(Number(e.target.value))}
            >
              {Array.from({ length: maxCount - 1 }, (_, i) => i + 2).map((n) => (
                <option key={n} value={n}>
                  {n} хуваарь
                </option>
              ))}
            </select>
          </div>
        </div>

        {schedule.length > 0 && (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.04]">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">
              Хуваарийн урьдчилсан харц
            </p>
            <ul className="space-y-1.5">
              {schedule.map((item) => (
                <li
                  key={item.installment_no}
                  className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300"
                >
                  <span>
                    #{item.installment_no} · {item.due_date}
                  </span>
                  <span className="tabular-nums font-medium">{formatMnt(item.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-sm text-error-500">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            Болих
          </Button>
          <Button size="sm" onClick={submit} disabled={submitting}>
            {submitting ? "Үүсгэж байна…" : "Үүсгэх"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
