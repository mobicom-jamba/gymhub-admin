"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";

type Member = {
  id: string;
  full_name: string | null;
  phone: string | null;
  membership_tier: string | null;
  membership_status: string | null;
  membership_expires_at: string | null;
  organization: string | null;
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

function initials(name: string | null) {
  if (!name) return "?";
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

function isExpired(exp: string | null) {
  return exp ? new Date(exp) < new Date() : false;
}

export default function OrganizationsSection() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [renameLoading, setRenameLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addOrgTarget, setAddOrgTarget] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [removeLoading, setRemoveLoading] = useState<string | null>(null);

  const supabase = createBrowserSupabaseClient();

  const fetchMembers = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, phone, membership_tier, membership_status, membership_expires_at, organization")
      .order("full_name", { ascending: true });
    setMembers((data ?? []) as Member[]);
    setLoading(false);
  };

  useEffect(() => { fetchMembers(); }, []);

  const orgs: OrgGroup[] = useMemo(() => {
    const map: Record<string, Member[]> = {};
    members.forEach(m => {
      const key = m.organization?.trim() || "";
      if (!key) return;
      if (!map[key]) map[key] = [];
      map[key].push(m);
    });
    return Object.entries(map)
      .map(([name, mems]) => ({
        name,
        members: mems,
        premiumCount: mems.filter(m => m.membership_tier === "premium").length,
        earlyCount: mems.filter(m => m.membership_tier === "early").length,
      }))
      .sort((a, b) => b.members.length - a.members.length);
  }, [members]);

  const unassigned = useMemo(() => members.filter(m => !m.organization?.trim()), [members]);

  const filteredOrgs = useMemo(() =>
    orgs.filter(o => o.name.toLowerCase().includes(search.toLowerCase())),
    [orgs, search]
  );

  const selectedOrg = selected ? orgs.find(o => o.name === selected) ?? null : null;

  // Unassigned users not already in selected org
  const addCandidates = useMemo(() => {
    if (!addOrgTarget) return [];
    const inOrg = new Set((orgs.find(o => o.name === addOrgTarget)?.members ?? []).map(m => m.id));
    return members.filter(m =>
      !inOrg.has(m.id) &&
      (m.full_name?.toLowerCase().includes(addSearch.toLowerCase()) ||
       m.phone?.includes(addSearch))
    ).slice(0, 30);
  }, [members, addOrgTarget, addSearch, orgs]);

  const handleRename = async (oldName: string) => {
    if (!renameVal.trim() || renameVal === oldName) { setRenaming(null); return; }
    setRenameLoading(true);
    await supabase.from("profiles").update({ organization: renameVal.trim() }).eq("organization", oldName);
    setRenameLoading(false);
    setRenaming(null);
    if (selected === oldName) setSelected(renameVal.trim());
    await fetchMembers();
  };

  const handleRemove = async (memberId: string) => {
    setRemoveLoading(memberId);
    await supabase.from("profiles").update({ organization: null }).eq("id", memberId);
    setRemoveLoading(null);
    await fetchMembers();
  };

  const handleAdd = async (memberId: string, orgName: string) => {
    await supabase.from("profiles").update({ organization: orgName }).eq("id", memberId);
    await fetchMembers();
  };

  const handleCreate = async () => {
    if (!newOrgName.trim()) return;
    setSelected(newOrgName.trim());
    setNewOrgName("");
    setCreating(false);
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
      <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/[0.08] dark:bg-gray-900">
        {/* Header */}
        <div className="border-b border-gray-100 p-4 dark:border-white/[0.06]">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-800 dark:text-white">Байгууллагууд</h2>
              <p className="text-xs text-gray-400">{orgs.length} байгууллага · {members.length} гишүүн</p>
            </div>
            <button
              onClick={() => setCreating(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition-colors"
              title="Байгууллага нэмэх"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          {/* New org input */}
          {creating && (
            <div className="mb-2 flex gap-2">
              <input
                autoFocus
                type="text"
                value={newOrgName}
                onChange={e => setNewOrgName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                placeholder="Байгууллагын нэр..."
                className="h-9 flex-1 rounded-lg border border-brand-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-brand-700 dark:bg-gray-800 dark:text-white"
              />
              <button onClick={handleCreate} className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600">Нэмэх</button>
              <button onClick={() => setCreating(false)} className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">✕</button>
            </div>
          )}

          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Хайх..."
            className="h-9 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
          />
        </div>

        {/* Org list */}
        <div className="flex-1 overflow-y-auto">
          {filteredOrgs.map((org, i) => {
            const color = avatarColors[i % avatarColors.length];
            const isActive = selected === org.name;
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
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-bold text-white ${color}`}>
                    {org.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-sm font-medium ${isActive ? "text-brand-700 dark:text-brand-400" : "text-gray-800 dark:text-white"}`}>
                      {org.name}
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
          <UnassignedPanel members={unassigned} orgs={orgs.map(o => o.name)} onAssign={async (memberId, orgName) => { await handleAdd(memberId, orgName); }} avatarColors={avatarColors} />
        ) : selectedOrg ? (
          <OrgDetailPanel
            org={selectedOrg}
            renaming={renaming}
            renameVal={renameVal}
            renameLoading={renameLoading}
            removeLoading={removeLoading}
            addOpen={addOpen && addOrgTarget === selectedOrg.name}
            addSearch={addSearch}
            addCandidates={addCandidates}
            onStartRename={() => { setRenaming(selectedOrg.name); setRenameVal(selectedOrg.name); }}
            onRenameChange={setRenameVal}
            onRenameSubmit={() => handleRename(selectedOrg.name)}
            onRenameCancel={() => setRenaming(null)}
            onRemove={handleRemove}
            onOpenAdd={() => { setAddOrgTarget(selectedOrg.name); setAddOpen(true); setAddSearch(""); }}
            onCloseAdd={() => { setAddOpen(false); setAddSearch(""); }}
            onAddSearchChange={setAddSearch}
            onAddMember={(id) => handleAdd(id, selectedOrg.name)}
            avatarColors={avatarColors}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ── Org Detail Panel ── */
function OrgDetailPanel({
  org, renaming, renameVal, renameLoading, removeLoading,
  addOpen, addSearch, addCandidates,
  onStartRename, onRenameChange, onRenameSubmit, onRenameCancel,
  onRemove, onOpenAdd, onCloseAdd, onAddSearchChange, onAddMember, avatarColors,
}: {
  org: OrgGroup;
  renaming: string | null; renameVal: string; renameLoading: boolean;
  removeLoading: string | null;
  addOpen: boolean; addSearch: string; addCandidates: Member[];
  onStartRename: () => void; onRenameChange: (v: string) => void;
  onRenameSubmit: () => void; onRenameCancel: () => void;
  onRemove: (id: string) => void;
  onOpenAdd: () => void; onCloseAdd: () => void;
  onAddSearchChange: (v: string) => void;
  onAddMember: (id: string) => void;
  avatarColors: string[];
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Org header */}
      <div className="border-b border-gray-100 p-5 dark:border-white/[0.06]">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            {renaming === org.name ? (
              <div className="flex items-center gap-2">
                <input
                  autoFocus
                  value={renameVal}
                  onChange={e => onRenameChange(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") onRenameSubmit(); if (e.key === "Escape") onRenameCancel(); }}
                  className="h-9 flex-1 rounded-lg border border-brand-400 bg-white px-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:bg-gray-800 dark:text-white"
                />
                <button onClick={onRenameSubmit} disabled={renameLoading}
                  className="h-9 rounded-lg bg-brand-500 px-3 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50">
                  {renameLoading ? "..." : "Хадгалах"}
                </button>
                <button onClick={onRenameCancel}
                  className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-500 hover:bg-gray-50 dark:border-gray-700">
                  Болих
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white truncate">{org.name}</h2>
                <button onClick={onStartRename}
                  className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-white/[0.06]"
                  title="Нэр өөрчлөх">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                  </svg>
                </button>
              </div>
            )}
            <div className="mt-1.5 flex items-center gap-3">
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
          <button
            onClick={onOpenAdd}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Гишүүн нэмэх
          </button>
        </div>

        {/* Add member search */}
        {addOpen && (
          <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/60 p-3 dark:border-brand-800 dark:bg-brand-900/10">
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
                      <div className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold text-white ${avatarColors[i % avatarColors.length]}`}>
                        {initials(m.full_name)}
                      </div>
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

      {/* Member list */}
      <div className="flex-1 overflow-y-auto">
        {org.members.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-gray-400">Гишүүн байхгүй</div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/60">
              <tr>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Гишүүн</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Утас</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Тариф</th>
                <th className="px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">Дуусах</th>
                <th className="px-4 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-400"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-white/[0.04]">
              {org.members.map((m, i) => {
                const expired = isExpired(m.membership_expires_at);
                return (
                  <tr key={m.id} className="group transition hover:bg-gray-50/60 dark:hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColors[i % avatarColors.length]}`}>
                          {initials(m.full_name)}
                        </div>
                        <span className="text-sm font-medium text-gray-800 dark:text-white whitespace-nowrap">{m.full_name ?? "—"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-xs text-gray-600 dark:bg-white/[0.06] dark:text-gray-300">
                        {m.phone ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {m.membership_tier === "premium" ? (
                        <span className="rounded-full bg-violet-50 px-2.5 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-900/20 dark:text-violet-400">Premium</span>
                      ) : m.membership_tier === "early" ? (
                        <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">Early</span>
                      ) : <span className="text-gray-400 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {m.membership_expires_at ? (
                        <span className={`text-xs ${expired ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
                          {new Date(m.membership_expires_at).toLocaleDateString("mn-MN")}
                        </span>
                      ) : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onRemove(m.id)}
                        disabled={removeLoading === m.id}
                        className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-400 opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
                      >
                        {removeLoading === m.id ? "..." : "Хасах"}
                      </button>
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
function UnassignedPanel({ members, orgs, onAssign, avatarColors }: {
  members: Member[]; orgs: string[];
  onAssign: (memberId: string, orgName: string) => Promise<void>;
  avatarColors: string[];
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
        {filtered.map((m, i) => (
          <div key={m.id} className="flex items-center gap-3 border-b border-gray-50 px-4 py-3 dark:border-white/[0.04]">
            <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${avatarColors[i % avatarColors.length]}`}>
              {initials(m.full_name)}
            </div>
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
                <option value="" disabled>Байгууллага сонгох...</option>
                {orgs.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <button
                onClick={() => setAssigningId(m.id)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700 dark:border-gray-700 dark:text-gray-400"
              >
                Оноох
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
