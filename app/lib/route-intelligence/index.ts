import { resolveLogisticsLocation } from "./locations";
import type { CheckpointKind, LogisticsLocation, RouteCheckpoint, RouteJourney, RouteJourneyInput, RouteLeg, RoutePhase, RouteTransportMode } from "./types";

export { findLogisticsLocation, resolveLogisticsLocation } from "./locations";
export type * from "./types";

type DraftCheckpoint = Omit<RouteCheckpoint, "id" | "sequence" | "transportMode" | "references">;

export function normalizeRouteTransportMode(mode: string): Exclude<RouteTransportMode, "multimodal"> {
  const value = mode.trim().toLowerCase();
  if (/air|flight|aircraft/.test(value)) return "air";
  if (/sea|ocean|ship|vessel/.test(value)) return "sea";
  if (/road|truck|land/.test(value)) return "road";
  throw new Error(`Unsupported route transport mode: ${mode || "empty value"}`);
}

function checkpoint(kind: CheckpointKind, phase: RoutePhase, label: string, description: string, location: LogisticsLocation): DraftCheckpoint {
  return { kind, phase, label, description, location };
}

function airTemplate(origin: LogisticsLocation, destination: LogisticsLocation, transits: LogisticsLocation[]): DraftCheckpoint[] {
  const route = [
    checkpoint("shipment_created", "collection", "Shipment Created", "Shipment information has been received.", origin),
    checkpoint("collected", "collection", "Collected", "Shipment collected from sender.", origin),
    checkpoint("origin_warehouse", "origin", "Origin Warehouse", "Shipment received at the origin logistics facility.", origin),
    checkpoint("origin_gateway", "origin", "Origin Airport", `Shipment received at ${origin.name}.`, origin),
    checkpoint("export_customs", "export", "Export Customs", "Shipment undergoing export customs processing.", origin),
    checkpoint("departed_origin", "export", "Departed Origin Airport", `Shipment departed from ${origin.name}.`, origin),
    checkpoint("linehaul", "transit", "In Flight", "Shipment is currently in air transit.", origin),
  ];
  for (const transit of transits) route.push(
    checkpoint("transit_arrival", "transit", "Arrived Transit Airport", `Shipment arrived at ${transit.name}.`, transit),
    checkpoint("transit_processing", "transit", "Transit Airport Processing", "Shipment is being transferred through the transit air hub.", transit),
    checkpoint("transit_departure", "transit", "Departed Transit Airport", `Shipment departed from ${transit.name}.`, transit),
  );
  route.push(
    checkpoint("destination_arrival", "import", "Arrived Destination Airport", `Shipment arrived at ${destination.name}.`, destination),
    checkpoint("import_customs", "import", "Import Customs", "Shipment is undergoing import customs processing.", destination),
    checkpoint("destination_warehouse", "destination", "Destination Warehouse", "Shipment received at the destination logistics facility.", destination),
    checkpoint("out_for_delivery", "delivery", "Out For Delivery", "Shipment is with the local delivery team.", destination),
    checkpoint("delivered", "delivery", "Delivered", "Shipment delivered successfully.", destination),
  );
  return route;
}

function seaTemplate(origin: LogisticsLocation, destination: LogisticsLocation, transits: LogisticsLocation[]): DraftCheckpoint[] {
  const route = [
    checkpoint("shipment_created", "collection", "Shipment Created", "Shipment information has been received.", origin),
    checkpoint("collected", "collection", "Collected", "Shipment collected from sender.", origin),
    checkpoint("origin_warehouse", "origin", "Origin Warehouse", "Shipment received at the origin logistics facility.", origin),
    checkpoint("origin_gateway", "origin", "Port of Loading", `Shipment received at ${origin.name}.`, origin),
    checkpoint("loaded", "export", "Loaded on Vessel", "Shipment loaded for ocean transport.", origin),
    checkpoint("departed_origin", "export", "Departed Port of Loading", `Vessel departed from ${origin.name}.`, origin),
    checkpoint("linehaul", "transit", "At Sea", "Shipment is currently in sea transit.", origin),
  ];
  for (const transit of transits) route.push(
    checkpoint("transit_arrival", "transit", "Arrived Transit Port", `Shipment arrived at ${transit.name}.`, transit),
    checkpoint("transit_processing", "transit", "Transit Port Processing", "Shipment is being transferred through the transit port.", transit),
    checkpoint("transit_departure", "transit", "Departed Transit Port", `Vessel departed from ${transit.name}.`, transit),
  );
  route.push(
    checkpoint("destination_arrival", "import", "Port of Discharge", `Shipment arrived at ${destination.name}.`, destination),
    checkpoint("discharged", "import", "Discharged from Vessel", "Shipment discharged at the destination port.", destination),
    checkpoint("import_customs", "import", "Port Customs", "Shipment is undergoing destination port customs processing.", destination),
    checkpoint("destination_warehouse", "destination", "Destination Warehouse", "Shipment received at the destination logistics facility.", destination),
    checkpoint("out_for_delivery", "delivery", "Out For Delivery", "Shipment is with the local delivery team.", destination),
    checkpoint("delivered", "delivery", "Delivered", "Shipment delivered successfully.", destination),
  );
  return route;
}

function roadTemplate(origin: LogisticsLocation, destination: LogisticsLocation, transits: LogisticsLocation[]): DraftCheckpoint[] {
  const crossings = transits.length ? transits : [resolveLogisticsLocation("International Border", "road", "transit")];
  const route = [
    checkpoint("shipment_created", "collection", "Shipment Created", "Shipment information has been received.", origin),
    checkpoint("collected", "collection", "Collected", "Shipment collected from sender.", origin),
    checkpoint("origin_warehouse", "origin", "Origin Warehouse", "Shipment received at the origin distribution centre.", origin),
    checkpoint("departed_origin", "export", "Departed Origin Warehouse", `Truck departed from ${origin.name}.`, origin),
    checkpoint("linehaul", "transit", "Road Transit", "Shipment is currently moving through the road freight network.", origin),
  ];
  for (const crossing of crossings) {
    if (crossing.kind === "border") route.push(
      checkpoint("border_exit", "export", "Border Exit", `Shipment reached the outbound checkpoint at ${crossing.name}.`, crossing),
      checkpoint("border_customs", "transit", "Border Customs", "Shipment is undergoing border customs processing.", crossing),
      checkpoint("border_entry", "import", "Border Entry", `Shipment cleared the inbound checkpoint at ${crossing.name}.`, crossing),
    );
    else route.push(
      checkpoint("transit_arrival", "transit", "Arrived Road Hub", `Shipment arrived at ${crossing.name}.`, crossing),
      checkpoint("transit_processing", "transit", "Road Hub Processing", "Shipment is being processed at the transit distribution centre.", crossing),
      checkpoint("transit_departure", "transit", "Departed Road Hub", `Shipment departed from ${crossing.name}.`, crossing),
    );
  }
  route.push(
    checkpoint("destination_warehouse", "destination", "Destination Warehouse", `Shipment received at ${destination.name}.`, destination),
    checkpoint("out_for_delivery", "delivery", "Out For Delivery", "Shipment is with the local delivery team.", destination),
    checkpoint("delivered", "delivery", "Delivered", "Shipment delivered successfully.", destination),
  );
  return route;
}

const TEMPLATES: Record<Exclude<RouteTransportMode, "multimodal">, (origin: LogisticsLocation, destination: LogisticsLocation, transits: LogisticsLocation[]) => DraftCheckpoint[]> = {
  air: airTemplate,
  sea: seaTemplate,
  road: roadTemplate,
};

function createLegs(mode: RouteTransportMode, locations: LogisticsLocation[], checkpoints: RouteCheckpoint[], references: RouteJourneyInput["references"]): RouteLeg[] {
  return locations.slice(0, -1).map((origin, sequence) => {
    const destination = locations[sequence + 1];
    const start = checkpoints.findIndex((item) => item.location.id === origin.id);
    const next = checkpoints.findIndex((item, index) => index > start && item.location.id === destination.id);
    const end = next < 0 ? checkpoints.length - 1 : next;
    return {
      id: `${mode}-leg-${sequence + 1}`,
      sequence,
      transportMode: mode,
      origin,
      destination,
      checkpointIds: checkpoints.slice(Math.max(0, start), end + 1).map((item) => item.id),
      references: { ...references },
    };
  });
}

export function buildRouteJourney(input: RouteJourneyInput): RouteJourney {
  const transportMode = normalizeRouteTransportMode(input.transportMode);
  const origin = resolveLogisticsLocation(input.origin, transportMode, "origin");
  const destination = resolveLogisticsLocation(input.destination, transportMode, "destination");
  const transitStops = (input.transitStops ?? []).map((stop) => resolveLogisticsLocation(stop, transportMode, "transit"));
  const drafts = TEMPLATES[transportMode](origin, destination, transitStops);
  const checkpoints = drafts.map((item, sequence): RouteCheckpoint => ({
    ...item,
    id: `${transportMode}-${String(sequence + 1).padStart(2, "0")}-${item.kind}`,
    sequence,
    transportMode,
    references: { ...input.references },
  }));
  return {
    version: 1,
    transportMode,
    origin,
    destination,
    transitStops,
    checkpoints,
    legs: createLegs(transportMode, [origin, ...transitStops, destination], checkpoints, input.references),
  };
}

export function tryBuildRouteJourney(input: RouteJourneyInput) {
  try { return buildRouteJourney(input); }
  catch { return null; }
}
