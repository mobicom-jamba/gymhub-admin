"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/components/ui/Toast";
import ConfirmModal from "@/components/ui/ConfirmModal";
import EmptyState from "@/components/ui/EmptyState";
import { Modal } from "@/components/ui/modal";
import {
  VIDEO_CATEGORIES,
  categoryLabel,
  formatDuration,
  levelLabel,
  statusLabel,
  type VideoLessonLevel,
  type VideoLessonStatus,
} from "@/lib/video-lessons";
import VideoLessonModal from "./VideoLessonModal";

export type AdminLesson = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  level: VideoLessonLevel;
  trainer_name: string | null;
  cf_uid: string | null;
  cf_status: VideoLessonStatus;
  cf_error: string | null;
  duration_seconds: number | null;
  is_published: boolean;
  access_level: "members" | "public";
  sort_order: number;
  view_count: number;
  thumbnail_url: string | null;
  created_at: string;
};

const statusStyles: Record<VideoLessonStatus, string> = {
  ready: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  processing: "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  uploading: "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  pending: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  error: "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

export default function VideoLessonsSection() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const { can } = useAuth();
  const { show: showToast } = useToast();
  const canManage = can("videos.manage");

  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [configured, setConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminLesson | null>(null);
  const [removing, setRemoving] = useState<AdminLesson | null>(null);
  const [removeLoading, setRemoveLoading] = useState(false);
  const [preview, setPreview] = useState<{ lesson: AdminLesson; url: string } | null>(null);

  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  }, [supabase]);

  const load = useCallback(async () => {
    setError("");
    try {
      const headers = await authHeader();
      const params = new URLSearchParams();
      if (category) params.set("category", category);
      const res = await fetch(`/api/admin/video-lessons?${params.toString()}`, {
        headers,
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Жагсаалт татаж чадсангүй");
      setLessons(json.lessons ?? []);
      setConfigured(Boolean(json.cloudflare_configured));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setLoading(false);
    }
  }, [authHeader, category]);

  useEffect(() => {
    void load();
  }, [load]);

  // Cloudflare хөрвүүлж байх хугацаанд төлвийг өөрөө шинэчилж байна.
  const hasPending = lessons.some((l) => l.cf_status !== "ready" && l.cf_status !== "error");
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(() => void load(), 15000);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return lessons;
    return lessons.filter((l) =>
      [l.title, l.trainer_name, l.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [lessons, query]);

  const patchLesson = async (lesson: AdminLesson, patch: Partial<AdminLesson>) => {
    const headers = await authHeader();
    const res = await fetch(`/api/admin/video-lessons/${lesson.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        title: lesson.title,
        description: lesson.description,
        category: lesson.category,
        level: lesson.level,
        trainer_name: lesson.trainer_name,
        access_level: lesson.access_level,
        sort_order: lesson.sort_order,
        is_published: lesson.is_published,
        ...patch,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error || "Хадгалж чадсангүй");
    await load();
  };

  const togglePublish = async (lesson: AdminLesson) => {
    try {
      await patchLesson(lesson, { is_published: !lesson.is_published });
      showToast(lesson.is_published ? "Нуулаа" : "Нийтэллээ", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Алдаа гарлаа", "error");
    }
  };

  const openPreview = async (lesson: AdminLesson) => {
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/admin/video-lessons/${lesson.id}/playback`, { headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Видео нээж чадсангүй");
      setPreview({ lesson, url: json.playback.iframe as string });
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Алдаа гарлаа", "error");
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveLoading(true);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/admin/video-lessons/${removing.id}`, {
        method: "DELETE",
        headers,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Устгаж чадсангүй");
      showToast("Хичээл устлаа", "success");
      setRemoving(null);
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Алдаа гарлаа", "error");
    } finally {
      setRemoveLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-gray-800 dark:text-white/90">
            Видео хичээл ({lessons.length})
          </h3>
          <p className="mt-0.5 text-xs text-gray-400">
            Видео Cloudflare Stream дээр байршиж, аппд хугацаатай холбоосоор тоглоно.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Гарчиг, дасгалжуулагчаар хайх..."
            className="h-10 w-56 rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-800 placeholder:text-gray-300 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800/80 dark:text-white/90"
          />
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800/80 dark:text-white/90"
          >
            <option value="">Бүх ангилал</option>
            {VIDEO_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
          {canManage && (
            <button
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
              className="h-10 rounded-xl bg-brand-500 px-4 text-sm font-semibold text-white transition hover:bg-brand-600"
            >
              + Хичээл нэмэх
            </button>
          )}
        </div>
      </div>

      {!configured && (
        <div className="mb-4 rounded-xl bg-amber-50 px-4 py-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-400">
          Cloudflare Stream тохируулаагүй байна. CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_STREAM_API_TOKEN
          орчны хувьсагчийг нэмсний дараа видео хуулах боломжтой.
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="search"
          title={query || category ? "Тохирох хичээл олдсонгүй" : "Видео хичээл алга"}
          description={
            query || category ? undefined : "«Хичээл нэмэх» товчоор эхний видеогоо хуулна уу."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lesson) => (
            <div
              key={lesson.id}
              className="overflow-hidden rounded-xl border border-gray-100 bg-white transition hover:border-gray-200 dark:border-gray-800 dark:bg-white/[0.02]"
            >
              <button
                onClick={() => lesson.cf_status === "ready" && void openPreview(lesson)}
                disabled={lesson.cf_status !== "ready"}
                className="relative block h-40 w-full bg-gray-100 dark:bg-gray-800"
              >
                {lesson.thumbnail_url ? (
                  // Cloudflare-ийн signed зураг — next/image-ийн домэйн тохиргоо шаардахгүй.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={lesson.thumbnail_url}
                    alt={lesson.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center text-xs text-gray-400">
                    {lesson.cf_status === "ready" ? "Үзэх" : statusLabel(lesson.cf_status)}
                  </span>
                )}
                <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">
                  {formatDuration(lesson.duration_seconds)}
                </span>
              </button>

              <div className="space-y-2 p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="line-clamp-2 text-sm font-medium text-gray-800 dark:text-white/90">
                    {lesson.title}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusStyles[lesson.cf_status]}`}
                  >
                    {statusLabel(lesson.cf_status)}
                  </span>
                </div>

                <p className="text-xs text-gray-400">
                  {categoryLabel(lesson.category)} · {levelLabel(lesson.level)}
                  {lesson.trainer_name ? ` · ${lesson.trainer_name}` : ""}
                </p>

                {lesson.cf_error && (
                  <p className="text-[11px] text-red-500">{lesson.cf_error}</p>
                )}

                <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                  <span
                    className={`rounded-full px-2 py-0.5 font-medium ${
                      lesson.is_published
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                    }`}
                  >
                    {lesson.is_published ? "Нийтлэгдсэн" : "Ноорог"}
                  </span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                    {lesson.access_level === "public" ? "Нээлттэй" : "Гишүүд"}
                  </span>
                  <span className="text-gray-400">{lesson.view_count} үзсэн</span>
                </div>

                {canManage && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      onClick={() => void togglePublish(lesson)}
                      disabled={!lesson.is_published && lesson.cf_status !== "ready"}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-40 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      {lesson.is_published ? "Нуух" : "Нийтлэх"}
                    </button>
                    <button
                      onClick={() => {
                        setEditing(lesson);
                        setModalOpen(true);
                      }}
                      className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                    >
                      Засах
                    </button>
                    <button
                      onClick={() => setRemoving(lesson)}
                      className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/40 dark:hover:bg-red-900/20"
                    >
                      Устгах
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <VideoLessonModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        editing={editing}
        onSuccess={(message) => {
          showToast(message, "success");
          void load();
        }}
      />

      <Modal
        isOpen={Boolean(preview)}
        onClose={() => setPreview(null)}
        className="max-w-3xl p-4"
      >
        <h3 className="mb-3 text-base font-semibold text-gray-800 dark:text-white/90">
          {preview?.lesson.title}
        </h3>
        {preview && (
          <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
            <iframe
              src={preview.url}
              className="h-full w-full"
              allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture;"
              allowFullScreen
            />
          </div>
        )}
      </Modal>

      <ConfirmModal
        isOpen={Boolean(removing)}
        title="Видео хичээл устгах уу?"
        message={
          removing
            ? `«${removing.title}» хичээл болон Cloudflare дээрх видео нь бүрмөсөн устана.`
            : undefined
        }
        confirmLabel="Устгах"
        loading={removeLoading}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
