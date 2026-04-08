import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  getPermissionsForRole,
  hasPermission,
  normalizeAppRole,
  type AppPermission,
  type AppRole,
} from "@/lib/permissions";

export type VerifiedCaller =
  | {
      ok: true;
      userId: string;
      role: AppRole;
      permissions: AppPermission[];
      isAdmin: boolean;
      isModerator: boolean;
      isSales: boolean;
    }
  | { ok: false; response: NextResponse };

/** Authorization: Bearer <supabase access_token> */
export async function verifyBearerUser(request: Request): Promise<VerifiedCaller> {
  const raw = request.headers.get("authorization");
  const token = raw?.startsWith("Bearer ") ? raw.slice(7).trim() : null;
  if (!token) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Authorization: Bearer token шаардлагатай" }, { status: 401 }),
    };
  }
  const supabase = createAdminClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);
  if (error || !user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Нэвтрэх эсвэл token хүчингүй байна" }, { status: 401 }),
    };
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const role = normalizeAppRole((profile as { role?: string | null } | null)?.role);
  const permissions = getPermissionsForRole(role);
  const isAdmin = role === "admin";
  const isModerator = role === "moderator";
  const isSales = role === "sales";
  return { ok: true, userId: user.id, role, permissions, isAdmin, isModerator, isSales };
}

/** Админ эсвэл тухайн фитнесийн owner/manager */
export async function verifyGymStaffOrAdmin(request: Request, gymId: string): Promise<VerifiedCaller> {
  const v = await verifyBearerUser(request);
  if (!v.ok) return v;
  if (v.isAdmin) return v;

  const supabase = createAdminClient();
  const { data: row } = await supabase
    .from("gym_staff")
    .select("user_id")
    .eq("gym_id", gymId)
    .eq("user_id", v.userId)
    .in("role", ["owner", "manager"])
    .limit(1)
    .maybeSingle();

  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Энэ фитнесийн мэдээлэлд хандах эрхгүй" }, { status: 403 }),
    };
  }
  return v;
}

export async function requirePermission(
  request: Request,
  permission: AppPermission,
  forbiddenMessage = "Энэ үйлдэлд хандах эрхгүй байна",
): Promise<VerifiedCaller> {
  const v = await verifyBearerUser(request);
  if (!v.ok) return v;
  if (hasPermission(v.permissions, permission)) return v;
  return {
    ok: false,
    response: NextResponse.json({ error: forbiddenMessage }, { status: 403 }),
  };
}
