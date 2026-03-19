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
      setError("");
    }
  }, [isOpen, gym]);

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
