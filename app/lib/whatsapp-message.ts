import { buildSmartCommunicationTemplate, COMMUNICATION_UPDATE_TYPES, inferCommunicationUpdateType, type CommunicationUpdateType } from "./communication-template-engine";

export { publicTrackingUrl } from "./communication-template-engine";

export const WHATSAPP_MESSAGE_TYPES = COMMUNICATION_UPDATE_TYPES;
export type WhatsAppMessageType = CommunicationUpdateType;

export type WhatsAppShipmentContext = {
  receiverName?: string | null;
  trackingNumber: string;
  shipmentStatus?: string | null;
  currentCheckpoint?: string | null;
  currentLocation?: string | null;
  transportMode?: string | null;
  estimatedDelivery?: string | null;
  trackingUrl?: string | null;
};

export function buildWhatsAppMessage(type: WhatsAppMessageType, context: WhatsAppShipmentContext) {
  return buildSmartCommunicationTemplate(type, context).whatsappMessage;
}

export function inferWhatsAppMessageType(status: string | null | undefined): WhatsAppMessageType {
  return inferCommunicationUpdateType(status);
}
