import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import {
  countGymVisitorsToday,
  getTodayStartUTC8,
  gymHasDailyCapacityLeft,
} from "@/lib/gym-daily-capacity";

/**
 * GET /api/checkin?user_id=xxx — Check if user already checked in today
 * POST /api/checkin — Perform check-in (1 user visit per day + optional per-gym daily cap)
 */

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id");
    if (!userId) {
      return NextResponse.json({ error: "user_id шаардлагатай" }, { status: 400 });
    }

    const supabase = createAdminClient();

    // Check if user has any check-in today (Mongolia time UTC+8)
    const todayStart = getTodayStartUTC8();
    const { data, error } = await supabase
      .from("gym_visits")
      .select("id, gym_id, gym_name, status, checked_in_at")
      .eq("user_id", userId)
      .gte("checked_in_at", todayStart)
      .order("checked_in_at", { ascending: false })
      .limit(1);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const alreadyCheckedIn = data && data.length > 0;
    return NextResponse.json({
      checked_in_today: alreadyCheckedIn,
      visit: alreadyCheckedIn ? data[0] : null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { user_id, gym_id, gym_name } = body as {
      user_id: string;
      gym_id: string;
      gym_name?: string;
    };

    if (!user_id || !gym_id) {
      return NextResponse.json(
        { error: "user_id, gym_id шаардлагатай" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Enforce daily limit: check if already checked in today
    const todayStart = getTodayStartUTC8();
    const { data: existing, error: checkErr } = await supabase
      .from("gym_visits")
      .select("id, gym_name, checked_in_at")
      .eq("user_id", user_id)
      .gte("checked_in_at", todayStart)
      .limit(1);

    if (checkErr) {
      return NextResponse.json({ error: checkErr.message }, { status: 500 });
    }

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          error: "Та өнөөдөр аль хэдийн бүртгүүлсэн байна. Өдөрт 1 удаа л очих боломжтой.",
          already_checked_in: true,
          visit: existing[0],
        },
        { status: 409 }
      );
    }

    const { data: gymRow, error: gymErr } = await supabase
      .from("gyms")
      .select("daily_visitor_limit")
      .eq("id", gym_id)
      .maybeSingle();

    if (gymErr) {
      return NextResponse.json({ error: gymErr.message }, { status: 500 });
    }

    const cap = gymRow?.daily_visitor_limit;
    if (cap != null && cap > 0) {
      const used = await countGymVisitorsToday(supabase, gym_id, todayStart);
      if (!gymHasDailyCapacityLeft(cap, used)) {
        return NextResponse.json(
          {
            error:
              "Энэ фитнес өнөөдрийн зочлогчийн тоо дүүрсэн байна. Маргааш эсвэл өөр өдөр дахин оролдоно уу.",
            gym_at_capacity: true,
            daily_visitor_limit: cap,
            today_visitors: used,
          },
          { status: 429 }
        );
      }
    }

    // Perform check-in
    const { data: visit, error: insertErr } = await supabase
      .from("gym_visits")
      .insert({
        user_id,
        gym_id,
        gym_name: gym_name || null,
        method: "button",
        status: "pending",
        checked_in_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      visit,
      message: "Амжилттай бүртгэгдлээ!",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
