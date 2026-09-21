import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requirePermission } from "@/lib/verify-gym-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUSES = ["pending_payment", "paid", "underpaid", "cancelled"] as const;

/**
 * Админ гараар тавьж болох төлвүүд. `paid` / `underpaid`-ийг зөвхөн QPay-ийн
 * баталгаажсан гүйлгээ тогтооно — эс тэгвээс орлогын тайлан бодит гүйлгээнээс
 * салж, төлөөгүй захиалга «Төлсөн» болж харагдах эрсдэлтэй.
 */
const MANUAL_STATUSES = ["pending_payment", "cancelled"] as const;

/** GET /api/admin/office-requests — оффис багцын захиалгууд. */
export async function GET(request: Request) {
  const auth = await requirePermission(request, "office.requests.view", "Захиалга харах эрхгүй.");
  if (!auth.ok) return auth.response;

  const status = new URL(request.url).searchParams.get("status")?.trim() ?? "";

  const supabase = createAdminClient();
  let select = supabase
    .from("office_package_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (status && (STATUSES as readonly string[]).includes(status)) {
    select = select.eq("status", status);
  }

  const { data, error } = await select;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ requests: data ?? [] });
}

/** PATCH /api/admin/office-requests — төлөв солих. */
export async function PATCH(request: Request) {
  const auth = await requirePermission(request, "office.requests.manage", "Захиалга засах эрхгүй.");
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = String(body.id ?? "").trim();
  const status = String(body.status ?? "").trim();

  if (!id) return NextResponse.json({ error: "id шаардлагатай." }, { status: 400 });
  if (!(STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "Төлөв буруу байна." }, { status: 400 });
  }
  if (!(MANUAL_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: "«Төлсөн» төлөвийг зөвхөн QPay-ийн баталгаажсан төлбөр тогтооно." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();
  // Төлөгдсөн захиалгыг гараар буцаахгүй — гүйлгээний бүртгэл хэвээр үлдэнэ.
  const { data, error } = await supabase
    .from("office_package_requests")
    .update({ status })
    .eq("id", id)
    .in("status", MANUAL_STATUSES)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: "Төлбөр төлөгдсөн захиалгын төлвийг өөрчлөх боломжгүй." },
      { status: 409 },
    );
  }
  return NextResponse.json({ request: data });
}
