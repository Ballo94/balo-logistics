import type { EditableRouteStop, JourneyLegMode, SavedRouteTemplate } from "./saved-routes";

type RouteMode = SavedRouteTemplate["transport_mode"];
type StopIdentity = Pick<EditableRouteStop, "id" | "stop_type" | "onward_transport">;

const ROAD_STOP_TYPES = new Set<EditableRouteStop["stop_type"]>([
  "border",
  "warehouse",
  "distribution_centre",
  "customs",
  "transit_hub",
  "rail_terminal",
  "delivery_depot",
  "customer_address",
]);

export function inferOnwardTransport(origin: StopIdentity, destination: StopIdentity, routeMode: RouteMode): JourneyLegMode | null {
  if (routeMode !== "Multimodal") return routeMode;
  if (origin.stop_type === "airport" && destination.stop_type === "airport") return "Air";
  if (origin.stop_type === "port" && destination.stop_type === "port") return "Sea";
  if (ROAD_STOP_TYPES.has(origin.stop_type) && ROAD_STOP_TYPES.has(destination.stop_type)) return "Road";
  return null;
}

export function reconcileInferredOnwardTransport(
  stops: EditableRouteStop[],
  routeMode: RouteMode,
  automaticallyManagedIds: ReadonlySet<string>,
  inferenceEligibleIds: ReadonlySet<string>,
) {
  const nextManagedIds = new Set(automaticallyManagedIds);
  const nextStops = stops.map((stop, index) => {
    if (index === stops.length - 1) return nextManagedIds.has(stop.id) ? { ...stop, onward_transport: null } : stop;
    const wasAutomaticallyManaged = nextManagedIds.has(stop.id);
    const canDefault = wasAutomaticallyManaged || (inferenceEligibleIds.has(stop.id) && !stop.onward_transport);
    if (!canDefault) return stop;
    const inferred = inferOnwardTransport(stop, stops[index + 1], routeMode);
    if (!inferred) {
      nextManagedIds.delete(stop.id);
      return wasAutomaticallyManaged ? { ...stop, onward_transport: null } : stop;
    }
    nextManagedIds.add(stop.id);
    return stop.onward_transport === inferred ? stop : { ...stop, onward_transport: inferred };
  });
  return { stops: nextStops, automaticallyManagedIds: nextManagedIds };
}
