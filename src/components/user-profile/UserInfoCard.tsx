"use client";
import React, { useState } from "react";
import { useModal } from "../../hooks/useModal";
import { Modal } from "../ui/modal";
import Button from "../ui/button/Button";
import Label from "../form/Label";
import { t } from "@/lib/i18n";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type ProfileData = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  membership_tier: string | null;
};

type Props = {
  profile: ProfileData;
  email: string;
  onUpdate: () => Promise<void>;
};

const tierLabels: Record<string, string> = {
  early: "Early ®",
  premium: "Premium ®",
};

export default function UserInfoCard({ profile, email, onUpdate }: Props) {
  const { isOpen, openModal, closeModal } = useModal();
  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("profiles")
      .update({
        full_name: fullName || null,
        phone: phone || null,
      })
      .eq("id", profile.id);
    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    await onUpdate();
    closeModal();
  };

  return (
    <div className="p-5 border border-gray-200 rounded-2xl dark:border-gray-800 lg:p-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h4 className="text-lg font-semibold text-gray-800 dark:text-white/90 lg:mb-6">
            {t("personalInformation")}
          </h4>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-7 2xl:gap-x-32">
            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                {t("fullName")}
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {profile.full_name || "—"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                {t("emailAddress")}
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {email}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                {t("phone")}
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {profile.phone || "—"}
              </p>
            </div>

            <div>
              <p className="mb-2 text-xs leading-normal text-gray-500 dark:text-gray-400">
                {t("membershipTier")}
              </p>
              <p className="text-sm font-medium text-gray-800 dark:text-white/90">
                {tierLabels[profile.membership_tier ?? ""] ?? "—"}
              </p>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            setFullName(profile.full_name ?? "");
            setPhone(profile.phone ?? "");
            setError("");
            openModal();
          }}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200 lg:inline-flex lg:w-auto"
        >
          <svg
            className="fill-current"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              fillRule="evenodd"
              clipRule="evenodd"
              d="M15.0911 2.78206C14.2125 1.90338 12.7878 1.90338 11.9092 2.78206L4.57524 10.116C4.26682 10.4244 4.0547 10.8158 3.96468 11.2426L3.31231 14.3352C3.25997 14.5833 3.33653 14.841 3.51583 15.0203C3.69512 15.1996 3.95286 15.2761 4.20096 15.2238L7.29355 14.5714C7.72031 14.4814 8.11172 14.2693 8.42013 13.9609L15.7541 6.62695C16.6327 5.74827 16.6327 4.32365 15.7541 3.44497L15.0911 2.78206ZM12.9698 3.84272C13.2627 3.54982 13.7376 3.54982 14.0305 3.84272L14.6934 4.50563C14.9863 4.79852 14.9863 5.2734 14.6934 5.56629L14.044 6.21573L12.3204 4.49215L12.9698 3.84272ZM11.2597 5.55281L5.6359 11.1766C5.53309 11.2794 5.46238 11.4099 5.43238 11.5522L5.01758 13.5185L6.98394 13.1037C7.1262 13.0737 7.25666 13.003 7.35947 12.9002L12.9833 7.27639L11.2597 5.55281Z"
              fill=""
            />
          </svg>
          {t("edit")}
        </button>
      </div>

      <Modal isOpen={isOpen} onClose={closeModal} className="max-w-[500px] m-4">
        <div className="p-6">
          <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
            {t("editPersonalInformation")}
          </h3>
          {error && (
            <div className="mb-4 rounded-lg bg-error-50 p-2 text-sm text-error-600 dark:bg-error-950 dark:text-error-400">
              {error}
            </div>
          )}
          <div className="space-y-4">
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
            <div className="flex justify-end gap-3 pt-4">
              <Button size="sm" variant="outline" onClick={closeModal}>
                {t("cancel")}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? "..." : t("save")}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
