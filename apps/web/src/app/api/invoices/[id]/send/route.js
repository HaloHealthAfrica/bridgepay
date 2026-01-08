import { auth } from "@/auth";
import { startRequest } from "@/app/api/utils/logger";
import sql from "@/app/api/utils/sql";
import { sendInvoiceNotification } from "@apps-lib/notifications/service.js";
import { isEmailConfigured } from "@apps-lib/notifications/email.js";

function isPrivileged(role) {
  return role === "admin" || role === "merchant";
}

export async function POST(request, { params: { id } }) {
  const reqMeta = startRequest({ request, route: "/api/invoices/[id]/send" });
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return Response.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: reqMeta.header() },
      );
    }
    let role = session.user.role;
    if (!role) {
      try {
        const r =
          await sql`SELECT role FROM auth_users WHERE id = ${session.user.id} LIMIT 1`;
        role = r?.[0]?.role;
      } catch {}
    }
    if (!isPrivileged(role)) {
      return Response.json(
        { ok: false, error: "forbidden" },
        { status: 403, headers: reqMeta.header() },
      );
    }

    // Check if email is configured
    if (!isEmailConfigured()) {
      return Response.json(
        { ok: false, error: "email_not_configured", reason: "RESEND_API_KEY not set" },
        { headers: reqMeta.header() },
      );
    }

    // Fetch invoice details
    const invoiceRows = await sql(
      `SELECT id, customer_email, customer_name, total, currency, due_date, status
       FROM invoices WHERE id = $1 LIMIT 1`,
      [Number(id)]
    );

    if (!invoiceRows || !invoiceRows[0]) {
      return Response.json(
        { ok: false, error: "not_found" },
        { status: 404, headers: reqMeta.header() },
      );
    }

    const invoice = invoiceRows[0];

    if (!invoice.customer_email) {
      return Response.json(
        { ok: false, error: "no_email", message: "Invoice has no customer email" },
        { status: 400, headers: reqMeta.header() },
      );
    }

    // Get merchant name
    const userRows = await sql(
      `SELECT name, email FROM auth_users WHERE id = $1 LIMIT 1`,
      [session.user.id]
    );
    const merchantName = userRows?.[0]?.name || userRows?.[0]?.email || "Bridge";

    // Generate invoice URL
    const invoiceUrl = `${process.env.APP_URL || "http://localhost:4000"}/i/${id}`;

    // Queue email notification
    const job = await sendInvoiceNotification({
      invoiceId: String(id),
      customerEmail: invoice.customer_email,
      customerName: invoice.customer_name,
      merchantName,
      amount: Number(invoice.total || 0),
      currency: invoice.currency || "KES",
      invoiceUrl,
      dueDate: invoice.due_date,
    });

    // Update invoice status to 'sent'
    await sql(
      `UPDATE invoices SET status = 'sent', updated_at = NOW() WHERE id = $1`,
      [Number(id)]
    );

    return Response.json(
      { 
        ok: true, 
        message: "Invoice email queued",
        jobId: job.id,
      },
      { headers: reqMeta.header() },
    );
  } catch (e) {
    console.error("[Invoice Send] Error:", e);
    return Response.json(
      { ok: false, error: e?.message || "unknown_error" },
      { status: 500 },
    );
  }
}
