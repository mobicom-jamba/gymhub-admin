"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { Profile } from "./UsersSection";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  organizations: string[];
  onSuccess: () => void;
};

const F = "block mb-1 text-xs font-medium text-gray-600 dark:text-gray-400";
const inputCls =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 " +
  "focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 " +
  "dark:border-gray-700 dark:bg-gray-800 dark:text-white/90 dark:[color-scheme:dark]";
const selectCls =
  "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 " +
  "focus:border-brand-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white/90";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={F}>{label}</label>
      {children}
    </div>
  );
}

export default function UserFormModal({ isOpen, onClose, profile, organizations, onSuccess }: Props) {
  const isCreate = !profile;

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("123456");
  const [ovog, setOvog]                 = useState("");
  const [ner, setNer]                   = useState("");
  const [phone, setPhone]               = useState("");
  const [role, setRole]                 = useState("user");
  const [organization, setOrganization] = useState("");
  const [orgSearch, setOrgSearch]       = useState("");
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
      setOrgSearch("");
      setTier(profile.membership_tier ?? "early");
      setStartedAt(profile.membership_started_at?.slice(0, 10) ?? "");
      setExpiresAt(profile.membership_expires_at?.slice(0, 10) ?? "");
      setEmail("");
      setPassword("");
    } else {
      setEmail(""); setPassword("123456");
      setOvog(""); setNer("");
      setPhone(""); setRole("user");
      setOrganization(""); setOrgSearch("");
      setTier("early"); setStartedAt(""); setExpiresAt("");
    }
    setFormError("");
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
            email, password,
            full_name: fullName,
            phone: phone || null,
            role,
            organization: organization || null,
            membership_tier: tier,
            membership_started_at: startedAt ? new Date(startedAt).toISOString() : null,
            membership_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
            membership_status: "active",
          }),
        });
        const data = await res.json();
        if (!res.ok) { setFormError(data.error ?? "Алдаа гарлаа"); return; }
      } else {
        const supabase = createBrowserSupabaseClient();
        const { error: err } = await supabase
          .from("profiles")
          .update({
            full_name: fullName,
            phone: phone || null,
            role,
            organization: organization || null,
            membership_tier: tier,
            membership_status: "active",
            membership_started_at: startedAt ? new Date(startedAt).toISOString() : null,
            membership_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", profile!.id);
        if (err) { setFormError(err.message); return; }
      }
      onSuccess();
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const filteredOrgs = organizations.filter((o) =>
    o.toLowerCase().includes(orgSearch.toLowerCase())
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg m-4">
      <div className="max-h-[90vh] overflow-y-auto p-6">
        <h3 className="mb-1 text-base font-semibold text-gray-800 dark:text-white/90">
          {isCreate ? "Шинэ хэрэглэгч нэмэх" : "Хэрэглэгч засах"}
        </h3>
        <p className="mb-4 text-xs text-gray-400">
          {isCreate ? "Auth болон профайл хамт үүснэ" : `ID: ${profile?.id?.slice(0, 8)}...`}
        </p>

        {formError && (
          <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">

          {/* ── Login (create only) ── */}
          {isCreate && (
            <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Нэвтрэх мэдээлэл</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <Field label="И-мэйл *">
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      className={inputCls} required placeholder="user@example.com" />
                  </Field>
                </div>
                <div className="col-span-2">
                  <Field label="Нууц үг *">
                    <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                      className={inputCls} required minLength={6} />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {/* ── Personal info ── */}
          <div className="grid grid-cols-2 gap-2">
            <Field label="Овог">
              <input type="text" value={ovog} onChange={(e) => setOvog(e.target.value)}
                className={inputCls} placeholder="Батболд" />
            </Field>
            <Field label="Нэр">
              <input type="text" value={ner} onChange={(e) => setNer(e.target.value)}
                className={inputCls} placeholder="Мөнхбаяр" />
            </Field>
            <Field label="Утасны дугаар">
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                className={inputCls} placeholder="9911xxxx" />
            </Field>
            <Field label="Эрх">
              <select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
                <option value="user">Гишүүн</option>
                <option value="admin">Админ</option>
              </select>
            </Field>
          </div>

          {/* ── Organization searchable select ── */}
          <Field label="Байгууллага">
            <div className="relative">
              <input
                type="text"
                value={organization || orgSearch}
                onChange={(e) => {
                  setOrgSearch(e.target.value);
                  setOrganization("");
                }}
                onFocus={() => setOrgSearch(organization)}
                className={inputCls}
                placeholder="Хайх эсвэл сонгох..."
                autoComplete="off"
              />
              {orgSearch && !organization && filteredOrgs.length > 0 && (
                <ul className="absolute z-50 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800">
                  {filteredOrgs.slice(0, 30).map((o) => (
                    <li
                      key={o}
                      onMouseDown={() => { setOrganization(o); setOrgSearch(""); }}
                      className="cursor-pointer px-3 py-2 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 dark:text-gray-300 dark:hover:bg-brand-900/20"
                    >
                      {o}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Field>

          {/* ── Membership ── */}
          <div className="rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Гишүүнчлэл</p>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2">
                <Field label="Тариф">
                  <select value={tier} onChange={(e) => setTier(e.target.value)} className={selectCls}>
                    <option value="early">Early — 480,000₮</option>
                    <option value="premium">Premium — 780,000₮</option>
                  </select>
                </Field>
              </div>
              <Field label="Эхлэх огноо">
                <input
                  type="date"
                  value={startedAt}
                  onChange={(e) => setStartedAt(e.target.value)}
                  className={inputCls}
                  style={{ colorScheme: "light" }}
                />
              </Field>
              <Field label="Дуусах огноо">
                <input
                  type="date"
                  value={expiresAt}
                  onChange={(e) => handleExpiresChange(e.target.value)}
                  className={inputCls}
                  style={{ colorScheme: "light" }}
                />
              </Field>
              {expiresAt && (
                <p className="col-span-2 text-xs text-gray-400">
                  Дуусах огноо оруулахад эхлэх огноо автоматаар −1 жил тохируулагдана
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose} size="sm">Цуцлах</Button>
            <Button type="submit" disabled={loading} size="sm">
              {loading ? "Хадгалж байна..." : isCreate ? "Нэмэх" : "Хадгалах"}
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
