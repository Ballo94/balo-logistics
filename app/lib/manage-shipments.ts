export const MANAGE_TRANSPORT_FILTERS = ["All", "Air", "Sea", "Road", "Multimodal"] as const;
export type ManageTransportFilter = (typeof MANAGE_TRANSPORT_FILTERS)[number];

export const MANAGE_SORT_OPTIONS = [
  { value: "created-newest", label: "Newest created" },
  { value: "created-oldest", label: "Oldest created" },
  { value: "eta-soonest", label: "Estimated delivery: soonest" },
  { value: "eta-latest", label: "Estimated delivery: latest" },
] as const;
export type ManageShipmentSort = (typeof MANAGE_SORT_OPTIONS)[number]["value"];

export type ManageShipmentListItem = {
  tracking_number: string;
  client_name: string;
  receiver_name: string | null;
  client_company_name: string | null;
  receiver_company_name: string | null;
  origin_country: string;
  destination_country: string;
  transport_mode: string | null;
  shipment_status: string | null;
  estimated_delivery: string | null;
  created_at: string;
};

export type ManageShipmentCounts = {
  total: number;
  active: number;
  customs: number;
  exceptions: number;
  outForDelivery: number;
  delivered: number;
};

export type OperationalAttention = "customs" | "exception" | "delivery" | null;

export function filterAndSortShipments<T extends ManageShipmentListItem>(shipments: readonly T[], options: { search: string; transport: ManageTransportFilter; status: string; sort: ManageShipmentSort }) {
  const query = normalize(options.search);
  const filtered = shipments.filter((shipment) => {
    const searchable = [shipment.tracking_number, shipment.client_name, shipment.receiver_name, shipment.client_company_name, shipment.receiver_company_name, shipment.origin_country, shipment.destination_country];
    const matchesSearch = !query || searchable.some((value) => normalize(value).includes(query));
    const matchesTransport = options.transport === "All" || normalize(shipment.transport_mode) === normalize(options.transport);
    const matchesStatus = !options.status || normalize(shipment.shipment_status || "Shipment Created") === normalize(options.status);
    return matchesSearch && matchesTransport && matchesStatus;
  });
  return [...filtered].sort((left, right) => compareShipments(left, right, options.sort));
}

export function shipmentOperationCounts(shipments: readonly ManageShipmentListItem[]): ManageShipmentCounts {
  return shipments.reduce<ManageShipmentCounts>((counts, shipment) => {
    const status = normalize(shipment.shipment_status || "Shipment Created");
    counts.total += 1;
    if (status !== "delivered") counts.active += 1;
    if (isCustomsStatus(status)) counts.customs += 1;
    if (isExceptionStatus(status)) counts.exceptions += 1;
    if (status === "out for delivery") counts.outForDelivery += 1;
    if (status === "delivered") counts.delivered += 1;
    return counts;
  }, { total: 0, active: 0, customs: 0, exceptions: 0, outForDelivery: 0, delivered: 0 });
}

export function operationalAttention(status: string | null): OperationalAttention {
  const value = normalize(status);
  if (isExceptionStatus(value)) return "exception";
  if (isCustomsStatus(value)) return "customs";
  if (value === "out for delivery") return "delivery";
  return null;
}

export function paginateShipments<T>(shipments: readonly T[], page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(shipments.length / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: shipments.slice(start, start + pageSize), page: safePage, totalPages, start: shipments.length ? start + 1 : 0, end: Math.min(start + pageSize, shipments.length) };
}

function compareShipments(left: ManageShipmentListItem, right: ManageShipmentListItem, sort: ManageShipmentSort) {
  if (sort === "created-newest") return compareDates(left.created_at, right.created_at, "desc");
  if (sort === "created-oldest") return compareDates(left.created_at, right.created_at, "asc");
  if (sort === "eta-soonest") return compareOptionalDates(left.estimated_delivery, right.estimated_delivery, "asc");
  return compareOptionalDates(left.estimated_delivery, right.estimated_delivery, "desc");
}

function compareDates(left: string, right: string, order: "asc" | "desc") {
  const leftTime = dateValue(left);
  const rightTime = dateValue(right);
  if (Number.isNaN(leftTime) && Number.isNaN(rightTime)) return 0;
  if (Number.isNaN(leftTime)) return 1;
  if (Number.isNaN(rightTime)) return -1;
  if (leftTime === rightTime) return 0;
  return order === "asc" ? leftTime - rightTime : rightTime - leftTime;
}

function compareOptionalDates(left: string | null, right: string | null, order: "asc" | "desc") {
  const leftTime = optionalDateValue(left);
  const rightTime = optionalDateValue(right);
  if (leftTime == null && rightTime == null) return 0;
  if (leftTime == null) return 1;
  if (rightTime == null) return -1;
  return order === "asc" ? leftTime - rightTime : rightTime - leftTime;
}

function optionalDateValue(value: string | null) {
  if (!value) return null;
  const parsed = dateValue(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function dateValue(value: string) {
  const parsed = new Date(value.includes("T") ? value : `${value}T00:00:00`).getTime();
  return parsed;
}

function isCustomsStatus(value: string) { return value.includes("customs") && !value.includes("cleared"); }
function isExceptionStatus(value: string) { return ["delayed", "shipment issue", "exception", "returned"].includes(value); }
function normalize(value: string | null | undefined) { return (value ?? "").trim().toLowerCase(); }
