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
export type CanonicalShipmentStatus = "created" | "collected" | "warehouse" | "awaiting_departure" | "transit" | "arrived_destination" | "customs" | "destination_hub" | "out_for_delivery" | "delivered" | "exception";
export type TransportKind = "air" | "sea" | "road" | "other";
export type TimelineState = "completed" | "current" | "upcoming";
export type MilestoneIcon = "package" | "collection" | "warehouse" | "air" | "sea" | "road" | "customs" | "delivery" | "delivered";

export type ShipmentStateInput = {
  shipmentStatus: string | null | undefined;
  transportMode: string | null | undefined;
  currentLocation: string | null | undefined;
  originCountry: string;
  destinationCountry: string;
  receiverAddress?: string | null;
  courierName?: string | null;
  estimatedDelivery?: string | null;
  latestUpdateNote?: string | null;
};

export type ShipmentMilestone = {
  key: ShipmentStage;
  label: string;
  index: number;
  state: TimelineState;
  icon: MilestoneIcon;
};

export type ShipmentState = {
  canonicalStatus: CanonicalShipmentStatus;
  normalizedStatus: string;
  displayStatus: string;
  progress: number;
  stageIndex: number;
  currentCheckpoint: string;
  currentLocation: string;
  nextStop: string;
  originLabel: string;
  destinationLabel: string;
  transportKind: TransportKind;
  transportLabel: string;
  operationalStage: string;
  statusNote: string;
  estimatedArrival: string | null;
  modeDetailLabel: string;
  modeDetailValue: string;
  milestones: ShipmentMilestone[];
};

const PROGRESS: Record<CanonicalShipmentStatus, number> = {
  created: 5,
  collected: 17,
  warehouse: 25,
  awaiting_departure: 35,
  transit: 50,
  arrived_destination: 68,
  customs: 75,
  destination_hub: 85,
  out_for_delivery: 92,
  delivered: 100,
  exception: 50,
};

const STAGE_INDEX: Record<CanonicalShipmentStatus, number> = {
  created: 0,
  collected: 1,
  warehouse: 2,
  awaiting_departure: 2,
  transit: 3,
  arrived_destination: 3,
  customs: 4,
  destination_hub: 4,
  out_for_delivery: 5,
  delivered: 6,
  exception: 3,
};

export function normalizeShipmentStatus(status: string | null | undefined) {
  return status?.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? "";
}

export function canonicalizeShipmentStatus(status: string | null | undefined): CanonicalShipmentStatus {
  const value = normalizeShipmentStatus(status);
  if (/delivered|journey complete|completed/.test(value)) return "delivered";
  if (/out for delivery|with courier|last mile|final delivery/.test(value)) return "out_for_delivery";
  if (/destination (warehouse|hub)|distribution (hub|centre|center)/.test(value)) return "destination_hub";
  if (/custom|clearance|border processing|border clearance|cleared/.test(value)) return "customs";
  if (/arrived (at )?(destination|transit)|destination (airport|port)|arrival/.test(value)) return "arrived_destination";
  if (/in flight|at sea|ocean transit|road transit|in transit|departed|on route|shipping/.test(value)) return "transit";
  if (/awaiting departure|loaded on|loaded for|origin processing/.test(value)) return "awaiting_departure";
  if (/warehouse|origin hub|hub processing|sorting|arrived origin/.test(value)) return "warehouse";
  if (/picked up|pickup|collected/.test(value)) return "collected";
  if (/delayed|shipment issue|exception|held/.test(value)) return "exception";
  return "created";
}

export function getShipmentStageIndex(status: string | null | undefined) {
  return STAGE_INDEX[canonicalizeShipmentStatus(status)];
}

export function getShipmentProgress(status: string | null | undefined) {
  return PROGRESS[canonicalizeShipmentStatus(status)];
}

export function getTransportKind(mode: string | null | undefined): TransportKind {
  const value = normalizeShipmentStatus(mode);
  if (/air|flight|aircraft/.test(value)) return "air";
  if (/sea|ocean|vessel|ship/.test(value)) return "sea";
  if (/road|truck|land/.test(value)) return "road";
  return "other";
}

function logisticsLocation(country: string, kind: TransportKind) {
  const locations: Record<string, { air: string; sea: string; road: string }> = {
    "south africa": { air: "OR Tambo International Airport (JNB)", sea: "Durban Port (ZADBN)", road: "Johannesburg Distribution Centre" },
    namibia: { air: "Hosea Kutako International Airport (WDH)", sea: "Port of Walvis Bay (NAWVB)", road: "Windhoek Distribution Centre" },
    china: { air: "Shanghai Pudong International Airport (PVG)", sea: "Port of Shanghai (CNSHA)", road: "Shanghai Distribution Centre" },
    "united arab emirates": { air: "Dubai International Airport (DXB)", sea: "Jebel Ali Port (AEJEA)", road: "Dubai Distribution Centre" },
    france: { air: "Paris Charles de Gaulle Airport (CDG)", sea: "Port of Le Havre (FRLEH)", road: "Paris Distribution Centre" },
    singapore: { air: "Singapore Changi Airport (SIN)", sea: "Port of Singapore (SGSIN)", road: "Singapore Distribution Centre" },
  };
  const mappedKind = kind === "other" ? "road" : kind;
  return locations[country.trim().toLowerCase()]?.[mappedKind] ?? (kind === "air" ? `${country} origin airport` : kind === "sea" ? `${country} origin port` : kind === "road" ? `${country} distribution centre` : country);
}

function transportLabel(kind: TransportKind, mode: string | null | undefined) {
  if (kind === "air") return "Air Freight";
  if (kind === "sea") return "Sea Freight";
  if (kind === "road") return "Road Freight";
  return mode?.trim() || "Freight";
}

function operationalStage(status: CanonicalShipmentStatus, kind: TransportKind) {
  const common: Partial<Record<CanonicalShipmentStatus, string>> = { created: "Shipment Created", collected: "Collected", customs: "Customs Clearance", out_for_delivery: "Final Delivery", delivered: "Delivered", exception: "Shipment Exception" };
  if (common[status]) return common[status];
  if (kind === "air") return ({ warehouse: "Origin Processing", awaiting_departure: "Awaiting Departure", transit: "In Flight", arrived_destination: "Arrived Destination Airport", destination_hub: "Destination Hub" } as Partial<Record<CanonicalShipmentStatus, string>>)[status] ?? "Air Freight Processing";
  if (kind === "sea") return ({ warehouse: "Port Processing", awaiting_departure: "Loaded for Sea Freight", transit: "At Sea", arrived_destination: "Arrived Destination Port", destination_hub: "Destination Hub" } as Partial<Record<CanonicalShipmentStatus, string>>)[status] ?? "Sea Freight Processing";
  if (kind === "road") return ({ warehouse: "Origin Hub", awaiting_departure: "Road Departure", transit: "Road Transit", arrived_destination: "Destination Hub", destination_hub: "Destination Hub" } as Partial<Record<CanonicalShipmentStatus, string>>)[status] ?? "Road Freight Processing";
  return ({ warehouse: "Logistics Processing", awaiting_departure: "Awaiting Departure", transit: "In Transit", arrived_destination: "Arrived Destination", destination_hub: "Destination Hub" } as Partial<Record<CanonicalShipmentStatus, string>>)[status] ?? "Shipment Processing";
}

function currentCheckpoint(status: CanonicalShipmentStatus, stage: string) {
  if (status === "warehouse") return "At Origin Hub";
  return stage;
}

function storedLocationIsCompatible(location: string, status: CanonicalShipmentStatus) {
  const value = location.toLowerCase();
  if (status === "delivered") return /delivered|receiver|customer|address/.test(value);
  if (status === "created") return !/delivered|out for delivery|in flight|at sea|destination customs/.test(value);
  if (status === "out_for_delivery") return !/origin airport|origin port|in flight|at sea/.test(value);
  return true;
}

function fallbackCurrentLocation(status: CanonicalShipmentStatus, kind: TransportKind) {
  if (status === "created") return "Origin / Supplier Location";
  if (status === "collected") return "Collected from Sender";
  if (status === "warehouse" || status === "awaiting_departure") return "Origin Warehouse / Logistics Hub";
  if (status === "transit" || status === "arrived_destination") return kind === "air" ? "In Flight" : kind === "sea" ? "At Sea" : kind === "road" ? "In Road Transit" : "In Transit";
  if (status === "customs") return "Destination Customs Facility";
  if (status === "destination_hub") return "Destination Distribution Hub";
  if (status === "out_for_delivery") return "Local Delivery Network";
  if (status === "delivered") return "Delivered to Receiver";
  return "Location Update Pending";
}

function nextStop(status: CanonicalShipmentStatus, kind: TransportKind, origin: string, destination: string, receiverAddress?: string | null) {
  if (status === "delivered") return "Journey Complete";
  if (status === "out_for_delivery") return receiverAddress?.trim() || "Receiver";
  if (status === "customs" || status === "destination_hub") return "Destination Distribution Hub";
  if (status === "arrived_destination") return "Destination Customs Facility";
  if (status === "transit") return destination;
  if (status === "warehouse" || status === "awaiting_departure") return kind === "road" ? "Next Road Hub / Border Post" : destination;
  if (status === "created" || status === "collected") return origin;
  return destination;
}

function defaultStatusNote(status: CanonicalShipmentStatus, kind: TransportKind) {
  if (status === "created") return "Your shipment has been registered with Balo Logistics.";
  if (status === "collected") return "Your shipment has been collected and is progressing toward the next logistics checkpoint.";
  if (status === "warehouse" || status === "awaiting_departure") return "Your shipment is being processed at the logistics facility.";
  if (status === "transit" || status === "arrived_destination") return `Your shipment is currently moving through the ${kind === "air" ? "air freight" : kind === "sea" ? "sea freight" : kind === "road" ? "road transport" : "logistics"} network.`;
  if (status === "customs") return "Your shipment is undergoing customs processing.";
  if (status === "destination_hub") return "Your shipment is being processed at the destination logistics hub.";
  if (status === "out_for_delivery") return "Your shipment is with the local delivery team.";
  if (status === "delivered") return "Your shipment has been delivered successfully.";
  return "Your shipment requires operational attention. Please refer to the latest tracking update.";
}

function milestoneLabel(index: number, kind: TransportKind) {
  if (index === 2) return kind === "air" ? "Origin Processing" : kind === "sea" ? "Port Processing" : kind === "road" ? "Origin Hub" : "In Warehouse";
  if (index === 3) return kind === "air" ? "In Flight" : kind === "sea" ? "At Sea" : kind === "road" ? "Road Transit" : "In Transit";
  if (index === 5) return "Final Delivery";
  return SHIPMENT_STAGES[index];
}

function milestoneIcon(index: number, kind: TransportKind): MilestoneIcon {
  if (index === 0) return "package";
  if (index === 1) return "collection";
  if (index === 2) return "warehouse";
  if (index === 3) return kind === "air" ? "air" : kind === "sea" ? "sea" : kind === "road" ? "road" : "warehouse";
  if (index === 4) return "customs";
  if (index === 5) return "delivery";
  return "delivered";
}

export function deriveShipmentState(input: ShipmentStateInput): ShipmentState {
  const canonicalStatus = canonicalizeShipmentStatus(input.shipmentStatus);
  const transportKind = getTransportKind(input.transportMode);
  const originLabel = logisticsLocation(input.originCountry, transportKind);
  const destinationLabel = logisticsLocation(input.destinationCountry, transportKind).replace(" origin ", " destination ");
  const stageIndex = STAGE_INDEX[canonicalStatus];
  const stage = operationalStage(canonicalStatus, transportKind);
  const storedLocation = input.currentLocation?.trim();
  const currentLocation = storedLocation && storedLocationIsCompatible(storedLocation, canonicalStatus) ? storedLocation : fallbackCurrentLocation(canonicalStatus, transportKind);
  const latestNote = input.latestUpdateNote?.trim();
  const modeDetailLabel = transportKind === "air" ? "Flight stage" : transportKind === "sea" ? "Vessel name" : transportKind === "road" ? "Road stage" : "Current stage";
  const modeDetailValue = transportKind === "sea" ? "Not provided" : transportKind === "road" ? currentLocation : stage;
  const milestones = SHIPMENT_STAGES.map((key, index): ShipmentMilestone => ({ key, label: milestoneLabel(index, transportKind), index, state: index < stageIndex ? "completed" : index === stageIndex ? "current" : "upcoming", icon: milestoneIcon(index, transportKind) }));

  return {
    canonicalStatus,
    normalizedStatus: normalizeShipmentStatus(input.shipmentStatus),
    displayStatus: input.shipmentStatus?.trim() || "Shipment Created",
    progress: canonicalStatus === "delivered" ? 100 : PROGRESS[canonicalStatus],
    stageIndex,
    currentCheckpoint: currentCheckpoint(canonicalStatus, stage),
    currentLocation,
    nextStop: nextStop(canonicalStatus, transportKind, originLabel, destinationLabel, input.receiverAddress),
    originLabel,
    destinationLabel,
    transportKind,
    transportLabel: transportLabel(transportKind, input.transportMode),
    operationalStage: stage,
    statusNote: latestNote || defaultStatusNote(canonicalStatus, transportKind),
    estimatedArrival: input.estimatedDelivery?.trim() || null,
    modeDetailLabel,
    modeDetailValue,
    milestones,
  };
}
