import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { hasPermission } from "@/lib/permissions";
import { requireSalesOrAdmin } from "@/lib/verify-sales-access";

export async function GET(request: Request) {
  try {
    const auth = await requireSalesOrAdmin(request);
    if (!auth.ok) return auth.response;

    const supabase = createAdminClient();
    let query = supabase
      .from("sales_commission_requests")
      .select(
        "id, sales_user_id, requested_rate, approved_rate, status, note, review_note, reviewed_by, reviewed_at, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);

    if (!hasPermission(auth.permissions, "commissions.rate.approve")) {
      query = query.eq("sales_user_id", auth.userId);
    }

    const { data, error } = await query;
    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json(
          { error: "sales_commission_requests хүснэгт байхгүй. sql/sales_commission_requests.sql ажиллуулна уу." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ rows: data ?? [] });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireSalesOrAdmin(request);
    if (!auth.ok) return auth.response;
    if (!hasPermission(auth.permissions, "commissions.rate.request")) {
      return NextResponse.json({ error: "Комиссын хувь хүсэх эрхгүй." }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      requested_rate?: number | string;
      note?: string;
    };
    const requestedRate = Number(body.requested_rate);
    if (!Number.isFinite(requestedRate) || requestedRate < 0 || requestedRate > 1) {
      return NextResponse.json({ error: "requested_rate 0-1 хооронд байх ёстой." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data: pendingRows, error: pendingError } = await supabase
      .from("sales_commission_requests")
      .select("id")
      .eq("sales_user_id", auth.userId)
      .eq("status", "pending")
      .limit(1);
    if (pendingError && pendingError.code !== "42P01") {
      return NextResponse.json({ error: pendingError.message }, { status: 500 });
    }
    if ((pendingRows ?? []).length > 0) {
      return NextResponse.json({ error: "Шинэ хүсэлт илгээхийн өмнө одоогийн pending хүсэлт шийдэгдсэн байх ёстой." }, { status: 409 });
    }

    const { data, error } = await supabase
      .from("sales_commission_requests")
      .insert({
        sales_user_id: auth.userId,
        requested_rate: requestedRate,
        note: typeof body.note === "string" ? body.note.trim() || null : null,
        status: "pending",
      })
      .select(
        "id, sales_user_id, requested_rate, approved_rate, status, note, review_note, reviewed_by, reviewed_at, created_at, updated_at",
      )
      .single();

    if (error) {
      if (error.code === "42P01") {
        return NextResponse.json(
          { error: "sales_commission_requests хүснэгт байхгүй. sql/sales_commission_requests.sql ажиллуулна уу." },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ row: data });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
}
