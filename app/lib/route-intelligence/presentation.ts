import type { CanonicalShipmentStatus, ShipmentState } from "../shipment-state";
import type { CheckpointKind, RouteCheckpoint, RouteJourney } from "./types";

export type RouteJourneyPresentation = {
  journey: RouteJourney;
  currentIndex: number;
  currentCheckpoint: RouteCheckpoint;
  nextCheckpoint: RouteCheckpoint | null;
  currentLocation: string;
  nextStop: string;
  currentStage: string;
};

const STATUS_CHECKPOINTS: Record<CanonicalShipmentStatus, readonly CheckpointKind[]> = {
  created: ["shipment_created"],
  collected: ["collected"],
  warehouse: ["origin_warehouse"],
  awaiting_departure: ["origin_gateway", "loaded", "departed_origin"],
  transit: ["linehaul", "transit_processing", "transit_arrival", "transit_departure"],
  arrived_destination: ["destination_arrival", "discharged"],
  customs: ["import_customs", "border_customs"],
  destination_hub: ["destination_warehouse"],
  out_for_delivery: ["out_for_delivery"],
  delivered: ["delivered"],
  exception: ["linehaul"],
};

export function checkpointIndexForStatus(journey: RouteJourney, status: CanonicalShipmentStatus) {
  const kinds = STATUS_CHECKPOINTS[status];
  const candidates = journey.checkpoints.map((item, index) => ({ item, index })).filter(({ item }) => kinds.includes(item.kind));
  if (!candidates.length) return 0;
  return status === "transit" ? candidates[0].index : candidates.at(-1)?.index ?? 0;
}

function nextMeaningfulCheckpoint(journey: RouteJourney, currentIndex: number) {
  const current = journey.checkpoints[currentIndex];
  return journey.checkpoints.slice(currentIndex + 1).find((item) => item.location.id !== current.location.id || item.phase !== current.phase)
    ?? journey.checkpoints[currentIndex + 1]
    ?? null;
}

export function createRouteJourneyPresentation(journey: RouteJourney, state: ShipmentState, realCurrentLocation?: string | null): RouteJourneyPresentation {
  const currentIndex = checkpointIndexForStatus(journey, state.canonicalStatus);
  const currentCheckpoint = journey.checkpoints[currentIndex];
  const nextCheckpoint = state.canonicalStatus === "delivered" ? null : nextMeaningfulCheckpoint(journey, currentIndex);
  const routeSpecificLocation = !["created", "collected", "warehouse"].includes(state.canonicalStatus);
  return {
    journey,
    currentIndex,
    currentCheckpoint,
    nextCheckpoint,
    currentLocation: realCurrentLocation?.trim() || (routeSpecificLocation ? currentCheckpoint.location.name : state.currentLocation),
    nextStop: nextCheckpoint ? `${nextCheckpoint.label} · ${nextCheckpoint.location.name}` : "Journey Complete",
    currentStage: currentCheckpoint.label,
  };
}
