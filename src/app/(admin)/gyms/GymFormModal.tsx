"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Checkbox from "@/components/form/input/Checkbox";
import { FormError, SubmitLabel } from "@/components/form/FormFeedback";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";

import type { Gym } from "./types";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  gym?: Gym | null;
  onSuccess: () => void;
};

type DayKey = "mon"|"tue"|"wed"|"thu"|"fri"|"sat"|"sun";
type DaySchedule = { open: string; close: string } | null;
type Schedule = Record<DayKey, DaySchedule>;

const DAY_KEYS: DayKey[] = ["mon","tue","wed","thu","fri","sat","sun"];
const DAY_LABELS: Record<DayKey, string> = { mon:"Даваа",tue:"Мягмар",wed:"Лхагва",thu:"Пүрэв",fri:"Баасан",sat:"Бямба",sun:"Нямдан" };

function parseRaw(raw: unknown): { openTime: string; closeTime: string; openDays: Set<DayKey> } {
  const openDays = new Set<DayKey>();
  let openTime = "08:00", closeTime = "22:00";
  if (raw && typeof raw === "object") {
    DAY_KEYS.forEach(k => {
      const v = (raw as Record<string, unknown>)[k];
      if (v && typeof v === "object" && "open" in v && "close" in v) {
        openDays.add(k);
        openTime  = String((v as {open:unknown}).open);
        closeTime = String((v as {close:unknown}).close);
      }
    });
  } else {
    ["mon","tue","wed","thu","fri","sat"].forEach(k => openDays.add(k as DayKey));
  }
  return { openTime, closeTime, openDays };
}

function buildSchedule(openTime: string, closeTime: string, openDays: Set<DayKey>): Schedule {
  const s = {} as Schedule;
  DAY_KEYS.forEach(k => { s[k] = openDays.has(k) ? { open: openTime, close: closeTime } : null; });
  return s;
}

export default function GymFormModal({
  isOpen,
  onClose,
  gym,
  onSuccess,
}: Props) {
  const [name, setName] = useState(gym?.name ?? "");
  const [description, setDescription] = useState(gym?.description ?? "");
  const [address, setAddress] = useState(gym?.address ?? "");
  const [city, setCity] = useState<string>(gym?.city ?? "ulaanbaatar");
  const [imageUrl, setImageUrl] = useState(gym?.image_url ?? "");
  const [isActive, setIsActive] = useState(gym?.is_active ?? true);
  const [dailyVisitorLimit, setDailyVisitorLimit] = useState(
    () => (gym?.daily_visitor_limit != null ? String(gym.daily_visitor_limit) : "")
  );
  const [openTime, setOpenTime]   = useState(() => parseRaw(gym?.opening_hours).openTime);
  const [closeTime, setCloseTime] = useState(() => parseRaw(gym?.opening_hours).closeTime);
  const [openDays, setOpenDays]   = useState<Set<DayKey>>(() => parseRaw(gym?.opening_hours).openDays);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Owner fields
  const [ownerName, setOwnerName] = useState("");
  const [ownerPhone, setOwnerPhone] = useState("");
  const [ownerPassword, setOwnerPassword] = useState("");
  const [ownerLoading, setOwnerLoading] = useState(false);
  const [hasExistingOwner, setHasExistingOwner] = useState(false);

  const getAuthHeaders = async (
    extra: Record<string, string> = {},
  ): Promise<Record<string, string>> => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const auth: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    return { ...extra, ...auth };
  };

  React.useEffect(() => {
    if (isOpen) {
      setName(gym?.name ?? "");
      setDescription(gym?.description ?? "");
      setAddress(gym?.address ?? "");
      setCity(gym?.city ?? "ulaanbaatar");
      setImageUrl(gym?.image_url ?? "");
      setIsActive(gym?.is_active ?? true);
      setDailyVisitorLimit(gym?.daily_visitor_limit != null ? String(gym.daily_visitor_limit) : "");
      const parsed = parseRaw(gym?.opening_hours);
      setOpenTime(parsed.openTime);
      setCloseTime(parsed.closeTime);
      setOpenDays(parsed.openDays);
      setError("");
      setOwnerName("");
      setOwnerPhone("");
      setOwnerPassword("");
      setHasExistingOwner(false);
      // Fetch existing owner for this gym
      if (gym?.id) {
        setOwnerLoading(true);
        getAuthHeaders()
          .then((headers) => fetch(`/api/admin/gym-owner?gym_id=${gym.id}`, { headers }))
          .then(r => r.json())
          .then(d => {
            if (d.owner) {
              setOwnerName(d.owner.name || "");
              setOwnerPhone(d.owner.phone || "");
              setHasExistingOwner(true);
            }
          })
          .catch(() => {})
          .finally(() => setOwnerLoading(false));
      }
    }
  }, [isOpen, gym]);

  const toggleDay = (day: DayKey) => {
    setOpenDays(prev => {
      const next = new Set(prev);
      next.has(day) ? next.delete(day) : next.add(day);
      return next;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const ext = file.name.split(".").pop();
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bucket", "media-public");
      formData.append("path", `gyms/${Date.now()}.${ext}`);
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/upload", { method: "POST", headers, body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Зураг оруулахад алдаа гарлаа");
      setImageUrl(data.url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Зураг оруулахад алдаа гарлаа");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name?.trim()) {
      setError(t("pleaseEnterName"));
      return;
    }
    if (openDays.size === 0) {
      setError("Дор хаяж нэг ажиллах өдөр сонгоно уу");
      return;
    }
    if (openTime >= closeTime) {
      setError("Эхлэх цаг нь дуусах цагаас өмнө байх ёстой");
      return;
    }
    let daily_visitor_limit: number | null = null;
    const limitTrim = dailyVisitorLimit.trim();
    if (limitTrim !== "") {
      const n = parseInt(limitTrim, 10);
      if (!Number.isFinite(n) || n < 1) {
        setError("Өдрийн зочлогчийн дээд тоо нь 1-ээс их бүхэл тоо эсвэл хоосон (хязгааргүй) байна");
        return;
      }
      daily_visitor_limit = n;
    }
    setError("");
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const payload = {
      name: name || null,
      description: description || null,
      address: address || null,
      city: city || "ulaanbaatar",
      image_url: imageUrl || null,
      is_active: isActive,
      daily_visitor_limit,
      opening_hours: buildSchedule(openTime, closeTime, openDays),
    };
    let savedGymId = gym?.id ?? null;

    if (gym) {
      const { error: err } = await supabase
        .from("gyms")
        .update(payload)
        .eq("id", gym.id);
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
    } else {
      const { data: inserted, error: err } = await supabase
        .from("gyms")
        .insert(payload)
        .select("id")
        .single();
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      savedGymId = inserted?.id ?? null;
    }

    if (ownerPhone.trim() && savedGymId) {
      try {
        const headers = await getAuthHeaders({ "Content-Type": "application/json" });
        const ownerRes = await fetch("/api/admin/gym-owner", {
          method: "POST",
          headers,
          body: JSON.stringify({
            gym_id: savedGymId,
            name: ownerName.trim(),
            phone: ownerPhone.trim(),
            password: ownerPassword.trim() || undefined,
          }),
        });
        const ownerData = await ownerRes.json();
        if (!ownerRes.ok) {
          setError(`Эзэмшигч: ${ownerData.error ?? "алдаа"}`);
          setLoading(false);
          return;
        }
      } catch {
        setError("Эзэмшигч хадгалахад алдаа гарлаа");
        setLoading(false);
        return;
      }
    }

    setLoading(false);
    onSuccess();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[500px] m-4">
      <div className="p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          {gym ? t("edit") : t("add")} {t("gyms")}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={error} />
          <div>
            <Label>{t("gymName")} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Фитнес төвийн нэр"
            />
          </div>
          <div>
            <Label>{t("gymAddress")}</Label>
            <Input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Хаяг"
            />
          </div>
          <div>
            <Label>Хот *</Label>
            <select
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90"
            >
              <option value="ulaanbaatar">Улаанбаатар</option>
              <option value="darkhan">Дархан</option>
            </select>
          </div>
          <div>
            <Label>{t("description")}</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Тайлбар"
            />
          </div>
          <div>
            <Label>{t("logo")}</Label>
            <div
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 px-4 py-5 transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-800 dark:hover:border-brand-500"
              onClick={() => fileInputRef.current?.click()}
            >
              {imageUrl ? (
                <div className="relative h-28 w-full overflow-hidden rounded-lg">
                  <Image
                    src={imageUrl}
                    alt="gym"
                    fill
                    className="object-contain"
                    unoptimized
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1 text-gray-400">
                  <svg className="size-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-sm">Зураг сонгох</span>
                </div>
              )}
              {uploading && (
                <span className="text-xs text-brand-500">Оруулж байна...</span>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            {imageUrl && (
              <button
                type="button"
                onClick={() => setImageUrl("")}
                className="mt-1 text-xs text-error-500 hover:underline"
              >
                Зураг арилгах
              </button>
            )}
          </div>
          {/* Schedule */}
          <div>
            <Label>Ажиллах цаг</Label>
            {/* Shared open/close time */}
            <div className="mb-2 flex items-center gap-3">
              <div className="flex flex-1 items-center gap-2">
                <span className="text-xs text-gray-500 w-12">Эхлэх</span>
                <input type="time" value={openTime} onChange={e => setOpenTime(e.target.value)}
                  className="h-9 flex-1 rounded-xl border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
              <span className="text-gray-300">–</span>
              <div className="flex flex-1 items-center gap-2">
                <span className="text-xs text-gray-500 w-12">Дуусах</span>
                <input type="time" value={closeTime} onChange={e => setCloseTime(e.target.value)}
                  className="h-9 flex-1 rounded-xl border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
              </div>
            </div>
            {/* Day toggles */}
            <div className="grid grid-cols-7 gap-1">
              {DAY_KEYS.map(day => {
                const on = openDays.has(day);
                return (
                  <button key={day} type="button" onClick={() => toggleDay(day)}
                    className={`flex flex-col items-center gap-1 rounded-xl border-2 py-2 transition-all ${
                      on
                        ? "border-brand-400 bg-brand-50 dark:border-brand-600 dark:bg-brand-900/20"
                        : "border-gray-100 bg-white hover:border-gray-200 dark:border-gray-700 dark:bg-gray-800/60"
                    }`}>
                    <span className={`text-[11px] font-semibold ${
                      on ? "text-brand-600 dark:text-brand-400" : "text-gray-400"
                    }`}>{DAY_LABELS[day].slice(0,3)}</span>
                    <div className={`h-1.5 w-1.5 rounded-full ${
                      on ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-600"
                    }`} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              checked={isActive}
              onChange={(checked) => setIsActive(checked)}
            />
            <Label className="!mb-0">{t("active")}</Label>
          </div>

          <div>
            <Label>Өдөрт зөвшөөрөх зочлогчийн дээд тоо</Label>
            <Input
              type="number"
              min="1"
              value={dailyVisitorLimit}
              onChange={(e) => setDailyVisitorLimit(e.target.value)}
              placeholder="Хоосон = хязгааргүй (жишээ нь 20)"
            />
            <p className="mt-1 text-[11px] text-gray-500">
              Хоосон бол хязгааргүй. Тоо оруулбал өдөрт тийм олон хүн &quot;Одоо очих&quot; бүртгүүлнэ (хүлээгдэж буй + зөвшөөрөгдсөн).
            </p>
          </div>

          {/* Owner Section — шинэ болон засварлахад */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">🔑 Эзэмшигчийн мэдээлэл</p>
            {!gym && (
              <p className="text-[11px] text-gray-500 mb-2">
                Эхлээд фитнесээ хадгална. Утас оруулбал эзэмшигчийг автоматаар үүсгэж холбоно.
              </p>
            )}
            {gym && ownerLoading ? (
              <div className="text-xs text-gray-400 py-2">Ачаалж байна...</div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label>Эзэмшигчийн нэр</Label>
                  <Input
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="Нэр"
                  />
                </div>
                <div>
                  <Label>Утасны дугаар (нэвтрэх нэр)</Label>
                  <Input
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="99001122"
                  />
                </div>
                <div>
                  <Label>{hasExistingOwner ? "Шинэ нууц үг (хоосон бол хэвээр)" : "Нууц үг"}</Label>
                  <Input
                    type="password"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder={hasExistingOwner ? "Солих бол бичнэ үү" : "123456"}
                  />
                </div>
                {hasExistingOwner && gym && (
                  <p className="text-[11px] text-gray-400">✅ Эзэмшигч бүртгэлтэй байна</p>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              <SubmitLabel loading={loading} loadingText="Хадгалж байна..." idleText={t("save")} />
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
