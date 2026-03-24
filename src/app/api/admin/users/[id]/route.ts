import { createClient } from "@supabase/supabase-js";
import { errorResponse, successResponse } from "@/lib/api-response";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
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
