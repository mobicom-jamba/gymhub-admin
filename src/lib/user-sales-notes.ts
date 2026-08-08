import { createBrowserSupabaseClient } from "@/lib/supabase-browser";
import type { UserSalesNote } from "@/app/(admin)/users/UserNoteModal";
import { fetchAllPagesParallel } from "@/lib/fetch-all-pages";

const PAGE = 1000;
const NOTES_CACHE_TTL_MS = 30_000;

let notesCache: { at: number; map: Record<string, UserSalesNote> } | null = null;

async function authHeader(): Promise<string> {
  const supabase = createBrowserSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : "";
}

/** Бүх sales notes — browser Supabase + параллель pagination (жагсаалтын icon-д). */
export async function fetchAllUserSalesNotes(): Promise<Record<string, UserSalesNote>> {
  if (notesCache && Date.now() - notesCache.at < NOTES_CACHE_TTL_MS) {
    return notesCache.map;
  }

  const supabase = createBrowserSupabaseClient();
  const { data, error } = await fetchAllPagesParallel<UserSalesNote>({
    pageSize: PAGE,
    getCount: async () => {
      const res = await supabase
        .from("user_sales_notes")
        .select("user_id", { count: "exact", head: true });
      return { count: res.count, error: res.error };
    },
    fetchPage: async (from, to) => {
      const res = await supabase
        .from("user_sales_notes")
        .select("user_id, called, called_at, note, agent_id, updated_at")
        .order("user_id", { ascending: true })
        .range(from, to);
      return {
        data: (res.data as UserSalesNote[] | null) ?? null,
        error: res.error,
      };
    },
  });

  if (error) throw new Error(error);

  const map: Record<string, UserSalesNote> = {};
  for (const n of data) map[n.user_id] = n;
  notesCache = { at: Date.now(), map };
  return map;
}

/** Notes cache-ийг refresh (хадгалсны дараа). */
export function invalidateUserSalesNotesCache(): void {
  notesCache = null;
}

export function patchUserSalesNotesCache(note: UserSalesNote): void {
  if (!notesCache) {
    notesCache = { at: Date.now(), map: { [note.user_id]: note } };
    return;
  }
  notesCache = {
    at: notesCache.at,
    map: { ...notesCache.map, [note.user_id]: note },
  };
}

/** Cache-ээс өгөгдсөн id-уудыг шууд авна (flicker багасгах). */
export function peekUserSalesNotesCache(
  userIds: string[],
): Record<string, UserSalesNote> | null {
  if (!notesCache || userIds.length === 0) return null;
  const map: Record<string, UserSalesNote> = {};
  let hits = 0;
  for (const id of userIds) {
    const row = notesCache.map[id];
    if (!row) continue;
    map[id] = row;
    hits += 1;
  }
  return hits > 0 ? map : null;
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
  await Promise.all(
    Array.from({ length: Math.ceil(userIds.length / CHUNK) }, async (_, i) => {
      const chunk = userIds.slice(i * CHUNK, i * CHUNK + CHUNK);
      const res = await fetch(
        `/api/admin/user-notes?user_ids=${encodeURIComponent(chunk.join(","))}&limit=${CHUNK}&with_agent=1`,
        { headers: { Authorization: header } },
      );
      if (!res.ok) return;
      const json = await res.json();
      for (const n of (json.notes ?? []) as UserSalesNote[]) {
        map[n.user_id] = n;
      }
    }),
  );

  if (notesCache) {
    notesCache = {
      at: Date.now(),
      map: { ...notesCache.map, ...map },
    };
  } else {
    notesCache = { at: Date.now(), map: { ...map } };
  }
  return map;
}
