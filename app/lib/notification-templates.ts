export type NotificationEvent = "shipment_created" | "status_changed" | "delivered";

export type NotificationShipment = {
  id: number;
  tracking_number: string;
  client_name: string;
  client_email?: string | null;
  receiver_name?: string | null;
  receiver_email?: string | null;
  receiver_phone?: string | null;
  destination_country: string;
  current_location?: string | null;
  shipment_status?: string | null;
  estimated_delivery?: string | null;
};

function safe(value: string | null | undefined) {
  return value?.trim() || "Not available";
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function buildNotificationTemplate(event: NotificationEvent, shipment: NotificationShipment) {
  const name = safe(shipment.receiver_name ?? shipment.client_name);
  const status = safe(shipment.shipment_status);
  const location = safe(shipment.current_location);
  const delivery = safe(shipment.estimated_delivery);
  const copy = event === "shipment_created"
    ? {
        subject: `Shipment created - ${shipment.tracking_number}`,
        heading: "Your shipment has been created",
        intro: `Hello ${name}, your Balo Logistics shipment is now registered and ready for processing.`,
      }
    : event === "delivered"
      ? {
          subject: `Shipment delivered - ${shipment.tracking_number}`,
          heading: "Your shipment has been delivered",
          intro: `Hello ${name}, your Balo Logistics shipment has been delivered successfully.`,
        }
      : {
          subject: `Shipment update - ${shipment.tracking_number}`,
          heading: "Your shipment status has changed",
          intro: `Hello ${name}, there is a new update for your Balo Logistics shipment.`,
        };

  const text = `${copy.intro}\n\nTracking Number: ${shipment.tracking_number}\nStatus: ${status}\nCurrent Location: ${location}\nDestination: ${shipment.destination_country}\nEstimated Delivery: ${delivery}\n\nThank you for choosing Balo Logistics.`;
  const html = `<div style="margin:0;background:#f1f5f9;padding:32px;font-family:Arial,sans-serif;color:#071a33"><div style="max-width:620px;margin:auto;background:white;border-radius:18px;overflow:hidden;box-shadow:0 12px 35px rgba(15,23,42,.12)"><div style="background:#071a33;padding:26px 30px;color:white"><div style="font-size:20px;font-weight:800">BALO LOGISTICS</div><div style="margin-top:5px;color:#bfdbfe;font-size:11px;letter-spacing:2px">FAST · SECURE · RELIABLE</div></div><div style="padding:30px"><div style="color:#2563eb;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">Shipment notification</div><h1 style="font-size:26px;line-height:1.2;margin:10px 0 14px">${escapeHtml(copy.heading)}</h1><p style="color:#475569;line-height:1.7">${escapeHtml(copy.intro)}</p><div style="margin-top:24px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:20px"><p><strong>Tracking Number:</strong> ${escapeHtml(shipment.tracking_number)}</p><p><strong>Status:</strong> ${escapeHtml(status)}</p><p><strong>Current Location:</strong> ${escapeHtml(location)}</p><p><strong>Destination:</strong> ${escapeHtml(shipment.destination_country)}</p><p><strong>Estimated Delivery:</strong> ${escapeHtml(delivery)}</p></div><p style="margin-top:24px;color:#64748b;font-size:13px">Thank you for choosing Balo Logistics.</p></div></div></div>`;
  const whatsapp = `*Balo Logistics*\n${copy.heading}\n\nTracking: *${shipment.tracking_number}*\nStatus: ${status}\nCurrent location: ${location}\nDestination: ${shipment.destination_country}\nEstimated delivery: ${delivery}\n\nThank you for choosing Balo Logistics.`;
  return { ...copy, text, html, whatsapp };
}
