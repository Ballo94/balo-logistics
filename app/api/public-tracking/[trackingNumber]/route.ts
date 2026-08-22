import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase-admin";
import { buildJourneyFromSavedRoute, type SavedRouteStop, type SavedRouteTemplate } from "../../../lib/saved-routes";
import { SHIPMENT_DOCUMENT_BUCKET, type ShipmentDocument } from "../../../lib/shipment-document-records";
import type { ShipmentCommunication } from "../../../lib/shipment-communications";
import type { PublicShipmentHistory, PublicShipmentRecord, PublicTrackingBundle } from "../../../lib/public-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PUBLIC_SHIPMENT_FIELDS = "id, tracking_number, client_name, origin_country, destination_country, current_location, current_route_checkpoint_id, shipment_status, transport_mode, vessel_name, estimated_delivery, item_description, created_at, courier_name, weight_kg, package_count, package_type, dimensions, container_number, seal_number, declared_value, receiver_name, route_template_id";

const RESPONSE_HEADERS = { "Cache-Control": "no-store, max-age=0" };

export async function GET(_request: Request, context: { params: Promise<{ trackingNumber: string }> }) {
  const { trackingNumber: encodedTrackingNumber } = await context.params;
  let trackingNumber = "";
  try { trackingNumber = decodeURIComponent(encodedTrackingNumber).trim(); } catch { return failure("Invalid tracking number.", 400); }
  if (!isValidTrackingNumber(trackingNumber)) return failure("Invalid tracking number.", 400);

  let result;
  const supabase = createSupabaseAdminClient();
  try {
    result = await supabase.from("shipments").select(PUBLIC_SHIPMENT_FIELDS).eq("tracking_number", trackingNumber).maybeSingle();
  } catch {
    return failure("Tracking information is temporarily unavailable.", 500);
  }
  const { data, error } = result;
  if (error) return failure("Tracking information is temporarily unavailable.", 500);
  if (!data) return failure("No shipment found with that tracking number.", 404);

  const { id: shipmentId, route_template_id: routeTemplateId, ...publicFields } = data;
  const shipment = { ...publicFields, receiver_address: null } as PublicShipmentRecord;
  try {
    const [historyResult, snapshotResult, snapshotStopsResult, documentsResult, communicationsResult] = await Promise.all([
      supabase.from("shipment_history").select("status, location, created_at").eq("shipment_id", shipmentId).order("created_at", { ascending: true }),
      supabase.from("shipment_route_snapshots").select("shipment_id, route_template_id, template_name, transport_mode, template_version").eq("shipment_id", shipmentId).maybeSingle(),
      supabase.from("shipment_route_stops").select("id, position, name, country, city, stop_type, code, onward_transport, estimated_distance_km, system_recommended_distance_km, expected_arrival_offset, expected_departure_offset, default_status_text, logistics_location_id").eq("shipment_id", shipmentId).order("position"),
      supabase.from("shipment_documents").select("id, document_name, document_type, document_direction, file_url, file_size, visible_to_customer, uploaded_at, lifecycle_status, required_for, replacement_reason, submitted_at, completed_at").eq("shipment_id", shipmentId).eq("visible_to_customer", true).order("uploaded_at", { ascending: false }).order("id", { ascending: false }),
      supabase.from("shipment_communications").select("id, title, message, type, created_at, visible_to_customer").eq("shipment_id", shipmentId).eq("visible_to_customer", true).order("created_at", { ascending: false }).order("id", { ascending: false }),
    ]);
    const relatedError = historyResult.error ?? snapshotResult.error ?? snapshotStopsResult.error ?? documentsResult.error;
    if (relatedError) return failure("Tracking information is temporarily unavailable.", 500);

    const history = (historyResult.data ?? []) as PublicShipmentHistory[];
    const documents = await signDocuments(supabase, (documentsResult.data ?? []) as ShipmentDocument[]);
    const communications = communicationsResult.error
      ? []
      : (communicationsResult.data ?? []) as ShipmentCommunication[];
    const journey = snapshotResult.data
      ? buildSnapshotJourney(shipmentId, snapshotResult.data, snapshotStopsResult.data ?? [])
      : await loadLegacyJourney(supabase, routeTemplateId);
    const bundle: PublicTrackingBundle = { shipment, history, documents, communications, journey };
    return NextResponse.json(bundle, { headers: RESPONSE_HEADERS });
  } catch {
    return failure("Tracking information is temporarily unavailable.", 500);
  }
}

function isValidTrackingNumber(value: string) { return value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9-]+$/.test(value); }
function failure(error: string, status: number) { return NextResponse.json({ error }, { status, headers: RESPONSE_HEADERS }); }

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type SnapshotRecord = { route_template_id: string | null; template_name: string; transport_mode: SavedRouteTemplate["transport_mode"]; template_version: number };
type RouteTemplateRecord = SavedRouteTemplate;

function buildSnapshotJourney(shipmentId: number, snapshot: SnapshotRecord, rows: Record<string, unknown>[]) {
  const template: SavedRouteTemplate = { id: snapshot.route_template_id ?? `shipment-${shipmentId}`, name: snapshot.template_name, transport_mode: snapshot.transport_mode, version: snapshot.template_version };
  return buildJourneyFromSavedRoute(template, sanitizeStops(rows, template.id));
}

async function loadLegacyJourney(supabase: AdminClient, routeTemplateId: string | null) {
  if (!routeTemplateId) return null;
  const [templateResult, stopsResult] = await Promise.all([
    supabase.from("route_templates").select("id, name, transport_mode, estimated_transit_days, route_status, version").eq("id", routeTemplateId).maybeSingle(),
    supabase.from("route_stops").select("id, route_template_id, position, name, country, city, stop_type, code, onward_transport, estimated_distance_km, system_recommended_distance_km, expected_arrival_offset, expected_departure_offset, default_status_text, logistics_location_id").eq("route_template_id", routeTemplateId).order("position"),
  ]);
  if (templateResult.error || stopsResult.error || !templateResult.data) return null;
  const template = templateResult.data as RouteTemplateRecord;
  return buildJourneyFromSavedRoute(template, sanitizeStops(stopsResult.data ?? [], template.id));
}

function sanitizeStops(rows: Record<string, unknown>[], routeTemplateId: string) {
  return rows.map((row) => ({ ...row, route_template_id: routeTemplateId, operational_notes: null, leg_internal_notes: null, logistics_location: null })) as SavedRouteStop[];
}

async function signDocuments(supabase: AdminClient, documents: ShipmentDocument[]) {
  return Promise.all(documents.map(async (document) => {
    if (!document.file_url) return document;
    const [view, download] = await Promise.all([
      supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).createSignedUrl(document.file_url, 3600),
      supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).createSignedUrl(document.file_url, 3600, { download: document.document_name }),
    ]);
    return { ...document, view_url: view.data?.signedUrl ?? "", download_url: download.data?.signedUrl ?? "" };
  }));
}
