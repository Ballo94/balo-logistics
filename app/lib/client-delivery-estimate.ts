import { canonicalizeShipmentStatus } from "./shipment-state";

export type ClientDeliveryEstimate = {
  label: string;
  estimatedDelivery: string | null;
  message: string;
  isPaused: boolean;
};

const ESTIMATE_NOTE = "Timing may change with customs clearance, carrier schedules, border procedures, weather or transit handling.";

export function getClientDeliveryEstimate(
  shipmentStatus: string | null | undefined,
  estimatedDelivery: string | null | undefined,
): ClientDeliveryEstimate {
  const status = canonicalizeShipmentStatus(shipmentStatus);
  if (status === "customs") return {
    label: "Customs clearance in progress",
    estimatedDelivery: null,
    message: "Delivery estimate will update after clearance.",
    isPaused: true,
  };
  if (status === "exception") return {
    label: "Delivery estimate under review",
    estimatedDelivery: null,
    message: "The delivery estimate will update after the current operational issue is reviewed.",
    isPaused: true,
  };
  return {
    label: "Estimated delivery window",
    estimatedDelivery: estimatedDelivery?.trim() || null,
    message: ESTIMATE_NOTE,
    isPaused: false,
  };
}
