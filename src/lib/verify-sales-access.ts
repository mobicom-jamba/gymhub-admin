import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser, type VerifiedCaller } from "@/lib/verify-gym-access";
import { hasPermission } from "@/lib/permissions";

/** Админ эсвэл profiles.role = sales */
export async function requireSalesOrAdmin(request: Request): Promise<VerifiedCaller> {
  const v = await verifyBearerUser(request);
  if (!v.ok) return v;
  if (v.isAdmin || hasPermission(v.permissions, "commissions.view.own")) return v;

  const supabase = createAdminClient();
  const { data: p, error } = await supabase.from("profiles").select("role").eq("id", v.userId).maybeSingle();
  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Профайл уншиж чадсангүй" }, { status: 500 }),
    };
  }
  if (p?.role === "sales") return v;

  return {
    ok: false,
    response: NextResponse.json({ error: "Зөвхөн борлуулалтын эрхтэй эсвэл админ" }, { status: 403 }),
  };
}
