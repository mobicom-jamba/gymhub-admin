import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

export type JwtUserResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/** Any valid Supabase session (not limited to admin). */
export async function verifyJwtUser(request: Request): Promise<JwtUserResult> {
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
  return { ok: true, userId: user.id };
}
