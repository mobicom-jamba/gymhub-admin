import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { UserSalesNote } from "@/app/(admin)/users/UserNoteModal";

const PAGE = 1000;

async function authHeader(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

/** Бүх sales notes-ийг pagination-оор татах (Supabase 1000 мөрийн хязгаарыг давах). */
export async function fetchAllUserSalesNotes(): Promise<Record<string, UserSalesNote>> {
  const map: Record<string, UserSalesNote> = {};
  const header = await authHeader();
  if (!header) return map;

  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const res = await fetch(
      `/api/admin/user-notes?offset=${offset}&limit=${PAGE}`,
      { headers: { Authorization: header } },
    );
    if (!res.ok) break;
    const json = await res.json();
    const notes = (json.notes ?? []) as UserSalesNote[];
    for (const n of notes) map[n.user_id] = n;
    if (!json.has_more || notes.length === 0) break;
    offset += PAGE;
  }
  return map;
}

/** Зөвхөн өгөгдсөн user_id-уудын notes (ж: нэг org-ийн гишүүд). */
export async function fetchUserSalesNotesByIds(
  userIds: string[],
): Promise<Record<string, UserSalesNote>> {
  const map: Record<string, UserSalesNote> = {};
  if (userIds.length === 0) return map;
  const header = await authHeader();
  if (!header) return map;

  const CHUNK = 200;
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const chunk = userIds.slice(i, i + CHUNK);
    const res = await fetch(
      `/api/admin/user-notes?user_ids=${encodeURIComponent(chunk.join(","))}&limit=${CHUNK}&with_agent=1`,
      { headers: { Authorization: header } },
    );
    if (!res.ok) continue;
    const json = await res.json();
    for (const n of (json.notes ?? []) as UserSalesNote[]) {
      map[n.user_id] = n;
    }
  }
  return map;
}
