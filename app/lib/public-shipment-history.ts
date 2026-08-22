import { canonicalizeShipmentStatus, normalizeShipmentStatus } from "./shipment-state";
import { checkpointIndexForStatus } from "./route-intelligence/presentation";
import type { RouteJourney } from "./route-intelligence";

export type ShipmentHistoryAuditRow = { status: string; location: string | null; note?: string | null; created_at: string; route_checkpoint_id?: string | null };
export type CustomerShipmentHistoryRow = Omit<ShipmentHistoryAuditRow, "route_checkpoint_id">;

export function reconcilePublicShipmentHistory(rows: readonly ShipmentHistoryAuditRow[], journey: RouteJourney | null, currentCheckpointId: string | null) {
  if (!journey || !currentCheckpointId) return rows.map(toPublicRow);
  const currentIndex = journey.checkpoints.findIndex((checkpoint) => checkpoint.id === currentCheckpointId);
  if (currentIndex < 0) return rows.map(toPublicRow);
  return rows.filter((row) => {
    const exactIndex = row.route_checkpoint_id ? journey.checkpoints.findIndex((checkpoint) => checkpoint.id === row.route_checkpoint_id) : -1;
    if (exactIndex >= 0) return exactIndex <= currentIndex;
    if (canonicalizeShipmentStatus(row.status) === "exception") return true;
    const labelIndex = journey.checkpoints.findIndex((checkpoint) => normalizeShipmentStatus(checkpoint.label) === normalizeShipmentStatus(row.status));
    if (labelIndex >= 0) return labelIndex <= currentIndex;
    return checkpointIndexForStatus(journey, canonicalizeShipmentStatus(row.status)) <= currentIndex;
  }).map(toPublicRow);
}

function toPublicRow(row: ShipmentHistoryAuditRow): CustomerShipmentHistoryRow {
  return { status: row.status, location: row.location, note: row.note, created_at: row.created_at };
}
