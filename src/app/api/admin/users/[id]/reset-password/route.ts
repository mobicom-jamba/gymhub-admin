import { createClient } from "@supabase/supabase-js";
import { errorResponse, successResponse } from "@/lib/api-response";
import { revokeAllUserSessions } from "@/lib/auth-sessions";
import { hasPermission } from "@/lib/permissions";
import { verifyBearerUser } from "@/lib/verify-gym-access";

const DEFAULT_RESET_PASSWORD = "123456";

/** POST /api/admin/users/[id]/reset-password — нууц үгийг 123456 болгоно. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;

    const canReset =
      hasPermission(auth.permissions, "users.password.reset") ||
      hasPermission(auth.permissions, "users.manage");
    if (!canReset) {
      return errorResponse(
        "FORBIDDEN",
        "Нууц үг шинэчлэх эрх хүрэлцэхгүй байна.",
        403,
      );
    }

    const { id } = await params;
    if (!id) {
      return errorResponse("VALIDATION_ERROR", "Хэрэглэгчийн id шаардлагатай.", 400);
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!serviceRoleKey) {
      return errorResponse("INTERNAL_ERROR", "Серверийн тохиргоо дутуу байна.", 500);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: profile } = await admin
      .from("profiles")
      .select("id, role, full_name")
      .eq("id", id)
      .maybeSingle();

    if (!profile) {
      return errorResponse("NOT_FOUND", "Хэрэглэгч олдсонгүй.", 404);
    }

    // Модератор зөвхөн энгийн гишүүний нууц үг солино (admin/moderator биш).
    if (
      auth.isModerator &&
      !auth.isAdmin &&
      !hasPermission(auth.permissions, "users.manage")
    ) {
      const role = String(profile.role ?? "user").toLowerCase();
      if (role !== "user") {
        return errorResponse(
          "FORBIDDEN",
          "Модератор зөвхөн гишүүдийн нууц үг шинэчилж болно.",
          403,
        );
      }
    }

    const { error } = await admin.auth.admin.updateUserById(id, {
      password: DEFAULT_RESET_PASSWORD,
    });
    if (error) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Нууц үг шинэчлэхэд алдаа гарлаа.",
        400,
        error.message,
      );
    }

    const revoked = await revokeAllUserSessions(admin, id);
    if (revoked.error) {
      console.warn("admin_revoke_user_sessions:", revoked.error);
    }

    return successResponse({
      ok: true,
      password: DEFAULT_RESET_PASSWORD,
      sessions_revoked: true,
    });
  } catch (e) {
    return errorResponse(
      "INTERNAL_ERROR",
      e instanceof Error ? e.message : String(e),
      500,
    );
  }
}
