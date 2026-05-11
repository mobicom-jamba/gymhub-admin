"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { PlusIcon, PencilIcon, TrashIcon, XMarkIcon, PhotoIcon } from "@heroicons/react/24/outline";

type NewsRow = {
  id: string;
  category: string;
  title: string;
  summary: string;
  content: string;
  image_url: string | null;
  created_at: string;
};

type FormState = {
  category: string;
  title: string;
  summary: string;
  content: string;
  image_url: string;
};

const EMPTY_FORM: FormState = {
  category: "",
  title: "",
  summary: "",
  content: "",
  image_url: "",
};

const CATEGORIES = [
  "COLLABORATION",
  "EVENTS",
  "INDUSTRY",
  "ANNOUNCEMENT",
  "PARTNERSHIP",
];

function NewsModal({
  open, onClose, onSave, initial, saving, error,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (form: FormState) => Promise<void>;
  initial: FormState;
  saving: boolean;
  error: string;
}) {
  const [form, setForm] = useState<FormState>(initial);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setForm(initial); }, [initial, open]);

  const set = (k: keyof FormState, v: string) => setForm((p) => ({ ...p, [k]: v }));

 const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const supabase = createBrowserSupabaseClient();
      const ext = file.name.split(".").pop();
      const path = `news/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("media-public")
        .upload(path, file, { upsert: true });
      if (upErr) {
        alert("Upload алдаа: " + upErr.message);  // ← алдааны дэлгэрэнгүй
        return;
      }
      const { data } = supabase.storage.from("media-public").getPublicUrl(path);
      set("image_url", data.publicUrl);
    } catch (e: unknown) {
      alert("Catch алдаа: " + (e instanceof Error ? e.message : JSON.stringify(e)));  // ← catch алдаа
    } finally {
      setUploading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-gray-900 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white">
            {initial.title ? "Мэдээ засах" : "Шинэ мэдээ нэмэх"}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Ангилал <span className="text-red-500">*</span>
            </label>
            <select
              value={form.category}
              onChange={(e) => set("category", e.target.value)}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              <option value="">-- Ангилал сонгох --</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Гарчиг <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Мэдээний гарчиг..."
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Товч тайлбар <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.summary}
              onChange={(e) => set("summary", e.target.value)}
              rows={2}
              placeholder="Мэдээний товч агуулга..."
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Дэлгэрэнгүй агуулга <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              rows={6}
              placeholder="Мэдээний бүтэн агуулга..."
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
              Зураг
            </label>
            {form.image_url && (
              <div className="mb-3 relative w-full h-40 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
                <img src={form.image_url} alt="preview" className="w-full h-full object-cover" />
                <button
                  onClick={() => set("image_url", "")}
                  className="absolute top-2 right-2 rounded-full bg-black/50 p-1 text-white hover:bg-black/70"
                >
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 dark:border-gray-600 px-4 py-2.5 text-sm text-gray-600 dark:text-gray-400 hover:border-brand-500 hover:text-brand-600 transition-colors"
              >
                <PhotoIcon className="h-4 w-4" />
                {uploading ? "Байршуулж байна..." : "Зураг сонгох"}
              </button>
              <input
                type="text"
                value={form.image_url}
                onChange={(e) => set("image_url", e.target.value)}
                placeholder="Эсвэл URL оруулах..."
                className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          </div>

          {error && (
            <p className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-6 py-4">
          <button onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Болих
          </button>
          <button
            onClick={() => onSave(form)}
            disabled={saving || uploading}
            className="rounded-xl bg-brand-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {saving ? "Хадгалж байна..." : "Хадгалах"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ open, onClose, onConfirm, title }: {
  open: boolean; onClose: () => void; onConfirm: () => void; title: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-gray-900 shadow-2xl p-6">
        <h3 className="text-base font-semibold text-gray-800 dark:text-white mb-2">Мэдээ устгах уу?</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          <span className="font-medium text-gray-700 dark:text-gray-300">{title}</span> мэдээг устгавал буцаах боломжгүй.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="rounded-xl px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            Болих
          </button>
          <button onClick={onConfirm} className="rounded-xl bg-red-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-red-600 transition-colors">
            Устгах
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formInitial, setFormInitial] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<NewsRow | null>(null);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data } = await supabase
      .from("news")
      .select("id, category, title, summary, content, image_url, created_at")
      .order("created_at", { ascending: false });
    setNews((data as NewsRow[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { void fetchNews(); }, [fetchNews]);

  const filtered = news.filter((n) => {
    const matchSearch = !search || n.title.toLowerCase().includes(search.toLowerCase()) || n.summary.toLowerCase().includes(search.toLowerCase());
    const matchCat = !filterCategory || n.category === filterCategory;
    return matchSearch && matchCat;
  });

  const openCreate = () => {
    setEditingId(null);
    setFormInitial(EMPTY_FORM);
    setSaveError("");
    setModalOpen(true);
  };

  const openEdit = (row: NewsRow) => {
    setEditingId(row.id);
    setFormInitial({ category: row.category, title: row.title, summary: row.summary, content: row.content, image_url: row.image_url ?? "" });
    setSaveError("");
    setModalOpen(true);
  };

  const handleSave = async (form: FormState) => {
    if (!form.category || !form.title || !form.summary || !form.content) {
      setSaveError("Бүх талбарыг бөглөнө үү.");
      return;
    }
    setSaving(true);
    setSaveError("");
    const supabase = createBrowserSupabaseClient();
    try {
      if (editingId) {
        const { error } = await supabase.from("news").update({
          category: form.category, title: form.title, summary: form.summary,
          content: form.content, image_url: form.image_url || null,
        }).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("news").insert({
          category: form.category, title: form.title, summary: form.summary,
          content: form.content, image_url: form.image_url || null,
        });
        if (error) throw error;
      }
      setModalOpen(false);
      void fetchNews();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : typeof e === "object" ? JSON.stringify(e) : "Хадгалахад алдаа гарлаа.");
    } finally {
      setSaving(false);
    }
  };

  const openDelete = (row: NewsRow) => { setDeletingItem(row); setDeleteOpen(true); };

 const handleDelete = async () => {
    if (!deletingItem) return;
    const supabase = createBrowserSupabaseClient();
    
    // Зурагыг Storage-с устгах
    if (deletingItem.image_url) {
      try {
        // media-public/ гэсэн хэсгээр тасална
        const parts = deletingItem.image_url.split("media-public/");
        if (parts.length > 1) {
          const storagePath = parts[1];
          await supabase.storage.from("media-public").remove([storagePath]);
        }
      } catch (e) {
        console.warn("Storage error:", e);
      }
    }

    await supabase.from("news").delete().eq("id", deletingItem.id);
    setDeleteOpen(false);
    setDeletingItem(null);
    void fetchNews();
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Мэдээ мэдээлэл</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Нийт {news.length} мэдээ</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-600 transition-colors shadow-sm"
        >
          <PlusIcon className="h-4 w-4" />
          Мэдээ нэмэх
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Гарчиг, агуулгаар хайх..."
          className="flex-1 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          className="rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
        >
          <option value="">Бүх ангилал</option>
          {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <p className="text-sm">Мэдээ олдсонгүй</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Мэдээ</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Ангилал</th>
                  <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Огноо</th>
                  <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Үйлдэл</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filtered.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                          {row.image_url ? (
                            <img src={row.image_url} alt={row.title} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <PhotoIcon className="h-6 w-6 text-gray-300" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-800 dark:text-white line-clamp-1">{row.title}</p>
                          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 line-clamp-2 max-w-md">{row.summary}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="inline-flex items-center rounded-full bg-brand-50 dark:bg-brand-900/30 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400">
                        {row.category}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-gray-500 dark:text-gray-400 whitespace-nowrap">{formatDate(row.created_at)}</td>
                    <td className="px-5 py-4">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => openEdit(row)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-brand-600 transition-colors" title="Засах">
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        <button onClick={() => openDelete(row)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 transition-colors" title="Устгах">
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewsModal open={modalOpen} onClose={() => setModalOpen(false)} onSave={handleSave} initial={formInitial} saving={saving} error={saveError} />
      <DeleteConfirm open={deleteOpen} onClose={() => setDeleteOpen(false)} onConfirm={handleDelete} title={deletingItem?.title ?? ""} />
    </div>
  );
}