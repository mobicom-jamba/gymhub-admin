"use client";

import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export type UserSalesNote = {
  user_id: string;
  called: boolean;
  called_at: string | null;
  note: string;
  agent_id: string | null;
  updated_at: string;
};

async function getAuthHeader(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

export default function UserNoteModal({
  profile,
  note,
  onClose,
  onSave,
}: {
  profile: { id: string; full_name: string | null; phone?: string | null } | null;
  note: UserSalesNote | null;
  onClose: () => void;
  onSave: (note: UserSalesNote) => void;
}) {
  const [called, setCalled] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setCalled(note?.called ?? false);
    setNoteText(note?.note ?? "");
    setError(null);
  }, [note, profile?.id]);

  useEffect(() => {
    if (!profile) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [profile, onClose]);

  // Focus textarea when modal opens
  useEffect(() => {
    if (profile) {
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [profile?.id]);

  if (!profile) return null;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch("/api/admin/user-notes", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ user_id: profile.id, called, note: noteText }),
      });
      const json = await res.json();
      if (!res.ok) { setError(json.error ?? "Алдаа гарлаа."); return; }
      onSave(json.note);
      onClose();
    } catch {
      setError("Сүлжээний алдаа.");
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-99999 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal card */}
      <div className="relative w-full max-w-md rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-900">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-white/6">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">
              Борлуулалтын тэмдэглэл
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {profile.full_name ?? "—"}
              {profile.phone && (
                <span className="ml-2 font-mono">{profile.phone}</span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/6 dark:hover:text-gray-200"
          >
            <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Called toggle */}
          <button
            type="button"
            onClick={() => setCalled(!called)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 transition ${
              called
                ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
                : "border-gray-200 bg-gray-50 hover:bg-gray-100 dark:border-white/8 dark:bg-white/4 dark:hover:bg-white/6"
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`flex size-9 items-center justify-center rounded-full ${
                called
                  ? "bg-green-100 dark:bg-green-800/40"
                  : "bg-gray-200 dark:bg-white/10"
              }`}>
                <svg
                  className={`size-4 ${called ? "text-green-600 dark:text-green-400" : "text-gray-400 dark:text-gray-500"}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
              </div>
              <div className="text-left">
                <div className={`text-sm font-semibold ${called ? "text-green-700 dark:text-green-300" : "text-gray-700 dark:text-gray-200"}`}>
                  {called ? "Залгасан" : "Залгаагүй"}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  {called ? "Борлуулагч холбогдсон" : "Харилцаа холбоо хийгдээгүй"}
                </div>
              </div>
            </div>

            {/* Toggle switch */}
            <div
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                called ? "bg-green-500" : "bg-gray-300 dark:bg-gray-600"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  called ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </div>
          </button>

          {/* Note textarea */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-gray-400 dark:text-gray-500">
              Тэмдэглэл
            </label>
            <textarea
              ref={textareaRef}
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              rows={4}
              placeholder="Тэмдэглэл, дараагийн алхам, хариу зэрэг..."
              className="w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-800 placeholder-gray-400 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/4 dark:text-white dark:placeholder-gray-500"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-gray-100 px-6 py-4 dark:border-white/6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/6"
          >
            Болих
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            {saving && (
              <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {saving ? "Хадгалж байна..." : "Хадгалах"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
