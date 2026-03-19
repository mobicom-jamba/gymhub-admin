"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";

type Profile = { id: string; full_name: string | null };
type Schedule = {
  id: string;
  start_time: string;
  end_time: string;
  classes?: { title?: string | null; gyms?: { name?: string | null } | null } | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
};

export default function CreateBookingModal({
  isOpen,
  onClose,
  onSuccess,
}: Props) {
  const [userId, setUserId] = useState("");
  const [scheduleId, setScheduleId] = useState("");
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUserId("");
      setScheduleId("");
      setError("");
      const supabase = createBrowserSupabaseClient();
      Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name")
          .order("full_name"),
        supabase
          .from("class_schedules")
          .select("id, start_time, end_time, classes!inner(title, gyms(name))")
          .eq("is_cancelled", false)
          .gte("start_time", new Date().toISOString())
          .order("start_time")
          .limit(100),
      ]).then(([profRes, schedRes]) => {
        setProfiles((profRes.data ?? []) as Profile[]);
        setSchedules((schedRes.data ?? []) as Schedule[]);
      });
    }
  }, [isOpen]);

  const getScheduleLabel = (s: Schedule) => {
    const c = Array.isArray(s.classes) ? s.classes[0] : s.classes;
    const g = Array.isArray(c?.gyms) ? c?.gyms[0] : c?.gyms;
    const start = new Date(s.start_time).toLocaleString("mn-MN");
    return `${c?.title ?? ""} (${g?.name ?? ""}) - ${start}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId || !scheduleId) {
      setError(t("pleaseSelectUserAndSchedule"));
      return;
    }
    setError("");
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { data, error: rpcError } = await supabase.rpc("admin_create_booking", {
      p_user_id: userId,
      p_schedule_id: scheduleId,
    });
    setLoading(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    onSuccess();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[500px] m-4">
      <div className="p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("add")} {t("bookings")}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-error-50 p-2 text-sm text-error-600 dark:bg-error-950 dark:text-error-400">
              {error}
            </div>
          )}
          <div>
            <Label>{t("user")} *</Label>
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              required
            >
              <option value="">{t("select")}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name ?? p.id.slice(0, 8)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>{t("classTitle")} / {t("time")} *</Label>
            <select
              value={scheduleId}
              onChange={(e) => setScheduleId(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              required
            >
              <option value="">{t("select")}</option>
              {schedules.map((s) => (
                <option key={s.id} value={s.id}>
                  {getScheduleLabel(s)}
                </option>
              ))}
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
