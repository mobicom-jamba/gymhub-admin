"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export type OrgRecord = {
  id: string;
  name: string;
  logo_url: string | null;
  description: string | null;
  phone: string | null;
  facebook_url: string | null;
  website_url: string | null;
  partner_url: string | null;
  created_at: string;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  org: OrgRecord | null;
  onSuccess: () => void;
};

const inp =
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

function SectionHeader({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gray-100 dark:bg-gray-700">
        <span className="text-gray-500 dark:text-gray-400">{icon}</span>
      </div>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{title}</span>
    </div>
  );
}

export default function OrgFormModal({ isOpen, onClose, org, onSuccess }: Props) {
  const isCreate = !org || !org.id;
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createBrowserSupabaseClient();

  const [name, setName]               = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone]             = useState("");
  const [facebookUrl, setFacebookUrl] = useState("");
  const [websiteUrl, setWebsiteUrl]   = useState("");
  const [partnerUrl, setPartnerUrl]   = useState("");
  const [logoUrl, setLogoUrl]         = useState<string | null>(null);
  const [logoFile, setLogoFile]       = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [formError, setFormError]     = useState("");
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (org) {
      setName(org.name);
      setDescription(org.description ?? "");
      setPhone(org.phone ?? "");
      setFacebookUrl(org.facebook_url ?? "");
      setWebsiteUrl(org.website_url ?? "");
      setPartnerUrl(org.partner_url ?? "");
      setLogoUrl(org.logo_url ?? null);
      setLogoPreview(org.logo_url ?? null);
    } else {
      setName(""); setDescription(""); setPhone("");
      setFacebookUrl(""); setWebsiteUrl(""); setPartnerUrl("");
      setLogoUrl(null); setLogoPreview(null);
    }
    setLogoFile(null); setFormError("");
  }, [isOpen, org]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  };

  const uploadLogo = async (orgId: string): Promise<string | null> => {
    if (!logoFile) return logoUrl;
    const ext = logoFile.name.split(".").pop();
    const path = `${orgId}.${ext}`;
    const { error } = await supabase.storage
      .from("org-logos")
      .upload(path, logoFile, { upsert: true, contentType: logoFile.type });
    if (error) { console.error("Logo upload error:", error.message); return logoUrl; }
    const { data } = supabase.storage.from("org-logos").getPublicUrl(path);
    return data.publicUrl + `?t=${Date.now()}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setFormError("Нэр оруулна уу"); return; }
    setFormError(""); setLoading(true);

    try {
      if (isCreate) {
        const { data: inserted, error: insertErr } = await supabase
          .from("organizations")
          .insert({ name: name.trim(), description: description || null, phone: phone || null,
            facebook_url: facebookUrl || null, website_url: websiteUrl || null, partner_url: partnerUrl || null })
          .select("id")
          .single();
        if (insertErr) { setFormError(insertErr.message); return; }
        const finalLogo = await uploadLogo(inserted.id);
        if (finalLogo) {
          await supabase.from("organizations").update({ logo_url: finalLogo }).eq("id", inserted.id);
        }
        // If opened from a stub (existing org name pre-filled), update profiles if name changed
        if (org?.name && name.trim() !== org.name) {
          await supabase.from("profiles").update({ organization: name.trim() }).eq("organization", org.name);
        }
      } else {
        const finalLogo = await uploadLogo(org!.id);
        const { error: updateErr } = await supabase
          .from("organizations")
          .update({
            name: name.trim(), description: description || null, phone: phone || null,
            facebook_url: facebookUrl || null, website_url: websiteUrl || null,
            partner_url: partnerUrl || null, logo_url: finalLogo,
            updated_at: new Date().toISOString(),
          })
          .eq("id", org!.id);
        if (updateErr) { setFormError(updateErr.message); return; }
        // Rename profiles if name changed
        if (name.trim() !== org!.name) {
          await supabase.from("profiles").update({ organization: name.trim() }).eq("organization", org!.name);
        }
      }
      onSuccess(); onClose();
    } finally { setLoading(false); }
  };

  const orgInitials = name.slice(0, 2).toUpperCase() || "ОР";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[460px] m-4" showCloseButton={false}>
      <div className="flex max-h-[92vh] flex-col overflow-hidden rounded-3xl">

        {/* Header */}
        <div className="relative flex items-center gap-4 border-b border-gray-100 px-6 py-5 dark:border-white/[0.06]">
          <div className="flex-1">
            <h3 className="text-base font-bold text-gray-800 dark:text-white">
              {isCreate ? "Байгууллага нэмэх" : "Байгууллага засах"}
            </h3>
            <p className="text-xs text-gray-400">{isCreate ? "Шинэ байгууллага үүсгэнэ" : org?.name}</p>
          </div>
          <button type="button" onClick={onClose}
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/10">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          <form id="org-form" onSubmit={handleSubmit}>

            {formError && (
              <div className="mx-5 mt-4 rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
                {formError}
              </div>
            )}

            {/* Logo upload */}
            <div className="flex items-center gap-4 px-6 py-5">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="group relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 transition hover:border-brand-400 hover:bg-brand-50 dark:border-gray-700 dark:bg-gray-800"
              >
                {logoPreview ? (
                  <>
                    <img src={logoPreview} alt="logo" className="h-full w-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                      <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                      </svg>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1">
                    <svg className="h-6 w-6 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3 21h18M3.75 3h16.5A.75.75 0 0121 3.75v13.5a.75.75 0 01-.75.75H3.75A.75.75 0 013 17.25V3.75A.75.75 0 013.75 3z" />
                    </svg>
                    <span className="text-[10px] text-gray-300">Лого</span>
                  </div>
                )}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <div>
                {logoPreview ? (
                  <p className="text-sm font-medium text-gray-700 dark:text-white/80">{orgInitials}</p>
                ) : (
                  <p className="text-sm font-semibold text-gray-700 dark:text-white/80">{name || "Байгууллагын лого"}</p>
                )}
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="mt-1 text-xs text-brand-500 hover:text-brand-600">
                  {logoPreview ? "Лого солих" : "Лого оруулах"}
                </button>
                <p className="mt-0.5 text-[11px] text-gray-400">PNG, JPG · Дөрвөлжин хэлбэр зөвлөнө</p>
              </div>
            </div>

            <div className="space-y-5 px-6 pb-6">

              {/* Basic info */}
              <div>
                <SectionHeader
                  icon={
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15" />
                    </svg>
                  }
                  title="Үндсэн мэдээлэл"
                />
                <div className="space-y-3">
                  <div>
                    <Label>Нэр *</Label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)}
                      className={inp} placeholder="Khanbank" required />
                  </div>
                  <div>
                    <Label>Утас</Label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                        </svg>
                      </span>
                      <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
                        className={inp + " pl-9"} placeholder="7700xxxx" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Links */}
              <div>
                <SectionHeader
                  icon={
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                    </svg>
                  }
                  title="Холбоосууд"
                />
                <div className="space-y-3">
                  <div>
                    <Label>Facebook</Label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[11px] font-medium text-gray-300">fb.com/</span>
                      <input type="text" value={facebookUrl} onChange={e => setFacebookUrl(e.target.value)}
                        className={inp + " pl-12"} placeholder="khanbank" />
                    </div>
                  </div>
                  <div>
                    <Label>Вэб сайт</Label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2">
                        <svg className="h-3.5 w-3.5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253" />
                        </svg>
                      </span>
                      <input type="text" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)}
                        className={inp + " pl-9"} placeholder="www.khanbank.com" />
                    </div>
                  </div>
                  <div>
                    <Label>GymHub URL</Label>
                    <div className="flex items-center gap-0">
                      <span className="flex h-10 items-center rounded-l-xl border border-r-0 border-gray-200 bg-gray-50 px-3 text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-800">
                        gymhub.mn/partner/
                      </span>
                      <input type="text" value={partnerUrl} onChange={e => setPartnerUrl(e.target.value)}
                        className="h-10 flex-1 rounded-r-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-800/80 dark:text-white/90"
                        placeholder="khanbank" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]">
            Цуцлах
          </button>
          <button form="org-form" type="submit" disabled={loading}
            className="flex items-center gap-2 rounded-xl bg-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-60 transition">
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Хадгалж байна...
              </>
            ) : isCreate ? "Байгууллага нэмэх" : "Хадгалах"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
