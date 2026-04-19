"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { PlusIcon } from "@/icons";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import { parseApiError } from "@/lib/api-response";
import flatpickr from "flatpickr";
import { Mongolian } from "flatpickr/dist/l10n/mn.js";

type Coupon = {
  id: string;
  partner_name: string;
  title: string;
  description: string | null;
  discount_percent: number;
  partner_logo_url: string | null;
  expires_at: string | null;
  is_active: boolean;
  view_count: number;
  required_tier: string | null;
  created_at: string;
};

type CouponFormData = {
  partner_name: string;
  title: string;
  description: string;
  discount_percent: number;
  expires_at: string;
  partner_logo_url: string;
  is_active: boolean;
};

const EMPTY_FORM: CouponFormData = {
  partner_name: "",
  title: "",
  description: "",
  discount_percent: 10,
  expires_at: "",
  partner_logo_url: "",
  is_active: true,
};

async function getAuthHeaders(): Promise<HeadersInit> {
  const sb = createBrowserSupabaseClient();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function CouponsSection() {
  const toast = useToast();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Coupon | null>(null);
  const [deleting, setDeleting] = useState(false);

  const expiresInputRef = useRef<HTMLInputElement | null>(null);
  const expiresPickerRef = useRef<flatpickr.Instance | null>(null);

  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Зөвхөн зураг файл оруулна уу.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Файлын хэмжээ 5MB-аас бага байх ёстой.");
      return;
    }
    setUploadingLogo(true);
    setUploadError("");
    try {
      const ext = file.name.split(".").pop() || "png";
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "media-public");
      formData.append("path", `coupons/${Date.now()}.${ext}`);
      const sb = createBrowserSupabaseClient();
      const { data } = await sb.auth.getSession();
      const token = data.session?.access_token;
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Зураг оруулахад алдаа гарлаа");
      setForm((f) => ({ ...f, partner_logo_url: json.url }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Зураг оруулахад алдаа гарлаа");
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/coupons", { headers });
      if (!res.ok) {
        const msg = await parseApiError(res);
        setError(msg);
        return;
      }
      const json = await res.json();
      setCoupons(json.data ?? []);
    } catch {
      setError("Купоны жагсаалт ачаалж чадсангүй.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCoupons();
  }, [fetchCoupons]);

  useEffect(() => {
    if (!modalOpen || !expiresInputRef.current) return;

    expiresPickerRef.current?.destroy();
    const instance = flatpickr(expiresInputRef.current, {
      dateFormat: "Y-m-d",
      locale: Mongolian,
      disableMobile: true,
      allowInput: false,
      clickOpens: true,
      monthSelectorType: "static",
      minDate: "today",
      onChange: (_dates, dateStr) => {
        setForm((f) => ({ ...f, expires_at: dateStr }));
      },
    });
    expiresPickerRef.current = instance;

    return () => {
      instance.destroy();
      expiresPickerRef.current = null;
    };
  }, [modalOpen]);

  useEffect(() => {
    const picker = expiresPickerRef.current;
    if (!picker) return;
    if (form.expires_at) {
      picker.setDate(form.expires_at, false, "Y-m-d");
    } else {
      picker.clear(false);
    }
  }, [form.expires_at]);

  const openCreate = () => {
    setEditingCoupon(null);
    setForm(EMPTY_FORM);
    setUploadError("");
    setModalOpen(true);
  };

  const openEdit = (coupon: Coupon) => {
    setEditingCoupon(coupon);
    setForm({
      partner_name: coupon.partner_name,
      title: coupon.title,
      description: coupon.description || "",
      discount_percent: coupon.discount_percent,
      expires_at: coupon.expires_at ? coupon.expires_at.slice(0, 10) : "",
      partner_logo_url: coupon.partner_logo_url || "",
      is_active: coupon.is_active,
    });
    setUploadError("");
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.partner_name.trim() || !form.title.trim()) {
      toast.show("Партнерын нэр болон купоны нэр заавал оруулна уу.", "error");
      return;
    }
    setSaving(true);
    try {
      const headers = await getAuthHeaders();
      const payload = {
        partner_name: form.partner_name,
        title: form.title,
        description: form.description || null,
        discount_percent: form.discount_percent,
        expires_at: form.expires_at || null,
        partner_logo_url: form.partner_logo_url || null,
        is_active: form.is_active,
      };

      const url = editingCoupon
        ? `/api/admin/coupons/${editingCoupon.id}`
        : "/api/admin/coupons";
      const method = editingCoupon ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers,
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const msg = await parseApiError(res);
        toast.show(msg, "error");
        return;
      }

      toast.show(editingCoupon ? "Купон шинэчлэгдлээ." : "Купон үүсгэгдлээ.", "success");
      setModalOpen(false);
      fetchCoupons();
    } catch {
      toast.show("Системийн алдаа гарлаа.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/coupons/${deleteTarget.id}`, {
        method: "DELETE",
        headers,
      });
      if (!res.ok) {
        const msg = await parseApiError(res);
        toast.show(msg, "error");
        return;
      }
      toast.show("Купон устгагдлаа.", "success");
      setDeleteTarget(null);
      fetchCoupons();
    } catch {
      toast.show("Устгахад алдаа гарлаа.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const toggleActive = async (coupon: Coupon) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ is_active: !coupon.is_active }),
      });
      if (!res.ok) {
        const msg = await parseApiError(res);
        toast.show(msg, "error");
        return;
      }
      setCoupons((prev) =>
        prev.map((c) => (c.id === coupon.id ? { ...c, is_active: !c.is_active } : c)),
      );
    } catch {
      toast.show("Төлөв солиход алдаа гарлаа.", "error");
    }
  };

  return (
    <>
      <ComponentCard title="Партнер купон">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Нийт: {coupons.length} купон
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 transition-colors"
          >
            <PlusIcon className="h-4 w-4" />
            Купон нэмэх
          </button>
        </div>

        {loading && (
          <div className="flex justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-500 border-t-transparent" />
          </div>
        )}

        {!loading && error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error}
            <button onClick={fetchCoupons} className="ml-2 underline">
              Дахин оролдох
            </button>
          </div>
        )}

        {!loading && !error && coupons.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-400 dark:border-gray-700">
            Купон бүртгэгдээгүй байна. "Купон нэмэх" товч дарж эхлэнэ үү.
          </div>
        )}

        {!loading && !error && coupons.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:border-gray-800 dark:text-gray-400">
                  <th className="px-3 py-3">Партнер</th>
                  <th className="px-3 py-3">Купон</th>
                  <th className="px-3 py-3 text-center">Хөнгөлөлт</th>
                  <th className="px-3 py-3 text-center">Харсан</th>
                  <th className="px-3 py-3">Хүчинтэй</th>
                  <th className="px-3 py-3 text-center">Төлөв</th>
                  <th className="px-3 py-3 text-right">Үйлдэл</th>
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr
                    key={coupon.id}
                    className="border-b border-gray-50 hover:bg-gray-50/50 dark:border-gray-800/50 dark:hover:bg-white/[0.02]"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        {coupon.partner_logo_url ? (
                          <img
                            src={coupon.partner_logo_url}
                            alt={coupon.partner_name}
                            className="h-8 w-8 rounded-lg object-contain bg-gray-50 p-0.5"
                          />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-xs font-bold text-brand-600 dark:bg-brand-900/30">
                            {coupon.partner_name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-gray-800 dark:text-white/90">
                          {coupon.partner_name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-gray-700 dark:text-gray-300">{coupon.title}</p>
                      {coupon.description && (
                        <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">
                          {coupon.description}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        {coupon.discount_percent}%
                      </span>
                    </td>
                    <td className="px-3 py-3 text-center text-gray-500">
                      {coupon.view_count}
                    </td>
                    <td className="px-3 py-3 text-gray-500">
                      {coupon.expires_at
                        ? new Date(coupon.expires_at).toLocaleDateString("mn-MN")
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <button
                        onClick={() => toggleActive(coupon)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                          coupon.is_active
                            ? "bg-brand-500"
                            : "bg-gray-200 dark:bg-gray-700"
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                            coupon.is_active ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(coupon)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06]"
                          title="Засах"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDeleteTarget(coupon)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20"
                          title="Устгах"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ComponentCard>

      {/* Create / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900">
            <h3 className="mb-5 text-lg font-bold text-gray-800 dark:text-white">
              {editingCoupon ? "Купон засах" : "Шинэ купон нэмэх"}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Партнерын нэр *
                </label>
                <input
                  type="text"
                  value={form.partner_name}
                  onChange={(e) => setForm((f) => ({ ...f, partner_name: e.target.value }))}
                  placeholder="Nike, Power Nutrition..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Купоны нэр *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="20% хөнгөлөлт бүх бүтээгдэхүүнд"
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Тайлбар
                </label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={2}
                  placeholder="Купоны нэмэлт мэдээлэл..."
                  className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Хөнгөлөлт (%) *
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={form.discount_percent}
                    onChange={(e) => setForm((f) => ({ ...f, discount_percent: Number(e.target.value) }))}
                    className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Хүчинтэй хугацаа
                  </label>
                  <div className="relative">
                    <input
                      ref={expiresInputRef}
                      type="text"
                      readOnly
                      placeholder="Огноо сонгох"
                      value={form.expires_at}
                      onClick={() => expiresPickerRef.current?.open()}
                      onFocus={() => expiresPickerRef.current?.open()}
                      className="w-full cursor-pointer rounded-xl border border-gray-200 px-4 py-2.5 pr-9 text-sm outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                    />
                    {form.expires_at ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setForm((f) => ({ ...f, expires_at: "" }));
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06]"
                        aria-label="Цэвэрлэх"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    ) : (
                      <svg className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Партнерын лого
                </label>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <div
                  onClick={() => !uploadingLogo && logoInputRef.current?.click()}
                  className={`group flex cursor-pointer items-center gap-4 rounded-xl border-2 border-dashed p-4 transition-colors ${
                    uploadingLogo
                      ? "cursor-wait border-brand-300 bg-brand-50/40 dark:border-brand-600 dark:bg-brand-900/10"
                      : "border-gray-300 bg-gray-50 hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-500"
                  }`}
                >
                  {form.partner_logo_url ? (
                    <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={form.partner_logo_url}
                        alt="logo preview"
                        className="h-full w-full object-contain p-1"
                        referrerPolicy="no-referrer"
                      />
                    </div>
                  ) : (
                    <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 dark:border-gray-700 dark:bg-gray-800">
                      <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                        />
                      </svg>
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    {uploadingLogo ? (
                      <div className="flex items-center gap-2 text-sm text-brand-600 dark:text-brand-400">
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        Оруулж байна...
                      </div>
                    ) : form.partner_logo_url ? (
                      <>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Лого солих</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Шинэ зураг сонгохын тулд дарна уу</p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">Лого оруулах</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">PNG, JPG, SVG · 5MB хүртэл</p>
                      </>
                    )}
                  </div>

                  {form.partner_logo_url && !uploadingLogo && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setForm((f) => ({ ...f, partner_logo_url: "" }));
                        setUploadError("");
                      }}
                      className="shrink-0 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-500 dark:hover:bg-gray-700"
                      aria-label="Лого устгах"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
                {uploadError && (
                  <p className="mt-2 text-xs text-red-500">{uploadError}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    form.is_active ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                      form.is_active ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {form.is_active ? "Идэвхтэй" : "Идэвхгүй"}
                </span>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setModalOpen(false)}
                disabled={saving}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]"
              >
                Болих
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 rounded-xl bg-brand-500 py-2.5 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
              >
                {saving ? "Хадгалж байна..." : editingCoupon ? "Хадгалах" : "Нэмэх"}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={!!deleteTarget}
        title="Купон устгах уу?"
        message={`"${deleteTarget?.partner_name} — ${deleteTarget?.title}" купоныг устгахыг хүсэж байна уу?`}
        confirmLabel="Устгах"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </>
  );
}
