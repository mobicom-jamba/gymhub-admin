export type QpayBankUrl = {
  name: string;
  description: string;
  logo: string;
  link: string;
};

function pickString(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

export function normalizeQpayBankUrls(invoice: unknown): QpayBankUrl[] {
  if (!invoice || typeof invoice !== "object") return [];
  const raw = (invoice as Record<string, unknown>).urls;
  if (!Array.isArray(raw)) return [];

  const out: QpayBankUrl[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const link = pickString(o, "link", "deeplink", "url");
    if (!link) continue;
    out.push({
      name: pickString(o, "name"),
      description: pickString(o, "description", "desc"),
      logo: pickString(o, "logo", "icon"),
      link,
    });
  }
  return out;
}
