import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser } from "@/lib/verify-gym-access";

export type FlexyCallLog = {
  id: string;
  user_id: string;
  payment_id: string;
  plan_id: string | null;
  agent_id: string | null;
  note: string;
  called_at: string;
  agent_name?: string | null;
};

export type FlexyCallSummary = {
  payment_id: string;
  call_count: number;
  last_called_at: string | null;
  last_agent_id: string | null;
  last_agent_name?: string | null;
};

function allowedRole(auth: { isAdmin: boolean; isModerator: boolean; isSales: boolean }) {
  return auth.isAdmin || auth.isModerator || auth.isSales;
}

async function agentNamesById(
  supabase: ReturnType<typeof createAdminClient>,
  agentIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(agentIds.filter(Boolean))];
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const { data } = await supabase.from("profiles").select("id, full_name, phone").in("id", ids);
  for (const a of data ?? []) {
    const name = (a.full_name ?? "").trim() || (a.phone ?? "").trim() || a.id.slice(0, 8);
    map.set(a.id, name);
  }
  return map;
}

/**
 * GET /api/admin/flexy-calls?payment_ids=id1,id2  → summaries
 * GET /api/admin/flexy-calls?payment_id=id&history=1 → call logs for one payment
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!allowedRole(auth)) {
      return NextResponse.json({ error: "Эрх хүрэлцэхгүй." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const paymentId = (searchParams.get("payment_id") ?? "").trim();
    const history = searchParams.get("history") === "1";
    const paymentIds = (searchParams.get("payment_ids") ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 200);

    const supabase = createAdminClient();

    if (history && paymentId) {
      const { data, error } = await supabase
        .from("flexy_call_logs")
        .select("id, user_id, payment_id, plan_id, agent_id, note, called_at")
        .eq("payment_id", paymentId)
        .order("called_at", { ascending: false })
        .limit(50);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const logs = (data ?? []) as FlexyCallLog[];
      const names = await agentNamesById(
        supabase,
        logs.map((l) => l.agent_id).filter((id): id is string => !!id),
      );
      return NextResponse.json({
        logs: logs.map((l) => ({
          ...l,
          agent_name: l.agent_id ? (names.get(l.agent_id) ?? null) : null,
        })),
      });
    }

    const ids = paymentId ? [paymentId] : paymentIds;
    if (ids.length === 0) {
      return NextResponse.json({ error: "payment_ids эсвэл payment_id шаардлагатай." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("flexy_call_logs")
      .select("payment_id, called_at, agent_id")
      .in("payment_id", ids)
      .order("called_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const summaryByPayment = new Map<string, FlexyCallSummary>();
    for (const id of ids) {
      summaryByPayment.set(id, {
        payment_id: id,
        call_count: 0,
        last_called_at: null,
        last_agent_id: null,
      });
    }
    for (const row of data ?? []) {
      const cur = summaryByPayment.get(row.payment_id);
      if (!cur) continue;
      cur.call_count += 1;
      if (!cur.last_called_at) {
        cur.last_called_at = row.called_at;
        cur.last_agent_id = row.agent_id ?? null;
      }
    }

    const names = await agentNamesById(
      supabase,
      [...summaryByPayment.values()]
        .map((s) => s.last_agent_id)
        .filter((id): id is string => !!id),
    );
    const summaries = [...summaryByPayment.values()].map((s) => ({
      ...s,
      last_agent_name: s.last_agent_id ? (names.get(s.last_agent_id) ?? null) : null,
    }));

    return NextResponse.json({ summaries });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/flexy-calls
 * Body: { payment_id, user_id, plan_id?, note? }
 * Шинэ дуудлага нэмнэ (олон удаа залгах боломжтой).
 */
export async function POST(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!allowedRole(auth)) {
      return NextResponse.json({ error: "Эрх хүрэлцэхгүй." }, { status: 403 });
    }

    const body = (await request.json()) as {
      payment_id?: string;
      user_id?: string;
      plan_id?: string | null;
      note?: string;
    };
    const paymentId = body.payment_id?.trim();
    const userId = body.user_id?.trim();
    if (!paymentId || !userId) {
      return NextResponse.json({ error: "payment_id болон user_id шаардлагатай." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const note = typeof body.note === "string" ? body.note.trim().slice(0, 2000) : "";

    const { data, error } = await supabase
      .from("flexy_call_logs")
      .insert({
        payment_id: paymentId,
        user_id: userId,
        plan_id: body.plan_id?.trim() || null,
        agent_id: auth.userId,
        note,
        called_at: new Date().toISOString(),
      })
      .select("id, user_id, payment_id, plan_id, agent_id, note, called_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const names = await agentNamesById(supabase, [auth.userId]);
    const log: FlexyCallLog = {
      ...(data as FlexyCallLog),
      agent_name: names.get(auth.userId) ?? null,
    };

    const { count } = await supabase
      .from("flexy_call_logs")
      .select("id", { count: "exact", head: true })
      .eq("payment_id", paymentId);

    return NextResponse.json({
      log,
      summary: {
        payment_id: paymentId,
        call_count: count ?? 1,
        last_called_at: log.called_at,
        last_agent_id: log.agent_id,
        last_agent_name: log.agent_name ?? null,
      } satisfies FlexyCallSummary,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
