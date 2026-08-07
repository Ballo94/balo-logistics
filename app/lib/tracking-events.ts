import { deriveShipmentState } from "./shipment-state";
import { supabase } from "./supabase";

export type TrackingEventInput = {
  shipmentId: number;
  trackingNumber: string;
  status: string;
  transportMode: string | null;
  currentLocation: string | null;
  originCountry: string;
  destinationCountry: string;
  receiverAddress?: string | null;
  estimatedDelivery?: string | null;
  customNote?: string | null;
};

export type BuiltTrackingEvent = {
  shipmentId: number;
  trackingNumber: string;
  status: string;
  location: string;
  timestamp: string;
  transportMode: string;
  description: string;
};

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? "";
}

function automaticDescription(status: ReturnType<typeof deriveShipmentState>, rawStatus: string) {
  const detailed = normalize(rawStatus);
  if (/origin warehouse/.test(detailed)) return "Shipment received at origin logistics facility.";
  if (/departed origin airport/.test(detailed)) return "Shipment departed from origin airport.";
  if (/departed origin port/.test(detailed)) return "Shipment departed from origin port.";
  if (/in flight/.test(detailed)) return "Shipment is currently in air transit.";
  if (/arrived (at )?destination airport/.test(detailed)) return "Shipment has arrived at the destination airport.";
  if (/arrived (at )?destination port/.test(detailed)) return "Shipment has arrived at the destination port.";
  switch (status.canonicalStatus) {
    case "created": return "Shipment information has been received.";
    case "collected": return "Shipment collected from sender.";
    case "warehouse": return status.transportKind === "air"
      ? "Shipment received at origin airport logistics facility."
      : status.transportKind === "sea"
        ? "Shipment received at origin port facility."
        : "Shipment received at origin distribution centre.";
    case "awaiting_departure": return status.transportKind === "air"
      ? "Shipment is ready for departure from the origin airport."
      : status.transportKind === "sea"
        ? "Shipment has been loaded for sea freight departure."
        : "Shipment is ready to depart the origin distribution centre.";
    case "transit": return status.transportKind === "air"
      ? "Shipment is currently in air transit."
      : status.transportKind === "sea"
        ? "Shipment is currently in sea transit."
        : status.transportKind === "road"
          ? "Shipment is currently in road transit."
          : "Shipment is currently in transit.";
    case "arrived_destination": return status.transportKind === "air"
      ? "Shipment has arrived at the destination airport."
      : status.transportKind === "sea"
        ? "Shipment has arrived at the destination port."
        : "Shipment has arrived at the destination distribution centre.";
    case "customs": return "Shipment is undergoing customs processing.";
    case "destination_hub": return "Shipment received at the destination logistics facility.";
    case "out_for_delivery": return "Shipment is with the local delivery team.";
    case "delivered": return "Shipment delivered successfully.";
    case "exception": return "Shipment requires operational attention.";
  }
}

export function buildTrackingEvent(input: TrackingEventInput, timestamp = new Date().toISOString()): BuiltTrackingEvent {
  const state = deriveShipmentState({
    shipmentStatus: input.status,
    transportMode: input.transportMode,
    currentLocation: input.currentLocation,
    originCountry: input.originCountry,
    destinationCountry: input.destinationCountry,
    receiverAddress: input.receiverAddress,
    estimatedDelivery: input.estimatedDelivery,
    latestUpdateNote: input.customNote,
  });
  return {
    shipmentId: input.shipmentId,
    trackingNumber: input.trackingNumber,
    status: input.status,
    location: state.currentLocation,
    timestamp,
    transportMode: state.transportLabel,
    description: input.customNote?.trim() || automaticDescription(state, input.status),
  };
}

export async function createTrackingEvent(input: TrackingEventInput) {
  const { data: latest, error: latestError } = await supabase
    .from("shipment_history")
    .select("status")
    .eq("shipment_id", input.shipmentId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) return { created: false, error: latestError };
  if (latest && normalize(latest.status) === normalize(input.status)) return { created: false, error: null };

  const event = buildTrackingEvent(input);
  // tracking number and transport mode remain available through the related shipment;
  // only columns supported by the existing shipment_history schema are persisted.
  const { error } = await supabase.from("shipment_history").insert([{
    shipment_id: event.shipmentId,
    status: event.status,
    location: event.location,
    note: event.description,
    created_at: event.timestamp,
  }]);
  return { created: !error, error };
}
