import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { hasPermission } from "@/lib/permissions";
import { verifyBearerUser } from "@/lib/verify-gym-access";

/**
 * GET /api/admin/user-visit-history?user_id=xxx
 * Returns visit rows + per-gym counts (name + logo) for one user.
 */
export async function GET(request: Request) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;

    const canView =
      auth.isAdmin ||
      hasPermission(auth.permissions, "users.view") ||
      hasPermission(auth.permissions, "fitness.activity.view");
    if (!canView) {
      return NextResponse.json({ error: "Эрх хүрэлцэхгүй." }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("user_id")?.trim();
    if (!userId) {
      return NextResponse.json({ error: "user_id шаардлагатай." }, { status: 400 });
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("gym_visits")
      .select("checked_in_at, gym_id, gym_name, status")
      .eq("user_id", userId)
      .neq("status", "rejected")
      .order("checked_in_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const visits = data ?? [];

    const gymIds = [
      ...new Set(visits.map((v) => v.gym_id).filter((id): id is string => !!id)),
    ];

    const gymMeta = new Map<string, { name: string; image_url: string | null }>();
    if (gymIds.length > 0) {
      const { data: gyms } = await supabase
        .from("gyms")
        .select("id, name, image_url")
        .in("id", gymIds);
      for (const g of gyms ?? []) {
        if (!g.id) continue;
        gymMeta.set(g.id, {
          name: (g.name ?? "").trim(),
          image_url: g.image_url ?? null,
        });
      }
    }

    const enriched = visits.map((v) => {
      const meta = v.gym_id ? gymMeta.get(v.gym_id) : undefined;
      const fromRow = (v.gym_name ?? "").trim();
      return {
        checked_in_at: v.checked_in_at,
        gym_id: v.gym_id ?? null,
        gym_name: fromRow || meta?.name || null,
        gym_image_url: meta?.image_url ?? null,
        status: v.status,
      };
    });

    const byGymMap = new Map<
      string,
      {
        gym_id: string | null;
        gym_name: string;
        gym_image_url: string | null;
        visits: number;
      }
    >();

    for (const v of enriched) {
      const name = (v.gym_name ?? "").trim() || "Тодорхойгүй";
      const key = v.gym_id ?? `name:${name}`;
      const existing = byGymMap.get(key);
      if (existing) {
        existing.visits += 1;
        if (!existing.gym_image_url && v.gym_image_url) {
          existing.gym_image_url = v.gym_image_url;
        }
      } else {
        byGymMap.set(key, {
          gym_id: v.gym_id,
          gym_name: name,
          gym_image_url: v.gym_image_url,
          visits: 1,
        });
      }
    }

    const by_gym = [...byGymMap.values()].sort(
      (a, b) => b.visits - a.visits || a.gym_name.localeCompare(b.gym_name, "mn"),
    );

    return NextResponse.json({ visits: enriched, by_gym });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
