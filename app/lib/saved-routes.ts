import { supabase } from "./supabase";
import { effectiveEstimate, type RecommendationConfidence } from "./route-journey-estimates";
import type { CheckpointKind, LogisticsLocation, RouteCheckpoint, RouteJourney, RouteLeg, RoutePhase, RouteTransportMode } from "./route-intelligence";

export type SavedRouteTemplate = { id: string; name: string; transport_mode: "Air" | "Sea" | "Road" | "Multimodal"; estimated_transit_days?: number | null; route_status?: "Active" | "Archived"; notes?: string | null; library_root_id?: string | null; version?: number; is_current?: boolean; created_at?: string; updated_at?: string };
export type SavedRouteStopType = "warehouse" | "airport" | "port" | "border" | "distribution_centre" | "customs" | "transit_hub" | "rail_terminal" | "delivery_depot" | "customer_address" | "other";
export type JourneyLegMode = "Road" | "Air" | "Sea" | "Rail" | "Courier" | "Internal Transfer";
export type RouteLocationMetadata = { country_code: string; location_type: string; secondary_code: string | null; latitude: number | null; longitude: number | null; verified: boolean };
export type SystemRecommendationMetadata = { model: string; basis: string; assumptions: Record<string, number | string>; unavailableReason?: string };
export type SavedRouteStop = { id: string; route_template_id: string; position: number; name: string; country: string; city: string; stop_type: SavedRouteStopType; code: string | null; operational_notes: string | null; onward_transport: JourneyLegMode | null; estimated_duration_hours?: number | null; estimated_distance_km?: number | null; system_recommended_duration_hours?: number | null; system_recommended_distance_km?: number | null; system_recommendation_confidence?: RecommendationConfidence | null; system_recommendation_metadata?: SystemRecommendationMetadata | null; system_recommendation_calculated_at?: string | null; leg_internal_notes?: string | null; expected_arrival_offset?: number | null; expected_departure_offset?: number | null; default_status_text?: string | null; logistics_location_id?: string | null; logistics_location?: RouteLocationMetadata | RouteLocationMetadata[] | null };
export type EditableRouteStop = Omit<SavedRouteStop, "id" | "route_template_id" | "position"> & { id: string };
export function routeLocationMetadata(stop: Pick<SavedRouteStop, "logistics_location">) { return Array.isArray(stop.logistics_location) ? stop.logistics_location[0] ?? null : stop.logistics_location ?? null; }

function mode(value: string | null | undefined): RouteTransportMode { const normalized = value?.toLowerCase(); if (normalized === "air" || normalized === "sea" || normalized === "road") return normalized; if (normalized === "rail" || normalized === "courier" || normalized === "internal transfer") return "road"; return "multimodal"; }
function segmentMode(stop: SavedRouteStop, template: SavedRouteTemplate): Exclude<RouteTransportMode, "multimodal"> { const selected = mode(stop.onward_transport ?? template.transport_mode); return selected === "multimodal" ? "road" : selected; }
function location(stop: SavedRouteStop): LogisticsLocation { return { id: `route-stop-${stop.id}`, name: stop.name, city: stop.city, country: stop.country, countryCode: "XX", kind: stop.stop_type, code: stop.code ?? undefined }; }

type Draft = { kind: CheckpointKind; phase: RoutePhase; label: string; description: string; location: LogisticsLocation; transportMode: RouteTransportMode; sourceStopId: string };

export function buildJourneyFromSavedRoute(template: SavedRouteTemplate, orderedStops: SavedRouteStop[]): RouteJourney | null {
  const stops = [...orderedStops].sort((a, b) => a.position - b.position);
  if (stops.length < 2) return null;
  const locations = stops.map(location); const drafts: Draft[] = [];
  const add = (stop: SavedRouteStop, kind: CheckpointKind, phase: RoutePhase, label: string, description: string, transport = segmentMode(stop, template)) => drafts.push({ kind, phase, label, description, location: location(stop), transportMode: transport, sourceStopId: stop.id });
  add(stops[0], "shipment_created", "collection", "Shipment Created", "Shipment information has been received.");
  add(stops[0], "collected", "collection", "Collected", "Shipment collected from sender.");

  const typePositions = (type: SavedRouteStopType) => stops.filter((stop) => stop.stop_type === type).map((stop) => stop.id);
  const airports = typePositions("airport"), ports = typePositions("port");
  stops.forEach((stop, index) => {
    const firstHalf = index < stops.length / 2;
    if (stop.stop_type === "warehouse") add(stop, firstHalf ? "origin_warehouse" : "destination_warehouse", firstHalf ? "origin" : "destination", firstHalf ? "Origin Warehouse" : "Destination Warehouse", stop.operational_notes || `Shipment processed at ${stop.name}.`);
    else if (stop.stop_type === "distribution_centre") add(stop, firstHalf ? "origin_warehouse" : "destination_warehouse", firstHalf ? "origin" : "destination", firstHalf ? "Origin Distribution Centre" : "Destination Distribution Centre", stop.operational_notes || `Shipment processed at ${stop.name}.`);
    else if (stop.stop_type === "airport") {
      const airportIndex = airports.indexOf(stop.id), last = airportIndex === airports.length - 1;
      if (airportIndex === 0 && !last) { add(stop, "origin_gateway", "origin", "Origin Airport", `Shipment received at ${stop.name}.`, "air"); add(stop, "export_customs", "export", "Export Customs", "Shipment undergoing export customs processing.", "air"); add(stop, "departed_origin", "export", "Departed Origin Airport", `Shipment departed from ${stop.name}.`, "air"); add(stop, "linehaul", "transit", "In Flight", "Shipment is currently in air transit.", "air"); }
      else if (last) { add(stop, "destination_arrival", "import", "Arrived Destination Airport", `Shipment arrived at ${stop.name}.`, "air"); add(stop, "import_customs", "import", "Import Customs", "Shipment undergoing import customs processing.", "air"); }
      else { add(stop, "transit_arrival", "transit", "Arrived Transit Airport", `Shipment arrived at ${stop.name}.`, "air"); add(stop, "transit_processing", "transit", "Transit Airport Processing", `Shipment processed at ${stop.name}.`, "air"); add(stop, "transit_departure", "transit", "Departed Transit Airport", `Shipment departed from ${stop.name}.`, "air"); add(stop, "linehaul", "transit", "In Flight", "Shipment is currently in air transit.", "air"); }
    } else if (stop.stop_type === "port") {
      const portIndex = ports.indexOf(stop.id), last = portIndex === ports.length - 1;
      if (portIndex === 0 && !last) { add(stop, "origin_gateway", "origin", "Port of Loading", `Shipment received at ${stop.name}.`, "sea"); add(stop, "loaded", "export", "Loaded on Vessel", "Shipment loaded for ocean transport.", "sea"); add(stop, "departed_origin", "export", "Departed Port of Loading", `Vessel departed from ${stop.name}.`, "sea"); add(stop, "linehaul", "transit", "At Sea", "Shipment is currently in sea transit.", "sea"); }
      else if (last) { add(stop, "destination_arrival", "import", "Port of Discharge", `Shipment arrived at ${stop.name}.`, "sea"); add(stop, "discharged", "import", "Discharged from Vessel", "Shipment discharged at destination port.", "sea"); add(stop, "import_customs", "import", "Port Customs", "Shipment undergoing port customs processing.", "sea"); }
      else { add(stop, "transit_arrival", "transit", "Arrived Transit Port", `Shipment arrived at ${stop.name}.`, "sea"); add(stop, "transit_processing", "transit", "Transit Port Processing", `Shipment processed at ${stop.name}.`, "sea"); add(stop, "transit_departure", "transit", "Departed Transit Port", `Vessel departed from ${stop.name}.`, "sea"); add(stop, "linehaul", "transit", "At Sea", "Shipment is currently in sea transit.", "sea"); }
    } else if (stop.stop_type === "border") { add(stop, "border_exit", "export", "Border Exit", `Shipment reached ${stop.name}.`, "road"); add(stop, "border_customs", "transit", "Border Customs", stop.operational_notes || "Shipment undergoing border customs processing.", "road"); add(stop, "border_entry", "import", "Border Entry", `Shipment cleared ${stop.name}.`, "road"); }
    else if (stop.stop_type === "customs") add(stop, "import_customs", firstHalf ? "export" : "import", firstHalf ? "Export Customs" : "Import Customs", stop.operational_notes || `Shipment undergoing customs processing at ${stop.name}.`);
    else if (stop.stop_type === "customer_address") { add(stop, "out_for_delivery", "delivery", "Out For Delivery", "Shipment is with the local delivery team.", "road"); add(stop, "delivered", "delivery", "Delivered", stop.operational_notes || "Shipment delivered successfully.", "road"); }
    else {
      const label = ({ transit_hub: "Transit Hub", rail_terminal: "Rail Terminal", delivery_depot: "Delivery Depot", other: "Route Checkpoint" } as const)[stop.stop_type as "transit_hub" | "rail_terminal" | "delivery_depot" | "other"] ?? "Route Checkpoint";
      add(stop, "transit_processing", "transit", label, stop.default_status_text || `Shipment processed at ${stop.name}.`);
    }
  });
  if (!drafts.some((item) => item.kind === "out_for_delivery")) { add(stops.at(-1)!, "out_for_delivery", "delivery", "Out For Delivery", "Shipment is with the local delivery team.", "road"); add(stops.at(-1)!, "delivered", "delivery", "Delivered", "Shipment delivered successfully.", "road"); }
  const checkpoints: RouteCheckpoint[] = drafts.map((item, sequence) => ({ id: `saved-${item.sourceStopId}-${sequence}-${item.kind}`, sequence, kind: item.kind, phase: item.phase, transportMode: item.transportMode, label: item.label, description: item.description, location: item.location, references: {} }));
  const legs: RouteLeg[] = stops.slice(0, -1).map((stop, sequence) => ({ id: `saved-leg-${stop.id}`, sequence, transportMode: segmentMode(stop, template), displayMode: stop.onward_transport ?? undefined, estimatedDurationHours: effectiveEstimate(stop.estimated_duration_hours, stop.system_recommended_duration_hours), estimatedDistanceKm: effectiveEstimate(stop.estimated_distance_km, stop.system_recommended_distance_km), internalNotes: stop.leg_internal_notes ?? null, origin: locations[sequence], destination: locations[sequence + 1], checkpointIds: checkpoints.filter((item) => item.location.id === locations[sequence].id || item.location.id === locations[sequence + 1].id).map((item) => item.id), references: {} }));
  return { version: 1, transportMode: mode(template.transport_mode), origin: locations[0], destination: locations.at(-1)!, transitStops: locations.slice(1, -1), checkpoints, legs };
}

export async function loadRouteTemplates() { return supabase.from("route_templates").select("id, name, transport_mode, estimated_transit_days, route_status, notes, library_root_id, version, is_current, created_at, updated_at").eq("is_current", true).eq("route_status", "Active").order("name"); }
export async function loadSavedRoute(routeTemplateId: string) {
  const [{ data: template, error: templateError }, { data: stops, error: stopsError }] = await Promise.all([
    supabase.from("route_templates").select("id, name, transport_mode, estimated_transit_days, route_status, notes, library_root_id, version, is_current, created_at, updated_at").eq("id", routeTemplateId).maybeSingle(),
    supabase.from("route_stops").select("id, route_template_id, position, name, country, city, stop_type, code, operational_notes, onward_transport, estimated_duration_hours, estimated_distance_km, system_recommended_duration_hours, system_recommended_distance_km, system_recommendation_confidence, system_recommendation_metadata, system_recommendation_calculated_at, leg_internal_notes, expected_arrival_offset, expected_departure_offset, default_status_text, logistics_location_id, logistics_location:logistics_locations(country_code, location_type, secondary_code, latitude, longitude, verified)").eq("route_template_id", routeTemplateId).order("position"),
  ]);
  const error = templateError ?? stopsError;
  if (error || !template) return { template: null, stops: [], journey: null, error };
  const typedTemplate = template as SavedRouteTemplate, typedStops = (stops ?? []) as SavedRouteStop[];
  return { template: typedTemplate, stops: typedStops, journey: buildJourneyFromSavedRoute(typedTemplate, typedStops), error: null };
}
