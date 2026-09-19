import { deriveShipmentState, normalizeShipmentStatus, type ShipmentState } from "./shipment-state";
import { tryBuildRouteJourney, type RouteCheckpoint, type RouteJourney, type RouteLocationInput } from "./route-intelligence";
import { checkpointIndexForShipmentStatus } from "./route-intelligence/presentation";

export type OperationsAutomationInput = {
  shipmentStatus: string | null | undefined;
  transportMode: string | null | undefined;
  origin: RouteLocationInput;
  destination: RouteLocationInput;
  transitStops?: readonly RouteLocationInput[];
  receiverAddress?: string | null;
  estimatedDelivery?: string | null;
  operationalNote?: string | null;
  previousShipmentStatus?: string | null;
  statusHistory?: readonly string[];
  exactCheckpointId?: string | null;
  /** Undefined preserves the legacy generated route; null explicitly means no assigned route. */
  journey?: RouteJourney | null;
};

export type OperationsAutomation = {
  state: ShipmentState;
  journey: RouteJourney | null;
  currentCheckpoint: string;
  currentLocation: string;
  nextCheckpoint: string;
  nextLocation: string;
  progress: number;
  transportStage: string;
  customerStage: string;
  customerNote: string;
  eta: string | null;
  etaRecommendation: string;
  checkpointIndex: number;
  statusOptions: string[];
};

const EXCEPTION_STATUSES = ["Delayed", "Shipment Issue"];

function transitLocation(journey: RouteJourney, checkpoint: RouteCheckpoint) {
  if (checkpoint.kind === "shipment_created") return "Origin / Supplier Location";
  if (checkpoint.kind === "collected") return `Origin Warehouse – ${journey.origin.city}`;
  if (checkpoint.kind === "origin_warehouse") return `Origin Warehouse – ${journey.origin.city}`;
  if (checkpoint.kind === "departed_origin") return checkpoint.transportMode === "air" ? "In Flight" : checkpoint.transportMode === "sea" ? "At Sea" : checkpoint.transportMode === "road" ? "In Road Transit" : "In Transit";
  if (checkpoint.kind === "linehaul") return checkpoint.transportMode === "air" ? "In Flight" : checkpoint.transportMode === "sea" ? "At Sea" : checkpoint.transportMode === "road" ? "In Road Transit" : "In Transit";
  if (checkpoint.kind === "delivered") return "Delivered to Receiver";
  return checkpoint.location.name;
}

function nextOperationalLocation(next: RouteCheckpoint | undefined) {
  if (!next) return "Journey Complete";
  if (next.kind === "linehaul") return next.transportMode === "air" ? "Air Transit" : next.transportMode === "sea" ? "Sea Transit" : next.transportMode === "road" ? "Road Transit" : "Freight Transit";
  if (next.kind === "delivered") return "Receiver";
  return next.location.name;
}

function nextCheckpointFor(journey: RouteJourney, current: RouteCheckpoint) {
  return journey.checkpoints[current.sequence + 1];
}

function progressFor(journey: RouteJourney, index: number, state: ShipmentState) {
  if (state.canonicalStatus === "delivered") return 100;
  return Math.max(5, Math.min(99, Math.round(5 + (index / Math.max(1, journey.checkpoints.length - 1)) * 95)));
}

export function automateShipmentOperations(input: OperationsAutomationInput): OperationsAutomation {
  const originText = typeof input.origin === "string" ? input.origin : input.origin.country;
  const destinationText = typeof input.destination === "string" ? input.destination : input.destination.country;
  const state = deriveShipmentState({
    shipmentStatus: input.shipmentStatus,
    transportMode: input.transportMode,
    currentLocation: null,
    originCountry: originText,
    destinationCountry: destinationText,
    receiverAddress: input.receiverAddress,
    estimatedDelivery: input.estimatedDelivery,
    latestUpdateNote: input.operationalNote,
  });
  const journey = input.journey === undefined
    ? tryBuildRouteJourney({ origin: input.origin, destination: input.destination, transportMode: input.transportMode || "", transitStops: input.transitStops })
    : input.journey;
  if (!journey) return {
    state,
    journey: null,
    currentCheckpoint: state.currentCheckpoint,
    currentLocation: state.currentLocation,
    nextCheckpoint: state.nextStop,
    nextLocation: state.nextStop,
    progress: state.progress,
    transportStage: state.operationalStage,
    customerStage: state.displayStatus,
    customerNote: state.statusNote,
    eta: state.estimatedArrival,
    etaRecommendation: normalizeShipmentStatus(input.shipmentStatus).includes("delay") ? "Review the manually entered ETA; it has not been changed automatically." : "No ETA change recommended.",
    checkpointIndex: state.stageIndex,
    statusOptions: [],
  };

  const checkpointIndex = checkpointIndexForShipmentStatus(journey, state, input.previousShipmentStatus, input.statusHistory, input.exactCheckpointId);
  const current = journey.checkpoints[checkpointIndex];
  const next = state.canonicalStatus === "delivered" ? undefined : nextCheckpointFor(journey, current);
  const manualDeliveryStage = ["customs cleared", "with local delivery partner / destination facility"].includes(state.normalizedStatus);
  return {
    state,
    journey,
    currentCheckpoint: manualDeliveryStage ? state.displayStatus : current.label,
    currentLocation: state.normalizedStatus === "with local delivery partner / destination facility" && current.location.kind === "airport" ? "Location update pending" : transitLocation(journey, current),
    nextCheckpoint: state.canonicalStatus === "delivered" ? "Journey Complete" : next?.label ?? "Delivery confirmation pending",
    nextLocation: state.canonicalStatus === "delivered" ? "Journey Complete" : next ? nextOperationalLocation(next) : "Delivery confirmation pending",
    progress: progressFor(journey, checkpointIndex, state),
    transportStage: manualDeliveryStage ? state.displayStatus : current.label,
    customerStage: manualDeliveryStage ? state.displayStatus : current.label,
    customerNote: input.operationalNote?.trim() || (manualDeliveryStage ? state.statusNote : current.description),
    eta: input.estimatedDelivery?.trim() || null,
    etaRecommendation: normalizeShipmentStatus(input.shipmentStatus).includes("delay") ? "Review the manually entered ETA; it has not been changed automatically." : "No ETA change recommended.",
    checkpointIndex,
    statusOptions: [...new Set([...journey.checkpoints.map((item) => item.label), ...EXCEPTION_STATUSES])],
  };
}

export type StatusTransitionWarning = { kind: "backward" | "skipped"; message: string };

export function getStatusTransitionWarning(current: OperationsAutomation, target: OperationsAutomation): StatusTransitionWarning | null {
  if (!current.journey || !target.journey) return null;
  if (target.checkpointIndex < current.checkpointIndex) return {
    kind: "backward",
    message: current.state.canonicalStatus === "delivered"
      ? `This shipment is delivered. Moving it back to “${target.customerStage}” requires explicit confirmation.`
      : `This moves the shipment backwards from “${current.customerStage}” to “${target.customerStage}”. Continue?`,
  };
  if (target.checkpointIndex > current.checkpointIndex + 1) return { kind: "skipped", message: `This skips one or more operational checkpoints before “${target.customerStage}”. Confirm that those stages were completed.` };
  return null;
}
