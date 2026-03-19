"use client";

import React, { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import Checkbox from "@/components/form/input/Checkbox";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";

type Schedule = {
  id: string;
  class_id: string;
  start_time: string;
  end_time: string;
  is_cancelled: boolean;
  classes?: { title?: string | null; gyms?: { name?: string | null } | null } | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  schedule: Schedule | null;
  onSuccess: () => void;
};

export default function ScheduleEditModal({
  isOpen,
  onClose,
  schedule,
  onSuccess,
}: Props) {
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [isCancelled, setIsCancelled] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && schedule) {
      const start = new Date(schedule.start_time);
      const end = new Date(schedule.end_time);
      setStartDate(start.toISOString().slice(0, 10));
      setStartTime(start.toTimeString().slice(0, 5));
      setDurationMinutes(
        String(Math.round((end.getTime() - start.getTime()) / 60000))
      );
      setIsCancelled(schedule.is_cancelled);
      setError("");
    }
  }, [isOpen, schedule]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schedule) return;
    const start = new Date(`${startDate}T${startTime}`);
    const dur = parseInt(durationMinutes, 10) || 60;
    const end = new Date(start.getTime() + dur * 60 * 1000);
    setError("");
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase
      .from("class_schedules")
      .update({
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        is_cancelled: isCancelled,
      })
      .eq("id", schedule.id);
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSuccess();
    onClose();
  };

  if (!schedule) return null;

  const cls = Array.isArray(schedule.classes) ? schedule.classes[0] : schedule.classes;
  const gym = Array.isArray(cls?.gyms) ? cls?.gyms[0] : cls?.gyms;

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[500px] m-4">
      <div className="p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("edit")} {t("schedule")}
        </h3>
        <p className="mb-4 text-sm text-gray-500">
          {cls?.title ?? ""} ({gym?.name ?? ""})
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="rounded-lg bg-error-50 p-2 text-sm text-error-600 dark:bg-error-950 dark:text-error-400">
              {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t("date")} *</Label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                required
              />
            </div>
            <div>
              <Label>{t("time")} *</Label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                required
              />
            </div>
          </div>
          <div>
            <Label>{t("duration")} (мин)</Label>
            <input
              type="number"
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(e.target.value)}
              min="15"
              step="15"
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
            />
          </div>
          <div>
            <Checkbox
              label="Цуцлагдсан"
              checked={isCancelled}
              onChange={setIsCancelled}
            />
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
