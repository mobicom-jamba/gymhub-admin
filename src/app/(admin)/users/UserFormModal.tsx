"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { Profile } from "./UsersSection";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  onSuccess: () => void;
};

const inputCls =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

const selectCls =
  "h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90";

export default function UserFormModal({ isOpen, onClose, profile, onSuccess }: Props) {
  const isCreate = !profile;

  const [email, setEmail]               = useState("");
  const [password, setPassword]         = useState("123456");
  const [fullName, setFullName]         = useState("");
  const [phone, setPhone]               = useState("");
  const [role, setRole]                 = useState("user");
  const [organization, setOrganization] = useState("");
  const [tier, setTier]                 = useState("early");
  const [startedAt, setStartedAt]       = useState("");
  const [expiresAt, setExpiresAt]       = useState("");
  const [formError, setFormError]       = useState("");
  const [loading, setLoading]           = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    if (profile) {
      setEmail("");
      setPassword("");
      setFullName(profile.full_name ?? "");
      setPhone(profile.phone ?? "");
      setRole(profile.role ?? "user");
      setOrganization(profile.organization ?? "");
      setTier(profile.membership_tier ?? "early");
      setStartedAt(profile.membership_started_at ? profile.membership_started_at.slice(0, 10) : "");
      setExpiresAt(profile.membership_expires_at ? profile.membership_expires_at.slice(0, 10) : "");
    } else {
      setEmail("");
      setPassword("123456");
      setFullName("");
      setPhone("");
      setRole("user");
      setOrganization("");
      setTier("early");
      setStartedAt("");
      setExpiresAt("");
    }
    setFormError("");
  }, [isOpen, profile]);

  // Auto-fill started_at = expires_at − 1 year when expires changes (create mode)
  const handleExpiresChange = (val: string) => {
    setExpiresAt(val);
    if (val && isCreate) {
      const d = new Date(val);
      d.setFullYear(d.getFullYear() - 1);
      setStartedAt(d.toISOString().slice(0, 10));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setLoading(true);

    try {
      if (isCreate) {
        if (!email || !password) {
          setFormError("И-мэйл болон нууц үг оруулна уу");
          return;
        }
        // Create auth user + profile via admin API
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            full_name: fullName || null,
            phone: phone || null,
            role,
            organization: organization || null,
            membership_tier: tier || null,
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
            full_name: fullName || null,
            phone: phone || null,
            role,
            organization: organization || null,
            membership_tier: tier || null,
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

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg m-4">
      <div className="p-6">
        <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
          {isCreate ? "Шинэ хэрэглэгч нэмэх" : "Хэрэглэгч засах"}
        </h3>
        <p className="mb-5 text-sm text-gray-500 dark:text-gray-400">
          {isCreate ? "Auth + профайл хамт үүснэ" : `ID: ${profile?.id?.slice(0, 8)}...`}
        </p>

        {formError && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {formError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* ── Auth fields (create only) ── */}
          {isCreate && (
            <div className="rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Нэвтрэх мэдээлэл</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>И-мэйл *</Label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className={inputCls} required placeholder="user@example.com" />
                </div>
                <div className="col-span-2">
                  <Label>Нууц үг *</Label>
                  <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                    className={inputCls} required minLength={6} placeholder="123456" />
                </div>
              </div>
            </div>
          )}

          {/* ── Personal info ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Нэр</Label>
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)}
                className={inputCls} placeholder="Овог Нэр" />
            </div>
            <div>
              <Label>Утасны дугаар</Label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                className={inputCls} placeholder="9911xxxx" />
            </div>
            <div>
              <Label>Эрх</Label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className={selectCls}>
                <option value="user">Гишүүн</option>
                <option value="admin">Админ</option>
              </select>
            </div>
            <div className="col-span-2">
              <Label>Байгууллага</Label>
              <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)}
                className={inputCls} placeholder="Khanbank, MCS Group..." />
            </div>
          </div>

          {/* ── Membership ── */}
          <div className="rounded-xl border border-dashed border-gray-300 p-4 dark:border-gray-700">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Гишүүнчлэл</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Тариф</Label>
                <select value={tier} onChange={(e) => setTier(e.target.value)} className={selectCls}>
                  <option value="early">Early — 480,000₮</option>
                  <option value="premium">Premium — 780,000₮</option>
                </select>
              </div>
              <div>
                <Label>Эхлэх огноо</Label>
                <input type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <Label>Дуусах огноо</Label>
                <input type="date" value={expiresAt} onChange={(e) => handleExpiresChange(e.target.value)}
                  className={inputCls} />
                {isCreate && <p className="mt-1 text-xs text-gray-400">Дуусах огноо оруулахад эхлэх огноо автоматаар тохируулагдана</p>}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
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
