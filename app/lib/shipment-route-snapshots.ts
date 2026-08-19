import { supabase } from "./supabase";
import {
  buildJourneyFromSavedRoute,
  type SavedRouteStop,
  type SavedRouteTemplate,
} from "./saved-routes";

export async function snapshotShipmentRoute(shipmentId: number | string, routeTemplateId: string) {
  return supabase.rpc("snapshot_shipment_route", {
    target_shipment_id: shipmentId,
    selected_route_template_id: routeTemplateId,
  });
}

type ShipmentRouteSnapshot = {
  shipment_id: number;
  route_template_id: string | null;
  template_name: string;
  transport_mode: SavedRouteTemplate["transport_mode"];
  template_version: number;
  captured_at: string;
};

export async function loadShipmentRouteSnapshot(shipmentId: number) {
  const [{ data: snapshot, error: snapshotError }, { data: stops, error: stopsError }] = await Promise.all([
    supabase
      .from("shipment_route_snapshots")
      .select("shipment_id, route_template_id, template_name, transport_mode, template_version, captured_at")
      .eq("shipment_id", shipmentId)
      .maybeSingle(),
    supabase
      .from("shipment_route_stops")
      // Snapshot rows already contain the immutable route identity. Do not join the
      // admin-only location library here: public tracking must be able to read the
      // copied stop names, cities, countries, codes, and ordering independently.
      .select("id, shipment_id, position, name, country, city, stop_type, code, operational_notes, onward_transport, estimated_duration_hours, estimated_distance_km, system_recommended_duration_hours, system_recommended_distance_km, system_recommendation_confidence, system_recommendation_metadata, system_recommendation_calculated_at, leg_internal_notes, expected_arrival_offset, expected_departure_offset, default_status_text, logistics_location_id")
      .eq("shipment_id", shipmentId)
      .order("position"),
  ]);

  const error = snapshotError ?? stopsError;
  if (error || !snapshot) return { snapshot: null, stops: [], journey: null, error };

  const typedSnapshot = snapshot as ShipmentRouteSnapshot;
  const template: SavedRouteTemplate = {
    id: typedSnapshot.route_template_id ?? `shipment-${shipmentId}`,
    name: typedSnapshot.template_name,
    transport_mode: typedSnapshot.transport_mode,
    version: typedSnapshot.template_version,
  };
  const typedStops = (stops ?? []).map((stop) => ({
    ...stop,
    route_template_id: template.id,
  })) as SavedRouteStop[];

  return {
    snapshot: typedSnapshot,
    stops: typedStops,
    journey: buildJourneyFromSavedRoute(template, typedStops),
    error: null,
  };
}
