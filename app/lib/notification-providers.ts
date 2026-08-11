import "server-only";
import type { NotificationChannel } from "./notification-types";

export type ProviderMessage = { channel: NotificationChannel; recipient: string; subject: string; text: string; html?: string | null };
export type ProviderResult = { status: "Sent" | "Failed" | "Provider Not Configured"; providerId?: string; error?: string };

async function sendEmail(message: ProviderMessage): Promise<ProviderResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BALO_NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) return { status: "Provider Not Configured", error: "Email provider is not configured." };
  try {
    const response = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ from, to: [message.recipient], subject: message.subject, text: message.text, html: message.html || brandedEmail(message.subject, message.text) }) });
    const result = await response.json() as { id?: string; message?: string };
    return response.ok ? { status: "Sent", providerId: result.id } : { status: "Failed", error: result.message || "Email provider rejected the message." };
  } catch (error) { return { status: "Failed", error: error instanceof Error ? error.message : "Email delivery failed." }; }
}

export async function sendWithProvider(message: ProviderMessage): Promise<ProviderResult> {
  if (message.channel === "email") return sendEmail(message);
  return { status: "Provider Not Configured", error: `${message.channel.toUpperCase()} provider is not configured.` };
}

function brandedEmail(subject: string, text: string) {
  const safe = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
  const trackingUrl = `${process.env.NEXT_PUBLIC_SITE_URL || "https://balo-logistics.vercel.app"}/track`;
  const support = process.env.BALO_SUPPORT_EMAIL || "Balo Logistics Customer Care";
  return `<div style="background:#f4f7fb;padding:28px;font-family:Arial,sans-serif;color:#071a33"><div style="max-width:620px;margin:auto;overflow:hidden;border-radius:18px;background:#fff;box-shadow:0 14px 40px rgba(7,26,51,.12)"><div style="background:#071a33;padding:24px 28px;color:#fff"><strong style="font-size:20px">BALO LOGISTICS</strong><div style="margin-top:5px;color:#facc15;font-size:11px;letter-spacing:2px">FAST · SECURE · RELIABLE</div></div><div style="padding:28px"><h1 style="font-size:24px;margin:0 0 16px">${safe(subject)}</h1><div style="white-space:pre-line;line-height:1.7;color:#475569">${safe(text)}</div><a href="${safe(trackingUrl)}" style="display:inline-block;margin-top:22px;border-radius:10px;background:#2563eb;padding:12px 20px;color:#fff;text-decoration:none;font-weight:700">Track Shipment</a><div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px;font-size:12px;color:#64748b">This is an automated Balo Logistics shipment update. Support: ${safe(support)}</div></div></div></div>`;
}
