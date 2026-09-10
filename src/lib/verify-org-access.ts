import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser, type VerifiedCaller } from "@/lib/verify-gym-access";

export type OrgContext = {
  id: string;
  name: string;
  logoUrl: string | null;
  /** org_admins.role — 'hr' | 'owner'. Админ бол 'admin'. */
  role: string;
};

type Caller = Extract<VerifiedCaller, { ok: true }>;

export type OrgAccess =
  | { ok: true; caller: Caller; org: OrgContext; orgs: OrgContext[] }
  | { ok: false; response: NextResponse };

type OrgRow = { id: string; name: string | null; logo_url: string | null };

function toContext(row: OrgRow, role: string): OrgContext {
  return {
    id: String(row.id),
    name: String(row.name ?? "").trim() || "Байгууллага",
    logoUrl: row.logo_url ?? null,
    role,
  };
}

/** Тухайн хэрэглэгчийн HR эрхтэй байгууллагууд (org_admins). */
export async function listCallerOrgs(userId: string): Promise<OrgContext[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("org_admins")
    .select("role, organization_id, organizations(id, name, logo_url)")
    .eq("user_id", userId);

  return (data ?? [])
    .map((row) => {
      const rel = (row as { organizations?: OrgRow | OrgRow[] | null }).organizations;
      const org = Array.isArray(rel) ? rel[0] : rel;
      if (!org?.id) return null;
      return toContext(org, String((row as { role?: string }).role ?? "hr"));
    })
    .filter((o): o is OrgContext => o !== null)
    .sort((a, b) => a.name.localeCompare(b.name, "mn"));
}

/**
 * HR портлын API-д хандах эрх шалгана.
 *
 * - Админ/модератор: org_id заавал дамжуулна, дурын байгууллагад хандана.
 * - Бусад: зөвхөн org_admins-д бүртгэлтэй байгууллага. org_id өгөөгүй бол эхнийхийг авна.
 *
 * organization_id-г client-ээс ирсэн байдлаар нь хэзээ ч итгэхгүй — үргэлж энд шалгана.
 */
export async function requireOrgAccess(
  request: Request,
  requestedOrgId?: string | null,
): Promise<OrgAccess> {
  const auth = await verifyBearerUser(request);
  if (!auth.ok) return auth;

  const wanted = (requestedOrgId ?? "").trim() || null;

  if (auth.isAdmin || auth.isModerator) {
    if (!wanted) {
      return {
        ok: false,
        response: NextResponse.json({ error: "org_id шаардлагатай" }, { status: 400 }),
      };
    }
    const supabase = createAdminClient();
    const { data: org } = await supabase
      .from("organizations")
      .select("id, name, logo_url")
      .eq("id", wanted)
      .maybeSingle();
    if (!org?.id) {
      return {
        ok: false,
        response: NextResponse.json({ error: "Байгууллага олдсонгүй" }, { status: 404 }),
      };
    }
    const ctx = toContext(org as OrgRow, "admin");
    return { ok: true, caller: auth, org: ctx, orgs: [ctx] };
  }

  const orgs = await listCallerOrgs(auth.userId);
  if (orgs.length === 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Таны бүртгэлд холбогдсон байгууллага олдсонгүй." },
        { status: 403 },
      ),
    };
  }

  const org = wanted ? orgs.find((o) => o.id === wanted) : orgs[0];
  if (!org) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Энэ байгууллагад хандах эрхгүй" }, { status: 403 }),
    };
  }

  return { ok: true, caller: auth, org, orgs };
}
