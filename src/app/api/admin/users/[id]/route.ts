import { createClient } from "@supabase/supabase-js";
import { errorResponse, successResponse } from "@/lib/api-response";
import { hasPermission } from "@/lib/permissions";
import { verifyBearerUser } from "@/lib/verify-gym-access";

function resolveMembershipStatus(
  membershipStartedAt: string | null | undefined,
  membershipExpiresAt: string | null | undefined
): "active" | "inactive" {
  if (!membershipStartedAt && !membershipExpiresAt) return "inactive";
  const now = new Date();
  const start = membershipStartedAt ? new Date(membershipStartedAt) : null;
  const end = membershipExpiresAt ? new Date(membershipExpiresAt) : null;
  if ((start && Number.isNaN(start.getTime())) || (end && Number.isNaN(end.getTime()))) return "inactive";
  const isStarted = start ? now >= start : true;
  const isNotExpired = end ? now <= end : true;
  return isStarted && isNotExpired ? "active" : "inactive";
}

function mapProfileUpdateError(message: string): string {
  if (message.includes('invalid input value for enum user_role')) {
    return "Профайл шинэчлэхэд алдаа гарлаа. DB-ийн user_role enum-д энэ эрх бүртгэгдээгүй байна. sql/user_role_add_moderator.sql ажиллуулна уу.";
  }
  return "Профайл шинэчлэхэд алдаа гарлаа.";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!hasPermission(auth.permissions, "users.manage")) {
      return errorResponse("FORBIDDEN", "Хэрэглэгч засах эрх хүрэлцэхгүй байна.", 403);
    }

    const { id } = await params;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!serviceRoleKey) {
      return errorResponse("INTERNAL_ERROR", "Серверийн тохиргоо дутуу байна.", 500);
    }
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const body = await request.json();
    const {
      password,
      full_name,
      surname,
      given_name,
      phone,
      role,
      organization_id,
      organization,
      membership_tier,
      membership_started_at,
      membership_expires_at,
    } = body;
    if (role !== undefined && !hasPermission(auth.permissions, "users.role.assign")) {
      return errorResponse("FORBIDDEN", "Хэрэглэгчийн эрх өөрчлөх боломжгүй.", 403);
    }

    const isTryingToSetSubscriptionDates =
      membership_started_at !== undefined || membership_expires_at !== undefined;
    if (isTryingToSetSubscriptionDates && !hasPermission(auth.permissions, "users.subscription.edit")) {
      return errorResponse(
        "FORBIDDEN",
        "Гишүүнчлэлийн эхлэх/дуусах огноог зөвхөн админ засах эрхтэй.",
        403,
      );
    }

    if (password) {
      const { error } = await admin.auth.admin.updateUserById(id, { password });
      if (error) {
        return errorResponse("VALIDATION_ERROR", "Нууц үг шинэчлэхэд алдаа гарлаа.", 400, error.message);
      }
    }

    const hasProfileFields =
      full_name !== undefined ||
      surname !== undefined ||
      given_name !== undefined ||
      phone !== undefined ||
      role !== undefined ||
      organization_id !== undefined ||
      organization !== undefined ||
      membership_tier !== undefined ||
      membership_started_at !== undefined ||
      membership_expires_at !== undefined;

    if (hasProfileFields) {
      const patch: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (full_name !== undefined) patch.full_name = full_name ?? null;
      if (phone !== undefined) patch.phone = phone ?? null;
      if (role !== undefined) patch.role = role ?? "user";
      if (organization_id !== undefined) patch.organization_id = organization_id ?? null;
      if (organization !== undefined) patch.organization = organization ?? null;
      if (membership_tier !== undefined) patch.membership_tier = membership_tier ?? null;
      if (membership_started_at !== undefined) patch.membership_started_at = membership_started_at ?? null;
      if (membership_expires_at !== undefined) patch.membership_expires_at = membership_expires_at ?? null;

      if (surname !== undefined) {
        patch.surname = typeof surname === "string" && surname.trim() ? surname.trim() : null;
      }
      if (given_name !== undefined) {
        patch.given_name = typeof given_name === "string" && given_name.trim() ? given_name.trim() : null;
      }

      const membershipTouched =
        membership_tier !== undefined ||
        membership_started_at !== undefined ||
        membership_expires_at !== undefined;

      if (membershipTouched) {
        const { data: currentProfile, error: currentProfileError } = await admin
          .from("profiles")
          .select("membership_started_at, membership_expires_at")
          .eq("id", id)
          .maybeSingle();

        if (currentProfileError) {
          return errorResponse(
            "VALIDATION_ERROR",
            mapProfileUpdateError(currentProfileError.message),
            400,
            currentProfileError.message,
          );
        }

        const nextMembershipStartedAt =
          membership_started_at !== undefined
            ? membership_started_at
            : currentProfile?.membership_started_at ?? null;
        const nextMembershipExpiresAt =
          membership_expires_at !== undefined
            ? membership_expires_at
            : currentProfile?.membership_expires_at ?? null;

        patch.membership_status = resolveMembershipStatus(
          nextMembershipStartedAt,
          nextMembershipExpiresAt,
        );
      }

      const { error: profileError } = await admin.from("profiles").update(patch).eq("id", id);

      if (profileError) {
        return errorResponse(
          "VALIDATION_ERROR",
          mapProfileUpdateError(profileError.message),
          400,
          profileError.message,
        );
      }
    }

    return successResponse({ id });
  } catch (e) {
    return errorResponse("INTERNAL_ERROR", "Системийн алдаа.", 500, e instanceof Error ? e.message : String(e));
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyBearerUser(request);
    if (!auth.ok) return auth.response;
    if (!hasPermission(auth.permissions, "users.manage")) {
      return errorResponse("FORBIDDEN", "Хэрэглэгч устгах эрх хүрэлцэхгүй байна.", 403);
    }

    const { id } = await params;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    if (!serviceRoleKey) {
      return errorResponse(
        "INTERNAL_ERROR",
        "Серверийн тохиргоо дутуу байна (service role key).",
        500
      );
    }
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) {
      return errorResponse("VALIDATION_ERROR", "Хэрэглэгч устгах үед алдаа гарлаа.", 400, error.message);
    }
    return successResponse({ id });
  } catch (e) {
    return errorResponse(
      "INTERNAL_ERROR",
      "Системийн алдаа гарлаа. Дараа дахин оролдоно уу.",
      500,
      e instanceof Error ? e.message : String(e)
    );
  }
}
