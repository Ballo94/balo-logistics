import { canonicalizeShipmentStatus, normalizeShipmentStatus } from "./shipment-state";
import type { RouteJourney } from "./route-intelligence";

export type ShipmentHistoryAuditRow = { status: string; location: string | null; note?: string | null; created_at: string; route_checkpoint_id?: string | null };
export type CustomerShipmentHistoryRow = Omit<ShipmentHistoryAuditRow, "route_checkpoint_id"> & { checkpoint_index: number | null };

function checkpointIndexForRow(row: ShipmentHistoryAuditRow, journey: RouteJourney) {
  if (row.route_checkpoint_id) {
    const exact = journey.checkpoints.findIndex((checkpoint) => checkpoint.id === row.route_checkpoint_id);
    if (exact >= 0) return exact;
  }
  const normalizedStatus = normalizeShipmentStatus(row.status);
  const candidates = journey.checkpoints.map((checkpoint, index) => ({ checkpoint, index }))
    .filter(({ checkpoint }) => normalizeShipmentStatus(checkpoint.label) === normalizedStatus);
  if (candidates.length) {
    const location = normalizeShipmentStatus(row.location);
    const matchingLocation = location ? candidates.filter(({ checkpoint }) => [checkpoint.location.name, checkpoint.location.city, checkpoint.location.code].some((value) => normalizeShipmentStatus(value) === location)) : [];
    const eligible = matchingLocation.length ? matchingLocation : candidates;
    if (eligible.length !== 1) return null;
    return eligible[0].index;
  }
  const canonical = canonicalizeShipmentStatus(row.status);
  if (canonical === "exception" || canonical === "created") return null;
  const fallback = journey.checkpoints.map((checkpoint, index) => ({ checkpoint, index }))
    .filter(({ checkpoint }) => canonicalizeShipmentStatus(checkpoint.label) === canonical);
  return fallback.length === 1 ? fallback[0].index : null;
}

export function reconcilePublicShipmentHistory(rows: readonly ShipmentHistoryAuditRow[], journey: RouteJourney | null, currentCheckpointId: string | null) {
  if (!journey) return rows.map((row) => toPublicRow(row, null));
  const currentIndex = journey.checkpoints.findIndex((checkpoint) => checkpoint.id === currentCheckpointId);
  return rows.flatMap((row) => {
    const index = checkpointIndexForRow(row, journey);
    if (currentIndex >= 0 && index !== null && index > currentIndex) return [];
    return [toPublicRow(row, index)];
  });
}

function toPublicRow(row: ShipmentHistoryAuditRow, checkpointIndex: number | null): CustomerShipmentHistoryRow {
  return { status: row.status, location: row.location, note: row.note, created_at: row.created_at, checkpoint_index: checkpointIndex };
}
