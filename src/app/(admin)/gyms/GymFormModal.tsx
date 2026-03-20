"use client";

import React, { useRef, useState } from "react";
import Image from "next/image";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Checkbox from "@/components/form/input/Checkbox";
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

function defaultSchedule(): Schedule {
  return { mon:{open:"08:00",close:"22:00"}, tue:{open:"08:00",close:"22:00"}, wed:{open:"08:00",close:"22:00"}, thu:{open:"08:00",close:"22:00"}, fri:{open:"08:00",close:"22:00"}, sat:{open:"09:00",close:"20:00"}, sun:null };
}

function parseSchedule(raw: unknown): Schedule {
  if (!raw || typeof raw !== "object") return defaultSchedule();
  const s = defaultSchedule();
  DAY_KEYS.forEach(k => {
    const v = (raw as Record<string, unknown>)[k];
    if (v === null) s[k] = null;
    else if (v && typeof v === "object" && "open" in v && "close" in v)
      s[k] = { open: String((v as {open:unknown}).open), close: String((v as {close:unknown}).close) };
  });
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
  const [imageUrl, setImageUrl] = useState(gym?.image_url ?? "");
  const [isActive, setIsActive] = useState(gym?.is_active ?? true);
  const [schedule, setSchedule] = useState<Schedule>(() => parseSchedule(gym?.opening_hours));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setName(gym?.name ?? "");
      setDescription(gym?.description ?? "");
      setAddress(gym?.address ?? "");
      setImageUrl(gym?.image_url ?? "");
      setIsActive(gym?.is_active ?? true);
      setSchedule(parseSchedule(gym?.opening_hours));
      setError("");
    }
  }, [isOpen, gym]);

  const setDayTime = (day: DayKey, field: "open"|"close", val: string) => {
    setSchedule(s => ({ ...s, [day]: { ...(s[day] ?? {open:"08:00",close:"22:00"}), [field]: val } }));
  };
  const toggleDay = (day: DayKey) => {
    setSchedule(s => ({ ...s, [day]: s[day] ? null : { open: "08:00", close: "22:00" } }));
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
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
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
    setError("");
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const payload = {
      name: name || null,
      description: description || null,
      address: address || null,
      image_url: imageUrl || null,
      is_active: isActive,
      opening_hours: schedule,
    };
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
      const { error: err } = await supabase.from("gyms").insert(payload);
      if (err) {
        setError(err.message);
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
          {error && (
            <div className="p-2 rounded-lg bg-error-50 text-error-600 text-sm dark:bg-error-950 dark:text-error-400">
              {error}
            </div>
          )}
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
            <Label>Ажллах цаг</Label>
            <div className="mt-1 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
              {DAY_KEYS.map((day, i) => {
                const s = schedule[day];
                return (
                  <div key={day} className={`flex items-center gap-3 px-3 py-2 ${
                    i > 0 ? "border-t border-gray-100 dark:border-white/[0.05]" : ""
                  }`}>
                    <button type="button" onClick={() => toggleDay(day)}
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                        s ? "bg-brand-500" : "border border-gray-300 dark:border-gray-600"
                      }`}>
                      {s && <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>}
                    </button>
                    <span className={`w-16 text-sm ${
                      s ? "font-medium text-gray-700 dark:text-gray-300" : "text-gray-400"
                    }`}>{DAY_LABELS[day]}</span>
                    {s ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input type="time" value={s.open} onChange={e => setDayTime(day, "open", e.target.value)}
                          className="h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                        <span className="text-xs text-gray-400">–</span>
                        <input type="time" value={s.close} onChange={e => setDayTime(day, "close", e.target.value)}
                          className="h-8 flex-1 rounded-lg border border-gray-200 bg-white px-2 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-white" />
                      </div>
                    ) : (
                      <span className="flex-1 text-xs text-gray-400">Хаалтай</span>
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
          <div className="flex gap-2 justify-end pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "..." : t("save")}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
