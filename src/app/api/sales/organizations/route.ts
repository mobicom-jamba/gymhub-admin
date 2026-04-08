import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireSalesOrAdmin } from "@/lib/verify-sales-access";

/** POST { name, description?, phone?, ... } — байгууллага нэмэх */
export async function POST(request: Request) {
  try {
    const auth = await requireSalesOrAdmin(request);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const name = String(body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Байгууллагын нэр шаардлагатай" }, { status: 400 });
    }

    const supabase = createAdminClient();
    const row = {
      name,
      description: body?.description ? String(body.description).trim() || null : null,
      phone: body?.phone ? String(body.phone).trim() || null : null,
      facebook_url: body?.facebook_url ? String(body.facebook_url).trim() || null : null,
      website_url: body?.website_url ? String(body.website_url).trim() || null : null,
      partner_url: body?.partner_url ? String(body.partner_url).trim() || null : null,
      created_by: auth.userId,
    };

    let { data: inserted, error: insertErr } = await supabase.from("organizations").insert(row).select("id, name").single();
    if (insertErr && insertErr.message?.includes("created_by")) {
      const fallback = {
        name: row.name,
        description: row.description,
        phone: row.phone,
        facebook_url: row.facebook_url,
        website_url: row.website_url,
        partner_url: row.partner_url,
      };
      const retry = await supabase.from("organizations").insert(fallback).select("id, name").single();
      inserted = retry.data ?? null;
      insertErr = retry.error;
    }

    if (insertErr) {
      const msg = insertErr.message?.toLowerCase() ?? "";
      const duplicate = insertErr.code === "23505" || msg.includes("duplicate") || msg.includes("organizations_name_key");
      if (duplicate) {
        const { data: existing, error: exErr } = await supabase
          .from("organizations")
          .select("id, name")
          .ilike("name", name)
          .limit(1)
          .maybeSingle();
        if (exErr || !existing?.id) {
          return NextResponse.json({ error: "Ижил нэртэй байгууллага аль хэдийн байна" }, { status: 409 });
        }
        inserted = existing;
      } else {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, organization: inserted });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
