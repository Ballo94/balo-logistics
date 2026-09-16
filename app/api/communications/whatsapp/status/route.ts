import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "../../../../lib/supabase-admin";
import { mapTwilioStatus, validateTwilioSignature } from "../../../../lib/twilio-whatsapp";

export async function POST(request: Request) {
  const raw = await request.text();
  const parameters = new URLSearchParams(raw);
  const validationUrl = process.env.TWILIO_STATUS_CALLBACK_URL?.trim() || request.url;
  if (!validateTwilioSignature({ signature: request.headers.get("x-twilio-signature"), url: validationUrl, parameters })) return NextResponse.json({ error: "Invalid webhook signature." }, { status: 403 });

  const providerId = parameters.get("MessageSid");
  const providerStatus = parameters.get("MessageStatus") || "";
  if (!providerId || !providerStatus) return NextResponse.json({ error: "Missing provider message status." }, { status: 400 });
  const mapped = mapTwilioStatus(providerStatus);
  const now = new Date().toISOString();
  const supabase = createSupabaseAdminClient();
  const { data: existing } = await supabase.from("notification_history").select("id,status,sent_at,delivered_at,read_at").eq("provider", "twilio").eq("provider_id", providerId).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Delivery record not found." }, { status: 404 });
  const rank: Record<string, number> = { Processing: 0, Pending: 1, Sent: 2, Delivered: 3, Failed: 4 };
  const nextStatus = (rank[mapped.status] ?? 0) >= (rank[existing.status] ?? 0) ? mapped.status : existing.status;
  const update = {
    status: nextStatus,
    provider_status: providerStatus,
    sent_at: ["Sent", "Delivered"].includes(mapped.status) ? existing.sent_at ?? now : existing.sent_at,
    delivered_at: mapped.delivered ? existing.delivered_at ?? now : existing.delivered_at,
    read_at: mapped.read ? existing.read_at ?? now : existing.read_at,
    failed_at: mapped.status === "Failed" ? now : undefined,
    error_message: parameters.get("ErrorCode") || null,
    updated_at: now,
  };
  const { data, error } = await supabase.from("notification_history").update(update).eq("id", existing.id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Unable to update delivery status." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Delivery record not found." }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
