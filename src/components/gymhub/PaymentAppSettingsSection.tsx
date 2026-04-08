"use client";

import React, { useCallback, useEffect, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/components/ui/Toast";

type Settings = {
  early_membership_price_mnt: number;
  early_first_month_price_mnt: number;
  early_remainder_price_mnt: number;
  premium_membership_price_mnt: number;
  payment_qpay_enabled: boolean;
  payment_sono_enabled: boolean;
  payment_pocket_enabled: boolean;
  updated_at: string;
};

function formatMnt(n: number): string {
  return `${n.toLocaleString("mn-MN")}₮`;
}

export default function PaymentAppSettingsSection() {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [earlyLegacy, setEarlyLegacy] = useState(480_000);
  const [earlyFirst, setEarlyFirst] = useState(150_000);
  const [earlyRest, setEarlyRest] = useState(330_000);
  const [premium, setPremium] = useState(780_000);
  const [qpay, setQpay] = useState(true);
  const [sono, setSono] = useState(true);
  const [pocket, setPocket] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/payment-settings");
      const data = await res.json();
      if (!data.ok || !data.settings) {
        throw new Error(data.error || "Ачаалахад алдаа");
      }
      const s = data.settings as Settings;
      setEarlyLegacy(s.early_membership_price_mnt);
      setEarlyFirst(s.early_first_month_price_mnt);
      setEarlyRest(s.early_remainder_price_mnt);
      setPremium(s.premium_membership_price_mnt);
      setQpay(s.payment_qpay_enabled);
      setSono(s.payment_sono_enabled);
      setPocket(s.payment_pocket_enabled);
      setUpdatedAt(s.updated_at);
    } catch (e) {
      console.error(e);
      toast.show(
        e instanceof Error ? e.message : "Тохиргоо ачаалахад алдаа гарлаа",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/payment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          early_membership_price_mnt: earlyLegacy,
          early_first_month_price_mnt: earlyFirst,
          early_remainder_price_mnt: earlyRest,
          premium_membership_price_mnt: premium,
          payment_qpay_enabled: qpay,
          payment_sono_enabled: sono,
          payment_pocket_enabled: pocket,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Хадгалахад алдаа");
      }
      const s = data.settings as Settings;
      setUpdatedAt(s.updated_at);
      toast.show("Төлбөрийн тохиргоо хадгалагдлаа.");
    } catch (e) {
      console.error(e);
      toast.show(e instanceof Error ? e.message : "Хадгалахад алдаа гарлаа", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ComponentCard
      title="Төлбөр ба гишүүнчлэлийн үнэ"
      subtitle="Early (эхний сар + үлдсэн 11 сар), legacy нэг дор, Premium — QPay · Sono · Pocket"
      desc="Өөрчлөлт нь шууд /api/payment/health болон төлбөрийн API-д тусгагдана. Supabase дээр хүснэгт байхгүй бол эхлээд sql/payment_app_settings.sql ажиллуулна уу."
    >
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Ачаалж байна…</p>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="sm:col-span-2 lg:col-span-3">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                Early — хуваагдсан төлбөр (аппын үндсэн горим)
              </p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Эхний 1 сар (₮)
              </label>
              <input
                type="number"
                min={0}
                max={999_999_999}
                value={earlyFirst}
                onChange={(e) => setEarlyFirst(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-900 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-400">{formatMnt(earlyFirst)}</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Үлдсэн 11 сар (₮)
              </label>
              <input
                type="number"
                min={0}
                max={999_999_999}
                value={earlyRest}
                onChange={(e) => setEarlyRest(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-900 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-400">{formatMnt(earlyRest)}</p>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Нэг дор Early (legacy, ₮)
              </label>
              <input
                type="number"
                min={0}
                max={999_999_999}
                value={earlyLegacy}
                onChange={(e) => setEarlyLegacy(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-900 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-400">
                Хуучин нэхэмжлэл <code className="rounded bg-gray-100 px-1 dark:bg-white/10">membership-early-…</code>
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Premium (₮)
              </label>
              <input
                type="number"
                min={0}
                max={999_999_999}
                value={premium}
                onChange={(e) => setPremium(Number(e.target.value) || 0)}
                className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-gray-900 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white"
              />
              <p className="mt-1 text-xs text-gray-400">{formatMnt(premium)}</p>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.04]">
            <p className="text-sm font-medium text-gray-800 dark:text-white/90">
              Төлбөрийн суваг (апп дээр харагдах)
            </p>
            {[
              {
                id: "qpay",
                label: "QPay",
                logo: "/logos/qpay.png",
                checked: qpay,
                set: setQpay,
              },
              {
                id: "sono",
                label: "Sono зээл",
                logo: "/logos/sono.png",
                checked: sono,
                set: setSono,
              },
              {
                id: "pocket",
                label: "Pocket хуваалт",
                logo: "/logos/pocket.png",
                checked: pocket,
                set: setPocket,
              },
            ].map((row) => (
              <label
                key={row.id}
                className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-2 hover:bg-white dark:hover:bg-white/5"
              >
                <span className="flex items-center gap-3">
                  <img
                    src={row.logo}
                    alt={row.label}
                    className="h-8 w-8 rounded-md border border-gray-200 object-contain bg-white p-1 dark:border-gray-700 dark:bg-gray-900"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{row.label}</span>
                </span>
                <input
                  type="checkbox"
                  checked={row.checked}
                  onChange={(e) => row.set(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                />
              </label>
            ))}
          </div>

          {updatedAt && (
            <p className="text-xs text-gray-400">
              Сүүлд шинэчилсэн: {new Date(updatedAt).toLocaleString("mn-MN", { hour12: false })}
            </p>
          )}

          <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
            {saving ? "Хадгалж байна…" : "Хадгалах"}
          </Button>
        </div>
      )}
    </ComponentCard>
  );
}
