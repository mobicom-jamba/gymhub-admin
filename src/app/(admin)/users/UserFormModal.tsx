"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  membership_tier?: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  onSuccess: () => void;
};

const ROLES = ["user", "admin"] as const;

export default function UserFormModal({
  isOpen,
  onClose,
  profile,
  onSuccess,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("user");
  const [membershipTier, setMembershipTier] = useState<string>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isCreate = !profile;

  useEffect(() => {
    if (isOpen) {
      if (profile) {
        setFullName(profile.full_name ?? "");
        setPhone(profile.phone ?? "");
        setRole(profile.role ?? "user");
        setMembershipTier(profile.membership_tier ?? "");
        setEmail("");
        setPassword("");
      } else {
        setEmail("");
        setPassword("");
        setFullName("");
        setPhone("");
        setRole("user");
        setMembershipTier("");
      }
      setError("");
    }
  }, [isOpen, profile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (isCreate) {
      if (!email || !password) {
        setError(t("pleaseEnterEmailAndPassword"));
        setLoading(false);
        return;
      }
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          full_name: fullName || null,
          phone: phone || null,
          role,
          membership_tier: membershipTier || null,
        }),
      });
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(data.error ?? t("errorOccurred"));
        return;
      }
    } else {
      const supabase = createBrowserSupabaseClient();
      const { error: err } = await supabase
        .from("profiles")
        .update({
          full_name: fullName || null,
          phone: phone || null,
          role,
          membership_tier: membershipTier || null,
        })
        .eq("id", profile!.id);
      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
    }
    onSuccess();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[500px] m-4">
      <div className="p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          {isCreate ? t("add") + " " + t("users") : t("edit") + " " + t("users")}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-error-50 p-2 text-sm text-error-600 dark:bg-error-950 dark:text-error-400">
              {error}
            </div>
          )}
          {isCreate && (
            <>
              <div>
                <Label>{t("email")} *</Label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  required
                />
              </div>
              <div>
                <Label>{t("password")} *</Label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                  required
                  minLength={6}
                />
              </div>
            </>
          )}
          <div>
            <Label>{t("fullName")}</Label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div>
            <Label>{t("phone")}</Label>
            <input
              type="text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div>
            <Label>{t("role")}</Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r === "user" ? t("member") : t("admin")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("membershipTier")}</Label>
            <select
              value={membershipTier}
              onChange={(e) => setMembershipTier(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            >
              <option value="">—</option>
              <option value="early">Early ®</option>
              <option value="premium">Premium ®</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-4">
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
