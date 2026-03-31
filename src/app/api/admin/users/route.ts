import { createClient } from "@supabase/supabase-js";
import { errorResponse, successResponse } from "@/lib/api-response";

const PHONE_DOMAIN = "gymhub.mn";

function phoneToEmail(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return `${digits}@${PHONE_DOMAIN}`;
}

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

export async function POST(request: Request) {
  try {
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
    const body = await request.json();
    const {
      email: rawEmail,
      password,
      full_name,
      phone,
      role,
      organization_id,
      organization,
      membership_tier,
      membership_started_at,
      membership_expires_at,
    } = body;

    if (!phone || !password) {
      return errorResponse(
        "VALIDATION_ERROR",
        "Утасны дугаар болон нууц үг заавал оруулна уу.",
        400
      );
    }

    const email = rawEmail || phoneToEmail(phone);

    const computedMembershipStatus = resolveMembershipStatus(
      membership_started_at,
      membership_expires_at
    );

    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || "", phone: phone || "" },
    });
    if (authError) {
      if (authError.message?.includes("already been registered")) {
        return errorResponse("VALIDATION_ERROR", "Энэ утасны дугаар бүртгэлтэй байна.", 400, authError.message);
      }
      return errorResponse("VALIDATION_ERROR", "Хэрэглэгч үүсгэхэд алдаа гарлаа.", 400, authError.message);
    }
    if (authData.user) {
      const { error: profileUpdateError } = await admin
        .from("profiles")
        .update({
          full_name: full_name || null,
          phone: phone || null,
          role: role || "user",
          organization_id: organization_id || null,
          organization: organization || null,
          membership_tier: membership_tier || null,
          membership_status: computedMembershipStatus,
          membership_started_at: membership_started_at || null,
          membership_expires_at: membership_expires_at || null,
        })
        .eq("id", authData.user.id);
      if (profileUpdateError) {
        return errorResponse("VALIDATION_ERROR", "Профайл шинэчлэхэд алдаа гарлаа.", 400, profileUpdateError.message);
      }
    }
    return successResponse({ id: authData.user?.id });
  } catch (e) {
    return errorResponse("INTERNAL_ERROR", "Системийн алдаа гарлаа. Дараа дахин оролдоно уу.", 500, e instanceof Error ? e.message : String(e));
  }
}
