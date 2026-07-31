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
 * GET /api/admin/user-notes?offset=0&limit=1000
 * GET /api/admin/user-notes?user_ids=id1,id2&with_agent=1
 *
 * Анхдагч Supabase limit=1000 тул pagination заавал.
 * Жагсаалтын icon-д agent_name хэрэггүй — зөвхөн with_agent=1 үед нэмнэ.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!allowedRole(auth)) {
      return NextResponse.json({ error: "Эрх хүрэлцэхгүй." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 1000) || 1000, 1), 1000);
    const offset = Math.max(Number(searchParams.get("offset") ?? 0) || 0, 0);
    const withAgent = searchParams.get("with_agent") === "1";
    const userIds = (searchParams.get("user_ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 500);

    const supabase = createAdminClient();
    let query = supabase
      .from("user_sales_notes")
      .select("user_id, called, called_at, note, agent_id, updated_at", { count: "exact" })
      .order("updated_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (userIds.length > 0) {
      query = query.in("user_id", userIds);
    }

    const { data, error, count } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let notes = (data ?? []) as UserSalesNote[];
    if (withAgent && notes.length > 0 && notes.length <= 100) {
      notes = await attachAgentNames(supabase, notes);
    }

    const total = count ?? notes.length;
    return NextResponse.json({
      notes,
      total,
      offset,
      limit,
      has_more: offset + notes.length < total,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Unknown error" }, { status: 500 });
  }
}

/**
 * PUT /api/admin/user-notes
 * Body: { user_id, called, note }
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

    let calledAt: string | null = existing?.called_at ?? null;
    if (called && !existing?.called) {
      calledAt = new Date().toISOString();
    } else if (called && existing?.called) {
      calledAt = existing.called_at ?? new Date().toISOString();
    }

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
