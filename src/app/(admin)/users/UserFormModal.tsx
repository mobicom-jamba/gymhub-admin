"use client";

import React, { useState, useEffect, useRef } from "react";
import { Modal } from "@/components/ui/modal";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { Profile } from "./UsersSection";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  organizations: string[];
  onSuccess: () => void;
};

const AVATAR_COLORS = [
  "#8b5cf6","#3b82f6","#10b981","#f59e0b",
  "#ef4444","#ec4899","#06b6d4","#6366f1",
];

function getColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(ovog: string, ner: string) {
  return [(ovog[0] ?? ""), (ner[0] ?? "")].join("").toUpperCase() || "?";
}

const inp =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-800 " +
  "placeholder:text-gray-300 transition focus:border-brand-400 focus:outline-none focus:ring-2 " +
  "focus:ring-brand-500/15 dark:border-gray-700 dark:bg-gray-800/80 dark:text-white/90 dark:placeholder:text-gray-600";

const sel =
  "h-10 w-full rounded-xl border border-gray-200 bg-white px-3.5 text-sm text-gray-800 " +
  "transition focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800/80 dark:text-white/90";

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{children}</p>;
}

export default function UserFormModal({ isOpen, onClose, profile, organizations, onSuccess }: Props) {
  const isCreate = !profile;
  const orgDropRef = useRef<HTMLDivElement>(null);

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("123456");
  const [ovog, setOvog]                 = useState("");
  const [ner, setNer]                   = useState("");
  const [phone, setPhone]               = useState("");
  const [role, setRole]                 = useState("user");
  const [organization, setOrganization] = useState("");
  const [orgSearch, setOrgSearch]       = useState("");
  const [orgOpen, setOrgOpen]           = useState(false);
  const [tier, setTier]                 = useState("early");
  const [startedAt, setStartedAt]       = useState("");
  const [expiresAt, setExpiresAt]       = useState("");
  const [formError, setFormError]       = useState("");
  const [loading, setLoading]           = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (profile) {
      const parts = (profile.full_name ?? "").trim().split(" ");
      setOvog(parts[0] ?? "");
      setNer(parts.slice(1).join(" "));
      setPhone(profile.phone ?? "");
      setRole(profile.role ?? "user");
      setOrganization(profile.organization ?? "");
      setTier(profile.membership_tier ?? "early");
      setStartedAt(profile.membership_started_at?.slice(0, 10) ?? "");
      setExpiresAt(profile.membership_expires_at?.slice(0, 10) ?? "");
      setEmail(""); setPassword("");
    } else {
      setEmail(""); setPassword("123456");
      setOvog(""); setNer(""); setPhone(""); setRole("user");
      setOrganization(""); setTier("early"); setStartedAt(""); setExpiresAt("");
    }
    setOrgSearch(""); setOrgOpen(false); setFormError("");
  }, [isOpen, profile]);

  const handleExpiresChange = (val: string) => {
    setExpiresAt(val);
    if (val) {
      const d = new Date(val);
      d.setFullYear(d.getFullYear() - 1);
      setStartedAt(d.toISOString().slice(0, 10));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setLoading(true);
    const fullName = [ovog, ner].filter(Boolean).join(" ") || null;
    try {
      if (isCreate) {
        if (!email || !password) { setFormError("И-мэйл болон нууц үг оруулна уу"); return; }
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email, password, full_name: fullName,
            phone: phone || null, role,
            organization: organization || null,
            membership_tier: tier, membership_status: "active",
            membership_started_at: startedAt ? new Date(startedAt).toISOString() : null,
            membership_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setFormError(data.error ?? "Алдаа гарлаа"); return; }
      } else {
        const supabase = createBrowserSupabaseClient();
        const { error: err } = await supabase.from("profiles").update({
          full_name: fullName, phone: phone || null, role,
          organization: organization || null, membership_tier: tier,
          membership_status: "active",
          membership_started_at: startedAt ? new Date(startedAt).toISOString() : null,
          membership_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          updated_at: new Date().toISOString(),
        }).eq("id", profile!.id);
        if (err) { setFormError(err.message); return; }
      }
      onSuccess(); onClose();
    } finally { setLoading(false); }
  };

  const filteredOrgs = organizations.filter(o =>
    o.toLowerCase().includes(orgSearch.toLowerCase())
  );

  const displayName = [ovog, ner].filter(Boolean).join(" ");
  const avatarColor = displayName ? getColor(displayName) : "#8b5cf6";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[480px] m-4" showCloseButton={false}>
      <div className="flex max-h-[92vh] flex-col overflow-hidden rounded-3xl">

        {/* ── Gradient header ── */}
        <div
          className="relative flex items-center gap-4 px-6 py-5"
          style={{ background: `linear-gradient(135deg, ${avatarColor}22 0%, ${avatarColor}08 100%)` }}
        >
          {/* Avatar */}
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-sm"
            style={{ background: `linear-gradient(135deg, ${avatarColor}, ${avatarColor}bb)` }}
          >
            {initials(ovog, ner)}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-800 dark:text-white">
              {isCreate ? "Шинэ гишүүн нэмэх" : (displayName || "Гишүүн засах")}
            </h3>
            <p className="text-xs text-gray-400">
              {isCreate
                ? "Шинэ хэрэглэгч болон профайл үүсгэнэ"
                : `${organization || "Байгууллагагүй"} · ${tier === "premium" ? "Premium" : "Early"}`
              }
            </p>
          </div>
          {/* Tier pill */}
          <div className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${
            tier === "premium"
              ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
              : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          }`}>
            {tier === "premium" ? "Premium" : "Early"}
          </div>
          {/* Close */}
          <button
            type="button" onClick={onClose}
            className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-black/5 hover:text-gray-600 dark:hover:bg-white/10"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 dark:bg-white/[0.06]" />

        {/* ── Form body ── */}
        <div className="flex-1 overflow-y-auto">
          <form id="user-form" onSubmit={handleSubmit}>

            {formError && (
              <div className="mx-5 mt-4 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-2.5 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
                </svg>
                {formError}
              </div>
            )}

            {/* Login section (create only) */}
            {isCreate && (
              <div className="px-5 pt-5">
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/30">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700">
                      <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Нэвтрэх мэдээлэл</span>
                  </div>
                  <div className="space-y-3">
                    <div>
                      <Label>И-мэйл хаяг *</Label>
                      <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                        className={inp} required placeholder="user@example.com" />
                    </div>
                    <div>
                      <Label>Нууц үг *</Label>
                      <div className="relative">
                        <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                          className={inp} required minLength={6} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:bg-gray-700">
                          default
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Personal info */}
            <div className="px-5 pt-4">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700">
                  <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Хувийн мэдээлэл</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Овог</Label>
                  <input type="text" value={ovog} onChange={e => setOvog(e.target.value)}
                    className={inp} placeholder="Батболд" />
                </div>
                <div>
                  <Label>Нэр</Label>
                  <input type="text" value={ner} onChange={e => setNer(e.target.value)}
                    className={inp} placeholder="Мөнхбаяр" />
                </div>
                <div>
                  <Label>Утас</Label>
                  <input type="text" value={phone} onChange={e => setPhone(e.target.value)}
                    className={inp} placeholder="9911xxxx" />
                </div>
                <div>
                  <Label>Эрх</Label>
                  <select value={role} onChange={e => setRole(e.target.value)} className={sel}>
                    <option value="user">Гишүүн</option>
                    <option value="admin">Админ</option>
                  </select>
                </div>
              </div>

              {/* Org searchable combobox */}
              <div className="mt-3" ref={orgDropRef}>
                <Label>Байгууллага</Label>
                <div className="relative">
                  <input
                    type="text"
                    value={orgOpen ? orgSearch : organization}
                    onChange={e => { setOrgSearch(e.target.value); setOrganization(""); }}
                    onFocus={() => { setOrgOpen(true); setOrgSearch(organization); }}
                    onBlur={() => setTimeout(() => setOrgOpen(false), 150)}
                    className={inp + " pr-8"}
                    placeholder="Байгууллага хайх..."
                    autoComplete="off"
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {orgOpen && filteredOrgs.length > 0 && (
                    <ul className="absolute z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                      {filteredOrgs.slice(0, 30).map(o => (
                        <li
                          key={o}
                          onMouseDown={() => { setOrganization(o); setOrgSearch(""); setOrgOpen(false); }}
                          className={`cursor-pointer px-3.5 py-2 text-sm transition ${
                            o === organization
                              ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400"
                              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                          }`}
                        >
                          {o}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Membership */}
            <div className="px-5 pt-4 pb-5">
              <div className="mb-3 flex items-center gap-2">
                <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700">
                  <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
                  </svg>
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Гишүүнчлэл</span>
              </div>

              {/* Tier toggle */}
              <div className="mb-3 grid grid-cols-2 gap-2">
                {(["early", "premium"] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTier(t)}
                    className={`relative flex flex-col items-start rounded-xl border-2 px-4 py-3 transition ${
                      tier === t
                        ? t === "premium"
                          ? "border-violet-400 bg-violet-50 dark:border-violet-600 dark:bg-violet-900/20"
                          : "border-blue-400 bg-blue-50 dark:border-blue-600 dark:bg-blue-900/20"
                        : "border-gray-100 bg-white hover:border-gray-200 dark:border-gray-700 dark:bg-gray-800/60"
                    }`}
                  >
                    <span className={`text-sm font-bold ${
                      tier === t
                        ? t === "premium" ? "text-violet-700 dark:text-violet-300" : "text-blue-700 dark:text-blue-300"
                        : "text-gray-600 dark:text-gray-400"
                    }`}>
                      {t === "premium" ? "Premium" : "Early"}
                    </span>
                    <span className="text-[11px] text-gray-400">{t === "premium" ? "780,000₮" : "480,000₮"}</span>
                    {tier === t && (
                      <span className={`absolute right-2.5 top-2.5 flex h-4 w-4 items-center justify-center rounded-full ${t === "premium" ? "bg-violet-500" : "bg-blue-500"}`}>
                        <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                      </span>
                    )}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Эхлэх огноо</Label>
                  <input type="date" value={startedAt}
                    onChange={e => setStartedAt(e.target.value)}
                    className={inp} style={{ colorScheme: "light" }} />
                </div>
                <div>
                  <Label>Дуусах огноо</Label>
                  <input type="date" value={expiresAt}
                    onChange={e => handleExpiresChange(e.target.value)}
                    className={inp} style={{ colorScheme: "light" }} />
                </div>
              </div>
              {expiresAt && !startedAt && (
                <p className="mt-1.5 text-[11px] text-gray-400">↑ Эхлэх огноо автоматаар −1 жил тохируулагдана</p>
              )}
            </div>
          </form>
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-4 dark:border-white/[0.06]">
          <button type="button" onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]">
            Цуцлах
          </button>
          <button form="user-form" type="submit" disabled={loading}
            className={`flex items-center gap-2 rounded-xl px-5 py-2 text-sm font-semibold text-white transition disabled:opacity-60 ${
              isCreate ? "bg-brand-500 hover:bg-brand-600" : "bg-gray-800 hover:bg-gray-700 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            }`}>
            {loading ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                Хадгалж байна...
              </>
            ) : isCreate ? "Гишүүн нэмэх" : "Өөрчлөлт хадгалах"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
