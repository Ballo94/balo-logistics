import { supabase } from "./supabase";

export const COMMUNICATION_TYPES = ["Information", "Delay", "Customs", "Payment", "Arrival", "Delivery", "Warning", "Success"] as const;
export type CommunicationType = (typeof COMMUNICATION_TYPES)[number];
export type ShipmentCommunication = { id: number; shipment_id?: number; title: string; message: string; type: CommunicationType; created_at: string; created_by?: string | null; visible_to_customer: boolean; viewed_at?: string | null };

const ADMIN_COLUMNS = "id, shipment_id, title, message, type, created_at, created_by, visible_to_customer, viewed_at";
export function loadAdminCommunications(shipmentId: number) { return supabase.from("shipment_communications").select(ADMIN_COLUMNS).eq("shipment_id", shipmentId).order("created_at", { ascending: false }).order("id", { ascending: false }); }
export function loadPublicCommunications(trackingNumber: string) { return supabase.rpc("get_public_shipment_communications", { target_tracking_number: trackingNumber }); }
export function markCommunicationsViewed(trackingNumber: string) { return supabase.rpc("mark_shipment_communications_viewed", { target_tracking_number: trackingNumber }); }
