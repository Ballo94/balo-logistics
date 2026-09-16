import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isVerifiedAdminUser } from "../../../../lib/admin-authorization";
import { createSupabaseAdminClient } from "../../../../lib/supabase-admin";
import { resolveCustomerPhone } from "../../../../lib/phone-normalization";
import { isTwilioWhatsAppConfigured, sendTwilioWhatsApp } from "../../../../lib/twilio-whatsapp";

type SendBody = { shipmentId?: number; communicationId?: number | null; title?: string; message?: string; type?: string };

export async function GET() {
  const cookieStore = await cookies();
  const authClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => cookieStore.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isVerifiedAdminUser(user, process.env.BALO_ADMIN_EMAIL)) return NextResponse.json({ error: "Verified administrator access required" }, { status: 403 });

  return NextResponse.json({ configured: isTwilioWhatsAppConfigured() });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const authClient = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => cookieStore.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isVerifiedAdminUser(user, process.env.BALO_ADMIN_EMAIL)) return NextResponse.json({ error: "Verified administrator access required" }, { status: 403 });

  const body = await request.json() as SendBody;
  const shipmentId = Number(body.shipmentId);
  const message = body.message?.trim() || "";
  const title = body.title?.trim() || "WhatsApp shipment update";
  if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0 || !message) return NextResponse.json({ error: "Shipment and message are required." }, { status: 400 });
  if (message.length > 4096) return NextResponse.json({ error: "WhatsApp message must be 4,096 characters or fewer." }, { status: 400 });

  const supabase = createSupabaseAdminClient();
  const { data: shipment, error: shipmentError } = await supabase.from("shipments").select("id,tracking_number,receiver_name,receiver_phone,receiver_email").eq("id", shipmentId).maybeSingle();
  if (shipmentError || !shipment) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });

  let assignedCustomerPhone: string | null = null;
  const { data: assignment } = await supabase.from("customer_shipment_assignments").select("user_id").eq("shipment_id", shipment.id).limit(1).maybeSingle();
  if (assignment?.user_id) {
    const { data: profile } = await supabase.from("customer_profiles").select("phone").eq("user_id", assignment.user_id).maybeSingle();
    assignedCustomerPhone = profile?.phone ?? null;
  }
  const recipient = resolveCustomerPhone(shipment.receiver_phone, assignedCustomerPhone);
  if (!recipient.ok) return NextResponse.json({ error: recipient.error }, { status: 400 });

  let communicationId = body.communicationId ? Number(body.communicationId) : null;
  let createdCommunication = false;
  if (communicationId) {
    const { data: existing } = await supabase.from("shipment_communications").select("id,shipment_id,visible_to_customer").eq("id", communicationId).maybeSingle();
    if (!existing || existing.shipment_id !== shipment.id) return NextResponse.json({ error: "Communication does not belong to this shipment." }, { status: 409 });
    if (!existing.visible_to_customer) return NextResponse.json({ error: "Make the communication customer-visible before sending it by WhatsApp." }, { status: 409 });
    const { error } = await supabase.from("shipment_communications").update({ title, message, type: validCommunicationType(body.type) }).eq("id", communicationId).eq("shipment_id", shipment.id);
    if (error) return NextResponse.json({ error: "Unable to update the customer communication." }, { status: 500 });
  } else {
    const { data: created, error } = await supabase.from("shipment_communications").insert({ shipment_id: shipment.id, title, message, type: validCommunicationType(body.type), created_by: user.id, visible_to_customer: true }).select("id").single();
    if (error || !created) return NextResponse.json({ error: "Unable to create the customer communication." }, { status: 500 });
    communicationId = created.id;
    createdCommunication = true;
  }

  const now = new Date().toISOString();
  const { data: audit, error: auditError } = await supabase.from("notification_history").insert({ shipment_id: shipment.id, communication_id: communicationId, channel: "whatsapp", event_type: "manual", notification_type: "Customer Communication", category: validCommunicationType(body.type), recipient: recipient.e164, recipient_normalized: recipient.e164, subject: title, message, status: "Processing", delivery_mode: "Send Now", source: "shipment_communications", provider: "twilio", provider_status: "submitting", attempts: 1, created_by: user.id, customer_visible: true, updated_at: now }).select("id").single();
  if (auditError || !audit) {
    if (createdCommunication) await supabase.from("shipment_communications").delete().eq("id", communicationId).eq("shipment_id", shipment.id);
    return NextResponse.json({ error: "Unable to create the WhatsApp delivery audit." }, { status: 500 });
  }

  const callbackUrl = statusCallbackUrl();
  const result = await sendTwilioWhatsApp({ recipientE164: recipient.e164, message, statusCallbackUrl: callbackUrl });
  const sentAt = result.status === "Sent" ? now : null;
  await supabase.from("notification_history").update({ status: result.status, provider_id: result.providerId ?? null, provider_status: result.providerStatus ?? null, error_message: result.error ?? null, sent_at: sentAt, failed_at: result.status === "Failed" ? now : null, updated_at: now }).eq("id", audit.id);
  const httpStatus = result.status === "Provider Not Configured" ? 503 : result.status === "Failed" ? 502 : 200;
  return NextResponse.json({ id: audit.id, communicationId, status: result.status, error: result.error }, { status: httpStatus });
}

function validCommunicationType(value: string | undefined) {
  return ["Information", "Delay", "Customs", "Payment", "Arrival", "Delivery", "Warning", "Success"].includes(value || "") ? value : "Information";
}

function statusCallbackUrl() {
  const configured = process.env.TWILIO_STATUS_CALLBACK_URL?.trim();
  if (configured) return configured;
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (!site || !/^https:\/\//i.test(site) || /localhost|127\.0\.0\.1/i.test(site)) return null;
  return `${site}/api/communications/whatsapp/status`;
}
