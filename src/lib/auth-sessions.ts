import type { SupabaseClient } from "@supabase/supabase-js";

/** Extract session_id claim from a Supabase access token JWT (already verified separately). */
export function getSessionIdFromAccessToken(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const json =
      typeof atob === "function"
        ? atob(padded)
        : Buffer.from(padded, "base64").toString("utf8");
    const payload = JSON.parse(json) as { session_id?: string };
    return typeof payload.session_id === "string" && payload.session_id
      ? payload.session_id
      : null;
  } catch {
    return null;
  }
}

/**
 * Delete all auth.sessions for a user so refresh fails and (with is_auth_session_active)
 * access tokens stop working immediately.
 */
export async function revokeAllUserSessions(
  admin: SupabaseClient,
  userId: string,
): Promise<{ error: string | null }> {
  const { error } = await admin.rpc("admin_revoke_user_sessions", {
    p_user_id: userId,
  });
  if (error) return { error: error.message };
  return { error: null };
}

/**
 * Returns false when the session row is gone (logged out / password changed).
 * Returns true if the check cannot run (RPC missing) so older DBs keep working.
 */
export async function isAccessTokenSessionActive(
  admin: SupabaseClient,
  accessToken: string,
): Promise<boolean> {
  const sessionId = getSessionIdFromAccessToken(accessToken);
  if (!sessionId) return true;

  const { data, error } = await admin.rpc("is_auth_session_active", {
    p_session_id: sessionId,
  });
  if (error) {
    // Migration not applied yet — do not lock everyone out.
    if (
      error.message.includes("is_auth_session_active") ||
      error.code === "PGRST202" ||
      error.code === "42883"
    ) {
      return true;
    }
    return true;
  }
  return data === true;
}
