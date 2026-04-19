import { errorResponse, successResponse } from "@/lib/api-response";
import { requirePermission } from "@/lib/verify-gym-access";
import { createAdminClient } from "@/lib/supabase";

export async function GET(request: Request) {
  try {
    const auth = await requirePermission(request, "coupons.manage", "Купон удирдах эрх хүрэлцэхгүй байна.");
    if (!auth.ok) return auth.response;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("coupons")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return errorResponse("INTERNAL_ERROR", "Купоны жагсаалт ачаалж чадсангүй.", 500, error.message);
    }
    return successResponse(data);
  } catch (e) {
    return errorResponse("INTERNAL_ERROR", "Системийн алдаа гарлаа.", 500, e instanceof Error ? e.message : String(e));
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission(request, "coupons.manage", "Купон үүсгэх эрх хүрэлцэхгүй байна.");
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { partner_name, title, description, discount_percent, expires_at, partner_logo_url, is_active } = body;

    if (!partner_name?.trim()) {
      return errorResponse("VALIDATION_ERROR", "Партнерын нэр заавал оруулна уу.", 400);
    }
    if (!title?.trim()) {
      return errorResponse("VALIDATION_ERROR", "Купоны нэр заавал оруулна уу.", 400);
    }
    if (discount_percent == null || discount_percent < 1 || discount_percent > 100) {
      return errorResponse("VALIDATION_ERROR", "Хөнгөлөлтийн хувь 1-100 хооронд байна.", 400);
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("coupons")
      .insert({
        partner_name: partner_name.trim(),
        title: title.trim(),
        description: description?.trim() || null,
        discount_percent: Number(discount_percent),
        expires_at: expires_at || null,
        partner_logo_url: partner_logo_url || null,
        is_active: is_active !== false,
        view_count: 0,
        required_tier: "premium",
      })
      .select()
      .single();

    if (error) {
      return errorResponse("INTERNAL_ERROR", "Купон үүсгэхэд алдаа гарлаа.", 500, error.message);
    }
    return successResponse(data);
  } catch (e) {
    return errorResponse("INTERNAL_ERROR", "Системийн алдаа гарлаа.", 500, e instanceof Error ? e.message : String(e));
  }
}
