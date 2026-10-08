"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import flatpickr from "flatpickr";
import { Mongolian } from "flatpickr/dist/l10n/mn.js";
import { Modal } from "@/components/ui/modal";
import Button from "@/components/ui/button/Button";
import { exportToCsv } from "@/lib/csv-export";
import type { Profile } from "./UsersSection";

type DateField = "created_at" | "membership_started_at";

const DATE_FIELD_LABELS: Record<DateField, string> = {
  created_at: "Бүртгүүлсэн огноо",
  membership_started_at: "Эрх эхэлсэн огноо",
};

/** "YYYY-MM-DD" (Улаанбаатарын цаг, UTC+8) → тухайн өдрийн 00:00 мөч (ms). */
function dayStartMs(value: string): number {
  return new Date(`${value}T00:00:00+08:00`).getTime();
}

/** ISO → "2026-10-08 14:05" (UTC+8) */
function formatUb(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const ub = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  return ub.toISOString().slice(0, 16).replace("T", " ");
}

const DAY_MS = 24 * 60 * 60 * 1000;

function todayUb(): string {
  return formatUb(new Date().toISOString()).slice(0, 10);
}

/** "YYYY-MM-DD" ± n өдөр */
function addDays(day: string, n: number): string {
  return new Date(dayStartMs(day) + n * DAY_MS + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Бэлэн хүрээнүүд: [эхлэх, дуусах] ("" = хязгааргүй) */
function presetRanges(): Array<{ label: string; range: [string, string] }> {
  const today = todayUb();
  const monthStart = `${today.slice(0, 8)}01`;
  const prevMonthEnd = addDays(monthStart, -1);
  return [
    { label: "Өнөөдөр", range: [today, today] },
    { label: "Өчигдөр", range: [addDays(today, -1), addDays(today, -1)] },
    { label: "Сүүлийн 7 хоног", range: [addDays(today, -6), today] },
    { label: "Сүүлийн 30 хоног", range: [addDays(today, -29), today] },
    { label: "Энэ сар", range: [monthStart, today] },
    { label: "Өмнөх сар", range: [`${prevMonthEnd.slice(0, 8)}01`, prevMonthEnd] },
    { label: "Бүгд", range: ["", ""] },
  ];
}

/** "2026-10-08" → "2026.10.08" */
const dotted = (day: string) => day.replaceAll("-", ".");

/** Гараар бичсэн "2026.10.08", "2026-10-8", "20261008" → "2026-10-08" (буруу бол null) */
function parseTypedDay(text: string): string | null {
  const digits = text.trim().replace(/[.\-/\s]+/g, "-");
  const m = /^(\d{4})-?(\d{1,2})-?(\d{1,2})$/.exec(digits);
  if (!m) return null;
  const day = `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day ? day : null;
}

type Props = {
  isOpen: boolean;
  onClose: () => void;
  /** Одоогийн шүүлтүүрээр гарсан хэрэглэгчид */
  profiles: Profile[];
  orgName: (p: Profile) => string | null;
  statusLabel: (p: Profile) => string;
};

export default function UsersCsvExportModal({
  isOpen,
  onClose,
  profiles,
  orgName,
  statusLabel,
}: Props) {
  const [dateField, setDateField] = useState<DateField>("created_at");
  const [from, setFrom] = useState(() => addDays(todayUb(), -29));
  const [to, setTo] = useState(todayUb);
  const calendarRef = useRef<HTMLDivElement | null>(null);
  const pickerRef = useRef<flatpickr.Instance | null>(null);

  // Байнга харагдах календарь: эхний өдрөө, дараа нь сүүлийн өдрөө дарна.
  useEffect(() => {
    if (!isOpen || !calendarRef.current) return;
    const instance = flatpickr(calendarRef.current, {
      inline: true,
      mode: "range",
      dateFormat: "Y-m-d",
      locale: Mongolian,
      maxDate: todayUb(),
      monthSelectorType: "static",
      defaultDate: from && to ? [from, to] : undefined,
      onChange: (dates, _str, fp) => {
        const days = dates.map((d) => fp.formatDate(d, "Y-m-d"));
        if (days.length === 1) {
          setFrom(days[0]);
          setTo(days[0]);
        } else if (days.length === 2) {
          setFrom(days[0]);
          setTo(days[1]);
        }
      },
    });
    pickerRef.current = instance;
    return () => {
      instance.destroy();
      pickerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once per open
  }, [isOpen]);

  // Гараар бичих талбарууд: бичиж байх үед draft, зөв огноо болмогц хүрээг шинэчилнэ.
  const [fromText, setFromText] = useState(() => dotted(from));
  const [toText, setToText] = useState(() => dotted(to));
  useEffect(() => setFromText(from ? dotted(from) : ""), [from]);
  useEffect(() => setToText(to ? dotted(to) : ""), [to]);

  const syncCalendar = (a: string, b: string) => {
    if (a && b && a <= b) {
      pickerRef.current?.setDate([a, b], false);
      pickerRef.current?.jumpToDate(a);
    }
  };

  const onTyped = (which: "from" | "to", text: string) => {
    if (which === "from") setFromText(text);
    else setToText(text);
    if (text.trim() === "") {
      if (which === "from") setFrom("");
      else setTo("");
      return;
    }
    const day = parseTypedDay(text);
    if (!day) return;
    if (which === "from") {
      setFrom(day);
      syncCalendar(day, to);
    } else {
      setTo(day);
      syncCalendar(from, day);
    }
  };

  const typedInvalid = (text: string, value: string) =>
    text.trim() !== "" && (!parseTypedDay(text) || parseTypedDay(text) !== value);

  const applyPreset = (range: [string, string]) => {
    setFrom(range[0]);
    setTo(range[1]);
    if (range[0] && range[1]) {
      pickerRef.current?.setDate(range, false);
      pickerRef.current?.jumpToDate(range[0]);
    } else {
      pickerRef.current?.clear(false);
    }
  };

  const invalidRange = Boolean(from && to && from > to);

  // Сонгосон огнооны хүрээнд (хоёр талдаа багтаана) орсон хэрэглэгчид, огноогоор эрэмбэлсэн.
  const rows = useMemo(() => {
    if (invalidRange) return [];
    const fromMs = from ? dayStartMs(from) : -Infinity;
    const toMs = to ? dayStartMs(to) + 24 * 60 * 60 * 1000 : Infinity;
    return profiles
      .map((p) => ({ p, t: p[dateField] ? new Date(p[dateField] as string).getTime() : NaN }))
      .filter(({ t }) => !Number.isNaN(t) && t >= fromMs && t < toMs)
      .sort((a, b) => a.t - b.t)
      .map(({ p }) => p);
  }, [profiles, dateField, from, to, invalidRange]);

  const handleDownload = () => {
    exportToCsv(
      `users_${from || "ehnees"}_${to || "odoo"}`,
      rows.map((p) => ({
        full_name: p.full_name ?? [p.surname, p.given_name].filter(Boolean).join(" "),
        phone: p.phone,
        organization: orgName(p),
        membership_tier: p.membership_tier,
        status: statusLabel(p),
        created_at: formatUb(p.created_at),
        membership_started_at: formatUb(p.membership_started_at),
        membership_expires_at: formatUb(p.membership_expires_at),
      })),
      [
        { key: "full_name", label: "Нэр" },
        { key: "phone", label: "Утас" },
        { key: "organization", label: "Байгууллага" },
        { key: "membership_tier", label: "Тариф" },
        { key: "status", label: "Төлөв" },
        { key: "created_at", label: "Бүртгүүлсэн огноо" },
        { key: "membership_started_at", label: "Эхлэх огноо" },
        { key: "membership_expires_at", label: "Дуусах огноо" },
      ],
    );
    onClose();
  };

  const inputClass =
    "h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-gray-700 dark:bg-gray-800 dark:text-white/90";

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-[440px] m-4 max-h-[95vh] overflow-y-auto">
      <div className="p-6 space-y-4">
        <div className="pr-10">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">CSV татах</h3>
          <p className="mt-1 text-xs text-gray-500">
            Одоогийн шүүлтүүр дээр нэмээд огнооны хүрээ сонгоно. Огноогоор эрэмбэлэгдэж татагдана.
          </p>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Ямар огноогоор</span>
          <select
            value={dateField}
            onChange={(e) => setDateField(e.target.value as DateField)}
            className={inputClass}
          >
            {(Object.keys(DATE_FIELD_LABELS) as DateField[]).map((k) => (
              <option key={k} value={k}>
                {DATE_FIELD_LABELS[k]}
              </option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-300">Хугацаа</span>
          <div className="flex flex-wrap gap-1.5">
            {presetRanges().map((p) => {
              const active = p.range[0] === from && p.range[1] === to;
              return (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => applyPreset(p.range)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                    active
                      ? "bg-brand-500 text-white ring-brand-500"
                      : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
                  }`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["from", "Эхлэх өдөр", fromText, from],
                ["to", "Дуусах өдөр", toText, to],
              ] as const
            ).map(([which, label, text, value]) => (
              <label key={which} className="block space-y-1">
                <span className="text-[11px] text-gray-500">{label}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={text}
                  onChange={(e) => onTyped(which, e.target.value)}
                  onBlur={() => (which === "from" ? setFromText(from ? dotted(from) : "") : setToText(to ? dotted(to) : ""))}
                  placeholder={which === "from" ? "Эхнээс" : "Өнөөдөр"}
                  className={`${inputClass} tabular-nums ${
                    typedInvalid(text, value) ? "!border-error-400 focus:!ring-error-500/30" : ""
                  }`}
                />
              </label>
            ))}
          </div>
          <p className="text-[11px] text-gray-500">
            2026.10.08 гэж гараар бичих, эсвэл календарь дээр эхний өдрөө, дараа нь сүүлийн өдрөө дарна.
          </p>
          <div className="flex justify-center [&_.flatpickr-calendar]:!mt-0 [&_.flatpickr-calendar]:!shadow-none">
            <div ref={calendarRef} />
          </div>
        </div>

        <div className="rounded-xl bg-gray-50 px-3 py-2.5 text-sm dark:bg-white/[0.04]">
          {invalidRange ? (
            <span className="text-error-600">Эхлэх өдөр дуусах өдрөөс өмнө байх ёстой.</span>
          ) : (
            <span className="text-gray-700 dark:text-gray-200">
              <b className="tabular-nums">{rows.length}</b> хэрэглэгч ·{" "}
              {from ? dotted(from) : "Эхнээс"} – {to ? dotted(to) : "одоо"}
            </span>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" onClick={onClose}>
            Болих
          </Button>
          <Button onClick={handleDownload} disabled={rows.length === 0}>
            Татах
          </Button>
        </div>
      </div>
    </Modal>
  );
}
