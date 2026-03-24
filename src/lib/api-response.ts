export type ApiErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INTERNAL_ERROR";

export type ApiErrorResponse = {
  ok: false;
  code: ApiErrorCode;
  message: string;
  details?: string;
};

export type ApiSuccessResponse<T = unknown> = {
  ok: true;
  data?: T;
};

export function errorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  details?: string
) {
  return Response.json(
    { ok: false, code, message, details } satisfies ApiErrorResponse,
    { status }
  );
}

export function successResponse<T>(data?: T) {
  return Response.json({ ok: true, data } satisfies ApiSuccessResponse<T>);
}

export async function parseApiError(res: Response): Promise<string> {
  try {
    const json = (await res.json()) as Partial<ApiErrorResponse>;
    return json.message || "Системийн алдаа гарлаа. Дараа дахин оролдоно уу.";
  } catch {
    return "Системийн алдаа гарлаа. Дараа дахин оролдоно уу.";
  }
}

