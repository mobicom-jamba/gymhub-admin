import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSalesOrAdmin } from "@/lib/verify-sales-access";

const PHONE_DOMAIN = "gymhub.mn";

function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@${PHONE_DOMAIN}`;
}

/** POST { phone, password, full_name, organization_id } — ажилтан (энгийн user) нэмэх */
export async function POST(request: Request) {
  try {
    const auth = await requireSalesOrAdmin(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const phone = String(body?.phone ?? "").replace(/\D/g, "");
    const password = String(body?.password ?? "");
    const full_name = String(body?.full_name ?? "").trim();
    const organization_id = String(body?.organization_id ?? "").trim();

    if (phone.length < 8) {
      return NextResponse.json({ error: "Утасны дугаар зөв оруулна уу" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Нууц үг хамгийн багадаа 6 тэмдэгт" }, { status: 400 });
    }
    if (!full_name) {
      return NextResponse.json({ error: "Нэр оруулна уу" }, { status: 400 });
    }
    if (!organization_id) {
      return NextResponse.json({ error: "Байгууллага (organization_id) сонгоно уу" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!serviceRoleKey) {
      return NextResponse.json({ error: "Серверийн тохиргоо дутуу" }, { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .select("id, name")
      .eq("id", organization_id)
      .maybeSingle();

    if (orgErr || !org?.id) {
      return NextResponse.json({ error: "Байгууллага олдсонгүй" }, { status: 404 });
    }

    const email = phoneToEmail(phone);

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name, phone },
    });

    if (authError) {
      if (authError.message?.includes("already been registered")) {
        return NextResponse.json({ error: "Энэ утасны дугаар бүртгэлтэй байна" }, { status: 400 });
      }
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (authData.user) {
      const { error: profileUpdateError } = await admin.from("profiles").update({
        full_name,
        phone,
        role: "user",
        organization_id: org.id,
        organization: org.name ?? null,
        membership_status: "inactive",
        membership_tier: "early",
      }).eq("id", authData.user.id);

      if (profileUpdateError) {
        return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, id: authData.user?.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
