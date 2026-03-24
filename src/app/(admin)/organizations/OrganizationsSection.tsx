"use client";

import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import OrgFormModal, { type OrgRecord } from "./OrgFormModal";
import UserFormModal from "../users/UserFormModal";
import type { Profile } from "../users/UsersSection";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import ColumnToggle from "@/components/ui/ColumnToggle";
import EmptyState from "@/components/ui/EmptyState";
import { useLocalStorageState } from "@/hooks/useLocalStorageState";
import { getUserPlaceholderAvatar } from "@/lib/user-avatar";

type Member = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  membership_tier: string | null;
  membership_status: string | null;
  membership_started_at: string | null;
  membership_expires_at: string | null;
  organization_id: string | null;
  organization: string | null;
  organizations?: { id: string; name: string | null } | Array<{ id: string; name: string | null }> | null;
  created_at: string;
};

type OrgGroup = {
  name: string;
  members: Member[];
  premiumCount: number;
  earlyCount: number;
};

const avatarColors = [
  "bg-violet-500","bg-blue-500","bg-emerald-500","bg-orange-500",
  "bg-pink-500","bg-cyan-500","bg-fuchsia-500","bg-rose-500","bg-teal-500","bg-amber-500",
];

function isExpired(exp: string | null) {
  return exp ? new Date(exp) < new Date() : false;
}

function orgNameOf(member: Member): string | null {
  const rel = member.organizations;
  if (Array.isArray(rel)) return rel[0]?.name ?? member.organization;
  return rel?.name ?? member.organization;
}

/** Lowercase, trim, collapse spaces; strip combining marks for forgiving match. */
function normalizeSearchText(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/\s+/g, " ");
}

function searchTokens(query: string): string[] {
  return normalizeSearchText(query)
    .split(/\s+/)
    .filter(Boolean);
}

function buildOrgHaystack(name: string, rec: OrgRecord | undefined): string {
  const parts: string[] = [name];
  if (rec?.phone) {
    parts.push(rec.phone);
    parts.push(rec.phone.replace(/\D/g, ""));
  }
  if (rec?.description) parts.push(rec.description);
  if (rec?.partner_url) parts.push(rec.partner_url);
  if (rec?.website_url) parts.push(rec.website_url);
  if (rec?.facebook_url) parts.push(rec.facebook_url);
  return normalizeSearchText(parts.filter(Boolean).join(" "));
}

function haystackMatchesTokens(haystack: string, tokens: string[]): boolean {
  if (tokens.length === 0) return true;
  return tokens.every((t) => haystack.includes(t));
}

/** Higher score = better match (prefix / word-start hits). */
function orgSearchRank(nameNorm: string, haystack: string, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  let score = 0;
  const words = nameNorm.split(/\s+/).filter(Boolean);
  for (const t of tokens) {
    if (nameNorm.startsWith(t)) score += 120;
    else if (nameNorm.includes(t)) score += 80;
    if (words.some((w) => w.startsWith(t))) score += 40;
    if (haystack.includes(t) && !nameNorm.includes(t)) score += 15;
  }
  return score;
}

function highlightOrgName(name: string, query: string): React.ReactNode {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return name;
  const lower = name.toLowerCase();
  let bestIdx = -1;
  let bestLen = 0;
  for (const t of tokens) {
    const idx = lower.indexOf(t);
    if (idx >= 0 && (bestIdx < 0 || idx < bestIdx)) {
      bestIdx = idx;
      bestLen = t.length;
    }
  }
  if (bestIdx < 0 || bestLen === 0) return name;
  return (
    <>
      {name.slice(0, bestIdx)}
      <mark className="rounded bg-amber-200/90 px-0.5 font-medium text-gray-900 dark:bg-amber-500/35 dark:text-white">
        {name.slice(bestIdx, bestIdx + bestLen)}
      </mark>
      {name.slice(bestIdx + bestLen)}
    </>
  );
}

export default function OrganizationsSection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [orgRecords, setOrgRecords] = useState<OrgRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addOrgTarget, setAddOrgTarget] = useState<string | null>(null);
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);
  const [formOrg, setFormOrg] = useState<OrgRecord | "new" | null>(null);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<{ memberId: string; name: string } | null>(null);
  const [confirmDeleteOrg, setConfirmDeleteOrg] = useState<{ orgName: string; recordId: string | null } | null>(null);
  const toast = useToast();
  const orgSearchInputRef = useRef<HTMLInputElement>(null);

  const MEMBER_SELECT = "id, full_name, phone, role, membership_tier, membership_status, membership_started_at, membership_expires_at, organization_id, organization, organizations(id,name), created_at";

  const fetchAllMemberPages = useCallback(async (): Promise<Member[]> => {
    const supabase = createBrowserSupabaseClient();
    const all: Member[] = [];
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("profiles")
        .select(MEMBER_SELECT)
        .order("full_name", { ascending: true })
        .range(from, from + PAGE - 1);
      all.push(...((data ?? []) as Member[]));
      if (!data || data.length < PAGE) break;
      from += PAGE;
    }
    return all;
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const supabase = createBrowserSupabaseClient();
    const [allMembers, orgsRes] = await Promise.all([
      fetchAllMemberPages(),
      supabase.from("organizations").select("*").order("name", { ascending: true }),
    ]);
    setMembers(allMembers);
    setOrgRecords((orgsRes.data ?? []) as OrgRecord[]);
    setLoading(false);
  }, [fetchAllMemberPages]);

  const silentRefresh = useCallback(async () => {
    const supabase = createBrowserSupabaseClient();
    const [allMembers, orgsRes] = await Promise.all([
      fetchAllMemberPages(),
      supabase.from("organizations").select("*").order("name", { ascending: true }),
    ]);
    setMembers(allMembers);
    if (orgsRes.data) setOrgRecords(orgsRes.data as OrgRecord[]);
  }, [fetchAllMemberPages]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const orgs: OrgGroup[] = useMemo(() => {
    const map: Record<string, Member[]> = {};
    members.forEach(m => {
      const key = orgNameOf(m)?.trim() || "";
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    // Canonical rows from `organizations` with zero members must still appear in the list.
    for (const rec of orgRecords) {
      const name = rec.name?.trim() || "";
      if (!name) continue;
      if (!map[name]) map[name] = [];
    }
    return Object.entries(map)
      .map(([name, mems]) => ({
        name,
        members: mems,
        premiumCount: mems.filter(m => m.membership_tier === "premium").length,
        earlyCount: mems.filter(m => m.membership_tier === "early").length,
      }))
      .sort((a, b) => {
        if (b.members.length !== a.members.length) return b.members.length - a.members.length;
        return a.name.localeCompare(b.name, "mn");
      });
  }, [members, orgRecords]);

  const unassigned = useMemo(
    () => members.filter((m) => !m.organization_id && !(m.organization?.trim())),
    [members]
  );

  const filteredOrgs = useMemo(() => {
    const tokens = searchTokens(search);
    if (tokens.length === 0) return orgs;

    const scored = orgs
      .map((o) => {
        const rec = orgRecords.find((r) => r.name === o.name);
        const nameNorm = normalizeSearchText(o.name);
        const haystack = buildOrgHaystack(o.name, rec);
        if (!haystackMatchesTokens(haystack, tokens)) return null;
        const score = orgSearchRank(nameNorm, haystack, tokens);
        return { org: o, score };
      })
      .filter((x): x is { org: OrgGroup; score: number } => x !== null);

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.org.members.length !== a.org.members.length) {
        return b.org.members.length - a.org.members.length;
      }
      return a.org.name.localeCompare(b.org.name, "mn");
    });
    return scored.map((s) => s.org);
  }, [orgs, orgRecords, search]);

  const selectedOrg = selected ? orgs.find(o => o.name === selected) ?? null : null;
  const selectedRecord = selected ? orgRecords.find(r => r.name === selected) ?? null : null;

  const addCandidates = useMemo(() => {
    if (!addOrgTarget) return [];
    const inOrg = new Set((orgs.find(o => o.name === addOrgTarget)?.members ?? []).map(m => m.id));
    return members.filter(m =>
      !inOrg.has(m.id) &&
      (m.full_name?.toLowerCase().includes(addSearch.toLowerCase()) ||
       m.phone?.includes(addSearch))
    ).slice(0, 30);
  }, [members, addOrgTarget, addSearch, orgs]);

  const handleRemove = (memberId: string) => {
    const name = members.find(m => m.id === memberId)?.full_name ?? "";
    setConfirmRemove({ memberId, name });
  };

  const handleRemoveConfirmed = async () => {
    if (!confirmRemove) return;
    const { memberId } = confirmRemove;
    setConfirmRemove(null);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, organization: null, organization_id: null, organizations: null } : m));
    toast.show("Гишүүний байгууллагын холбоос амжилттай цуцлагдлаа.");
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("profiles").update({ organization: null, organization_id: null }).eq("id", memberId);
    if (error) silentRefresh();
  };

  const handleAdd = async (memberId: string, orgName: string) => {
    const orgRecord = orgRecords.find((o) => o.name === orgName);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, organization: orgName, organization_id: orgRecord?.id ?? null } : m));
    toast.show("Гишүүн байгууллагад амжилттай холбогдлоо.");
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.from("profiles").update({ organization: orgName, organization_id: orgRecord?.id ?? null }).eq("id", memberId);
    if (error) silentRefresh();
  };

  const handleDeleteOrg = (orgName: string, recordId: string | null) => {
    setConfirmDeleteOrg({ orgName, recordId });
  };

  const handleDeleteOrgConfirmed = async () => {
    if (!confirmDeleteOrg) return;
    const { orgName, recordId } = confirmDeleteOrg;
    setConfirmDeleteOrg(null);
    setSelected(null);
    setOrgRecords(prev => recordId ? prev.filter(r => r.id !== recordId) : prev);
    setMembers(prev => prev.map(m => orgNameOf(m) === orgName ? { ...m, organization: null, organization_id: null, organizations: null } : m));
    toast.show("Байгууллагын мэдээлэл амжилттай устгагдлаа.");
    const supabase = createBrowserSupabaseClient();
    if (recordId) await supabase.from("organizations").delete().eq("id", recordId);
    if (recordId) {
      await supabase.from("profiles").update({ organization: null, organization_id: null }).eq("organization_id", recordId);
    } else {
      await supabase.from("profiles").update({ organization: null, organization_id: null }).eq("organization", orgName);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-120px)] gap-4 overflow-hidden">

      {/* ── Left panel: org list ── */}
      <div className="flex w-[22rem] shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
        {/* Header */}
        <div className="border-b border-gray-100 p-4 dark:border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Байгууллагууд</h2>
              <p className="text-xs text-gray-400">{orgs.length} байгууллага · {members.length} гишүүн</p>
            </div>
            <button
              onClick={() => setFormOrg("new")}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
              title="Байгууллага нэмэх"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <label htmlFor="org-list-search" className="sr-only">
            Байгууллага хайх — нэр, олон үг, утас
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </span>
            <input
              id="org-list-search"
              ref={orgSearchInputRef}
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              spellCheck={false}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearch("");
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder="Нэр, олон үг, утас…"
              className="h-10 w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-9 text-sm placeholder:text-gray-400 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500"
            />
            {search.trim() !== "" && (
              <button
                type="button"
                title="Цэвэрлэх"
                aria-label="Хайлт цэвэрлэх"
                onClick={() => {
                  setSearch("");
                  orgSearchInputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-200/80 hover:text-gray-600 dark:hover:bg-white/10 dark:hover:text-gray-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <p className="mt-1.5 text-[11px] leading-snug text-gray-400">
            {search.trim() === ""
              ? "Олон үгээр зэрэгцүүлэн хайна. Жишээ: MEA Munkhada"
              : `Олдсон: ${filteredOrgs.length} · Нийт ${orgs.length}`}
          </p>
        </div>

        {/* Org list */}
        <div className="flex-1 overflow-y-auto">
          {filteredOrgs.length === 0 && search.trim() !== "" && (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Тохирох байгууллага олдсонгүй</p>
              <p className="mt-1 text-xs text-gray-400">Өөр үгээр оролдоно уу эсвэл хайлт цэвэрлэнэ үү.</p>
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
              >
                Хайлт арилгах
              </button>
            </div>
          )}
          {filteredOrgs.map((org) => {
            let hash = 0;
            for (let i = 0; i < org.name.length; i++) {
              hash = org.name.charCodeAt(i) + ((hash << 5) - hash);
            }
            const color = avatarColors[Math.abs(hash) % avatarColors.length];
            const isActive = selected === org.name;
            const rec = orgRecords.find(r => r.name === org.name);
            return (
              <button
                key={org.name}
                onClick={() => setSelected(isActive ? null : org.name)}
                className={`w-full border-b border-gray-50 px-4 py-3 text-left transition-colors dark:border-white/[0.04] ${
                  isActive
                    ? "bg-brand-50 dark:bg-brand-900/20"
                    : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
                }`}
              >
                <div className="flex items-center gap-3">
                  {rec?.logo_url ? (
                    <img src={rec.logo_url} alt={org.name} className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white ${color}`}>
                      {org.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${isActive ? "text-brand-700 dark:text-brand-400" : "text-gray-800 dark:text-white"}`}>
                      {highlightOrgName(org.name, search)}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{org.members.length} гишүүн</span>
                      {org.premiumCount > 0 && (
                        <span className="rounded-full bg-violet-100 px-1.5 py-0 text-[10px] font-semibold text-violet-700 dark:bg-violet-900/20 dark:text-violet-400">
                          {org.premiumCount}P
                        </span>
                      )}
                      {org.earlyCount > 0 && (
                        <span className="rounded-full bg-blue-100 px-1.5 py-0 text-[10px] font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                          {org.earlyCount}E
                        </span>
                      )}
                    </div>
                  </div>
                  <svg className={`h-4 w-4 shrink-0 transition-transform ${isActive ? "rotate-90 text-brand-500" : "text-gray-300"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            );
          })}

          {/* Unassigned */}
          {unassigned.length > 0 && (
            <button
              onClick={() => setSelected(selected === "__unassigned__" ? null : "__unassigned__")}
              className={`w-full px-4 py-3 text-left transition-colors ${
                selected === "__unassigned__" ? "bg-gray-100 dark:bg-white/[0.05]" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-200 text-xs font-bold text-gray-500 dark:bg-gray-700">
                  —
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Байгууллагагүй</p>
                  <p className="text-xs text-gray-400">{unassigned.length} гишүүн</p>
                </div>
              </div>
            </button>
          )}
        </div>
      </div>

      {/* ── Right panel: org detail ── */}
      <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
        {!selected ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-gray-400">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-gray-800">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
              </svg>
            </div>
            <p className="text-sm">Байгууллага сонгоно уу</p>
          </div>
        ) : selected === "__unassigned__" ? (
          <UnassignedPanel members={unassigned} orgs={orgs.map(o => o.name)} onAssign={async (memberId, orgName) => { await handleAdd(memberId, orgName); }} />
        ) : selectedOrg ? (
          <OrgDetailPanel
            org={selectedOrg}
            record={selectedRecord}
            removeLoading={removeLoading}
            addOpen={addOpen && addOrgTarget === selectedOrg.name}
            addSearch={addSearch}
            addCandidates={addCandidates}
            onEdit={() => setFormOrg(selectedRecord ?? { id: "", name: selectedOrg.name, logo_url: null, description: null, phone: null, facebook_url: null, website_url: null, partner_url: null, created_at: "" })}
            onDelete={() => handleDeleteOrg(selectedOrg.name, selectedRecord?.id ?? null)}
            onRemove={handleRemove}
            onEditMember={(m) => setEditProfile(m as unknown as Profile)}
            onOpenAdd={() => { setAddOrgTarget(selectedOrg.name); setAddOpen(true); setAddSearch(""); }}
            onCloseAdd={() => { setAddOpen(false); setAddSearch(""); }}
            onAddSearchChange={setAddSearch}
            onAddMember={(id) => handleAdd(id, selectedOrg.name)}
            avatarColors={avatarColors}
          />
        ) : null}
      </div>

      <OrgFormModal
        isOpen={formOrg !== null}
        onClose={() => setFormOrg(null)}
        org={formOrg === "new" ? null : formOrg}
        onSuccess={() => { setFormOrg(null); silentRefresh(); }}
      />

      <UserFormModal
        isOpen={editProfile !== null}
        onClose={() => setEditProfile(null)}
        profile={editProfile}
        organizations={orgRecords.map((r) => ({ id: r.id, name: r.name }))}
        onOrganizationsRefresh={silentRefresh}
        onSuccess={() => { setEditProfile(null); toast.show("Хэрэглэгчийн мэдээлэл амжилттай хадгалагдлаа."); silentRefresh(); }}
      />

      <ConfirmModal
        isOpen={confirmRemove !== null}
        title="Гишүүн хасах уу?"
        message={confirmRemove?.name ? `"${confirmRemove.name}"-г энэ байгууллагаас хасана.` : undefined}
        confirmLabel="Хасах"
        onConfirm={handleRemoveConfirmed}
        onCancel={() => setConfirmRemove(null)}
      />

      <ConfirmModal
        isOpen={confirmDeleteOrg !== null}
        title="Байгууллага устгах уу?"
        message={confirmDeleteOrg ? `"${confirmDeleteOrg.orgName}" байгууллагыг устгана. Гишүүдийн холбоос арилна.` : undefined}
        onConfirm={handleDeleteOrgConfirmed}
        onCancel={() => setConfirmDeleteOrg(null)}
      />
    </div>
  );
}

/* ── Org Detail Panel ── */
function OrgDetailPanel({
  org, record, removeLoading,
  addOpen, addSearch, addCandidates,
  onEdit, onDelete, onRemove, onEditMember, onOpenAdd, onCloseAdd, onAddSearchChange, onAddMember, avatarColors,
}: {
  org: OrgGroup;
  record: OrgRecord | null;
  removeLoading: string | null;
  addOpen: boolean; addSearch: string; addCandidates: Member[];
  onEdit: () => void;
  onDelete: () => void;
  onRemove: (id: string) => void;
  onEditMember: (m: Member) => void;
  onOpenAdd: () => void; onCloseAdd: () => void;
  onAddSearchChange: (v: string) => void;
  onAddMember: (id: string) => void;
  avatarColors: string[];
}) {
  const [memberSearch, setMemberSearch] = useState("");
  const [tierFilter, setTierFilter]     = useState<"" | "early" | "premium">("" );
  const [statusFilter, setStatusFilter] = useState<"" | "active" | "expired">("" );
  const [sortBy, setSortBy]             = useState<"name" | "expires_asc" | "expires_desc">("name");
  const [visibleColumns, setVisibleColumns] = useLocalStorageState<Record<string, boolean>>("organizations.members.visibleColumns", {
    member: true, phone: true, tier: true, expires: true,
  });

  const filteredMembers = useMemo(() => {
    let list = org.members;
    if (memberSearch)
      list = list.filter(m =>
        m.full_name?.toLowerCase().includes(memberSearch.toLowerCase()) ||
        m.phone?.includes(memberSearch));
    if (tierFilter)
      list = list.filter(m => m.membership_tier === tierFilter);
    if (statusFilter === "active")
      list = list.filter(m => m.membership_expires_at && new Date(m.membership_expires_at) >= new Date());
    if (statusFilter === "expired")
      list = list.filter(m => !m.membership_expires_at || new Date(m.membership_expires_at) < new Date());
    return [...list].sort((a, b) => {
      if (sortBy === "name")
        return (a.full_name ?? "").localeCompare(b.full_name ?? "");
      const da = a.membership_expires_at ? new Date(a.membership_expires_at).getTime() : Infinity;
      const db = b.membership_expires_at ? new Date(b.membership_expires_at).getTime() : Infinity;
      return sortBy === "expires_asc" ? da - db : db - da;
    });
  }, [org.members, memberSearch, tierFilter, statusFilter, sortBy]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Org header */}
      <div className="border-b border-gray-100 dark:border-white/[0.06]">
        {/* Top: logo + name + actions */}
        <div className="flex items-start gap-4 p-5">
          {/* Logo */}
          <div className="shrink-0">
            {record?.logo_url ? (
              <img src={record.logo_url} alt={org.name}
                className="h-14 w-14 rounded-2xl object-cover shadow-sm" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-lg font-bold text-white shadow-sm">
                {org.name.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold text-gray-800 dark:text-white">{org.name}</h2>
            </div>
            {record?.description && (
              <p className="mt-0.5 text-sm text-gray-400">{record.description}</p>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <span className="text-sm text-gray-500">{org.members.length} гишүүн</span>
              {org.premiumCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-semibold text-violet-700 dark:bg-violet-900/20 dark:text-violet-400">
                  Premium {org.premiumCount}
                </span>
              )}
              {org.earlyCount > 0 && (
                <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                  Early {org.earlyCount}
                </span>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button onClick={onDelete}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-600 transition-colors dark:border-gray-700 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              title="Байгууллага устгах">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </button>
            <button onClick={onEdit}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/[0.04]">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
              </svg>
              Засах
            </button>
            <button onClick={onOpenAdd}
              className="flex items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Гишүүн нэмэх
            </button>
          </div>
        </div>

        {/* Contact / social links strip */}
        {record && (record.phone || record.facebook_url || record.website_url || record.partner_url) && (
          <div className="flex flex-wrap items-center gap-4 border-t border-gray-50 px-5 py-2.5 dark:border-white/[0.04]">
            {record.phone && (
              <a href={`tel:${record.phone}`} className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                {record.phone}
              </a>
            )}
            {record.facebook_url && (
              <a href={`https://facebook.com/${record.facebook_url}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-600">
                <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                fb/{record.facebook_url}
              </a>
            )}
            {record.website_url && (
              <a href={record.website_url.startsWith("http") ? record.website_url : `https://${record.website_url}`}
                target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582" />
                </svg>
                {record.website_url}
              </a>
            )}
            {record.partner_url && (
              <a href={`https://gymhub.mn/partner/${record.partner_url}`} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-brand-600">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
                gymhub.mn/partner/{record.partner_url}
              </a>
            )}
          </div>
        )}
        {!record && (
          <div className="border-t border-gray-50 px-5 py-2.5 dark:border-white/[0.04]">
            <p className="text-xs text-gray-400">Байгууллагын мэдээлэл бүртгэгдээгүй байна — "Засах" товч дарж мэдээлэл нэмнэ үү</p>
          </div>
        )}

        {/* Add member search */}
        {addOpen && (
          <div className="mx-5 mb-4 rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-800 dark:bg-brand-900/10">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-brand-700 dark:text-brand-400">Гишүүн хайх</p>
              <button onClick={onCloseAdd} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <input
              autoFocus
              type="text"
              value={addSearch}
              onChange={e => onAddSearchChange(e.target.value)}
              placeholder="Нэр эсвэл утасны дугаар..."
              className="h-9 w-full rounded-lg border border-brand-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-brand-700 dark:bg-gray-800 dark:text-white"
            />
            {addSearch && addCandidates.length > 0 && (
              <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-100 bg-white dark:border-gray-700 dark:bg-gray-800">
                {addCandidates.map((m, i) => (
                  <li key={m.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                    <div className="flex items-center gap-2">
                      <img
                        src={getUserPlaceholderAvatar(m.id || m.full_name)}
                        alt="avatar"
                        className="h-7 w-7 rounded-full object-cover"
                      />
                      <div>
                        <p className="text-xs font-medium text-gray-800 dark:text-white">{m.full_name ?? "—"}</p>
                        <p className="text-[10px] text-gray-400">{m.phone ?? ""}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { onAddMember(m.id); onCloseAdd(); }}
                      className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-600"
                    >
                      Нэмэх
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {addSearch && addCandidates.length === 0 && (
              <p className="mt-2 text-center text-xs text-gray-400">Олдсонгүй</p>
            )}
          </div>
        )}
      </div>

      {/* Member filters */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 px-4 py-2.5 dark:border-white/[0.04]">
        <input
          type="text"
          value={memberSearch}
          onChange={e => setMemberSearch(e.target.value)}
          placeholder="Гишүүн хайх..."
          className="h-8 w-36 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />

        {/* Tier filter */}
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800/60">
          {([["", "Бүгд"], ["early", "Early"], ["premium", "Premium"]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setTierFilter(v)}
              className={`h-7 rounded-lg px-2.5 text-xs font-medium transition-all ${
                tierFilter === v
                  ? v === "premium" ? "bg-violet-500 text-white shadow-sm"
                    : v === "early" ? "bg-blue-500 text-white shadow-sm"
                    : "bg-white text-gray-700 shadow-sm dark:bg-gray-700 dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}>{label}</button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 p-1 dark:border-gray-700 dark:bg-gray-800/60">
          {([["", "Төлөв"], ["active", "Идэвх"], ["expired", "Дууссан"]] as const).map(([v, label]) => (
            <button key={v} type="button" onClick={() => setStatusFilter(v)}
              className={`h-7 rounded-lg px-2.5 text-xs font-medium transition-all ${
                statusFilter === v
                  ? v === "active" ? "bg-emerald-500 text-white shadow-sm"
                    : v === "expired" ? "bg-red-500 text-white shadow-sm"
                    : "bg-white text-gray-700 shadow-sm dark:bg-gray-700 dark:text-white"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}>{label}</button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="ml-auto h-7 rounded-lg border border-gray-200 bg-white px-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
        >
          <option value="name">Нэрээр А→Я</option>
          <option value="expires_asc">Дуусах ↑ хамгийн</option>
          <option value="expires_desc">Дуусах ↓ хоцойн</option>
        </select>
        <ColumnToggle
          options={[
            { key: "member", label: "Гишүүн" },
            { key: "phone", label: "Утас" },
            { key: "tier", label: "Тариф" },
            { key: "expires", label: "Дуусах" },
          ]}
          visible={visibleColumns}
          onChange={setVisibleColumns}
        />

        {(memberSearch || tierFilter || statusFilter) && (
          <button onClick={() => { setMemberSearch(""); setTierFilter(""); setStatusFilter(""); }}
            className="h-7 rounded-lg border border-gray-200 px-2 text-xs text-gray-400 hover:border-red-200 hover:bg-red-50 hover:text-red-500 dark:border-gray-700">
            ✕
          </button>
        )}

        <span className="ml-1 text-xs text-gray-400">{filteredMembers.length}/{org.members.length}</span>
      </div>

      {/* Member list */}
      <div className="flex-1 overflow-y-auto">
        {org.members.length === 0 ? (
          <EmptyState title="Гишүүн байхгүй" description="Энэ байгууллагад гишүүн нэмэгдээгүй байна." icon="users" />
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/60">
              <tr>
                {(visibleColumns.member ?? true) && <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Гишүүн</th>}
                {(visibleColumns.phone ?? true) && <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Утас</th>}
                {(visibleColumns.tier ?? true) && <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Тариф</th>}
                {(visibleColumns.expires ?? true) && <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Дуусах</th>}
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-400"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.04]">
              {filteredMembers.map((m, i) => {
                const days = m.membership_expires_at
                  ? Math.ceil((new Date(m.membership_expires_at).getTime() - Date.now()) / 86400000)
                  : null;
                return (
                  <tr key={m.id} className="group transition hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                    {(visibleColumns.member ?? true) && <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img
                          src={getUserPlaceholderAvatar(m.id || m.full_name)}
                          alt="avatar"
                          className="h-8 w-8 shrink-0 rounded-full object-cover"
                        />
                        <span className="text-sm font-medium text-gray-800 dark:text-white whitespace-nowrap">{m.full_name ?? "—"}</span>
                      </div>
                    </td>}
                    {(visibleColumns.phone ?? true) && <td className="px-4 py-3">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                        {m.phone ?? "—"}
                      </span>
                    </td>}
                    {(visibleColumns.tier ?? true) && <td className="px-4 py-3">
                      {m.membership_tier === "premium" ? (
                        <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-900/20 dark:text-violet-400">Premium</span>
                      ) : m.membership_tier === "early" ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">Early</span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>}
                    {(visibleColumns.expires ?? true) && <td className="px-4 py-3">
                      {m.membership_expires_at ? (
                        days !== null && days < 0
                          ? <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600 dark:bg-red-900/20 dark:text-red-400">⚠️ {new Date(m.membership_expires_at).toLocaleDateString("mn-MN")}</span>
                          : days !== null && days <= 30
                            ? <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">⏳ {days} өдөр</span>
                            : <span className="text-xs text-gray-500 dark:text-gray-400">{new Date(m.membership_expires_at).toLocaleDateString("mn-MN")}</span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => onEditMember(m)}
                          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06] dark:hover:text-gray-300"
                          title="Засах"
                        >
                          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
                        </button>
                        <button
                          onClick={() => onRemove(m.id)}
                          disabled={removeLoading === m.id}
                          className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-red-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                          title="Хасах"
                        >
                          {removeLoading === m.id
                            ? <span className="text-xs">...</span>
                            : <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ── Unassigned Panel ── */
function UnassignedPanel({ members, orgs, onAssign }: {
  members: Member[]; orgs: string[];
  onAssign: (memberId: string, orgName: string) => Promise<void>;
}) {
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filtered = members.filter(m =>
    !search || m.full_name?.toLowerCase().includes(search.toLowerCase()) || m.phone?.includes(search)
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-gray-100 p-5 dark:border-white/[0.06]">
        <h2 className="text-base font-bold text-gray-800 dark:text-white">Байгууллагагүй гишүүд</h2>
        <p className="mb-3 text-sm text-gray-400">{members.length} гишүүн байгууллага тохируулагдаагүй байна</p>
        <input
          type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Нэр эсвэл утас хайх..."
          className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:border-brand-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-white"
        />
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((m) => (
          <div key={m.id} className="flex items-center gap-3 border-b border-gray-50 px-4 py-3 dark:border-white/[0.04]">
            <img
              src={getUserPlaceholderAvatar(m.id || m.full_name)}
              alt="avatar"
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-gray-800 dark:text-white">{m.full_name ?? "—"}</p>
              <p className="text-xs text-gray-400">{m.phone ?? ""}</p>
            </div>
            {assigningId === m.id ? (
              <select
                autoFocus
                onChange={async e => { if (e.target.value) { await onAssign(m.id, e.target.value); setAssigningId(null); } }}
                onBlur={() => setAssigningId(null)}
                className="h-8 rounded-lg border border-brand-300 bg-white px-2 text-xs focus:outline-none dark:border-brand-700 dark:bg-gray-800 dark:text-white"
                defaultValue=""
              >
                <option value="" disabled>Байгууллага сонгоно уу</option>
                {orgs.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <button
                onClick={() => setAssigningId(m.id)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:text-gray-400"
              >
                Холбох
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
