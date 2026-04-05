"use client";

import React, { useState, useEffect, useRef, useId } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/components/ui/modal";
import type { OrganizationOption, Profile } from "./UsersSection";
import { parseApiError } from "@/lib/api-response";
import { FormError, SubmitLabel } from "@/components/form/FormFeedback";
import OrgFormModal from "../organizations/OrgFormModal";
import { getUserPlaceholderAvatar } from "@/lib/user-avatar";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  profile: Profile | null;
  organizations: OrganizationOption[];
  onOrganizationsRefresh?: () => void;
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function resolveMembershipStatus(startedAt: string, expiresAt: string): "active" | "inactive" {
  if (!startedAt && !expiresAt) return "inactive";
  const now = new Date();
  const start = startedAt ? new Date(startedAt) : null;
  const end = expiresAt ? new Date(expiresAt) : null;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) return "inactive";
  const isStarted = start ? now >= start : true;
  const isNotExpired = end ? now <= end : true;
  return isStarted && isNotExpired ? "active" : "inactive";
}

const MN_MONTHS = ["1-р","2-р","3-р","4-р","5-р","6-р","7-р","8-р","9-р","10-р","11-р","12-р"];
const MN_DAYS   = ["Да","Мя","Лх","Пү","Ба","Бя","Ня"];

function parseTyped(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 8) {
    const y = digits.slice(0,4), m = digits.slice(4,6), d = digits.slice(6,8);
    const date = new Date(`${y}-${m}-${d}`);
    if (!isNaN(date.getTime()) && date.getFullYear() === +y) return `${y}-${m}-${d}`;
  }
  const parts = raw.split(/[.\-\/]/);
  if (parts.length === 3) {
    const [y, m, d] = parts.map(p => p.padStart(2, "0"));
    const iso = `${y}-${m}-${d}`;
    const date = new Date(iso);
    if (!isNaN(date.getTime()) && String(date.getFullYear()) === y) return iso;
  }
  return null;
}

function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const uid             = useId();
  const portalId        = `date-cal-${uid.replace(/:/g, "")}`;
  const [open, setOpen]   = useState(false);
  const [pos, setPos]     = useState({ top: 0, left: 0, width: 0 });
  const triggerRef        = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLInputElement>(null);
  const [text, setText]   = useState(value ? value.replace(/-/g, ".") : "");

  useEffect(() => {
    setText(value ? value.replace(/-/g, ".") : "");
  }, [value]);

  const today = new Date();
  const [vy, setVy] = useState(() => value ? parseInt(value.slice(0,4)) : today.getFullYear());
  const [vm, setVm] = useState(() => value ? parseInt(value.slice(5,7)) - 1 : today.getMonth());

  const prevMonth = () => { if (vm === 0) { setVm(11); setVy(y => y-1); } else setVm(m => m-1); };
  const nextMonth = () => { if (vm === 11) { setVm(0); setVy(y => y+1); } else setVm(m => m+1); };

  const openCalendar = (anchor: HTMLElement) => {
    const r   = anchor.getBoundingClientRect();
    const calH = 300;
    const top    = r.bottom + 4;
    const adjTop = (top + calH > window.innerHeight) ? r.top - calH - 4 : top;
    setPos({ top: adjTop, left: r.left, width: Math.max(r.width, 240) });
    if (value) { setVy(parseInt(value.slice(0,4))); setVm(parseInt(value.slice(5,7))-1); }
    setOpen(o => !o);
  };

  const handleIconClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!triggerRef.current) return;
    openCalendar(triggerRef.current);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(raw);
    if (!raw) { onChange(""); return; }
    const iso = parseTyped(raw);
    if (iso) onChange(iso);
  };

  const handleBlur = () => {
    if (!text) { onChange(""); return; }
    const iso = parseTyped(text);
    if (iso) {
      setText(iso.replace(/-/g, "."));
      onChange(iso);
    } else {
      setText(value ? value.replace(/-/g, ".") : "");
    }
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      const cal = document.getElementById(portalId);
      if (cal?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open, portalId]);


  const [pickMode, setPickMode] = useState<"day" | "month" | "year">("day");

  const firstDay   = new Date(vy, vm, 1).getDay();
  const startDay   = (firstDay + 6) % 7; // Mon-first
  const daysInMon  = new Date(vy, vm + 1, 0).getDate();
  const display    = value ? value.replace(/-/g, ".") : "";
  const yearRange  = Array.from({ length: 16 }, (_, i) => today.getFullYear() - 5 + i);

  const pick = (day: number) => {
    const iso = `${vy}-${String(vm+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
    onChange(iso);
    setText(iso.replace(/-/g, "."));
    setOpen(false);
  };

  return (
    <div ref={triggerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={handleTextChange}
        onBlur={handleBlur}
        placeholder="жжжж.сс.өө"
        className={inp + " pr-9"}
      />
      <button
        type="button"
        onMouseDown={e => e.preventDefault()}
        onClick={handleIconClick}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 dark:hover:text-gray-400"
        tabIndex={-1}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5m-9-6h.008v.008H12V9zm0 3.75h.008v.008H12v-.008zm0 3.75h.008v.008H12v-.008zm3.75-7.5h.008v.008H15.75V9zm0 3.75h.008v.008H15.75v-.008zm0 3.75h.008v.008H15.75v-.008zM8.25 9h.008v.008H8.25V9zm0 3.75h.008v.008H8.25v-.008zm0 3.75h.008v.008H8.25v-.008z" />
        </svg>
      </button>

      {open && createPortal(
        <div
          id={portalId}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width, zIndex: 99999 }}
          className="rounded-2xl border border-gray-100 bg-white p-4 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
        >
          {/* Header */}
          <div className="mb-3 flex items-center justify-between">
            {pickMode === "day" ? (
              <>
                <button type="button" onClick={prevMonth}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7"/></svg>
                </button>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setPickMode("year")}
                    className="rounded-lg px-2 py-1 text-sm font-bold text-gray-800 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-700">{vy}</button>
                  <span className="text-gray-300">·</span>
                  <button type="button" onClick={() => setPickMode("month")}
                    className="rounded-lg px-2 py-1 text-sm font-semibold text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700">{MN_MONTHS[vm]} сар</button>
                </div>
                <button type="button" onClick={nextMonth}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7"/></svg>
                </button>
              </>
            ) : (
              <>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                  {pickMode === "year" ? "Tон сонгох" : "Сар сонгох"}
                </span>
                <button type="button" onClick={() => setPickMode("day")}
                  className="rounded-lg px-2 py-1 text-xs text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">× Хаах</button>
              </>
            )}
          </div>

          {pickMode === "year" && (
            <div className="grid grid-cols-4 gap-1">
              {yearRange.map(y => (
                <button key={y} type="button" onClick={() => { setVy(y); setPickMode("month"); }}
                  className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                    y === vy ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}>{y}</button>
              ))}
            </div>
          )}

          {pickMode === "month" && (
            <div className="grid grid-cols-3 gap-1">
              {MN_MONTHS.map((m, i) => (
                <button key={i} type="button" onClick={() => { setVm(i); setPickMode("day"); }}
                  className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                    i === vm ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}>{m} сар</button>
              ))}
            </div>
          )}

          {pickMode === "day" && (<>
          {/* Day headers */}
          <div className="mb-1 grid grid-cols-7">
            {MN_DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-gray-400">{d}</div>
            ))}
          </div>
          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: startDay }, (_, i) => <div key={`x${i}`} />)}
            {Array.from({ length: daysInMon }, (_, i) => {
              const day = i + 1;
              const iso = `${vy}-${String(vm+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
              const sel = iso === value;
              const isToday = iso === today.toISOString().slice(0,10);
              return (
                <button key={day} type="button" onClick={() => pick(day)}
                  className={`flex h-8 w-full items-center justify-center rounded-lg text-sm transition-colors ${
                    sel
                      ? "bg-brand-500 font-bold text-white"
                      : isToday
                        ? "border border-brand-300 text-brand-600 dark:border-brand-700 dark:text-brand-400"
                        : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
                  }`}>
                  {day}
                </button>
              );
            })}
          </div>
          </>)}
          {value && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              className="mt-3 w-full rounded-lg border border-gray-100 py-1.5 text-xs text-gray-400 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-500 dark:hover:bg-gray-700/50">
              Арилгах
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

export default function UserFormModal({ isOpen, onClose, profile, organizations, onOrganizationsRefresh, onSuccess }: Props) {
  const isCreate = !profile;
  const orgDropRef = useRef<HTMLDivElement>(null);

  const [password, setPassword]         = useState("123456");
  const [ovog, setOvog]                 = useState("");
  const [ner, setNer]                   = useState("");
  const [phone, setPhone]               = useState("");
  const [role, setRole]                 = useState("user");
  const [organizationId, setOrganizationId] = useState<string>("");
  const [organization, setOrganization] = useState("");
  const [orgSearch, setOrgSearch]       = useState("");
  const [orgOpen, setOrgOpen]           = useState(false);
  const [quickCreateOrgOpen, setQuickCreateOrgOpen] = useState(false);
  const [tier, setTier]                 = useState("early");
  const [membershipStatus, setMembershipStatus] = useState("active");
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
      setOrganizationId(profile.organization_id ?? "");
      setOrganization(profile.organization ?? "");
      setTier(profile.membership_tier ?? "early");
      setMembershipStatus(profile.membership_status ?? "active");
      setStartedAt(profile.membership_started_at?.slice(0, 10) ?? "");
      setExpiresAt(profile.membership_expires_at?.slice(0, 10) ?? "");
      setPassword("");
    } else {
      setPassword("123456");
      setOvog(""); setNer(""); setPhone(""); setRole("user");
      setOrganizationId("");
      setOrganization(""); setTier("early"); setMembershipStatus("active"); setStartedAt(""); setExpiresAt("");
    }
    setOrgSearch(""); setOrgOpen(false); setFormError("");
  }, [isOpen, profile]);

  useEffect(() => {
    setMembershipStatus(resolveMembershipStatus(startedAt, expiresAt));
  }, [startedAt, expiresAt]);

  const handleExpiresChange = (val: string) => {
    setExpiresAt(val);
    if (val) {
      const d = new Date(val);
      d.setFullYear(d.getFullYear() - 1);
      setStartedAt(d.toISOString().slice(0, 10));
    }
  };

  const safeOrganizationId = organizationId && isUuid(organizationId) ? organizationId : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");
    setLoading(true);
    const fullName = [ovog, ner].filter(Boolean).join(" ") || null;
    const computedMembershipStatus = resolveMembershipStatus(startedAt, expiresAt);
    try {
      if (expiresAt && startedAt && new Date(startedAt) > new Date(expiresAt)) {
        setFormError("Эхлэх огноо нь дуусах огнооноос өмнө байх ёстой.");
        return;
      }
      if (isCreate) {
        const digits = phone.replace(/\D/g, "");
        if (!digits || digits.length < 8) { setFormError("8 оронтой утасны дугаар оруулна уу."); return; }
        if (!password) { setFormError("Нууц үг оруулна уу."); return; }
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            phone: digits, password, full_name: fullName,
            role,
            organization_id: safeOrganizationId,
            organization: organization || null,
            membership_tier: tier, membership_status: computedMembershipStatus,
            membership_started_at: startedAt ? new Date(startedAt).toISOString() : null,
            membership_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          }),
        });
        if (!res.ok) { setFormError(await parseApiError(res)); return; }
      } else {
        const res = await fetch(`/api/admin/users/${profile!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            full_name: fullName,
            phone: phone || null,
            role,
            organization_id: safeOrganizationId,
            organization: organization || null,
            membership_tier: tier,
            membership_status: computedMembershipStatus,
            membership_started_at: startedAt ? new Date(startedAt).toISOString() : null,
            membership_expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
            ...(password ? { password } : {}),
          }),
        });
        if (!res.ok) { setFormError(await parseApiError(res)); return; }
      }
      onSuccess(); onClose();
    } finally { setLoading(false); }
  };

  const filteredOrgs = organizations.filter((o) =>
    o.name.toLowerCase().includes(orgSearch.toLowerCase())
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
          <img
            src={getUserPlaceholderAvatar(profile?.id || displayName)}
            alt="avatar"
            className="h-14 w-14 shrink-0 rounded-2xl object-cover shadow-sm"
          />
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-800 dark:text-white">
              {isCreate ? "Хэрэглэгч бүртгэх" : (displayName || "Хэрэглэгчийн мэдээлэл засах")}
            </h3>
            <p className="text-xs text-gray-400">
              {isCreate
                ? "Шинэ хэрэглэгчийн бүртгэл болон профайл үүсгэнэ."
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

            <div className="mx-5 mt-4">
              <FormError message={formError} />
            </div>

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
                  <p className="mb-3 text-[11px] text-gray-400 dark:text-gray-500">
                    Хэрэглэгч утасны дугаар + нууц үгээр нэвтэрнэ.
                  </p>
                  <div className="space-y-3">
                    <div>
                      <Label>Утасны дугаар *</Label>
                      <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
                        className={inp} required placeholder="99112233" maxLength={8} autoFocus />
                    </div>
                    <div>
                      <Label>Нууц үг *</Label>
                      <div className="relative">
                        <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                          className={inp} required minLength={6} />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-400 dark:bg-gray-700">
                          түр
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Password change (edit only) */}
            {!isCreate && (
              <div className="px-5 pt-5">
                <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-800/30">
                  <div className="mb-3 flex items-center gap-2">
                    <div className="flex h-5 w-5 items-center justify-center rounded-md bg-gray-200 dark:bg-gray-700">
                      <svg className="h-3 w-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                      </svg>
                    </div>
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Нууц үг солих</span>
                  </div>
                  <div>
                    <Label>Шинэ нууц үг</Label>
                    <div className="relative">
                      <input type="text" value={password} onChange={e => setPassword(e.target.value)}
                        className={inp} placeholder="Хоосон бол хэвээр үлдэнэ" minLength={6} />
                      {password && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                          солигдоно
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-[10px] text-gray-400">Хоосон үлдээвэл одоогийн нууц үг хэвээр үлдэнэ.</p>
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
                    className={inp} placeholder="Батболд" autoFocus={!isCreate} />
                </div>
                <div>
                  <Label>Нэр</Label>
                  <input type="text" value={ner} onChange={e => setNer(e.target.value)}
                    className={inp} placeholder="Мөнхбаяр" />
                </div>
                <div className="col-span-2">
                  <Label>Утас{isCreate ? "" : ""}</Label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ""))}
                    className={inp} placeholder="99112233" maxLength={8}
                    disabled={isCreate}
                  />
                  {isCreate && (
                    <p className="mt-1 text-[10px] text-gray-400">Дээрх нэвтрэх хэсэгт оруулсан дугаараар автоматаар бөглөнө.</p>
                  )}
                </div>
                <div className="col-span-2">
                  <Label>Системийн эрх</Label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className={inp}
                  >
                    <option value="user">Хэрэглэгч</option>
                    <option value="gym_owner">Фитнес эзэмшигч</option>
                    <option value="sales">Борлуулалт</option>
                    <option value="admin">Админ</option>
                  </select>
                </div>
              </div>

              {/* Org searchable combobox */}
              <div className="mt-3" ref={orgDropRef}>
                <div className="mb-1.5 flex items-center justify-between">
                  <Label>Байгууллага</Label>
                  <button
                    type="button"
                    onClick={() => setQuickCreateOrgOpen(true)}
                    className="rounded-lg border border-gray-200 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300"
                  >
                    + Шинэ байгууллага
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={orgOpen ? orgSearch : organization}
                    onChange={e => { setOrgSearch(e.target.value); setOrganization(""); setOrganizationId(""); }}
                    onFocus={() => { setOrgOpen(true); setOrgSearch(organization); }}
                    onBlur={() =>
                      setTimeout(() => {
                        const typed = orgSearch.trim();
                        if (typed && !organization) {
                          setOrganization(typed);
                          setOrganizationId("");
                        }
                        setOrgOpen(false);
                      }, 150)
                    }
                    className={inp + " pr-8"}
                    placeholder="Байгууллагын нэрээр хайх..."
                    autoComplete="off"
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-300">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                  {orgOpen && filteredOrgs.length > 0 && (
                    <ul className="absolute z-50 mt-1 max-h-44 w-full overflow-y-auto rounded-xl border border-gray-100 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-800">
                      {filteredOrgs.map(o => (
                        <li
                          key={o.id}
                          onMouseDown={() => {
                            setOrganization(o.name);
                            setOrganizationId(o.id);
                            setOrgSearch("");
                            setOrgOpen(false);
                          }}
                          className={`cursor-pointer px-3.5 py-2 text-sm transition ${
                            o.name === organization
                              ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400"
                              : "text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-white/[0.04]"
                          }`}
                        >
                          {o.name}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {organization && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
                      🏢 {organization}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setOrganization("");
                        setOrganizationId("");
                        setOrgSearch("");
                      }}
                      className="rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-400"
                    >
                      Цэвэрлэх
                    </button>
                  </div>
                )}
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
                  <DateField value={startedAt} onChange={setStartedAt} />
                </div>
                <div>
                  <Label>Дуусах огноо</Label>
                  <DateField value={expiresAt} onChange={handleExpiresChange} />
                </div>
              </div>
              <div className="mt-3">
                <Label>Төлөв</Label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: "active", label: "Идэвхтэй" },
                    { key: "inactive", label: "Идэвхгүй" },
                  ] as const).map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      disabled
                      className={`rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                        membershipStatus === s.key
                          ? s.key === "active"
                            ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
                            : "border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
                          : "border-gray-200 text-gray-600 dark:border-gray-700 dark:text-gray-300 opacity-70"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-[11px] text-gray-400">Төлөв нь эхлэх/дуусах огнооноос автоматаар тооцогдоно.</p>
              </div>
              {expiresAt && !startedAt && (
                <p className="mt-1.5 text-[11px] text-gray-400">Эхлэх огноог дуусах огнооноос нэг жилийн өмнө автоматаар тооцоолно.</p>
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
            <SubmitLabel
              loading={loading}
              loadingText="Мэдээлэл хадгалж байна..."
              idleText={isCreate ? "Хэрэглэгч бүртгэх" : "Өөрчлөлтийг хадгалах"}
            />
          </button>
        </div>
      </div>
      <OrgFormModal
        isOpen={quickCreateOrgOpen}
        onClose={() => setQuickCreateOrgOpen(false)}
        org={null}
        onSuccess={(savedOrg) => {
          setQuickCreateOrgOpen(false);
          onOrganizationsRefresh?.();
          if (savedOrg?.id && savedOrg?.name) {
            setOrganization(savedOrg.name);
            setOrganizationId(savedOrg.id);
            setOrgSearch("");
            setOrgOpen(false);
          }
        }}
      />
    </Modal>
  );
}
