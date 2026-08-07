import { getShipmentStageIndex } from "./shipment-state";

export {
  SHIPMENT_STAGES,
  getShipmentProgress as shipmentProgress,
  getShipmentStageIndex as shipmentStageIndex,
  normalizeShipmentStatus,
} from "./shipment-state";
export type { ShipmentStage } from "./shipment-state";

export function statusBadgeClasses(status: string | null | undefined) {
  const index = getShipmentStageIndex(status);
  if (index === 6) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (index === 5) return "bg-cyan-50 text-cyan-700 ring-cyan-600/20";
  if (index === 4) return "bg-amber-50 text-amber-800 ring-amber-600/20";
  if (index === 3) return "bg-orange-50 text-orange-700 ring-orange-600/20";
  if (index === 2) return "bg-violet-50 text-violet-700 ring-violet-600/20";
  if (index === 1) return "bg-blue-50 text-blue-700 ring-blue-600/20";
  return "bg-slate-100 text-slate-700 ring-slate-500/20";
}
