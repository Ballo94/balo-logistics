import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { buildNotificationTemplate, NotificationEvent, NotificationShipment } from "../../../lib/notification-templates";
import { sendWithProvider } from "../../../lib/notification-providers";

type NotificationRecord = {
  id: string;
  shipment_id: number;
  event_type: NotificationEvent;
  recipient: string | null;
  attempts: number;
  channel?: "email" | "sms" | "whatsapp" | "push";
  subject?: string | null;
  message?: string;
  html_message?: string | null;
  status?: string;
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json() as { shipmentId?: number; eventType?: NotificationEvent; retryId?: string; notificationId?: string };
  let notification: NotificationRecord | null = null;
  let shipmentId = body.shipmentId;
  let eventType = body.eventType;

  if (body.retryId || body.notificationId) {
    const id = body.retryId || body.notificationId;
    const { data, error } = await supabase.from("notification_history").select("id, shipment_id, event_type, recipient, attempts, channel, subject, message, html_message, status").eq("id", id).single();
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
    if (["Sent", "Delivered"].includes(notification.status ?? "") && !body.retryId) return NextResponse.json({ error: "This notification has already been sent." }, { status: 409 });
    await supabase.from("notification_history").update({ status: "Processing", error_message: null, attempts: notification.attempts + 1, updated_at: new Date().toISOString() }).eq("id", notification.id);
  } else {
    const { data, error } = await supabase.from("notification_history").insert({ shipment_id: shipmentId, channel: "email", event_type: eventType, recipient, subject: template.subject, message: template.text, status: "Pending" }).select("id, shipment_id, event_type, recipient, attempts").single();
    if (error || !data) return NextResponse.json({ error: error?.message ?? "Unable to create notification" }, { status: 500 });
    notification = data as NotificationRecord;
  }

  if (!recipient) return fail(supabase, notification.id, "No customer or receiver email is available.");
  const result = await sendWithProvider({ channel: notification.channel ?? "email", recipient, subject: notification.subject || template.subject, text: notification.message || template.text, html: notification.html_message || template.html });
  const now = new Date().toISOString();
  await supabase.from("notification_history").update({ status: result.status, provider_id: result.providerId ?? null, sent_at: result.status === "Sent" ? now : null, error_message: result.error ?? null, updated_at: now }).eq("id", notification.id);
  return NextResponse.json({ status: result.status, error: result.error, id: notification.id }, { status: result.status === "Failed" ? 502 : 200 });
}

async function fail(supabase: ReturnType<typeof createServerClient>, id: string, message: string) {
  await supabase.from("notification_history").update({ status: "Failed", error_message: message, updated_at: new Date().toISOString() }).eq("id", id);
  return NextResponse.json({ status: "Failed", error: message, id });
}
