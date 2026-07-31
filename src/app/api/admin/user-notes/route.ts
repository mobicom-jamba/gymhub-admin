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
  agent_name?: string | null;
};

function allowedRole(auth: { isAdmin: boolean; isModerator: boolean; isSales: boolean }) {
  return auth.isAdmin || auth.isModerator || auth.isSales;
}

async function attachAgentNames(
  supabase: ReturnType<typeof createAdminClient>,
  notes: UserSalesNote[],
): Promise<UserSalesNote[]> {
  const agentIds = [...new Set(notes.map((n) => n.agent_id).filter((id): id is string => !!id))];
  if (agentIds.length === 0) return notes.map((n) => ({ ...n, agent_name: null }));

  const { data: agents } = await supabase
    .from("profiles")
    .select("id, full_name, phone")
    .in("id", agentIds);

  const nameById = new Map<string, string>();
  for (const a of agents ?? []) {
    const name = (a.full_name ?? "").trim() || (a.phone ?? "").trim() || a.id.slice(0, 8);
    nameById.set(a.id, name);
  }

  return notes.map((n) => ({
    ...n,
    agent_name: n.agent_id ? (nameById.get(n.agent_id) ?? null) : null,
  }));
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

    const notes = await attachAgentNames(supabase, (data ?? []) as UserSalesNote[]);
    return NextResponse.json({ notes });
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

    const { data: existing } = await supabase
      .from("user_sales_notes")
      .select("called, called_at")
      .eq("user_id", userId)
      .maybeSingle();

    // called_at: зөвхөн шинээр "Залгасан" болгоход шинэчилнэ; тэмдэглэл засахад бүү дар
    let calledAt: string | null = existing?.called_at ?? null;
    if (called && !existing?.called) {
      calledAt = new Date().toISOString();
    } else if (called && existing?.called) {
      calledAt = existing.called_at ?? new Date().toISOString();
    }
    // called=false үед сүүлийн залгалтын огноог хадгална (түүх)

    const { data, error } = await supabase
      .from("user_sales_notes")
      .upsert(
        {
          user_id: userId,
          called,
          called_at: calledAt,
          note,
          agent_id: auth.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      )
      .select("user_id, called, called_at, note, agent_id, updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const [enriched] = await attachAgentNames(supabase, [data as UserSalesNote]);
    return NextResponse.json({ note: enriched });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}
