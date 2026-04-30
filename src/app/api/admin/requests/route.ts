import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { verifyBearerUser, verifyGymStaffOrAdmin } from "@/lib/verify-gym-access";

/**
 * GET /api/admin/requests?gym_id=xxx&status=pending&date=today
 * List gym visit requests (for gym owners or admin). JWT шаардлагатай.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const gymId = searchParams.get("gym_id");
    const status = searchParams.get("status"); // pending, approved, rejected
    const date = searchParams.get("date"); // today, week, all

    if (gymId) {
      const access = await verifyGymStaffOrAdmin(request, gymId);
      if (!access.ok) return access.response;
    } else {
      const auth = await verifyBearerUser(request);
      if (!auth.ok) return auth.response;
      if (!auth.isAdmin) {
        return NextResponse.json({ error: "gym_id шаардлагатай" }, { status: 400 });
      }
    }

    const supabase = createAdminClient();

    let query = supabase
      .from("gym_visits")
      .select("id, user_id, gym_id, gym_name, status, method, checked_in_at, reviewed_at, reviewed_by")
      .order("checked_in_at", { ascending: false })
      .limit(100);

    if (gymId) {
      query = query.eq("gym_id", gymId);
    }
    if (status) {
      query = query.eq("status", status);
    }
    if (date === "today") {
      const todayStart = getTodayStartUTC8();
      query = query.gte("checked_in_at", todayStart);
    } else if (date === "week") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("checked_in_at", weekAgo);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Enrich with user profile info
    const userIds = [...new Set((data ?? []).map((v) => v.user_id))];
    let profiles: Record<
      string,
      { full_name?: string; phone?: string; email?: string; avatar_path?: string | null; avatar_url?: string | null }
    > = {};
    let authUsers: Record<string, { email?: string; phone?: string; user_metadata?: Record<string, unknown> }> = {};

    if (userIds.length > 0) {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, phone, email, avatar_path, avatar_url")
        .in("id", userIds);
      if (profileData) {
        profiles = Object.fromEntries(profileData.map((p) => [p.id, p]));
      }

      // Per-user auth lookup: listUsers(first page) misses most users; getUserById is reliable.
      const needAuthIds = userIds.filter((id) => {
        const p = profiles[id];
        const hasAvatar = !!(p?.avatar_path?.trim() || p?.avatar_url?.trim());
        return !p?.full_name?.trim() || !p?.phone?.trim() || !hasAvatar;
      });
      if (needAuthIds.length > 0) {
        authUsers = await fetchAuthUsersByIds(supabase, needAuthIds);
      }
    }

    const uniqueAvatarPaths = [
      ...new Set(
        Object.values(profiles)
          .flatMap((p) => {
            const a = String(p?.avatar_path ?? "").trim();
            const b = String(p?.avatar_url ?? "").trim();
            return [a, b];
          })
          .filter((v) => Boolean(v) && !/^https?:\/\//i.test(v))
      ),
    ];

    const signedAvatarUrls: Record<string, string> = {};
    if (uniqueAvatarPaths.length > 0) {
      await Promise.all(
        uniqueAvatarPaths.map(async (raw) => {
          const avatarPathRaw = raw.trim();
          if (!avatarPathRaw) return;
          // If already full URL, keep it.
          if (/^https?:\/\//i.test(avatarPathRaw)) {
            signedAvatarUrls[avatarPathRaw] = avatarPathRaw;
            return;
          }
          // Normalize storage object path
          let safePath = avatarPathRaw.startsWith("/") ? avatarPathRaw.slice(1) : avatarPathRaw;
          if (safePath.startsWith("media-public/")) safePath = safePath.slice("media-public/".length);
          if (!safePath) return;

          // Use plain public object URL (works without image transformation add-on).
          const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "");
          if (base) {
            signedAvatarUrls[avatarPathRaw] = `${base}/storage/v1/object/public/media-public/${encodeURI(safePath)}`;
            return;
          }

          // Last resort: signed or public URL from client SDK.
          const signed = await supabase.storage.from("media-public").createSignedUrl(safePath, 60 * 60);
          if (signed.data?.signedUrl) signedAvatarUrls[avatarPathRaw] = signed.data.signedUrl;
          else {
            const pub = supabase.storage.from("media-public").getPublicUrl(safePath).data.publicUrl;
            if (pub) signedAvatarUrls[avatarPathRaw] = pub;
          }
        })
      );
    }

    const enriched = (data ?? []).map((v) => {
      const p = profiles[v.user_id];
      const a = authUsers[v.user_id];
      const name =
        p?.full_name?.trim() ||
        pickDisplayNameFromMeta(a?.user_metadata) ||
        null;
      const phone =
        p?.phone?.trim() ||
        (typeof a?.phone === "string" && a.phone.trim()) ||
        pickPhoneFromMeta(a?.user_metadata) ||
        phoneFromVirtualEmail(a?.email) ||
        null;
      const email =
        p?.email?.trim() ||
        (a?.email && !a.email.endsWith("@gymhub.mn") ? a.email : null) ||
        null;
      const authAvatar =
        pickAvatarUrlFromMeta(a?.user_metadata) ||
        null;
      const avatarPathRaw =
        p?.avatar_path?.trim() ||
        (p?.avatar_url && String(p.avatar_url).trim()) ||
        authAvatar;
      const avatarUrl =
        (avatarPathRaw && signedAvatarUrls[avatarPathRaw]) ||
        (avatarPathRaw && signedAvatarUrls[avatarPathRaw.startsWith("/") ? avatarPathRaw.slice(1) : avatarPathRaw]) ||
        (avatarPathRaw && /^https?:\/\//i.test(avatarPathRaw) ? avatarPathRaw : null) ||
        svgAvatarDataUrl(name || phone || email || "User");
      return {
        ...v,
        user_name: name,
        user_phone: phone,
        user_email: email,
        user_avatar_url: avatarUrl,
      };
    });

    return NextResponse.json({ requests: enriched });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/requests — approve or reject a visit request
 * Body: { visit_id, action: "approve" | "reject", reviewed_by? }
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { visit_id, action } = body as {
      visit_id: string;
      action: "approve" | "reject";
    };

    if (!visit_id || !action) {
      return NextResponse.json({ error: "visit_id, action шаардлагатай" }, { status: 400 });
    }
    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action нь 'approve' эсвэл 'reject' байх ёстой" }, { status: 400 });
    }

    const supabase = createAdminClient();

    const { data: visitRow, error: visitErr } = await supabase
      .from("gym_visits")
      .select("id, gym_id")
      .eq("id", visit_id)
      .maybeSingle();

    if (visitErr || !visitRow?.gym_id) {
      return NextResponse.json({ error: "Олдсонгүй" }, { status: 404 });
    }

    const access = await verifyGymStaffOrAdmin(request, visitRow.gym_id);
    if (!access.ok) return access.response;

    const newStatus = action === "approve" ? "approved" : "rejected";
    const { data, error } = await supabase
      .from("gym_visits")
      .update({
        status: newStatus,
        reviewed_at: new Date().toISOString(),
        reviewed_by: access.userId,
      })
      .eq("id", visit_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      visit: data,
      message: action === "approve" ? "Хүсэлт зөвшөөрөгдлөө" : "Хүсэлт татгалзлаа",
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function pickDisplayNameFromMeta(meta?: Record<string, unknown>): string | null {
  if (!meta) return null;
  for (const k of ["full_name", "name", "display_name", "given_name", "nickname", "username"]) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function pickPhoneFromMeta(meta?: Record<string, unknown>): string | null {
  if (!meta) return null;
  const v = meta.phone;
  if (typeof v === "string" && v.trim()) {
    const digits = v.replace(/\D/g, "");
    if (digits.length >= 8) return digits;
    return v.trim();
  }
  return null;
}

function pickAvatarUrlFromMeta(meta?: Record<string, unknown>): string | null {
  if (!meta) return null;
  for (const k of ["avatar_url", "avatar", "picture", "photo_url", "profile_image_url"]) {
    const v = meta[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function phoneFromVirtualEmail(email: string | undefined): string | null {
  if (!email?.endsWith("@gymhub.mn")) return null;
  const local = email.slice(0, -"@gymhub.mn".length);
  const digits = local.replace(/\D/g, "");
  return digits.length >= 8 ? digits : local || null;
}

async function fetchAuthUsersByIds(
  supabase: ReturnType<typeof createAdminClient>,
  ids: string[]
): Promise<Record<string, { email?: string; phone?: string; user_metadata?: Record<string, unknown> }>> {
  const out: Record<string, { email?: string; phone?: string; user_metadata?: Record<string, unknown> }> = {};
  const chunkSize = 12;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (uid) => {
        try {
          const { data, error } = await supabase.auth.admin.getUserById(uid);
          if (error || !data.user) return;
          const u = data.user;
          out[uid] = {
            email: u.email,
            phone: u.phone ?? undefined,
            user_metadata: u.user_metadata as Record<string, unknown>,
          };
        } catch {
          /* skip */
        }
      })
    );
  }
  return out;
}

function getTodayStartUTC8(): string {
  const now = new Date();
  const mongoliaOffset = 8 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const mongoliaMs = utcMs + mongoliaOffset * 60000;
  const mongoliaDate = new Date(mongoliaMs);
  const startOfDay = new Date(
    mongoliaDate.getFullYear(),
    mongoliaDate.getMonth(),
    mongoliaDate.getDate(),
    0, 0, 0, 0
  );
  const startUtcMs = startOfDay.getTime() - mongoliaOffset * 60000;
  return new Date(startUtcMs).toISOString();
}

function svgAvatarDataUrl(label: string): string {
  const text = (label || "U").trim();
  const initial = (text[0] || "U").toUpperCase();
  const bg = "#E2E8F0"; // slate-200
  const fg = "#475569"; // slate-600
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">` +
    `<rect width="96" height="96" rx="48" fill="${bg}"/>` +
    `<text x="48" y="56" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,Arial" font-size="40" font-weight="700" fill="${fg}">${escapeXml(initial)}</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (ch) => {
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === "&") return "&amp;";
    if (ch === '"') return "&quot;";
    return "&#39;";
  });
}
