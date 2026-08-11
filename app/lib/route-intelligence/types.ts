export type RouteTransportMode = "air" | "sea" | "road" | "multimodal";
export type LocationKind = "airport" | "port" | "warehouse" | "distribution_centre" | "border" | "city" | "customs" | "customer_address" | "transit_hub" | "rail_terminal" | "delivery_depot" | "other";
export type RoutePhase = "collection" | "origin" | "export" | "transit" | "import" | "destination" | "delivery";
export type CheckpointKind =
  | "shipment_created" | "collected" | "origin_warehouse" | "origin_gateway" | "export_customs" | "departed_origin"
  | "transit_arrival" | "transit_processing" | "transit_departure" | "linehaul"
  | "destination_arrival" | "import_customs" | "destination_warehouse"
  | "border_exit" | "border_customs" | "border_entry" | "out_for_delivery" | "delivered"
  | "loaded" | "discharged";

export type LogisticsLocation = {
  id: string;
  name: string;
  city: string;
  country: string;
  countryCode: string;
  kind: LocationKind;
  code?: string;
  aliases?: readonly string[];
  coordinates?: { latitude: number; longitude: number };
};

export type RouteLocationInput = string | LogisticsLocation;

export type FutureOperationalReferences = {
  flightNumber?: string;
  vesselName?: string;
  voyageNumber?: string;
  containerNumber?: string;
  truckRegistration?: string;
  borderReference?: string;
  customsReference?: string;
};

export type RouteCheckpoint = {
  id: string;
  sequence: number;
  kind: CheckpointKind;
  phase: RoutePhase;
  transportMode: RouteTransportMode;
  label: string;
  description: string;
  location: LogisticsLocation;
  references: FutureOperationalReferences;
};

export type RouteLeg = {
  id: string;
  sequence: number;
  transportMode: RouteTransportMode;
  origin: LogisticsLocation;
  destination: LogisticsLocation;
  checkpointIds: string[];
  references: FutureOperationalReferences;
  displayMode?: "Road" | "Air" | "Sea" | "Rail" | "Courier" | "Internal Transfer";
  estimatedDurationHours?: number | null;
  estimatedDistanceKm?: number | null;
  internalNotes?: string | null;
};

export type RouteJourneyInput = {
  origin: RouteLocationInput;
  destination: RouteLocationInput;
  transportMode: string;
  transitStops?: readonly RouteLocationInput[];
  references?: FutureOperationalReferences;
};

export type RouteJourney = {
  version: 1;
  transportMode: RouteTransportMode;
  origin: LogisticsLocation;
  destination: LogisticsLocation;
  transitStops: LogisticsLocation[];
  checkpoints: RouteCheckpoint[];
  legs: RouteLeg[];
};
