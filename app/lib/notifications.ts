import type { NotificationEvent } from "./notification-templates";

export async function sendAutomaticNotification(shipmentId: number, eventType: NotificationEvent) {
  const response = await fetch("/api/notifications/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shipmentId, eventType }),
  });
  return response.json() as Promise<{ status?: string; error?: string }>;
}
