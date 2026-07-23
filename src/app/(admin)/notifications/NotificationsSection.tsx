"use client";

import React, { useCallback, useEffect, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

async function authHeaders(): Promise<HeadersInit> {
  const sb = createBrowserSupabaseClient();
  const { data } = await sb.auth.getSession();
  const token = data.session?.access_token;
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function NotificationsSection() {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [target, setTarget] = useState<"all" | "user">("all");
  const [userId, setUserId] = useState("");
  const [deviceCount, setDeviceCount] = useState<number | null>(null);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string>("");
  const [error, setError] = useState("");

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/notifications/send", {
        headers: await authHeaders(),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        configured?: boolean;
        devices_with_token?: number;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Статистик авахад алдаа");
        return;
      }
      setConfigured(json.configured ?? false);
      setDeviceCount(json.devices_with_token ?? 0);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const onSend = async () => {
    setSending(true);
    setResult("");
    setError("");
    try {
      const res = await fetch("/api/admin/notifications/send", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          target,
          user_id: target === "user" ? userId.trim() : undefined,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        error?: string;
        successCount?: number;
        failureCount?: number;
        token_count?: number;
      };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Илгээхэд алдаа гарлаа");
        return;
      }
      setResult(
        `Амжилттай: ${json.successCount ?? 0}, алдаа: ${json.failureCount ?? 0}` +
          (json.token_count != null ? ` (нийт token: ${json.token_count})` : ""),
      );
      setTitle("");
      setBody("");
      await loadStats();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Push мэдэгдэл
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Апп суулгасан хэрэглэгчид рүү FCM-ээр илгээнэ.
          </p>
        </div>
        <div className="text-right text-sm">
          <p className="text-gray-500 dark:text-gray-400">
            Firebase:{" "}
            <span
              className={
                configured ? "font-semibold text-emerald-600" : "font-semibold text-amber-600"
              }
            >
              {configured == null ? "…" : configured ? "Бэлэн" : "Тохируулаагүй"}
            </span>
          </p>
          <p className="text-gray-500 dark:text-gray-400">
            Token-тэй төхөөрөмж:{" "}
            <span className="font-semibold text-gray-900 dark:text-white">
              {deviceCount ?? "…"}
            </span>
          </p>
        </div>
      </div>

      {!configured && configured !== null && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          Vercel дээр <code className="font-mono text-xs">FIREBASE_SERVICE_ACCOUNT_JSON</code>{" "}
          env нэмнэ үү (Firebase Console → Project settings → Service accounts → Generate new
          private key).
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Хүлээн авагч
          </label>
          <div className="flex flex-wrap gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                checked={target === "all"}
                onChange={() => setTarget("all")}
              />
              Бүгд (token-тэй)
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input
                type="radio"
                checked={target === "user"}
                onChange={() => setTarget("user")}
              />
              Нэг хэрэглэгч (user id)
            </label>
          </div>
        </div>

        {target === "user" && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              User ID (UUID)
            </label>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
            />
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Гарчиг
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={100}
            placeholder="Жишээ: Шинэ купон"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Текст
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Мэдэгдлийн агуулга…"
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white"
          />
        </div>

        {error && (
          <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}
        {result && (
          <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            {result}
          </p>
        )}

        <button
          type="button"
          disabled={sending || !title.trim() || !body.trim()}
          onClick={() => void onSend()}
          className="inline-flex items-center justify-center rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {sending ? "Илгээж байна…" : "Илгээх"}
        </button>
      </div>
    </div>
  );
}
