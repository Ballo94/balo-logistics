export type PhoneNormalizationResult =
  | { ok: true; e164: string }
  | { ok: false; error: string };

export function normalizeInternationalPhone(value: string | null | undefined): PhoneNormalizationResult {
  const original = value?.trim();
  if (!original) return { ok: false, error: "No customer phone number is available." };

  let normalized = original.replace(/^whatsapp:/i, "").trim();
  if (normalized.startsWith("00")) normalized = `+${normalized.slice(2)}`;
  if (!normalized.startsWith("+")) return { ok: false, error: "Use an international phone number beginning with + or 00." };

  const digits = normalized.slice(1).replace(/[\s().-]/g, "");
  if (!/^\d+$/.test(digits)) return { ok: false, error: "The customer phone number contains unsupported characters." };
  if (!/^[1-9]\d{6,14}$/.test(digits)) return { ok: false, error: "The customer phone number is not a valid E.164 international number." };
  return { ok: true, e164: `+${digits}` };
}

export function resolveCustomerPhone(receiverPhone: string | null | undefined, assignedCustomerPhone?: string | null): PhoneNormalizationResult {
  const primary = normalizeInternationalPhone(receiverPhone);
  if (primary.ok || receiverPhone?.trim()) return primary;
  return normalizeInternationalPhone(assignedCustomerPhone);
}

export function buildManualWhatsAppUrl(recipientE164: string, message: string) {
  return `https://wa.me/${recipientE164.replace(/^\+/, "")}?text=${encodeURIComponent(message)}`;
}
