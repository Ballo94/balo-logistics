export type RecommendationConfidence = "Low" | "Medium" | "High";

export type RecommendationLocation = {
  latitude: number | null;
  longitude: number | null;
  verified: boolean;
};

export type RouteLegRecommendation = {
  distanceKm: number | null;
  durationHours: number | null;
  confidence: RecommendationConfidence | null;
  metadata: {
    model: "balo-route-estimate-v1";
    basis: string;
    assumptions: Record<string, number | string>;
    unavailableReason?: string;
  };
};

const EARTH_RADIUS_KM = 6371;
const AIR_CRUISE_SPEED_KMH = 800;
const AIR_HANDLING_HOURS = 3;
const ROAD_DISTANCE_FACTOR = 1.25;
const ROAD_AVERAGE_SPEED_KMH = 65;
const ROAD_HANDLING_HOURS = 2;

function radians(value: number) {
  return value * Math.PI / 180;
}

export function greatCircleDistanceKm(origin: RecommendationLocation, destination: RecommendationLocation) {
  const latitudeDelta = radians(destination.latitude! - origin.latitude!);
  const longitudeDelta = radians(destination.longitude! - origin.longitude!);
  const originLatitude = radians(origin.latitude!);
  const destinationLatitude = radians(destination.latitude!);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(originLatitude) * Math.cos(destinationLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function unavailable(reason: string): RouteLegRecommendation {
  return {
    distanceKm: null,
    durationHours: null,
    confidence: null,
    metadata: { model: "balo-route-estimate-v1", basis: "No estimate calculated", assumptions: {}, unavailableReason: reason },
  };
}

function hasVerifiedCoordinates(location: RecommendationLocation) {
  return location.verified
    && Number.isFinite(location.latitude)
    && Number.isFinite(location.longitude)
    && location.latitude! >= -90
    && location.latitude! <= 90
    && location.longitude! >= -180
    && location.longitude! <= 180;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function recommendRouteLeg(
  origin: RecommendationLocation,
  destination: RecommendationLocation,
  transportMode: string | null | undefined,
): RouteLegRecommendation {
  if (!hasVerifiedCoordinates(origin) || !hasVerifiedCoordinates(destination)) {
    return unavailable("Both route stops require verified coordinates.");
  }

  const mode = transportMode?.trim().toLowerCase();
  const greatCircleKm = greatCircleDistanceKm(origin, destination);

  if (mode === "air") {
    return {
      distanceKm: round(greatCircleKm),
      durationHours: round(greatCircleKm / AIR_CRUISE_SPEED_KMH + AIR_HANDLING_HOURS),
      confidence: "Medium",
      metadata: {
        model: "balo-route-estimate-v1",
        basis: "Great-circle air distance between verified coordinates",
        assumptions: { cruiseSpeedKmh: AIR_CRUISE_SPEED_KMH, fixedHandlingHours: AIR_HANDLING_HOURS },
      },
    };
  }

  if (mode === "road") {
    const approximatedRoadKm = greatCircleKm * ROAD_DISTANCE_FACTOR;
    return {
      distanceKm: round(approximatedRoadKm),
      durationHours: round(approximatedRoadKm / ROAD_AVERAGE_SPEED_KMH + ROAD_HANDLING_HOURS),
      confidence: "Low",
      metadata: {
        model: "balo-route-estimate-v1",
        basis: "Great-circle distance adjusted by a conservative road factor",
        assumptions: { roadDistanceFactor: ROAD_DISTANCE_FACTOR, averageSpeedKmh: ROAD_AVERAGE_SPEED_KMH, fixedHandlingHours: ROAD_HANDLING_HOURS },
      },
    };
  }

  if (mode === "sea") {
    return unavailable("Verified coordinates do not establish a navigable shipping-lane distance.");
  }

  return unavailable(`Transport mode ${transportMode || "not provided"} is not supported by the Phase 1 estimator.`);
}

export function effectiveEstimate(adminValue: number | null | undefined, systemValue: number | null | undefined) {
  return adminValue ?? systemValue ?? null;
}
