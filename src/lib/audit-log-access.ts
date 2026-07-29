/** Audit Log UI/API — зөвхөн энэ имэйлд харагдана. */
export const AUDIT_LOG_ALLOWED_EMAIL = "ganzojamba@gmail.com";

export function canAccessAuditLog(email: string | null | undefined): boolean {
  return (email ?? "").trim().toLowerCase() === AUDIT_LOG_ALLOWED_EMAIL;
}
