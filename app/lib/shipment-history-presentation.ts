import type { AdminShipmentHistoryEntry } from "./shipment-history-admin";

export const ADMIN_HISTORY_FILTERS = ["All", "Movement", "Customs", "Customer Updates", "Internal Notes", "Exceptions"] as const;
export type AdminShipmentHistoryFilter = (typeof ADMIN_HISTORY_FILTERS)[number];
export type AdminShipmentHistoryOrder = "newest" | "oldest";

const MOVEMENT_STATUS = /shipment created|collected|picked up|warehouse|facility|processing|dispatch|depart|transit|flight|arriv|loaded|vessel|sea|road|border|distribution|out for delivery|delivered|airport|port|courier|transfer/i;
const EXCEPTION_STATUS = /delay|exception|shipment issue|returned|failed|held/i;

export function matchesAdminShipmentHistoryFilter(entry: AdminShipmentHistoryEntry, filter: AdminShipmentHistoryFilter) {
  if (filter === "All") return true;
  if (filter === "Customer Updates") return Boolean(entry.note?.trim());
  if (filter === "Internal Notes") return Boolean(entry.internal_note?.trim());
  if (filter === "Customs") return /customs/i.test(entry.status);
  if (filter === "Exceptions") return EXCEPTION_STATUS.test(entry.status);
  return MOVEMENT_STATUS.test(entry.status) && !/customs/i.test(entry.status) && !EXCEPTION_STATUS.test(entry.status);
}

export function orderAdminShipmentHistory(entries: readonly AdminShipmentHistoryEntry[], order: AdminShipmentHistoryOrder) {
  const direction = order === "newest" ? -1 : 1;
  return [...entries].sort((left, right) => {
    const timeDifference = timestamp(left.created_at) - timestamp(right.created_at);
    return timeDifference === 0 ? direction * (left.id - right.id) : direction * timeDifference;
  });
}

export function latestAdminShipmentHistoryId(entries: readonly AdminShipmentHistoryEntry[]) {
  return orderAdminShipmentHistory(entries, "newest")[0]?.id ?? null;
}

function timestamp(value: string) {
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}
