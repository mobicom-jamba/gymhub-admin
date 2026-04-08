/** Admin вэб апп руу нэвтрэхийг зөвшөөрөгдсөн profiles.role утгууд */
export const ADMIN_APP_STAFF_ROLES = ["admin", "moderator", "sales"] as const;

export function isStaffRoleForAdminApp(role: string | null | undefined): boolean {
  const r = (role ?? "").trim().toLowerCase();
  return r === "admin" || r === "moderator" || r === "sales";
}

export const PHONE_LOGIN_EMAIL_DOMAIN = "gymhub.mn";

/**
 * Имэйл шууд эсвэл зөвхөн тоо → 99112233 → 99112233@gymhub.mn (хэрэглэгч үүсгэх API-тай ижил).
 */
export function resolveSignInEmailOrPhone(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.includes("@")) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length >= 8 && digits.length <= 15) {
    return `${digits}@${PHONE_LOGIN_EMAIL_DOMAIN}`;
  }
  return trimmed;
}
