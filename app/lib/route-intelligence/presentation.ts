import { canonicalizeShipmentStatus, normalizeShipmentStatus, type CanonicalShipmentStatus, type ShipmentState } from "../shipment-state";
import type { CheckpointKind, LogisticsLocation, RouteCheckpoint, RouteJourney } from "./types";

export type RouteJourneyPresentation = {
  journey: RouteJourney;
  currentIndex: number;
  currentCheckpoint: RouteCheckpoint;
  nextCheckpoint: RouteCheckpoint | null;
  orderedStops: LogisticsLocation[];
  currentStop: LogisticsLocation;
  currentStopIndex: number;
  destinationStop: LogisticsLocation;
  completedStopIndexes: number[];
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
  if (!candidates.length && status === "destination_hub") {
    const customsIndex = journey.checkpoints.findLastIndex((item) => item.kind === "import_customs");
    if (customsIndex >= 0) return customsIndex;
  }
  if (!candidates.length) return 0;
  return status === "transit" ? candidates[0].index : candidates.at(-1)?.index ?? 0;
}

/** Generic statuses have no exact route identity; exceptions retain their last known checkpoint. */
export function checkpointIdForFallbackStatus(status: string, currentId: string) {
  return /^(delayed|shipment issue|exception|held)$/i.test(status.trim()) ? currentId : "";
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
    if (exactIdentityIndex >= 0) {
      const exactStatus = normalizeShipmentStatus(journey.checkpoints[exactIdentityIndex].label);
      if (state.canonicalStatus === "exception" || exactStatus === state.normalizedStatus || canonicalizeShipmentStatus(exactStatus) === state.canonicalStatus) return exactIdentityIndex;
    }
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

function sameRouteLocation(left: RouteJourney["origin"], right: RouteJourney["origin"]) {
  if (left.id === right.id) return true;
  if (left.code && right.code && normalizeLocation(left.code) === normalizeLocation(right.code)) return true;
  return normalizeLocation(left.name) === normalizeLocation(right.name)
    && normalizeLocation(left.city) === normalizeLocation(right.city)
    && normalizeLocation(left.country) === normalizeLocation(right.country);
}

function routeStopProgress(journey: RouteJourney, currentCheckpoint: RouteCheckpoint, realCurrentLocation?: string | null) {
  if (currentCheckpoint.kind === "delivered") return { current: journey.destination, next: null };
  const locations = [journey.origin, ...journey.transitStops, journey.destination];
  const checkpointRouteStop = locations.find((location) => location.id === currentCheckpoint.location.id) ?? null;
  const recordedRouteStop = realCurrentLocation?.trim() ? savedRouteLocation(journey, realCurrentLocation) : null;
  const current = checkpointRouteStop ?? recordedRouteStop ?? journey.origin;
  const currentLocationIndex = locations.findIndex((location) => location.id === current.id);
  const next = currentLocationIndex < 0 ? null : locations.slice(currentLocationIndex + 1).find((location) => !sameRouteLocation(location, current)) ?? null;
  return { current, next };
}

function normalizeLocation(value: string) {
  return value.trim().toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").replace(/\s+/g, " ");
}

function savedRouteLocation(journey: RouteJourney, value: string) {
  const normalized = normalizeLocation(value);
  const locations = [journey.origin, ...journey.transitStops, journey.destination];
  return locations.find((location) => location.code && normalizeLocation(location.code) === normalized)
    ?? locations.find((location) => normalizeLocation(location.name) === normalized)
    ?? locations.find((location) => [location.city, `${location.city}, ${location.country}`, `${location.name}, ${location.city}, ${location.country}`].some((candidate) => normalizeLocation(candidate) === normalized))
    ?? null;
}

function transitLabel(checkpoint: RouteCheckpoint) {
  if (checkpoint.transportMode === "sea") return "At Sea";
  if (checkpoint.transportMode === "air") return "In Flight";
  if (checkpoint.transportMode === "road") return "In Road Transit";
  return "In Transit";
}

function currentLocationFor(journey: RouteJourney, checkpoint: RouteCheckpoint, currentRouteStop: LogisticsLocation, nextRouteStop: RouteJourney["destination"] | null, state: ShipmentState, realCurrentLocation?: string | null) {
  const recorded = realCurrentLocation?.trim();
  const matchingRouteLocation = recorded ? savedRouteLocation(journey, recorded) : null;
  if (checkpoint.kind === "linehaul") {
    const genericTransitLocation = !recorded || /^(at sea|in flight|in (road )?transit)$/i.test(recorded);
    if (genericTransitLocation || matchingRouteLocation) {
      const transit = transitLabel(checkpoint);
      return nextRouteStop ? `${transit} — En route to ${nextRouteStop.name}` : transit;
    }
  }
  const recordedIsRouteStop = Boolean(matchingRouteLocation);
  if (checkpoint.kind === "shipment_created") return recorded || currentRouteStop.name;
  if (checkpoint.kind === "collected") return recorded && !recordedIsRouteStop ? recorded : "Collected from Sender";
  if (state.normalizedStatus === "with local delivery partner / destination facility") return recorded || "Destination facility location pending";
  if (checkpoint.kind === "out_for_delivery" || checkpoint.kind === "delivered") return state.currentLocation;
  if (matchingRouteLocation && sameRouteLocation(matchingRouteLocation, currentRouteStop)) return currentRouteStop.name;
  if (matchingRouteLocation) return matchingRouteLocation.name;
  if (recorded && !recordedIsRouteStop) return recorded;
  return checkpoint.location.name;
}

export function createRouteJourneyPresentation(journey: RouteJourney, state: ShipmentState, realCurrentLocation?: string | null, currentIndexOverride?: number, previousStatus?: string | null): RouteJourneyPresentation {
  const currentIndex = currentIndexOverride ?? checkpointIndexForShipmentStatus(journey, state, previousStatus);
  const currentCheckpoint = journey.checkpoints[currentIndex];
  const nextCheckpoint = state.canonicalStatus === "delivered" ? null : journey.checkpoints[currentIndex + 1] ?? null;
  const routeProgress = routeStopProgress(journey, currentCheckpoint, realCurrentLocation);
  const orderedStops = [journey.origin, ...journey.transitStops, journey.destination];
  const currentStop = routeProgress.current ?? journey.origin;
  const currentStopIndex = Math.max(0, orderedStops.findIndex((location) => location.id === currentStop.id));
  const nextRouteStop = routeProgress.next;
  return {
    journey,
    currentIndex,
    currentCheckpoint,
    nextCheckpoint,
    orderedStops,
    currentStop,
    currentStopIndex,
    destinationStop: journey.destination,
    completedStopIndexes: state.canonicalStatus === "delivered" ? orderedStops.map((_, index) => index) : orderedStops.map((_, index) => index).filter((index) => index < currentStopIndex),
    currentLocation: currentLocationFor(journey, currentCheckpoint, currentStop, nextRouteStop, state, realCurrentLocation),
    nextStop: state.canonicalStatus === "delivered" ? "Journey Complete" : state.canonicalStatus === "out_for_delivery" ? "Delivered" : state.normalizedStatus === "with local delivery partner / destination facility" ? "Out For Delivery" : nextRouteStop?.name ?? nextCheckpoint?.label ?? "Delivery confirmation pending",
    currentStage: state.canonicalStatus === "exception" || ["customs cleared", "with local delivery partner / destination facility"].includes(state.normalizedStatus) ? state.displayStatus : currentCheckpoint.label,
  };
}

export function routeOverviewPoints(route: RouteJourneyPresentation, state: ShipmentState) {
  const finalMile = state.normalizedStatus === "with local delivery partner / destination facility" || state.canonicalStatus === "out_for_delivery" || state.canonicalStatus === "delivered";
  const lastIndex = route.orderedStops.length - 1;
  const receiverIsRouteDestination = route.destinationStop.kind === "customer_address";
  return route.orderedStops.map((location, index) => {
    const completedAfterHub = finalMile && (index < lastIndex || !receiverIsRouteDestination || state.canonicalStatus === "delivered");
    const progressState = completedAfterHub || route.completedStopIndexes.includes(index) ? "complete" : finalMile ? "future" : index === route.currentStopIndex ? "current" : "future";
    return {
      label: index === 0 ? "Origin" : index === lastIndex ? "Destination" : "Transit",
      value: location.name,
      state: progressState,
      arrivalLabel: index === lastIndex && finalMile && completedAfterHub ? state.canonicalStatus === "delivered" ? "Route complete" : "Arrived" : null,
    };
  });
}
