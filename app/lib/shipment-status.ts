export const SHIPMENT_STAGES = [
  "Shipment Created",
  "Collected",
  "In Warehouse",
  "In Transit",
  "Customs Clearance",
  "Out for Delivery",
  "Delivered",
] as const;

export type ShipmentStage = (typeof SHIPMENT_STAGES)[number];

export function normalizeShipmentStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? "";
}

export function shipmentStageIndex(status: string | null | undefined) {
  const value = normalizeShipmentStatus(status);
  if (/delivered|complete/.test(value)) return 6;
  if (/out for delivery|with courier|last mile/.test(value)) return 5;
  if (/custom|clearance|cleared/.test(value)) return 4;
  if (/in transit|departed|on route|shipping/.test(value)) return 3;
  if (/warehouse|hub|sorting|arrived/.test(value)) return 2;
  if (/picked up|pickup|collected/.test(value)) return 1;
  return 0;
}

export function shipmentProgress(status: string | null | undefined) {
  return Math.round((shipmentStageIndex(status) / (SHIPMENT_STAGES.length - 1)) * 100);
}

export function statusBadgeClasses(status: string | null | undefined) {
  const index = shipmentStageIndex(status);
  if (index === 6) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (index === 5) return "bg-cyan-50 text-cyan-700 ring-cyan-600/20";
  if (index === 4) return "bg-amber-50 text-amber-800 ring-amber-600/20";
  if (index === 3) return "bg-orange-50 text-orange-700 ring-orange-600/20";
  if (index === 2) return "bg-violet-50 text-violet-700 ring-violet-600/20";
  if (index === 1) return "bg-blue-50 text-blue-700 ring-blue-600/20";
  return "bg-slate-100 text-slate-700 ring-slate-500/20";
}
