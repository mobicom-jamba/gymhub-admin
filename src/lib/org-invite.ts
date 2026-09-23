/** Хэрэглэгчийн вэб (gymhub.mn) — байгууллагын урилгын линк үүсгэхэд хэрэглэнэ. */
export const CLIENT_WEB_BASE_URL = (
  process.env.NEXT_PUBLIC_CLIENT_WEB_URL ?? "https://gymhub.mn"
).replace(/\/$/, "");

/**
 * Байгууллагын ажилтныг өөрөө бүртгүүлэх линк.
 * Линкээр орсон хүнд байгууллага автоматаар бөглөгдөж, түгжээтэй байна.
 */
export function buildOrgInviteUrl(organizationId: string): string {
  return `${CLIENT_WEB_BASE_URL}/register?org=${encodeURIComponent(organizationId)}`;
}
