import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildNotificationTemplate, NotificationEvent, NotificationShipment } from "../../../lib/notification-templates";

type NotificationRecord = {
  id: string;
  shipment_id: number;
  event_type: NotificationEvent;
  recipient: string | null;
  attempts: number;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { shipmentId?: number; eventType?: NotificationEvent; retryId?: string };
  let notification: NotificationRecord | null = null;
  let shipmentId = body.shipmentId;
  let eventType = body.eventType;

  if (body.retryId) {
    const { data, error } = await supabase.from("notification_history").select("id, shipment_id, event_type, recipient, attempts").eq("id", body.retryId).single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Notification not found" }, { status: 404 });
    notification = data as NotificationRecord;
    shipmentId = notification.shipment_id;
    eventType = notification.event_type;
  }

  if (!shipmentId || !eventType) return NextResponse.json({ error: "Shipment and event type are required" }, { status: 400 });
  const { data: shipmentData, error: shipmentError } = await supabase.from("shipments").select("*").eq("id", shipmentId).single();
  if (shipmentError || !shipmentData) return NextResponse.json({ error: shipmentError?.message ?? "Shipment not found" }, { status: 404 });
  const shipment = shipmentData as NotificationShipment;
  const template = buildNotificationTemplate(eventType, shipment);
  const recipient = notification?.recipient || shipment.receiver_email || shipment.client_email || null;

  if (notification) {
    await supabase.from("notification_history").update({ status: "Pending", error_message: null, attempts: notification.attempts + 1 }).eq("id", notification.id);
  } else {
    const { data, error } = await supabase.from("notification_history").insert({ shipment_id: shipmentId, channel: "email", event_type: eventType, recipient, subject: template.subject, message: template.text, status: "Pending" }).select("id, shipment_id, event_type, recipient, attempts").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Unable to create notification" }, { status: 500 });
    notification = data as NotificationRecord;
  }

  if (!recipient) return fail(supabase, notification.id, "No customer or receiver email is available.");
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BALO_NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) return fail(supabase, notification.id, "Email provider is not configured.");

  try {
    const providerResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [recipient], subject: template.subject, html: template.html, text: template.text }),
    });
    const providerData = await providerResponse.json() as { id?: string; message?: string };
    if (!providerResponse.ok) return fail(supabase, notification.id, providerData.message || "Email provider rejected the message.");
    await supabase.from("notification_history").update({ status: "Sent", provider_id: providerData.id ?? null, sent_at: new Date().toISOString(), error_message: null }).eq("id", notification.id);
    return NextResponse.json({ status: "Sent", id: notification.id });
  } catch (error) {
    return fail(supabase, notification.id, error instanceof Error ? error.message : "Email delivery failed.");
  }
}

async function fail(supabase: ReturnType<typeof createServerClient>, id: string, message: string) {
  await supabase.from("notification_history").update({ status: "Failed", error_message: message }).eq("id", id);
  return NextResponse.json({ status: "Failed", error: message, id });
}
