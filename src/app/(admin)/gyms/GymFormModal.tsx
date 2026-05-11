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
  defaultType?: string;
};

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type DaySchedule = { open: string; close: string } | null;
type Schedule = Record<DayKey, DaySchedule>;

type DayConfig = { on: boolean; open: string; close: string };
type DaySchedules = Record<DayKey, DayConfig>;

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<DayKey, string> = {
  mon: "Даваа",
  tue: "Мягмар",
  wed: "Лхагва",
  thu: "Пүрэв",
  fri: "Баасан",
  sat: "Бямба",
  sun: "Нямдан",
};

const DEFAULT_SCHEDULE: DaySchedules = {
  mon: { on: true,  open: "08:00", close: "22:00" },
  tue: { on: true,  open: "08:00", close: "22:00" },
  wed: { on: true,  open: "08:00", close: "22:00" },
  thu: { on: true,  open: "08:00", close: "22:00" },
  fri: { on: true,  open: "08:00", close: "22:00" },
  sat: { on: true,  open: "08:00", close: "22:00" },
  sun: { on: false, open: "08:00", close: "22:00" },
};

function parseRaw(raw: unknown): DaySchedules {
  const result: DaySchedules = {
    mon: { ...DEFAULT_SCHEDULE.mon },
    tue: { ...DEFAULT_SCHEDULE.tue },
    wed: { ...DEFAULT_SCHEDULE.wed },
    thu: { ...DEFAULT_SCHEDULE.thu },
    fri: { ...DEFAULT_SCHEDULE.fri },
    sat: { ...DEFAULT_SCHEDULE.sat },
    sun: { ...DEFAULT_SCHEDULE.sun },
  };
  if (raw && typeof raw === "object") {
    DAY_KEYS.forEach((k) => {
      const v = (raw as Record<string, unknown>)[k];
      if (v && typeof v === "object" && "open" in v && "close" in v) {
        result[k] = {
          on: true,
          open: String((v as { open: unknown }).open),
          close: String((v as { close: unknown }).close),
        };
      } else {
        result[k] = { ...DEFAULT_SCHEDULE[k], on: false };
      }
    });
  }
  return result;
}

function buildSchedule(schedules: DaySchedules): Schedule {
  const s = {} as Schedule;
  DAY_KEYS.forEach((k) => {
    const d = schedules[k];
    s[k] = d.on ? { open: d.open, close: d.close } : null;
  });
  return s;
}

export default function GymFormModal({
  isOpen,
  onClose,
  gym,
  onSuccess,
  defaultType,
}: Props) {
  const [name, setName] = useState(gym?.name ?? "");
  const [description, setDescription] = useState(gym?.description ?? "");
  const [address, setAddress] = useState(gym?.address ?? "");
  const [city, setCity] = useState<string>(gym?.city ?? "ulaanbaatar");
  const [type, setType] = useState<string>(gym?.type ?? defaultType ?? "gym");
  const [imageUrl, setImageUrl] = useState(gym?.image_url ?? "");
  const [isActive, setIsActive] = useState(gym?.is_active ?? true);
  const [dailyVisitorLimit, setDailyVisitorLimit] = useState(
    () => (gym?.daily_visitor_limit != null ? String(gym.daily_visitor_limit) : "")
  );
  const [daySchedules, setDaySchedules] = useState<DaySchedules>(() =>
    parseRaw(gym?.opening_hours)
  );
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
    const auth: Record<string, string> = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
    return { ...extra, ...auth };
  };

  React.useEffect(() => {
    if (isOpen) {
      setName(gym?.name ?? "");
      setDescription(gym?.description ?? "");
      setAddress(gym?.address ?? "");
      setCity(gym?.city ?? "ulaanbaatar");
      setType(gym?.type ?? defaultType ?? "gym");
      setImageUrl(gym?.image_url ?? "");
      setIsActive(gym?.is_active ?? true);
      setDailyVisitorLimit(
        gym?.daily_visitor_limit != null ? String(gym.daily_visitor_limit) : ""
      );
      setDaySchedules(parseRaw(gym?.opening_hours));
      setError("");
      setOwnerName("");
      setOwnerPhone("");
      setOwnerPassword("");
      setHasExistingOwner(false);

      if (gym?.id) {
        setOwnerLoading(true);
        getAuthHeaders()
          .then((headers) =>
            fetch(`/api/admin/gym-owner?gym_id=${gym.id}`, { headers })
          )
          .then((r) => r.json())
          .then((d) => {
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
    setDaySchedules((prev) => ({
      ...prev,
      [day]: { ...prev[day], on: !prev[day].on },
    }));
  };

  const updateDayTime = (day: DayKey, field: "open" | "close", value: string) => {
    setDaySchedules((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
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
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        headers,
        body: formData,
      });
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
    const anyOpen = DAY_KEYS.some((k) => daySchedules[k].on);
    if (!anyOpen) {
      setError("Дор хаяж нэг ажиллах өдөр сонгоно уу");
      return;
    }
    const invalidDay = DAY_KEYS.find(
      (k) => daySchedules[k].on && daySchedules[k].open >= daySchedules[k].close
    );
    if (invalidDay) {
      setError(
        `${DAY_LABELS[invalidDay]}: эхлэх цаг нь дуусах цагаас өмнө байх ёстой`
      );
      return;
    }
    let daily_visitor_limit: number | null = null;
    const limitTrim = dailyVisitorLimit.trim();
    if (limitTrim !== "") {
      const n = parseInt(limitTrim, 10);
      if (!Number.isFinite(n) || n < 1) {
        setError(
          "Өдрийн зочлогчийн дээд тоо нь 1-ээс их бүхэл тоо эсвэл хоосон (хязгааргүй) байна"
        );
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
      opening_hours: buildSchedule(daySchedules),
      type: type,
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
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[500px] m-4 max-h-[90vh] overflow-y-auto">
      <div className="p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          {gym ? t("edit") : t("add")}{" "}
          {defaultType === "yoga" ? "Йога төвүүд" : t("gyms")}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormError message={error} />
          <div>
            <Label>{t("gymName")} *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={
                defaultType === "yoga" ? "Йога төвийн нэр" : "Фитнес төвийн нэр"
              }
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
                  <svg
                    className="size-8"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
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

          {/* Schedule — өдөр бүрийн тусдаа цаг */}
          <div>
            <Label>Ажиллах цаг</Label>
            <div className="divide-y divide-gray-100 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              {DAY_KEYS.map((day) => {
                const cfg = daySchedules[day];
                return (
                  <div
                    key={day}
                    className="flex items-center gap-3 px-3 py-2 bg-white dark:bg-gray-800"
                  >
                    {/* Toggle */}
                    <button
                      type="button"
                      onClick={() => toggleDay(day)}
                      className={`relative h-5 w-9 rounded-full transition-colors flex-shrink-0 ${
                        cfg.on
                          ? "bg-brand-500"
                          : "bg-gray-200 dark:bg-gray-600"
                      }`}
                      aria-label={`${DAY_LABELS[day]} идэвхтэй эсэх`}
                    >
                      <span
                        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${
                          cfg.on ? "left-[18px]" : "left-0.5"
                        }`}
                      />
                    </button>

                    {/* Өдрийн нэр */}
                    <span
                      className={`w-14 text-sm flex-shrink-0 ${
                        cfg.on
                          ? "text-gray-700 dark:text-gray-200 font-medium"
                          : "text-gray-400 dark:text-gray-500"
                      }`}
                    >
                      {DAY_LABELS[day].slice(0, 3)}
                    </span>

                    {/* Цаг эсвэл хаалттай */}
                    {cfg.on ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="time"
                          value={cfg.open}
                          onChange={(e) =>
                            updateDayTime(day, "open", e.target.value)
                          }
                          className="h-9 flex-1 rounded-xl border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                        <span className="text-gray-300 dark:text-gray-600 text-sm">
                          –
                        </span>
                        <input
                          type="time"
                          value={cfg.close}
                          onChange={(e) =>
                            updateDayTime(day, "close", e.target.value)
                          }
                          className="h-9 flex-1 rounded-xl border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white"
                        />
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        Хаалттай
                      </span>
                    )}
                  </div>
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
              Хоосон бол хязгааргүй. Тоо оруулбал өдөрт тийм олон хүн &quot;Одоо
              очих&quot; бүртгүүлнэ (хүлээгдэж буй + зөвшөөрөгдсөн).
            </p>
          </div>

          {/* Owner Section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4 mt-2">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              🔑 Эзэмшигчийн мэдээлэл
            </p>
            {!gym && (
              <p className="text-[11px] text-gray-500 mb-2">
                Эхлээд фитнесээ хадгална. Утас оруулбал эзэмшигчийг автоматаар
                үүсгэж холбоно.
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
                  <Label>
                    {hasExistingOwner
                      ? "Шинэ нууц үг (хоосон бол хэвээр)"
                      : "Нууц үг"}
                  </Label>
                  <Input
                    type="password"
                    value={ownerPassword}
                    onChange={(e) => setOwnerPassword(e.target.value)}
                    placeholder={
                      hasExistingOwner ? "Солих бол бичнэ үү" : "123456"
                    }
                  />
                </div>
                {hasExistingOwner && gym && (
                  <p className="text-[11px] text-gray-400">
                    ✅ Эзэмшигч бүртгэлтэй байна
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              <SubmitLabel
                loading={loading}
                loadingText="Хадгалж байна..."
                idleText={t("save")}
              />
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}