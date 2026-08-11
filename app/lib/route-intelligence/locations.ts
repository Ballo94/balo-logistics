import type { LogisticsLocation, RouteLocationInput, RouteTransportMode } from "./types";

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function preferredKind(mode: RouteTransportMode) {
  return mode === "air" ? "airport" as const : mode === "sea" ? "port" as const : "distribution_centre" as const;
}

export function findLogisticsLocation() {
  return undefined;
}

export function createGenericLocation(value: string, mode: RouteTransportMode, role: "origin" | "destination" | "transit"): LogisticsLocation {
  const name = value.trim() || "Location pending";
  const kind = role === "transit" && mode === "road" ? "border" : preferredKind(mode);
  return {
    id: `legacy-${mode}-${role}-${normalize(name).replace(/\s/g, "-")}`,
    name,
    city: name,
    country: name,
    countryCode: "XX",
    kind,
  };
}

export function resolveLogisticsLocation(input: RouteLocationInput, mode: RouteTransportMode, role: "origin" | "destination" | "transit") {
  if (typeof input !== "string") return input;
  return createGenericLocation(input, mode, role);
}
