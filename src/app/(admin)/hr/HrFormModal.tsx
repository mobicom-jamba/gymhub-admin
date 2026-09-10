"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { FormError, SubmitLabel } from "@/components/form/FormFeedback";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

export type OrgOption = { id: string; name: string };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  organizations: OrgOption[];
  /** Засах горим: аль хэдийн бүртгэлтэй HR-ийн утга. */
  editing: { user_id: string; organization_id: string; full_name: string | null; phone: string | null } | null;
  onSuccess: () => void;
};

const inputClass =
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

export default function HrFormModal({ isOpen, onClose, organizations, editing, onSuccess }: Props) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const isEdit = Boolean(editing);

  const [organizationId, setOrganizationId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setOrganizationId(editing?.organization_id ?? "");
    setFullName(editing?.full_name ?? "");
    setPhone(editing?.phone ?? "");
    setPassword("");
    setError("");
  }, [isOpen, editing]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!organizationId) return setError("Байгууллага сонгоно уу");
    if (!fullName.trim()) return setError("Нэр оруулна уу");
    if (phone.replace(/\D/g, "").length < 8) return setError("Утасны дугаар зөв оруулна уу");
    if (!isEdit && password.trim().length < 6) return setError("Нууц үг хамгийн багадаа 6 тэмдэгт");
    if (isEdit && password.trim() && password.trim().length < 6) {
      return setError("Нууц үг хамгийн багадаа 6 тэмдэгт");
    }

    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/admin/org-admins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          organization_id: organizationId,
          full_name: fullName.trim(),
          phone: phone.replace(/\D/g, ""),
          password: password.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || "Хадгалах үед алдаа гарлаа");
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Алдаа гарлаа");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-md p-6">
      <h3 className="mb-1 text-lg font-semibold text-gray-800 dark:text-white/90">
        {isEdit ? "HR засах" : "HR нэмэх"}
      </h3>
      <p className="mb-5 text-xs text-gray-400">
        HR нь утасны дугаараар нэвтэрч, зөвхөн сонгосон байгууллагынхаа ажилчдыг харна.
      </p>

      <form onSubmit={submit} className="space-y-4">
        <div>
          <Label>Байгууллага</Label>
          <select
            value={organizationId}
            onChange={(e) => setOrganizationId(e.target.value)}
            disabled={isEdit}
            className={`${inputClass} disabled:opacity-60`}
          >
            <option value="">— сонгоно уу —</option>
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <Label>Овог, нэр</Label>
          <input
            className={inputClass}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Дорж Болд"
          />
        </div>

        <div>
          <Label>Утас (нэвтрэх нэр)</Label>
          <input
            className={`${inputClass} disabled:opacity-60`}
            value={phone}
            disabled={isEdit}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="99112233"
            inputMode="numeric"
          />
          {!isEdit && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              HR-т тусдаа дугаар ашиглана. Гишүүнээр бүртгэлтэй дугаар оруулбал татгалзана.
            </p>
          )}
        </div>

        <div>
          <Label>{isEdit ? "Шинэ нууц үг (заавал биш)" : "Нууц үг"}</Label>
          <input
            className={inputClass}
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isEdit ? "Солихгүй бол хоосон орхино" : "Хамгийн багадаа 6 тэмдэгт"}
          />
          {isEdit && (
            <p className="mt-1.5 text-[11px] text-gray-400">
              Нууц үг солиход тухайн HR бүх төхөөрөмжөөс гарна.
            </p>
          )}
        </div>

        <FormError message={error} />

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-xl border border-gray-200 px-4 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            Болих
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-white transition hover:bg-brand-600 disabled:opacity-60"
          >
            <SubmitLabel loading={saving} idleText="Хадгалах" />
          </button>
        </div>
      </form>
    </Modal>
  );
}
