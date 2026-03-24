"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import Label from "@/components/form/Label";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import { t } from "@/lib/i18n";

type ClassOption = { id: string; title: string | null; gyms?: { name?: string | null } | null };

type Props = {
  isOpen: boolean;
  onClose: () => void;
  classes: ClassOption[];
  onSuccess: () => void;
};

export default function ScheduleFormModal({
  isOpen,
  onClose,
  classes,
  onSuccess,
}: Props) {
  const [classId, setClassId] = useState(classes[0]?.id ?? "");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [durationMinutes, setDurationMinutes] = useState("60");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  React.useEffect(() => {
    if (isOpen && classes.length > 0) {
      setClassId(classes[0].id);
      const today = new Date().toISOString().slice(0, 10);
      setStartDate(today);
    }
  }, [isOpen, classes]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!classId) {
      setError(t("pleaseSelectClass"));
      return;
    }
    if (!startDate || !startTime) {
      setError("Огноо болон цагаа бүрэн оруулна уу");
      return;
    }
    const start = new Date(`${startDate}T${startTime}`);
    const dur = parseInt(durationMinutes, 10) || 60;
    if (Number.isNaN(start.getTime())) {
      setError("Огноо/цаг буруу байна");
      return;
    }
    if (dur < 15) {
      setError("Үргэлжлэх хугацаа дор хаяж 15 минут байна");
      return;
    }
    const end = new Date(start.getTime() + dur * 60 * 1000);
    setError("");
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const { error: err } = await supabase.from("class_schedules").insert({
      class_id: classId,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSuccess();
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[500px] m-4">
      <div className="p-6">
        <h3 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">
          {t("add")} {t("schedule")}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-2 rounded-lg bg-error-50 text-error-600 text-sm dark:bg-error-950 dark:text-error-400">
              {error}
            </div>
          )}
          <div>
            <Label>{t("classes")} *</Label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              className="h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
              required
            >
              <option value="">{t("select")}</option>
              {classes.map((c) => {
                const g = Array.isArray(c.gyms) ? c.gyms[0] : c.gyms;
                return (
                  <option key={c.id} value={c.id}>
                    {c.title ?? c.id} ({g?.name ?? ""})
                  </option>
                );
              })}
            </select>
          </div>
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
