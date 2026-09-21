"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { FormError, SubmitLabel } from "@/components/form/FormFeedback";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { VIDEO_CATEGORIES, VIDEO_LEVELS, type VideoLessonLevel } from "@/lib/video-lessons";
import { uploadToCloudflare } from "./uploadToCloudflare";
import type { AdminLesson } from "./VideoLessonsSection";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  editing: AdminLesson | null;
  onSuccess: (message: string) => void;
};

/** Cloudflare Stream 30GB хүртэл дэмждэг ч хичээлийн видеонд 2GB хангалттай. */
const MAX_BYTES = 2 * 1024 * 1024 * 1024;

const inputClass =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-800 " +
  "placeholder:text-gray-300 transition focus:border-brand-400 focus:outline-none focus:ring-2 " +
  "focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-800/80 dark:text-white/90 dark:placeholder:text-gray-600";

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
      {children}
    </p>
  );
}

export default function VideoLessonModal({ isOpen, onClose, editing, onSuccess }: Props) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const isEdit = Boolean(editing);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("fitness");
  const [level, setLevel] = useState<VideoLessonLevel>("all");
  const [trainer, setTrainer] = useState("");
  const [accessLevel, setAccessLevel] = useState<"members" | "public">("members");
  const [sortOrder, setSortOrder] = useState("0");
  const [file, setFile] = useState<File | null>(null);
  const [replaceVideo, setReplaceVideo] = useState(false);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setTitle(editing?.title ?? "");
    setDescription(editing?.description ?? "");
    setCategory(editing?.category ?? "fitness");
    setLevel((editing?.level as VideoLessonLevel) ?? "all");
    setTrainer(editing?.trainer_name ?? "");
    setAccessLevel(editing?.access_level ?? "members");
    setSortOrder(String(editing?.sort_order ?? 0));
    setFile(null);
    setReplaceVideo(false);
    setProgress(0);
    setStage("");
    setError("");
  }, [isOpen, editing]);

  const authHeaders = async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      "Content-Type": "application/json",
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    };
  };

  const payload = () => ({
    title: title.trim(),
    description: description.trim(),
    category,
    level,
    trainer_name: trainer.trim(),
    access_level: accessLevel,
    sort_order: Number(sortOrder) || 0,
    // Нийтлэх нь жагсаалтын товчоор — видео бэлэн болсны дараа.
    is_published: editing?.is_published ?? false,
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) return setError("Хичээлийн нэр оруулна уу");
    const needsFile = !isEdit || replaceVideo;
    if (needsFile && !file) return setError("Видео файл сонгоно уу");
    if (file && file.size > MAX_BYTES) return setError("Видео 2GB-аас бага байх ёстой");
    if (file && !file.type.startsWith("video/")) return setError("Зөвхөн видео файл оруулна уу");

    setSaving(true);
    setProgress(0);
    try {
      const headers = await authHeaders();

      if (!isEdit) {
        setStage("Хичээл үүсгэж байна...");
        const res = await fetch("/api/admin/video-lessons", {
          method: "POST",
          headers,
          body: JSON.stringify(payload()),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Хичээл үүсгэж чадсангүй");

        setStage("Видеог Cloudflare руу хуулж байна...");
        await uploadToCloudflare(json.upload_url as string, file as File, setProgress);
        onSuccess("Видео хуулагдлаа. Cloudflare боловсруулж дуусмагц нийтлэх боломжтой болно.");
      } else {
        setStage("Хадгалж байна...");
        const res = await fetch(`/api/admin/video-lessons/${editing!.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify(payload()),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Хадгалж чадсангүй");

        if (replaceVideo && file) {
          setStage("Шинэ видеоны байршил бэлдэж байна...");
          const upRes = await fetch(`/api/admin/video-lessons/${editing!.id}/upload-url`, {
            method: "POST",
            headers,
          });
          const upJson = await upRes.json();
          if (!upRes.ok) throw new Error(upJson?.error || "Видео солих боломжгүй байна");

          setStage("Видеог Cloudflare руу хуулж байна...");
          await uploadToCloudflare(upJson.upload_url as string, file, setProgress);
          onSuccess("Видео солигдлоо. Боловсруулалт дуусмагц дахин нийтэлнэ үү.");
        } else {
          onSuccess("Хичээл шинэчлэгдлээ");
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setSaving(false);
      setStage("");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={saving ? () => {} : onClose} className="max-w-xl p-6">
      <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
        {isEdit ? "Видео хичээл засах" : "Видео хичээл нэмэх"}
      </h3>
      <p className="mb-5 text-xs text-gray-400">
        Видео Cloudflare Stream дээр байршиж, зөвхөн хугацаатай холбоосоор тоглогдоно.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Гарчиг</Label>
          <input
            className={inputClass}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Эхлэгчдэд зориулсан бүтэн биеийн дасгал"
          />
        </div>

        <div>
          <Label>Тайлбар</Label>
          <textarea
            className={`${inputClass} h-24 py-2.5`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Хичээлийн товч танилцуулга"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Ангилал</Label>
            <select className={inputClass} value={category} onChange={(e) => setCategory(e.target.value)}>
              {VIDEO_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>
          <div>
            <Label>Түвшин</Label>
            <select
              className={inputClass}
              value={level}
              onChange={(e) => setLevel(e.target.value as VideoLessonLevel)}
            >
              {VIDEO_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Дасгалжуулагч</Label>
            <input
              className={inputClass}
              value={trainer}
              onChange={(e) => setTrainer(e.target.value)}
              placeholder="Дорж Болд"
            />
          </div>
          <div>
            <Label>Эрэмбэ</Label>
            <input
              className={inputClass}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              inputMode="numeric"
              placeholder="0"
            />
          </div>
        </div>

        <div>
          <Label>Хандалт</Label>
          <select
            className={inputClass}
            value={accessLevel}
            onChange={(e) => setAccessLevel(e.target.value as "members" | "public")}
          >
            <option value="members">Зөвхөн идэвхтэй гишүүд</option>
            <option value="public">Нэвтэрсэн бүх хэрэглэгч</option>
          </select>
        </div>

        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input
              type="checkbox"
              checked={replaceVideo}
              onChange={(e) => setReplaceVideo(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Видеог солих (хуучин видео Cloudflare-оос устана)
          </label>
        )}

        {(!isEdit || replaceVideo) && (
          <div>
            <Label>Видео файл</Label>
            <input
              type="file"
              accept="video/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:h-9 file:rounded-lg file:border-0 file:bg-brand-50 file:px-3 file:text-sm file:font-medium file:text-brand-600 dark:text-gray-300"
            />
            <p className="mt-1.5 text-[11px] text-gray-400">
              MP4/MOV, 2GB хүртэл. Файл сервер дамжихгүй, шууд Cloudflare руу хуулагдана.
            </p>
          </div>
        )}

        {saving && (
          <div>
            <div className="mb-1.5 flex justify-between text-[11px] text-gray-400">
              <span>{stage}</span>
              {progress > 0 && <span>{progress}%</span>}
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${progress || 4}%` }}
              />
            </div>
          </div>
        )}

        <FormError message={error} />

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="h-10 rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Болих
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            <SubmitLabel loading={saving} idleText={isEdit ? "Хадгалах" : "Хуулах"} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
