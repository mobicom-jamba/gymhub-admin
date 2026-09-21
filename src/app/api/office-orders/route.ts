import { NextResponse } from "next/server";
import { getPaymentAppSettings, requirePaymentChannel } from "@/lib/payment-app-settings";
import { normalizeQpayBankUrls } from "@/lib/qpay-bank-urls";
import { QPayError, buildSenderInvoiceNo, createQpayInvoice } from "@/lib/qpay-client";
import { createAdminClient } from "@/lib/supabase";
import { verifyJwtUser } from "@/lib/verify-jwt-user";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const QPAY_CALLBACK_URL = process.env.QPAY_CALLBACK_URL ?? "https://gymhub.mn/payment-callback";

/**
 * POST /api/office-orders — оффис багцын захиалга үүсгээд QPay нэхэмжлэл буцаана.
 *
 * Зөвхөн QPay. Үнийг клиентээс авахгүй — багцын id-аар админ тохиргооноос уншина.
 */
export async function POST(request: Request) {
  try {
    const blocked = await requirePaymentChannel("qpay");
    if (blocked) return blocked;

    const auth = await verifyJwtUser(request);
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const organization = String(body.organization_name ?? "").trim();
    const phoneDigits = String(body.contact_phone ?? "").replace(/\D/g, "");
    const packageId = String(body.package_id ?? "").trim();

    if (!organization) {
      return NextResponse.json({ error: "Байгууллагын нэрээ оруулна уу." }, { status: 400 });
    }
    if (phoneDigits.length < 8) {
      return NextResponse.json({ error: "Утасны дугаараа зөв оруулна уу." }, { status: 400 });
    }

    const settings = await getPaymentAppSettings();
    const pkg = settings.office_packages.find((p) => p.id === packageId && p.enabled);
    if (!pkg) {
      return NextResponse.json({ error: "Багц олдсонгүй. Дахин сонгоно уу." }, { status: 400 });
    }
    if (pkg.price_mnt <= 0) {
      return NextResponse.json({ error: "Багцын үнэ тохируулагдаагүй байна." }, { status: 400 });
    }

    // «office-» угтвартай booking id — гишүүнчлэл олгох логик үүнд хамаарахгүй.
    const bookingId = `office-${pkg.id}-${Date.now()}`;
    const description = `Оффис багц — ${pkg.label} (${pkg.plan_label})`;

    const callbackUrl = new URL(QPAY_CALLBACK_URL);
    callbackUrl.searchParams.set("booking_id", bookingId);

    const invoice = await createQpayInvoice({
      senderInvoiceNo: buildSenderInvoiceNo(bookingId),
      receiverCode: auth.userId,
      description,
      amount: pkg.price_mnt,
      callbackUrl: callbackUrl.toString(),
    });

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("office_package_requests")
      .insert({
        user_id: auth.userId,
        package_id: pkg.id,
        package_label: pkg.label,
        plan_label: pkg.plan_label,
        headcount: pkg.headcount,
        price_mnt: pkg.price_mnt,
        organization_name: organization,
        contact_name: String(body.contact_name ?? "").trim() || null,
        contact_phone: phoneDigits,
        contact_email: String(body.contact_email ?? "").trim() || null,
        note: String(body.note ?? "").trim() || null,
        booking_id: bookingId,
        qpay_invoice_id: String(invoice.invoice_id),
        status: "pending_payment",
      })
      .select("id")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      order_id: data.id,
      booking_id: bookingId,
      amount: pkg.price_mnt,
      description,
      invoice_id: invoice.invoice_id,
      qr_image: invoice.qr_image,
      qr_text: invoice.qr_text,
      urls: normalizeQpayBankUrls(invoice),
    });
  } catch (err) {
    if (err instanceof QPayError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Тодорхойгүй алдаа" },
      { status: 500 },
    );
  }
}
