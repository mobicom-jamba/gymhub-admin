"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import ComponentCard from "@/components/common/ComponentCard";
import Button from "@/components/ui/button/Button";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import {
  DEFAULT_PACKAGES,
  newBlankPackage,
  type MembershipPackage,
  type StoredMembershipTier,
} from "@/lib/membership-packages";
import { PencilIcon } from "@/icons/index";

type Settings = {
  early_membership_price_mnt: number;
  early_remainder_price_mnt: number;
  packages: MembershipPackage[];
  payment_qpay_enabled: boolean;
  payment_sono_enabled: boolean;
  payment_pocket_enabled: boolean;
  payment_carepay_enabled: boolean;
  payment_monpay_enabled: boolean;
  payment_gymfintech_enabled: boolean;
  updated_at: string;
};

const STORED_TIER_OPTIONS: { value: StoredMembershipTier; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "premium1", label: "Premium 1" },
  { value: "premium2", label: "Premium 2" },
  { value: "gymcore", label: "GymCore" },
  { value: "early", label: "Early" },
];

const inputClass =
  "w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-theme-xs dark:border-gray-700 dark:bg-gray-900 dark:text-white";

function formatMntNumber(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  return Math.floor(n).toLocaleString("mn-MN");
}

function formatMnt(n: number): string {
  return `${formatMntNumber(n)}₮`;
}

function parseMntInput(raw: string): number {
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return 0;
  const n = Number(digits);
  if (!Number.isFinite(n)) return 0;
  return Math.min(999_999_999, Math.floor(n));
}

function MoneyInput({
  value,
  onChange,
  className = inputClass,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  return (
    <input
      type="text"
      inputMode="numeric"
      className={`${className} tabular-nums text-right`}
      value={formatMntNumber(value)}
      onChange={(e) => onChange(parseMntInput(e.target.value))}
      onFocus={(e) => e.currentTarget.select()}
    />
  );
}

function tierLabel(tier: StoredMembershipTier): string {
  return STORED_TIER_OPTIONS.find((o) => o.value === tier)?.label ?? tier;
}

type PackageModalProps = {
  isOpen: boolean;
  mode: "create" | "edit";
  initial: MembershipPackage | null;
  existingIds: string[];
  onClose: () => void;
  onSave: (pkg: MembershipPackage, previousId: string | null) => void;
  onDelete?: (id: string) => void;
};

function PackageFormModal({
  isOpen,
  mode,
  initial,
  existingIds,
  onClose,
  onSave,
  onDelete,
}: PackageModalProps) {
  const [draft, setDraft] = useState<MembershipPackage>(initial ?? newBlankPackage([]));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen || !initial) return;
    setError("");
    setDraft({ ...initial });
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const patch = (p: Partial<MembershipPackage>) => setDraft((d) => ({ ...d, ...p }));

  const submit = () => {
    if (!draft.name.trim()) {
      setError("Багцын нэр оруулна уу.");
      return;
    }
    const id = draft.id.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!id) {
      setError("Багцын ID оруулна уу.");
      return;
    }
    const previousId = mode === "edit" ? initial?.id ?? null : null;
    const others = existingIds.filter((x) => x !== previousId);
    if (others.includes(id)) {
      setError("Энэ ID аль хэдийн байна.");
      return;
    }
    if (draft.months < 1 || draft.months > 60) {
      setError("Фитнес хугацаа 1–60 сар байна.");
      return;
    }
    onSave(
      {
        ...draft,
        id: draft.locked ? draft.id : id,
        name: draft.name.trim(),
        locked: draft.locked,
      },
      previousId,
    );
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-lg m-4 p-6 sm:p-8">
      <div className="pr-8">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          {mode === "create" ? "Шинэ багц" : "Багц засах"}
        </h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Үнэ, хугацаа болон харагдах тохиргоог засна.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Нэр</label>
          <input
            className={inputClass}
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">ID</label>
          <input
            className={`${inputClass} font-mono text-xs`}
            value={draft.id}
            disabled={draft.locked}
            onChange={(e) =>
              patch({ id: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, "") })
            }
            title={draft.locked ? "Системийн ID солихгүй" : "booking slug"}
          />
          {draft.locked && (
            <p className="mt-1 text-xs text-gray-400">Системийн багц — ID солихгүй</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">Үнэ (₮)</label>
          <MoneyInput value={draft.price_mnt} onChange={(n) => patch({ price_mnt: n })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Фитнес (сар)
            </label>
            <input
              type="number"
              min={1}
              max={60}
              className={inputClass}
              value={draft.months}
              onChange={(e) => patch({ months: Number(e.target.value) || 1 })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Бассейн
            </label>
            <input
              type="number"
              min={0}
              max={60}
              className={inputClass}
              value={draft.pool_months}
              onChange={(e) => patch({ pool_months: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Иога
            </label>
            <input
              type="number"
              min={0}
              max={60}
              className={inputClass}
              value={draft.yoga_months}
              onChange={(e) => patch({ yoga_months: Number(e.target.value) || 0 })}
            />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Profile tier
          </label>
          <select
            className={inputClass}
            value={draft.stored_tier}
            onChange={(e) => patch({ stored_tier: e.target.value as StoredMembershipTier })}
          >
            {STORED_TIER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={draft.enabled}
              onChange={(e) => patch({ enabled: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            Идэвхтэй
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={draft.featured}
              onChange={(e) => patch({ featured: e.target.checked })}
              className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
            />
            Онцлох
          </label>
        </div>

        {error && <p className="text-sm text-error-500">{error}</p>}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div>
            {mode === "edit" && !draft.locked && onDelete && (
              <button
                type="button"
                onClick={() => {
                  onDelete(draft.id);
                  onClose();
                }}
                className="text-sm font-medium text-error-500 hover:underline"
              >
                Устгах
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Болих
            </Button>
            <Button size="sm" onClick={submit}>
              Хадгалах
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function PaymentAppSettingsSection() {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<MembershipPackage[]>(DEFAULT_PACKAGES);
  const [earlyLegacy, setEarlyLegacy] = useState(480_000);
  const [earlyRest, setEarlyRest] = useState(330_000);
  const [qpay, setQpay] = useState(true);
  const [sono, setSono] = useState(true);
  const [pocket, setPocket] = useState(true);
  const [carepay, setCarepay] = useState(true);
  const [monpay, setMonpay] = useState(true);
  const [gymfintech, setGymfintech] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("edit");
  const [editingPackage, setEditingPackage] = useState<MembershipPackage | null>(null);
  const [earlyModalOpen, setEarlyModalOpen] = useState(false);
  const [earlyDraftLegacy, setEarlyDraftLegacy] = useState(480_000);
  const [earlyDraftRest, setEarlyDraftRest] = useState(330_000);

  const getAuthHeaders = useCallback(async (extra: Record<string, string> = {}): Promise<Record<string, string>> => {
    const supabase = createBrowserSupabaseClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const auth: Record<string, string> = session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
    return { ...extra, ...auth };
  }, []);

  const applySettings = (s: Settings) => {
    setPackages(Array.isArray(s.packages) && s.packages.length ? s.packages : DEFAULT_PACKAGES);
    setEarlyLegacy(s.early_membership_price_mnt);
    setEarlyRest(s.early_remainder_price_mnt);
    setQpay(s.payment_qpay_enabled);
    setSono(s.payment_sono_enabled);
    setPocket(s.payment_pocket_enabled);
    setCarepay(s.payment_carepay_enabled);
    setMonpay(s.payment_monpay_enabled);
    setGymfintech(s.payment_gymfintech_enabled);
    setUpdatedAt(s.updated_at);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/admin/payment-settings", { headers });
      const data = await res.json();
      if (!data.ok || !data.settings) {
        throw new Error(data.error || "Ачаалахад алдаа");
      }
      applySettings(data.settings as Settings);
    } catch (e) {
      console.error(e);
      toastRef.current.show(
        e instanceof Error ? e.message : "Тохиргоо ачаалахад алдаа гарлаа",
        "error"
      );
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    const blank = newBlankPackage(packages);
    setEditingPackage(blank);
    setModalMode("create");
    setModalOpen(true);
  };

  const openEdit = (pkg: MembershipPackage) => {
    setEditingPackage({ ...pkg });
    setModalMode("edit");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPackage(null);
  };

  const openEarlyEdit = () => {
    setEarlyDraftLegacy(earlyLegacy);
    setEarlyDraftRest(earlyRest);
    setEarlyModalOpen(true);
  };

  const saveEarlyDraft = () => {
    setEarlyLegacy(earlyDraftLegacy);
    setEarlyRest(earlyDraftRest);
    setEarlyModalOpen(false);
  };

  const handleModalSave = (pkg: MembershipPackage, previousId: string | null) => {
    setPackages((prev) => {
      if (modalMode === "create" || previousId === null) {
        if (prev.some((p) => p.id === pkg.id)) {
          toastRef.current.show("Багцын ID давхцаж байна.", "error");
          return prev;
        }
        return [...prev, pkg];
      }
      return prev.map((p) => {
        if (p.id !== previousId) return p;
        if (p.locked) {
          return { ...pkg, id: p.id, locked: true };
        }
        return pkg;
      });
    });
  };

  const removePackage = (id: string) => {
    setPackages((prev) => {
      const target = prev.find((p) => p.id === id);
      if (!target || target.locked) {
        toastRef.current.show("Системийн багцыг устгах боломжгүй.", "error");
        return prev;
      }
      return prev.filter((p) => p.id !== id);
    });
  };

  const save = async () => {
    for (const p of packages) {
      if (!p.name.trim()) {
        toast.show("Багцын нэр хоосон байж болохгүй.", "error");
        return;
      }
      if (!p.id.trim()) {
        toast.show("Багцын ID хоосон байж болохгүй.", "error");
        return;
      }
    }
    const ids = packages.map((p) => p.id);
    if (new Set(ids).size !== ids.length) {
      toast.show("Багцын ID давхцаж байна.", "error");
      return;
    }

    setSaving(true);
    try {
      const headers = await getAuthHeaders({ "Content-Type": "application/json" });
      const res = await fetch("/api/admin/payment-settings", {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          packages,
          early_membership_price_mnt: earlyLegacy,
          early_remainder_price_mnt: earlyRest,
          payment_qpay_enabled: qpay,
          payment_sono_enabled: sono,
          payment_pocket_enabled: pocket,
          payment_carepay_enabled: carepay,
          payment_monpay_enabled: monpay,
          payment_gymfintech_enabled: gymfintech,
        }),
      });
      const data = await res.json();
      if (!data.ok) {
        throw new Error(data.error || "Хадгалахад алдаа");
      }
      if (data.settings) applySettings(data.settings as Settings);
      else setUpdatedAt(new Date().toISOString());
      toast.show("Төлбөрийн тохиргоо хадгалагдлаа.");
    } catch (e) {
      console.error(e);
      toast.show(e instanceof Error ? e.message : "Хадгалахад алдаа гарлаа", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-5 dark:border-gray-800 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-medium text-gray-800 dark:text-white/90">
              Гишүүнчлэлийн багц
            </h3>
            <p className="mt-0.5 text-xs text-gray-400 dark:text-gray-500">
              Үнэ · хугацаа · төлбөрийн хуудсанд харагдах
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Жагсаалтаас засах товч дарж засварлана. Системийн 4 багцыг устгахгүй.
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            <Button variant="outline" size="sm" onClick={openCreate} disabled={loading || saving}>
              Шинэ багц
            </Button>
            <Button size="sm" onClick={save} disabled={loading || saving}>
              {saving ? "Хадгалж байна…" : "Хадгалах"}
            </Button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Ачаалж байна…</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="border-b border-gray-100 dark:border-gray-800">
                  <TableRow>
                    <TableCell isHeader className="px-3 py-3 text-left text-xs font-medium text-gray-500">
                      Нэр
                    </TableCell>
                    <TableCell isHeader className="px-3 py-3 text-left text-xs font-medium text-gray-500">
                      ID
                    </TableCell>
                    <TableCell isHeader className="px-3 py-3 text-right text-xs font-medium text-gray-500">
                      Үнэ
                    </TableCell>
                    <TableCell isHeader className="px-3 py-3 text-center text-xs font-medium text-gray-500">
                      Фитнес
                    </TableCell>
                    <TableCell isHeader className="px-3 py-3 text-center text-xs font-medium text-gray-500">
                      Бассейн
                    </TableCell>
                    <TableCell isHeader className="px-3 py-3 text-center text-xs font-medium text-gray-500">
                      Иога
                    </TableCell>
                    <TableCell isHeader className="px-3 py-3 text-left text-xs font-medium text-gray-500">
                      Tier
                    </TableCell>
                    <TableCell isHeader className="px-3 py-3 text-center text-xs font-medium text-gray-500">
                      Төлөв
                    </TableCell>
                    <TableCell isHeader className="px-3 py-3 text-right text-xs font-medium text-gray-500">
                      &nbsp;
                    </TableCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {packages.map((pkg) => (
                    <TableRow key={pkg.id} className="border-b border-gray-50 dark:border-gray-800/60">
                      <TableCell className="px-3 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                        {pkg.name}
                        {pkg.featured && (
                          <span className="ml-2 rounded-full bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
                            онцлох
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3 font-mono text-xs text-gray-500">
                        {pkg.id}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">
                        {formatMnt(pkg.price_mnt)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                        {pkg.months} сар
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                        {pkg.pool_months > 0 ? `${pkg.pool_months} сар` : "—"}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                        {pkg.yoga_months > 0 ? `${pkg.yoga_months} сар` : "—"}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
                        {tierLabel(pkg.stored_tier)}
                      </TableCell>
                      <TableCell className="px-3 py-3 text-center">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={pkg.enabled}
                          aria-label={pkg.enabled ? "Идэвхгүй болгох" : "Идэвхтэй болгох"}
                          onClick={() =>
                            setPackages((prev) =>
                              prev.map((p) =>
                                p.id === pkg.id ? { ...p, enabled: !p.enabled } : p,
                              ),
                            )
                          }
                          className={[
                            "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                            pkg.enabled ? "bg-brand-500" : "bg-gray-200 dark:bg-gray-700",
                          ].join(" ")}
                        >
                          <span
                            className={[
                              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                              pkg.enabled ? "translate-x-6" : "translate-x-1",
                            ].join(" ")}
                          />
                        </button>
                      </TableCell>
                      <TableCell className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(pkg)}
                          title="Засах"
                          aria-label={`${pkg.name} засах`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}

                  <TableRow className="border-b border-gray-50 bg-gray-50/50 dark:border-gray-800/60 dark:bg-white/[0.02]">
                    <TableCell className="px-3 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      Legacy Early нэг дор
                      <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                        leftover нэхэмжлэл
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-3 font-mono text-xs text-gray-500">
                      early
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">
                      {formatMnt(earlyLegacy)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                      —
                    </TableCell>
                    <TableCell className="px-3 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                      —
                    </TableCell>
                    <TableCell className="px-3 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                      —
                    </TableCell>
                    <TableCell className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
                      Early
                    </TableCell>
                    <TableCell className="px-3 py-3 text-center">
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                        Legacy
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={openEarlyEdit}
                        title="Засах"
                        aria-label="Early үнэ засах"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>

                  <TableRow className="border-b border-gray-50 bg-gray-50/50 dark:border-gray-800/60 dark:bg-white/[0.02]">
                    <TableCell className="px-3 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      Үлдсэн 11 сар
                      <span className="mt-0.5 block text-[11px] font-normal text-gray-400">
                        эхний сараа төлсөн
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-3 font-mono text-xs text-gray-500">
                      early_rest
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right text-sm tabular-nums text-gray-800 dark:text-white/90">
                      {formatMnt(earlyRest)}
                    </TableCell>
                    <TableCell className="px-3 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                      11 сар
                    </TableCell>
                    <TableCell className="px-3 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                      —
                    </TableCell>
                    <TableCell className="px-3 py-3 text-center text-sm text-gray-600 dark:text-gray-300">
                      —
                    </TableCell>
                    <TableCell className="px-3 py-3 text-sm text-gray-600 dark:text-gray-300">
                      Early
                    </TableCell>
                    <TableCell className="px-3 py-3 text-center">
                      <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                        Legacy
                      </span>
                    </TableCell>
                    <TableCell className="px-3 py-3 text-right">
                      <button
                        type="button"
                        onClick={openEarlyEdit}
                        title="Засах"
                        aria-label="Early үлдэгдэл үнэ засах"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}

          {updatedAt && (
            <p className="mt-4 text-xs text-gray-400">
              Сүүлд шинэчилсэн: {new Date(updatedAt).toLocaleString("mn-MN", { hour12: false })}
            </p>
          )}
        </div>
      </div>

      <PackageFormModal
        isOpen={modalOpen}
        mode={modalMode}
        initial={editingPackage}
        existingIds={packages.map((p) => p.id)}
        onClose={closeModal}
        onSave={handleModalSave}
        onDelete={removePackage}
      />

      <Modal
        isOpen={earlyModalOpen}
        onClose={() => setEarlyModalOpen(false)}
        className="max-w-md m-4 p-6 sm:p-8"
      >
        <div className="pr-8">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Хуучин Early үнэ</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Зөвхөн leftover нэхэмжлэлд ашиглагдана.
          </p>
        </div>
        <div className="mt-6 space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Legacy Early нэг дор (₮)
            </label>
            <MoneyInput value={earlyDraftLegacy} onChange={setEarlyDraftLegacy} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Үлдсэн 11 сар (₮)
            </label>
            <MoneyInput value={earlyDraftRest} onChange={setEarlyDraftRest} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" size="sm" onClick={() => setEarlyModalOpen(false)}>
              Болих
            </Button>
            <Button size="sm" onClick={saveEarlyDraft}>
              Хадгалах
            </Button>
          </div>
        </div>
      </Modal>

      <ComponentCard title="Төлбөрийн суваг" subtitle="Апп дээр харагдах">
        <div className="space-y-2">
          {[
            { id: "qpay", label: "QPay", logo: "/logos/qpay.png", checked: qpay, set: setQpay },
            { id: "sono", label: "Sono зээл", logo: "/logos/sono.png", checked: sono, set: setSono },
            { id: "pocket", label: "Pocket хуваалт", logo: "/logos/pocket.png", checked: pocket, set: setPocket },
            { id: "carepay", label: "Carepay зээл", logo: "/logos/carepay.png", checked: carepay, set: setCarepay },
            { id: "monpay", label: "MonPay мини апп", logo: "/logos/monpay.png", checked: monpay, set: setMonpay },
            {
              id: "gymfintech",
              label: "Flexy хуваан төлөлт",
              logo: "/logos/flexy.png",
              checked: gymfintech,
              set: setGymfintech,
            },
          ].map((row) => (
            <label
              key={row.id}
              className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-transparent px-2 py-2 hover:bg-gray-50 dark:hover:bg-white/5"
            >
              <span className="flex items-center gap-3">
                <img
                  src={row.logo}
                  alt={row.label}
                  className="h-8 w-8 rounded-md border border-gray-200 object-contain bg-white p-1 dark:border-gray-700 dark:bg-gray-900"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{row.label}</span>
              </span>
              <input
                type="checkbox"
                checked={row.checked}
                onChange={(e) => row.set(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
              />
            </label>
          ))}
        </div>
        <div className="pt-2">
          <Button onClick={save} disabled={loading || saving} className="w-full sm:w-auto">
            {saving ? "Хадгалж байна…" : "Хадгалах"}
          </Button>
        </div>
      </ComponentCard>
    </div>
  );
}
