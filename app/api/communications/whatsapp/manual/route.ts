import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isVerifiedAdminUser } from "../../../../lib/admin-authorization";
import { buildManualWhatsAppUrl, resolveCustomerPhone } from "../../../../lib/phone-normalization";
import { createSupabaseAdminClient } from "../../../../lib/supabase-admin";

type ManualHandoffBody = {
  shipmentId?: number;
  communicationId?: number | null;
  title?: string;
  message?: string;
  type?: string;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  );
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isVerifiedAdminUser(user, process.env.BALO_ADMIN_EMAIL)) {
    return NextResponse.json({ error: "Verified administrator access required" }, { status: 403 });
  }

  const body = await request.json() as ManualHandoffBody;
  const shipmentId = Number(body.shipmentId);
  const title = body.title?.trim() || "WhatsApp shipment update";
  const message = body.message?.trim() || "";
  if (!Number.isSafeInteger(shipmentId) || shipmentId <= 0 || !message) {
    return NextResponse.json({ error: "Shipment and message are required." }, { status: 400 });
  }
  if (message.length > 4096) {
    return NextResponse.json({ error: "WhatsApp message must be 4,096 characters or fewer." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data: shipment, error: shipmentError } = await supabase
    .from("shipments")
    .select("id,receiver_phone")
    .eq("id", shipmentId)
    .maybeSingle();
  if (shipmentError || !shipment) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });

  let assignedCustomerPhone: string | null = null;
  const { data: assignment } = await supabase
    .from("customer_shipment_assignments")
    .select("user_id")
    .eq("shipment_id", shipment.id)
    .limit(1)
    .maybeSingle();
  if (assignment?.user_id) {
    const { data: profile } = await supabase
      .from("customer_profiles")
      .select("phone")
      .eq("user_id", assignment.user_id)
      .maybeSingle();
    assignedCustomerPhone = profile?.phone ?? null;
  }
  const recipient = resolveCustomerPhone(shipment.receiver_phone, assignedCustomerPhone);
  if (!recipient.ok) return NextResponse.json({ error: recipient.error }, { status: 400 });

  let communicationId = body.communicationId ? Number(body.communicationId) : null;
  let createdCommunication = false;
  if (communicationId) {
    const { data: existing } = await supabase
      .from("shipment_communications")
      .select("id,shipment_id,visible_to_customer")
      .eq("id", communicationId)
      .maybeSingle();
    if (!existing || existing.shipment_id !== shipment.id) {
      return NextResponse.json({ error: "Communication does not belong to this shipment." }, { status: 409 });
    }
    if (!existing.visible_to_customer) {
      return NextResponse.json({ error: "Make the communication customer-visible before opening it in WhatsApp." }, { status: 409 });
    }
    const { error } = await supabase
      .from("shipment_communications")
      .update({ title, message, type: validCommunicationType(body.type) })
      .eq("id", communicationId)
      .eq("shipment_id", shipment.id);
    if (error) return NextResponse.json({ error: "Unable to update the customer communication." }, { status: 500 });
  } else {
    const { data: created, error } = await supabase
      .from("shipment_communications")
      .insert({
        shipment_id: shipment.id,
        title,
        message,
        type: validCommunicationType(body.type),
        created_by: user.id,
        visible_to_customer: true,
      })
      .select("id")
      .single();
    if (error || !created) return NextResponse.json({ error: "Unable to create the customer communication." }, { status: 500 });
    communicationId = created.id;
    createdCommunication = true;
  }

  const now = new Date().toISOString();
  const { error: auditError } = await supabase.from("notification_history").insert({
    shipment_id: shipment.id,
    communication_id: communicationId,
    channel: "whatsapp",
    event_type: "manual",
    notification_type: "Customer Communication",
    category: validCommunicationType(body.type),
    recipient: recipient.e164,
    recipient_normalized: recipient.e164,
    subject: title,
    message,
    status: "Draft",
    delivery_mode: "Save Only",
    source: "manual_whatsapp_open",
    provider: null,
    provider_status: null,
    attempts: 0,
    created_by: user.id,
    customer_visible: false,
    updated_at: now,
  });
  if (auditError) {
    if (createdCommunication) {
      await supabase.from("shipment_communications").delete().eq("id", communicationId).eq("shipment_id", shipment.id);
    }
    return NextResponse.json({ error: "Unable to record the manual WhatsApp handoff." }, { status: 500 });
  }

  const whatsappUrl = buildManualWhatsAppUrl(recipient.e164, message);
  return NextResponse.json({ communicationId, whatsappUrl, status: "Manual handoff recorded" });
}

function validCommunicationType(value: string | undefined) {
  return ["Information", "Delay", "Customs", "Payment", "Arrival", "Delivery", "Warning", "Success"].includes(value || "") ? value : "Information";
}
