import type { RouteCheckpoint, RouteJourney } from "./route-intelligence";
import type { SavedRouteStop } from "./saved-routes";

export const LOCAL_DELIVERY_STATUS = "With Local Delivery Partner / Destination Facility";

export function isFinalMileStatus(status: string) {
  return [LOCAL_DELIVERY_STATUS, "Out For Delivery", "Delivered"].some((option) => option.toLowerCase() === status.trim().toLowerCase());
}

export function requiresReceiverDeliveryAddress(journey: RouteJourney | null | undefined) {
  return journey?.destination.kind === "customer_address";
}

export type ExistingLocationChoice = { value: string; label: string; source: "facility" | "route" | "customer_route" | "city" | "receiver" | "current" };

type LocationChoiceInput = {
  previousLocation?: string | null;
  currentLocation?: string | null;
  receiverAddress?: string | null;
  journey?: RouteJourney | null;
  stops?: readonly SavedRouteStop[];
};

function normalized(value: string) { return value.trim().toLowerCase().replace(/\s+/g, " "); }

export function buildFinalMileLocationChoices({ previousLocation, currentLocation, receiverAddress, journey, stops = [] }: LocationChoiceInput): ExistingLocationChoice[] {
  const choices: ExistingLocationChoice[] = [];
  const seen = new Set<string>();
  const gateways = new Set((journey ? [journey.origin, ...journey.transitStops, journey.destination] : [])
    .filter((location) => ["airport", "port", "border"].includes(location.kind))
    .flatMap((location) => [location.name, location.code ?? ""]).filter(Boolean).map(normalized));
  for (const stop of stops.filter((item) => ["airport", "port", "border"].includes(item.stop_type))) {
    gateways.add(normalized(stop.name));
    if (stop.code) gateways.add(normalized(stop.code));
  }
  const add = (value: string | null | undefined, label: string, source: ExistingLocationChoice["source"]) => {
    const text = value?.trim();
    if (!text || gateways.has(normalized(text)) || /^(in flight|at sea|in (road )?transit|destination airport|destination port)$/i.test(text) || (source === "current" && /\bairport\b/i.test(text))) return;
    const key = normalized(text);
    if (seen.has(key)) return;
    seen.add(key);
    choices.push({ value: text, label: `${label} — ${text}`, source });
  };

  const ordered = [...stops].sort((a, b) => a.position - b.position);
  const lastGatewayPosition = Math.max(-1, ...ordered.filter((stop) => ["airport", "port", "border"].includes(stop.stop_type)).map((stop) => stop.position));
  const firstPosition = ordered[0]?.position ?? -1;
  for (const stop of ordered.filter((item) => item.position > Math.max(lastGatewayPosition, firstPosition))) {
    if (["warehouse", "distribution_centre", "delivery_depot"].includes(stop.stop_type)) add(stop.name, "Destination facility", "facility");
    else if (stop.stop_type === "customer_address") add(stop.name, "Route destination", "customer_route");
  }
  if (journey?.destination && !["airport", "port", "border"].includes(journey.destination.kind)) add(journey.destination.name, "Route checkpoint", journey.destination.kind === "customer_address" ? "customer_route" : "route");
  add(receiverAddress, "Receiver address", "receiver");
  if (journey?.destination.city) add([journey.destination.city, journey.destination.country].filter(Boolean).join(", "), "Destination city", "city");
  add(currentLocation, "Current location", "current");
  add(previousLocation, "Previous location", "current");
  return choices;
}

export function defaultFinalMileLocation(status: string, choices: readonly ExistingLocationChoice[]) {
  const normalizedStatus = normalized(status);
  if (normalizedStatus === normalized(LOCAL_DELIVERY_STATUS)) return choices.findLast((choice) => choice.source === "facility")?.value ?? "";
  if (normalizedStatus === "out for delivery" || normalizedStatus === "delivered") return choices.find((choice) => choice.source === "receiver")?.value
    ?? choices.find((choice) => choice.source === "customer_route")?.value ?? "";
  return "";
}

export function routeBasedCurrentLocation(status: string, checkpoint: RouteCheckpoint | undefined, journey: RouteJourney | null) {
  if (checkpoint?.kind === "linehaul") return checkpoint.label;
  if (checkpoint?.location.name) return checkpoint.location.name;
  if (normalized(status) === "customs cleared") return [...(journey?.checkpoints ?? [])].reverse().find((item) => item.kind === "import_customs")?.location.name ?? null;
  const matching = journey?.checkpoints.filter((item) => normalized(item.label) === normalized(status)) ?? [];
  if (matching.length === 1) return matching[0].kind === "linehaul" ? matching[0].label : matching[0].location.name;
  if (matching.length > 1 && matching.every((item) => item.kind === "linehaul")) return matching[0].label;
  return null;
}
