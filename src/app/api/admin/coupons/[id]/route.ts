import { errorResponse, successResponse } from "@/lib/api-response";
import { requirePermission } from "@/lib/verify-gym-access";
import { createAdminClient } from "@/lib/supabase";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission(request, "coupons.manage", "Купон засах эрх хүрэлцэхгүй байна.");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const body = await request.json();
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.partner_name !== undefined) patch.partner_name = body.partner_name?.trim() || null;
    if (body.title !== undefined) patch.title = body.title?.trim() || null;
    if (body.description !== undefined) patch.description = body.description?.trim() || null;
    if (body.discount_percent !== undefined) {
      const pct = Number(body.discount_percent);
      if (pct < 1 || pct > 100) {
        return errorResponse("VALIDATION_ERROR", "Хөнгөлөлтийн хувь 1-100 хооронд байна.", 400);
      }
      patch.discount_percent = pct;
    }
    if (body.expires_at !== undefined) patch.expires_at = body.expires_at || null;
    if (body.partner_logo_url !== undefined) patch.partner_logo_url = body.partner_logo_url || null;
    if (body.is_active !== undefined) patch.is_active = Boolean(body.is_active);

    const admin = createAdminClient();
    const { data, error } = await admin.from("coupons").update(patch).eq("id", id).select().single();

    if (error) {
      return errorResponse("INTERNAL_ERROR", "Купон шинэчлэхэд алдаа гарлаа.", 500, error.message);
    }
    if (!data) {
      return errorResponse("NOT_FOUND", "Купон олдсонгүй.", 404);
    }
    return successResponse(data);
  } catch (e) {
    return errorResponse("INTERNAL_ERROR", "Системийн алдаа гарлаа.", 500, e instanceof Error ? e.message : String(e));
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requirePermission(request, "coupons.manage", "Купон устгах эрх хүрэлцэхгүй байна.");
    if (!auth.ok) return auth.response;

    const { id } = await params;
    const admin = createAdminClient();
    const { error } = await admin.from("coupons").delete().eq("id", id);

    if (error) {
      return errorResponse("INTERNAL_ERROR", "Купон устгахад алдаа гарлаа.", 500, error.message);
    }
    return successResponse({ deleted: true });
  } catch (e) {
    return errorResponse("INTERNAL_ERROR", "Системийн алдаа гарлаа.", 500, e instanceof Error ? e.message : String(e));
  }
}
