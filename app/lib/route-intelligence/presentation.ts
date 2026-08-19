import { canonicalizeShipmentStatus, normalizeShipmentStatus, type CanonicalShipmentStatus, type ShipmentState } from "../shipment-state";
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

function checkpointCandidates(journey: RouteJourney, status: string) {
  const normalized = normalizeShipmentStatus(status);
  const exact = journey.checkpoints.map((item, index) => ({ item, index })).filter(({ item }) => normalizeShipmentStatus(item.label) === normalized).map(({ index }) => index);
  if (exact.length) return exact;
  const canonical = canonicalizeShipmentStatus(status);
  if (canonical === "exception") return [];
  const kinds = STATUS_CHECKPOINTS[canonical];
  return journey.checkpoints.map((item, index) => ({ item, index })).filter(({ item }) => kinds.includes(item.kind)).map(({ index }) => index);
}

export function checkpointIndexForShipmentStatus(journey: RouteJourney, state: ShipmentState, previousStatus?: string | null, statusHistory?: readonly string[], exactCheckpointId?: string | null) {
  if (exactCheckpointId) {
    const exactIdentityIndex = journey.checkpoints.findIndex((checkpoint) => checkpoint.id === exactCheckpointId);
    if (exactIdentityIndex >= 0) return exactIdentityIndex;
  }
  if (statusHistory?.length) {
    let resolved = 0;
    for (const status of statusHistory) {
      const candidates = checkpointCandidates(journey, status);
      if (!candidates.length) continue;
      resolved = candidates.find((index) => index >= resolved) ?? candidates[0];
    }
    if (state.canonicalStatus === "exception") return resolved;
    const currentCandidates = checkpointCandidates(journey, state.displayStatus);
    if (currentCandidates.length) return currentCandidates.find((index) => index >= resolved) ?? currentCandidates[0];
  }
  const exactIndex = journey.checkpoints.findIndex((item) => item.label.trim().toLowerCase() === state.normalizedStatus);
  if (exactIndex >= 0) return exactIndex;
  if (state.canonicalStatus === "exception" && previousStatus) {
    const normalizedPrevious = previousStatus.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
    const previousExactIndex = journey.checkpoints.findIndex((item) => item.label.trim().toLowerCase() === normalizedPrevious);
    if (previousExactIndex >= 0) return previousExactIndex;
  }
  return checkpointIndexForStatus(journey, state.canonicalStatus);
}

function nextMeaningfulCheckpoint(journey: RouteJourney, currentIndex: number) {
  const current = journey.checkpoints[currentIndex];
  return journey.checkpoints.slice(currentIndex + 1).find((item) => item.location.id !== current.location.id || item.phase !== current.phase)
    ?? journey.checkpoints[currentIndex + 1]
    ?? null;
}

function nextVerifiedRouteStop(journey: RouteJourney, currentCheckpoint: RouteCheckpoint) {
  if (currentCheckpoint.kind === "delivered") return null;
  if (["shipment_created", "collected", "origin_warehouse"].includes(currentCheckpoint.kind)) return journey.origin;
  const locations = [journey.origin, ...journey.transitStops, journey.destination];
  const currentLocationIndex = locations.findIndex((location) => location.id === currentCheckpoint.location.id);
  return locations[currentLocationIndex + 1] ?? null;
}

function normalizeLocation(value: string) {
  return value.trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ");
}

function isSavedRouteLocation(journey: RouteJourney, value: string) {
  const normalized = normalizeLocation(value);
  return [journey.origin, ...journey.transitStops, journey.destination]
    .some((location) => normalizeLocation(location.name) === normalized);
}

function transitLabel(checkpoint: RouteCheckpoint) {
  if (checkpoint.transportMode === "sea") return "At Sea";
  if (checkpoint.transportMode === "air") return "In Flight";
  if (checkpoint.transportMode === "road") return "In Road Transit";
  return "In Transit";
}

function currentLocationFor(journey: RouteJourney, checkpoint: RouteCheckpoint, nextRouteStop: RouteJourney["destination"] | null, state: ShipmentState, realCurrentLocation?: string | null) {
  const recorded = realCurrentLocation?.trim();
  if (checkpoint.kind === "linehaul") {
    const genericTransitLocation = !recorded || /^(at sea|in flight|in (road )?transit)$/i.test(recorded);
    if (genericTransitLocation || isSavedRouteLocation(journey, recorded)) {
      const transit = transitLabel(checkpoint);
      return nextRouteStop ? `${transit} — En route to ${nextRouteStop.name}` : transit;
    }
  }
  const recordedIsRouteStop = Boolean(recorded && isSavedRouteLocation(journey, recorded));
  if (checkpoint.kind === "shipment_created") return recorded && !recordedIsRouteStop ? recorded : "Origin / Supplier Location";
  if (checkpoint.kind === "collected") return recorded && !recordedIsRouteStop ? recorded : "Collected from Sender";
  if (checkpoint.kind === "out_for_delivery") return recorded && !recordedIsRouteStop ? recorded : `Out for delivery — En route to ${state.nextStop}`;
  if (checkpoint.kind === "delivered") return recorded && !recordedIsRouteStop ? recorded : "Delivered to Receiver";
  if (recorded && !recordedIsRouteStop) return recorded;
  return checkpoint.location.name;
}

export function createRouteJourneyPresentation(journey: RouteJourney, state: ShipmentState, realCurrentLocation?: string | null, currentIndexOverride?: number, previousStatus?: string | null): RouteJourneyPresentation {
  const currentIndex = currentIndexOverride ?? checkpointIndexForShipmentStatus(journey, state, previousStatus);
  const currentCheckpoint = journey.checkpoints[currentIndex];
  const nextCheckpoint = state.canonicalStatus === "delivered" ? null : nextMeaningfulCheckpoint(journey, currentIndex);
  const nextRouteStop = nextVerifiedRouteStop(journey, currentCheckpoint);
  const immediateNextCheckpoint = journey.checkpoints[currentIndex + 1] ?? null;
  return {
    journey,
    currentIndex,
    currentCheckpoint,
    nextCheckpoint,
    currentLocation: currentLocationFor(journey, currentCheckpoint, nextRouteStop, state, realCurrentLocation),
    nextStop: nextRouteStop?.name ?? immediateNextCheckpoint?.label ?? "Journey Complete",
    currentStage: state.canonicalStatus === "exception" ? state.displayStatus : currentCheckpoint.label,
  };
}
