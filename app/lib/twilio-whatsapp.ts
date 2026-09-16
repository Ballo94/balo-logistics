import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export type TwilioWhatsAppResult = {
  status: "Pending" | "Sent" | "Failed" | "Provider Not Configured";
  providerStatus?: string;
  providerId?: string;
  error?: string;
};

export function isTwilioWhatsAppConfigured() {
  return process.env.TWILIO_WHATSAPP_ENABLED === "true"
    && Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM);
}

export async function sendTwilioWhatsApp(input: { recipientE164: string; message: string; statusCallbackUrl?: string | null }): Promise<TwilioWhatsAppResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!isTwilioWhatsAppConfigured() || !accountSid || !authToken || !from) return { status: "Provider Not Configured", error: "WhatsApp provider is not configured." };

  const body = new URLSearchParams({ To: `whatsapp:${input.recipientE164}`, From: normalizeWhatsAppAddress(from), Body: input.message });
  if (input.statusCallbackUrl) body.set("StatusCallback", input.statusCallbackUrl);
  try {
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const result = await response.json() as { sid?: string; status?: string; message?: string; error_message?: string };
    if (!response.ok || !result.sid) return { status: "Failed", providerStatus: result.status, error: result.message || result.error_message || "WhatsApp provider rejected the message." };
    return { status: result.status === "sent" ? "Sent" : "Pending", providerStatus: result.status || "queued", providerId: result.sid };
  } catch (error) {
    return { status: "Failed", error: error instanceof Error ? error.message : "WhatsApp delivery failed." };
  }
}

export function validateTwilioSignature(input: { signature: string | null; url: string; parameters: URLSearchParams; authToken?: string }) {
  const token = input.authToken ?? process.env.TWILIO_AUTH_TOKEN;
  if (!token || !input.signature) return false;
  let payload = input.url;
  const keys = [...new Set(input.parameters.keys())].sort();
  for (const key of keys) for (const value of input.parameters.getAll(key).sort()) payload += key + value;
  const expected = createHmac("sha1", token).update(payload).digest("base64");
  const actualBuffer = Buffer.from(input.signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

function normalizeWhatsAppAddress(value: string) {
  return value.toLowerCase().startsWith("whatsapp:") ? value : `whatsapp:${value}`;
}

export function mapTwilioStatus(status: string) {
  const value = status.toLowerCase();
  if (value === "read") return { status: "Delivered", delivered: true, read: true } as const;
  if (value === "delivered") return { status: "Delivered", delivered: true, read: false } as const;
  if (value === "sent") return { status: "Sent", delivered: false, read: false } as const;
  if (["failed", "undelivered"].includes(value)) return { status: "Failed", delivered: false, read: false } as const;
  return { status: "Pending", delivered: false, read: false } as const;
}
