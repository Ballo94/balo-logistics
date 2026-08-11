export const NOTIFICATION_TYPES = ["Shipment Created", "Shipment Collected", "In Warehouse", "In Transit", "Customs Inspection", "Customs Cleared", "Delay Reported", "ETA Changed", "Route Updated", "Shipment Event Added", "Communication Published", "Customer Document Published", "Out for Delivery", "Delivered", "Exception", "Returned", "Cancelled"] as const;
export const NOTIFICATION_CATEGORIES = ["Information", "Delay", "Customs", "Payment", "Arrival", "Delivery", "Warning", "Success", "Exception", "Route", "Document", "Event"] as const;
export const NOTIFICATION_CHANNELS = ["email", "sms", "whatsapp", "push"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export type NotificationStatus = "Draft" | "Pending" | "Scheduled" | "Processing" | "Sent" | "Delivered" | "Failed" | "Cancelled" | "Provider Not Configured";

export type SmartNotification = {
  id: string; shipment_id: number; notification_type: string; category: string;
  channel: NotificationChannel; recipient: string | null; subject: string | null; message: string;
  status: NotificationStatus; delivery_mode: "Send Now" | "Schedule" | "Save Only";
  scheduled_at: string | null; created_at: string; sent_at: string | null; read_at: string | null;
  error_message: string | null; attempts: number; batch_event_count: number; source: string;
};

export function categoryTone(category: string) {
  if (["Success", "Delivery"].includes(category)) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (["Warning", "Exception"].includes(category)) return "border-red-200 bg-red-50 text-red-800";
  if (category === "Delay") return "border-orange-200 bg-orange-50 text-orange-800";
  if (category === "Customs") return "border-purple-200 bg-purple-50 text-purple-800";
  return "border-blue-200 bg-blue-50 text-blue-800";
}
