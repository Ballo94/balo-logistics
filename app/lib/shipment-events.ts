import { supabase } from "./supabase";

export const SHIPMENT_EVENT_TYPES = [
  "Shipment Created",
  "Shipment Collected",
  "Warehouse Arrival",
  "Warehouse Departure",
  "Customs Clearance",
  "Flight Departure",
  "Flight Arrival",
  "Sea Departure",
  "Sea Arrival",
  "Local Distribution",
  "Out For Delivery",
  "Delivered",
  "Delayed",
  "Exception",
  "Returned",
] as const;

export type ShipmentEventType = (typeof SHIPMENT_EVENT_TYPES)[number];
export type ShipmentEvent = {
  id: number;
  shipment_id: number;
  title: string;
  description: string | null;
  country: string;
  city: string;
  event_type: ShipmentEventType;
  event_time: string;
  created_at: string;
};

export type ShipmentEventInput = Omit<ShipmentEvent, "id" | "created_at">;

const EVENT_COLUMNS = "id, shipment_id, title, description, country, city, event_type, event_time, created_at";

export function loadShipmentEvents(shipmentId: number) {
  return supabase.from("shipment_events").select(EVENT_COLUMNS).eq("shipment_id", shipmentId).order("event_time", { ascending: false }).order("id", { ascending: false });
}

export function createShipmentEvent(input: ShipmentEventInput) {
  return supabase.from("shipment_events").insert(input).select(EVENT_COLUMNS).single();
}

export function updateShipmentEvent(id: number, input: Omit<ShipmentEventInput, "shipment_id">) {
  return supabase.from("shipment_events").update(input).eq("id", id).select(EVENT_COLUMNS).single();
}

export function deleteShipmentEvent(id: number) {
  return supabase.from("shipment_events").delete().eq("id", id);
}
