import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { revokeAllUserSessions } from "@/lib/auth-sessions";
import { createAdminClient } from "@/lib/supabase";
import { PHONE_LOGIN_EMAIL_DOMAIN } from "@/lib/admin-app-access";
import { requirePermission, verifyBearerUser } from "@/lib/verify-gym-access";

export const dynamic = "force-dynamic";

type OrgAdminRow = {
  user_id: string;
  organization_id: string;
  role: string;
  created_at: string;
  organizations?: { id: string; name: string | null } | Array<{ id: string; name: string | null }> | null;
};

function orgNameOf(row: OrgAdminRow): string {
  const rel = row.organizations;
  const org = Array.isArray(rel) ? rel[0] : rel;
  return String(org?.name ?? "").trim() || "Нэргүй";
}

function phoneToEmail(phone: string): string {
  return `${phone.replace(/\D/g, "")}@${PHONE_LOGIN_EMAIL_DOMAIN}`;
}

async function findUserByEmail(supabase: SupabaseClient, email: string): Promise<{ id: string } | null> {
  const target = email.toLowerCase();
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) return null;
    const user = data.users.find((u) => u.email?.toLowerCase() === target);
    if (user) return { id: user.id };
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

/** GET /api/admin/org-admins — бүх HR бүртгэл (нэр, утас, байгууллага). */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!auth.isAdmin && !auth.isModerator) {
      return NextResponse.json({ error: "Энэ мэдээлэлд хандах эрхгүй." }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("org_admins")
      .select("user_id, organization_id, role, created_at, organizations(id, name)")
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data ?? []) as OrgAdminRow[];
    const ids = [...new Set(rows.map((r) => r.user_id))];

    const profileById = new Map<string, { full_name: string | null; phone: string | null }>();
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .in("id", ids);
      for (const p of profiles ?? []) {
        profileById.set(String(p.id), {
          full_name: (p as { full_name: string | null }).full_name,
          phone: (p as { phone: string | null }).phone,
        });
      }
    }

    return NextResponse.json({
      admins: rows.map((row) => ({
        user_id: row.user_id,
        organization_id: row.organization_id,
        organization_name: orgNameOf(row),
        role: row.role,
        created_at: row.created_at,
        full_name: profileById.get(row.user_id)?.full_name ?? null,
        phone: profileById.get(row.user_id)?.phone ?? null,
      })),
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}

/**
 * POST /api/admin/org-admins
 * Body: { organization_id, full_name, phone, password?, role? }
 * Утсаар нь HR хэрэглэгч үүсгэх/шинэчлээд байгууллагад холбоно.
 */
export async function POST(request: Request) {
  try {
    const auth = await requirePermission(
      request,
      "org.admins.manage",
      "HR эрх олгохыг зөвхөн админ гүйцэтгэнэ.",
    );
    if (!auth.ok) return auth.response;

    const body = (await request.json()) as {
      organization_id?: string;
      full_name?: string;
      phone?: string;
      password?: string;
      role?: string;
    };

    const organizationId = String(body.organization_id ?? "").trim();
    const fullName = String(body.full_name ?? "").trim();
    const phone = String(body.phone ?? "").replace(/\D/g, "");
    const password = String(body.password ?? "").trim();
    const role = body.role === "owner" ? "owner" : "hr";

    if (!organizationId) {
      return NextResponse.json({ error: "Байгууллага сонгоно уу" }, { status: 400 });
    }
    if (phone.length < 8) {
      return NextResponse.json({ error: "Утасны дугаар зөв оруулна уу" }, { status: 400 });
    }
    if (!fullName) {
      return NextResponse.json({ error: "Нэр оруулна уу" }, { status: 400 });
    }
    if (password && password.length < 6) {
      return NextResponse.json({ error: "Нууц үг хамгийн багадаа 6 тэмдэгт" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: org } = await supabase
      .from("organizations")
      .select("id, name")
      .eq("id", organizationId)
      .maybeSingle();
    if (!org?.id) {
      return NextResponse.json({ error: "Байгууллага олдсонгүй" }, { status: 404 });
    }

    const email = phoneToEmail(phone);
    const meta = { full_name: fullName, phone };
    let userId: string;
    let created = false;

    const existing = await findUserByEmail(supabase, email);
    if (existing) {
      userId = existing.id;

      // Байгаа хэрэглэгчийг чимээгүй HR болгож БОЛОХГҮЙ: гишүүн/ажилтны role нь
      // дарагдаж, өөрийн апп руугаа орох эрхээ алдана. HR-т тусдаа дугаар шаардана.
      const { data: existingProfile } = await supabase
        .from("profiles")
        .select("role, full_name")
        .eq("id", userId)
        .maybeSingle();
      const existingRole = String((existingProfile as { role?: string | null } | null)?.role ?? "").trim();

      if (existingRole !== "org_admin") {
        const who = String((existingProfile as { full_name?: string | null } | null)?.full_name ?? "").trim();
        return NextResponse.json(
          {
            error:
              `${phone} дугаар аль хэдийн бүртгэлтэй байна${who ? ` (${who})` : ""}. ` +
              "HR-т тусдаа дугаар ашиглана уу.",
          },
          { status: 409 },
        );
      }

      const payload: Record<string, unknown> = { email_confirm: true, user_metadata: meta };
      if (password) payload.password = password;
      const { error: updErr } = await supabase.auth.admin.updateUserById(userId, payload);
      if (updErr) return NextResponse.json({ error: `Auth update: ${updErr.message}` }, { status: 500 });
      if (password) {
        const revoked = await revokeAllUserSessions(supabase, userId);
        if (revoked.error) console.warn("admin_revoke_user_sessions:", revoked.error);
      }
    } else {
      if (!password) {
        return NextResponse.json({ error: "Шинэ HR-д нууц үг заавал оруулна" }, { status: 400 });
      }
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: meta,
      });
      if (authErr || !authData.user?.id) {
        return NextResponse.json(
          { error: `Auth create: ${authErr?.message ?? "хэрэглэгчийн id олдсонгүй"}` },
          { status: 500 },
        );
      }
      userId = authData.user.id;
      created = true;
    }

    // HR нь ажилтан биш — profiles.organization_id-г нь тавихгүй (тэр талбар
    // ажилтныг байгууллагад хамааруулдаг; HR-ийн эрх org_admins дээр байна).
    const { error: profileErr } = await supabase
      .from("profiles")
      .upsert({ id: userId, full_name: fullName, phone, role: "org_admin" }, { onConflict: "id" });
    if (profileErr) {
      return NextResponse.json({ error: `Profile: ${profileErr.message}` }, { status: 500 });
    }

    const { error: linkErr } = await supabase
      .from("org_admins")
      .upsert(
        { user_id: userId, organization_id: organizationId, role },
        { onConflict: "user_id,organization_id" },
      );
    if (linkErr) {
      return NextResponse.json({ error: `org_admins: ${linkErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true, user_id: userId, created });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/org-admins?user_id=..&organization_id=..
 * Холбоосыг устгана. Өөр байгууллага үлдээгүй бол role-г user болгож буцаана.
 */
export async function DELETE(request: Request) {
  try {
    const auth = await requirePermission(
      request,
      "org.admins.manage",
      "HR эрх хасахыг зөвхөн админ гүйцэтгэнэ.",
    );
    if (!auth.ok) return auth.response;

    const { searchParams } = new URL(request.url);
    const userId = String(searchParams.get("user_id") ?? "").trim();
    const organizationId = String(searchParams.get("organization_id") ?? "").trim();
    if (!userId || !organizationId) {
      return NextResponse.json({ error: "user_id, organization_id шаардлагатай" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from("org_admins")
      .delete()
      .eq("user_id", userId)
      .eq("organization_id", organizationId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { count } = await supabase
      .from("org_admins")
      .select("user_id", { count: "exact", head: true })
      .eq("user_id", userId);

    if ((count ?? 0) === 0) {
      await supabase.from("profiles").update({ role: "user" }).eq("id", userId).eq("role", "org_admin");
      const revoked = await revokeAllUserSessions(supabase, userId);
      if (revoked.error) console.warn("admin_revoke_user_sessions:", revoked.error);
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown" }, { status: 500 });
  }
}
