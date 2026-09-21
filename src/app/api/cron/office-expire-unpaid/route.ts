import { NextResponse } from "next/server";
import { markOfficeOrderPaid } from "@/lib/office-order-settle";
import { checkQpayInvoice } from "@/lib/qpay-client";
import { createAdminClient } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Нэхэмжлэл үүсгээд төлөөгүй захиалгыг хэдэн цагийн дараа цуцлах вэ. */
const UNPAID_TTL_MS = 24 * 60 * 60 * 1000;

/** Нэг ажиллахад боловсруулах дээд хэмжээ — QPay руу хэт олон дуудлага явуулахгүй. */
const BATCH_LIMIT = 50;

/**
 * Vercel Cron: оффис багцын нэхэмжлэл үүсгээд 24 цагийн дотор төлөөгүй
 * захиалгыг автоматаар цуцална.
 *
 * Цуцлахын өмнө QPay-гээс шалгана: callback/polling алдагдсан ч бодит төлбөр
 * орсон байвал цуцлахын оронд төлөгдсөнд тооцно.
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const cutoff = new Date(Date.now() - UNPAID_TTL_MS).toISOString();

  const { data, error } = await supabase
    .from("office_package_requests")
    .select("id, booking_id, qpay_invoice_id")
    .eq("status", "pending_payment")
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as {
    id: string;
    booking_id: string | null;
    qpay_invoice_id: string | null;
  }[];

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, cancelled: 0, settled: 0, checked: 0 });
  }

  const toCancel: string[] = [];
  let settled = 0;

  for (const row of rows) {
    if (row.qpay_invoice_id && row.booking_id) {
      try {
        const result = await checkQpayInvoice(row.qpay_invoice_id);
        if (result.paid) {
          await markOfficeOrderPaid(supabase, row.booking_id, {
            invoiceId: row.qpay_invoice_id,
            paidAmount: typeof result.paid_amount === "number" ? result.paid_amount : null,
          });
          settled += 1;
          continue;
        }
      } catch {
        // QPay хариугүй бол энэ удаад цуцлахгүй — дараагийн ажиллалтад дахин үзнэ.
        continue;
      }
    }
    toCancel.push(row.id);
  }

  if (toCancel.length > 0) {
    const { error: cancelError } = await supabase
      .from("office_package_requests")
      .update({ status: "cancelled" })
      .in("id", toCancel)
      .eq("status", "pending_payment");

    if (cancelError) {
      return NextResponse.json(
        { ok: false, error: cancelError.message, settled },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    checked: rows.length,
    cancelled: toCancel.length,
    settled,
  });
}
