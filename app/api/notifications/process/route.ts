import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sendWithProvider } from "../../../lib/notification-providers";

export async function POST() {
  const cookieStore = await cookies();
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { cookies: { getAll: () => cookieStore.getAll(), setAll: (values) => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const configuredAdmin = process.env.BALO_ADMIN_EMAIL?.trim().toLowerCase();
  const isVerifiedAdmin = user.app_metadata?.role === "admin" || (configuredAdmin && user.email?.toLowerCase() === configuredAdmin);
  if (!isVerifiedAdmin) return NextResponse.json({ error: "Verified administrator access required" }, { status: 403 });
  const now = new Date().toISOString();
  const { data, error } = await supabase.from("notification_history").select("id,channel,recipient,subject,message,html_message,attempts").in("status", ["Pending", "Scheduled"]).lte("scheduled_at", now).order("scheduled_at").limit(25);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const results = [];
  for (const row of data ?? []) {
    await supabase.from("notification_history").update({ status: "Processing", attempts: row.attempts + 1, updated_at: now }).eq("id", row.id).in("status", ["Pending", "Scheduled"]);
    if (!row.recipient) { await supabase.from("notification_history").update({ status: "Failed", error_message: "No recipient is available.", updated_at: now }).eq("id", row.id); results.push({ id: row.id, status: "Failed" }); continue; }
    const result = await sendWithProvider({ channel: row.channel, recipient: row.recipient, subject: row.subject || "Balo Logistics shipment update", text: row.message, html: row.html_message });
    await supabase.from("notification_history").update({ status: result.status, provider_id: result.providerId ?? null, error_message: result.error ?? null, sent_at: result.status === "Sent" ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq("id", row.id);
    results.push({ id: row.id, status: result.status });
  }
  return NextResponse.json({ processed: results.length, results });
}
