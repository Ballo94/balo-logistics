import type { ShipmentCommunication } from "./shipment-communications";
import type { ShipmentDocument } from "./shipment-document-records";
import type { RouteJourney } from "./route-intelligence";

export type PublicShipmentRecord = {
  tracking_number: string;
  client_name: string;
  origin_country: string;
  destination_country: string;
  current_location: string | null;
  current_route_checkpoint_id: string | null;
  shipment_status: string | null;
  transport_mode: string | null;
  vessel_name: string | null;
  estimated_delivery: string | null;
  item_description: string | null;
  created_at: string;
  courier_name: string | null;
  weight_kg: number | null;
  package_count: number | null;
  package_type: string | null;
  dimensions: string | null;
  container_number: string | null;
  seal_number: string | null;
  declared_value: number | null;
  receiver_name: string | null;
  receiver_address: null;
};

export type PublicShipmentHistory = { status: string; location: string | null; created_at: string };
export type PublicTrackingBundle = {
  shipment: PublicShipmentRecord;
  history: PublicShipmentHistory[];
  documents: ShipmentDocument[];
  communications: ShipmentCommunication[];
  journey: RouteJourney | null;
};

type PublicTrackingResponse = Partial<PublicTrackingBundle> & {
  error?: string;
};

export async function lookupPublicTracking(trackingNumber: string) {
  try {
    const response = await fetch(`/api/public-tracking/${encodeURIComponent(trackingNumber.trim())}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const result = await response.json() as PublicTrackingResponse;
    return {
      data: response.ok && result.shipment ? result as PublicTrackingBundle : null,
      error: response.ok ? null : new Error(result.error ?? "Tracking information is unavailable."),
    };
  } catch {
    return { data: null, error: new Error("Tracking information is unavailable.") };
  }
}

export async function lookupPublicShipment(trackingNumber: string) {
  const result = await lookupPublicTracking(trackingNumber);
  return { data: result.data?.shipment ?? null, error: result.error };
}
