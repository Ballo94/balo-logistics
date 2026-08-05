"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { buildNotificationTemplate, NotificationEvent, NotificationShipment } from "../lib/notification-templates";
import { supabase } from "../lib/supabase";

type NotificationRecord = {
  id: string;
  shipment_id: number;
  channel: "email" | "whatsapp";
  event_type: NotificationEvent | "manual";
  recipient: string | null;
  subject: string | null;
  message: string;
  status: "Sent" | "Failed" | "Pending";
  error_message: string | null;
  attempts: number;
  created_at: string;
  sent_at: string | null;
};

function notificationStyle(status: NotificationRecord["status"]) {
  if (status === "Sent") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (status === "Failed") return "bg-red-50 text-red-700 ring-red-600/20";
  return "bg-amber-50 text-amber-700 ring-amber-600/20";
}

export default function NotificationCenter({ shipments }: { shipments: NotificationShipment[] }) {
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState("");
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    const { data, error: loadError } = await supabase.from("notification_history").select("*").order("created_at", { ascending: false }).limit(100);
    if (loadError) setError(loadError.message);
    else {
      setNotifications((data ?? []) as NotificationRecord[]);
      setError("");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void supabase.from("notification_history").select("*").order("created_at", { ascending: false }).limit(100).then(({ data, error: loadError }) => {
      if (loadError) setError(loadError.message);
      else setNotifications((data ?? []) as NotificationRecord[]);
      setLoading(false);
    });
  }, []);

  const shipmentById = useMemo(() => new Map(shipments.map((shipment) => [shipment.id, shipment])), [shipments]);
  const selectedShipment = shipmentById.get(Number(selectedShipmentId));
  const counts = {
    total: notifications.length,
    sent: notifications.filter((item) => item.status === "Sent").length,
    failed: notifications.filter((item) => item.status === "Failed").length,
    pending: notifications.filter((item) => item.status === "Pending").length,
  };

  async function retry(notification: NotificationRecord) {
    setWorking(notification.id);
    setError("");
    const response = await fetch("/api/notifications/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ retryId: notification.id }) });
    const result = await response.json() as { error?: string };
    if (!response.ok) setError(result.error ?? "Unable to retry notification.");
    await loadNotifications();
    setWorking("");
  }

  async function sendWhatsApp(eventType: NotificationEvent) {
    if (!selectedShipment) return;
    const phone = selectedShipment.receiver_phone?.replace(/\D/g, "");
    if (!phone) {
      setError("The selected shipment does not have a receiver phone number.");
      return;
    }
    setWorking("whatsapp");
    setError("");
    const template = buildNotificationTemplate(eventType, selectedShipment);
    const { error: historyError } = await supabase.from("notification_history").insert({
      shipment_id: selectedShipment.id,
      channel: "whatsapp",
      event_type: eventType,
      recipient: phone,
      subject: template.heading,
      message: template.whatsapp,
      status: "Sent",
      sent_at: new Date().toISOString(),
    });
    if (historyError) {
      setError(historyError.message);
      setWorking("");
      return;
    }
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(template.whatsapp)}`, "_blank", "noopener,noreferrer");
    await loadNotifications();
    setWorking("");
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">Customer communications</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight">Notification Center</h2><p className="mt-2 text-sm text-slate-500">Monitor automated email delivery and send customer-ready WhatsApp updates.</p></div>
        <button type="button" onClick={() => void loadNotifications()} className="self-start rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold hover:border-blue-300 hover:text-blue-700">Refresh history</button>
      </div>

      <div className="grid gap-px border-b border-slate-100 bg-slate-100 sm:grid-cols-4">
        {[{ label: "All notifications", value: counts.total }, { label: "Sent", value: counts.sent }, { label: "Failed", value: counts.failed }, { label: "Pending", value: counts.pending }].map((item) => <div key={item.label} className="bg-white px-5 py-4"><p className="text-2xl font-black">{item.value}</p><p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-400">{item.label}</p></div>)}
      </div>

      <div className="border-b border-slate-100 bg-slate-50/70 p-5 sm:p-6">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end">
          <label className="min-w-0 flex-1"><span className="mb-1.5 block text-xs font-bold text-slate-600">WhatsApp shipment</span><select value={selectedShipmentId} onChange={(event) => setSelectedShipmentId(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"><option value="">Select a shipment...</option>{shipments.map((shipment) => <option key={shipment.id} value={shipment.id}>{shipment.tracking_number} - {shipment.client_name}</option>)}</select></label>
          <button type="button" disabled={!selectedShipment || working === "whatsapp"} onClick={() => void sendWhatsApp("status_changed")} className="h-11 rounded-xl bg-emerald-600 px-5 text-sm font-extrabold text-white hover:bg-emerald-700 disabled:opacity-40">{working === "whatsapp" ? "Opening WhatsApp..." : "Send status update"}</button>
          <button type="button" disabled={!selectedShipment || working === "whatsapp"} onClick={() => void sendWhatsApp("delivered")} className="h-11 rounded-xl border border-emerald-200 bg-white px-5 text-sm font-extrabold text-emerald-700 hover:bg-emerald-50 disabled:opacity-40">Send delivery message</button>
        </div>
        {selectedShipment && !selectedShipment.receiver_phone && <p className="mt-2 text-xs font-semibold text-amber-700">Add a receiver phone number to enable WhatsApp.</p>}
      </div>

      {error && <p role="alert" className="mx-5 mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:mx-6">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="bg-[#071a33] text-xs uppercase tracking-wider text-blue-100"><tr>{["Shipment", "Channel", "Event", "Recipient", "Status", "Created", "Attempts", "Action"].map((label) => <th key={label} className="px-5 py-4 font-extrabold">{label}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{loading ? <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-500">Loading notifications...</td></tr> : notifications.length ? notifications.map((item) => <tr key={item.id} className="hover:bg-blue-50/30"><td className="px-5 py-4 font-extrabold text-blue-700">{shipmentById.get(item.shipment_id)?.tracking_number ?? `#${item.shipment_id}`}</td><td className="px-5 py-4 font-semibold capitalize">{item.channel}</td><td className="px-5 py-4 text-slate-600">{item.event_type.replaceAll("_", " ")}</td><td className="max-w-52 truncate px-5 py-4 text-slate-600" title={item.recipient ?? ""}>{item.recipient ?? "—"}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${notificationStyle(item.status)}`}>{item.status}</span>{item.error_message && <p className="mt-1 max-w-48 text-xs text-red-600" title={item.error_message}>{item.error_message}</p>}</td><td className="px-5 py-4 text-slate-600">{new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(item.created_at))}</td><td className="px-5 py-4 text-center font-bold">{item.attempts}</td><td className="px-5 py-4">{item.status === "Failed" && item.channel === "email" ? <button type="button" disabled={working === item.id} onClick={() => void retry(item)} className="rounded-lg bg-red-50 px-3 py-2 text-xs font-extrabold text-red-700 hover:bg-red-100 disabled:opacity-50">{working === item.id ? "Retrying..." : "Retry"}</button> : <span className="text-xs text-slate-400">—</span>}</td></tr>) : <tr><td colSpan={8} className="px-5 py-14 text-center text-slate-500">No notifications have been recorded yet.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  );
}
