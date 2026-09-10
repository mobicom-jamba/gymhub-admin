import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireOrgAccess } from "@/lib/verify-org-access";
import { toCsv, type CsvColumn } from "@/lib/csv-export";
import { parseDateRange } from "../_lib/range";

export const dynamic = "force-dynamic";

const TZ = "Asia/Ulaanbaatar";

const dateTimeFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** ISO → "2026-09-10 13:56" (Монголын цагаар). Хоосон бол "". */
function localDateTime(raw: unknown): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return dateTimeFmt.format(d).replace(", ", " ");
}

function localDate(raw: unknown): string {
  return localDateTime(raw).slice(0, 10);
}

const MEMBERSHIP_STATUS_MN: Record<string, string> = {
  active: "Идэвхтэй",
  inactive: "Идэвхгүй",
  expired: "Дууссан",
  paused: "Түр зогссон",
  pending: "Хүлээгдэж буй",
};

function membershipStatusLabel(raw: unknown): string {
  const key = String(raw ?? "").trim().toLowerCase();
  return MEMBERSHIP_STATUS_MN[key] ?? (key || "—");
}

const MEMBER_COLUMNS: CsvColumn[] = [
  { key: "full_name", label: "Нэр" },
  { key: "phone", label: "Утас" },
  { key: "sap_number", label: "SAP дугаар" },
  { key: "membership_status", label: "Багцын төлөв" },
  { key: "membership_tier", label: "Багц" },
  { key: "membership_started_at", label: "Эхэлсэн" },
  { key: "membership_expires_at", label: "Дуусах" },
  { key: "visits_range", label: "Тухайн хугацааны ирц" },
  { key: "visits_total", label: "Нийт ирц" },
  { key: "last_visit_at", label: "Сүүлд ирсэн" },
];

const VISIT_COLUMNS: CsvColumn[] = [
  { key: "checked_in_at", label: "Огноо, цаг" },
  { key: "full_name", label: "Нэр" },
  { key: "phone", label: "Утас" },
  { key: "sap_number", label: "SAP дугаар" },
  { key: "gym_name", label: "Фитнес" },
  { key: "method", label: "Бүртгэсэн арга" },
];

type OverviewRow = Record<string, unknown>;

/** RPC-ийн нэг хуудасны дээд хэмжээ (org_admin_visits дотор мөн хязгаарладаг). */
const VISIT_PAGE_SIZE = 1000;
/** Тайлангийн нийт мөрийн дээд хязгаар — хязгааргүй гүйхээс сэргийлнэ. */
const VISIT_MAX_ROWS = 50_000;

/**
 * Ирцийг хуудаслан бүрэн татна. Нэг дуудалтаар авбал 1000 мөрөөр чимээгүй
 * тасарч, HR дутуу тайлан татсанаа мэдэхгүй үлдэнэ.
 */
async function fetchAllVisits(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  from: string,
  to: string,
): Promise<OverviewRow[]> {
  const all: OverviewRow[] = [];
  for (let offset = 0; offset < VISIT_MAX_ROWS; offset += VISIT_PAGE_SIZE) {
    const { data, error } = await supabase.rpc("org_admin_visits", {
      p_org: orgId,
      p_from: from,
      p_to: to,
      p_limit: VISIT_PAGE_SIZE,
      p_offset: offset,
    });
    if (error) throw new Error(error.message);
    const page = (data as { visits?: OverviewRow[] } | null)?.visits ?? [];
    all.push(...page);
    if (page.length < VISIT_PAGE_SIZE) break;
  }
  return all;
}

/**
 * HTTP толгойн утга нь ByteString (0-255) байх ёстой тул `filename=` хэсэгт
 * крилл үсэг шууд тавибал Response үүсгэхэд алдаа өгнө. Иймд энд зөвхөн ASCII
 * нөөц нэр тавьж, жинхэнэ нэрийг percent-encode хийсэн `filename*=UTF-8''`
 * хэсгээр дамжуулна (browser-ууд боломжтой үедээ түүнийг нь илүүд үздэг).
 */
function asciiFallbackName(filename: string): string {
  const stripped = filename
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .replace(/[\s-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return /[A-Za-z0-9]/.test(stripped) ? stripped : "report.csv";
}

function csvResponse(csv: string, filename: string): NextResponse {
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        `attachment; filename="${asciiFallbackName(filename)}"; ` +
        `filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

/** Файлын нэрэнд аюулгүй болгох: латин/крилл/тоо үлдээж бусдыг зураасаар солино. */
function safeFileSlug(raw: string): string {
  return raw.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "org";
}

/**
 * GET /api/org/report?org_id&from&to&type=members|visits
 * Excel-д нээгддэг CSV (UTF-8 BOM) буцаана.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const access = await requireOrgAccess(request, searchParams.get("org_id"));
    if (!access.ok) return access.response;

    const { from, to } = parseDateRange(searchParams);
    const type = (searchParams.get("type") ?? "members").trim().toLowerCase();
    const supabase = createAdminClient();
    const slug = safeFileSlug(access.org.name);

    if (type === "visits") {
      const visits = (await fetchAllVisits(supabase, access.org.id, from, to)).map((v) => ({
        ...v,
        checked_in_at: localDateTime(v.checked_in_at),
      }));
      return csvResponse(toCsv(visits, VISIT_COLUMNS), `${slug}-irts-${from}_${to}.csv`);
    }

    const { data, error } = await supabase.rpc("org_admin_overview", {
      p_org: access.org.id,
      p_from: from,
      p_to: to,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const members = ((data as { members?: OverviewRow[] } | null)?.members ?? []).map((m) => ({
      ...m,
      membership_status: membershipStatusLabel(m.membership_status),
      membership_started_at: localDate(m.membership_started_at),
      membership_expires_at: localDate(m.membership_expires_at),
      last_visit_at: localDateTime(m.last_visit_at),
    }));
    return csvResponse(toCsv(members, MEMBER_COLUMNS), `${slug}-ajilchid-${from}_${to}.csv`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
