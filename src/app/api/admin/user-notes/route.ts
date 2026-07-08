import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

export type UserSalesNote = {
  user_id: string;
  called: boolean;
  called_at: string | null;
  note: string;
  agent_id: string | null;
  updated_at: string;
};

function allowedRole(auth: { isAdmin: boolean; isModerator: boolean; isSales: boolean }) {
  return auth.isAdmin || auth.isModerator || auth.isSales;
}

/**
 * GET /api/admin/user-notes
 * Бүх тэмдэглэлийг буцаана (admin/moderator/sales).
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!allowedRole(auth)) {
      return NextResponse.json({ error: "Эрх хүрэлцэхгүй." }, { status: 403 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("user_sales_notes")
      .select("user_id, called, called_at, note, agent_id, updated_at");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ notes: data ?? [] });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/user-notes
 * Body: { user_id, called, note }
 * Хэрэглэгчийн тэмдэглэлийг upsert хийнэ.
 */
export async function PUT(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!allowedRole(auth)) {
      return NextResponse.json({ error: "Эрх хүрэлцэхгүй." }, { status: 403 });
    }

    const body = await request.json() as { user_id?: string; called?: boolean; note?: string };
    const userId = body.user_id?.trim();
    if (!userId) return NextResponse.json({ error: "user_id шаардлагатай." }, { status: 400 });

    const called = body.called ?? false;
    const note = body.note ?? "";

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("user_sales_notes")
      .upsert(
        {
          user_id: userId,
          called,
          called_at: called ? new Date().toISOString() : null,
          note,
          agent_id: auth.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("user_id, called, called_at, note, agent_id, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ note: data });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
