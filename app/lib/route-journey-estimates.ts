export type RecommendationConfidence = "Low" | "Medium" | "High";

export type RecommendationLocation = {
  latitude: number | null;
  longitude: number | null;
  verified: boolean;
};

export const COORDINATES_UNAVAILABLE_MESSAGE = "Coordinates unavailable — automatic distance and travel-time estimate cannot be calculated.";

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

type RecommendationStop = {
  onward_transport?: string | null;
  logistics_location?: { latitude: number | null; longitude: number | null; verified: boolean } | Array<{ latitude: number | null; longitude: number | null; verified: boolean }> | null;
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

export function hasUsableVerifiedCoordinates(location: { latitude?: unknown; longitude?: unknown; verified?: unknown } | null | undefined) {
  return location?.verified === true
    && typeof location.latitude === "number"
    && Number.isFinite(location.latitude)
    && typeof location.longitude === "number"
    && Number.isFinite(location.longitude)
    && location.latitude >= -90
    && location.latitude <= 90
    && location.longitude >= -180
    && location.longitude <= 180;
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function recommendRouteLeg(
  origin: RecommendationLocation,
  destination: RecommendationLocation,
  transportMode: string | null | undefined,
): RouteLegRecommendation {
  if (!hasUsableVerifiedCoordinates(origin) || !hasUsableVerifiedCoordinates(destination)) {
    return unavailable(COORDINATES_UNAVAILABLE_MESSAGE);
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

function recommendationLocation(stop: RecommendationStop) {
  return Array.isArray(stop.logistics_location) ? stop.logistics_location[0] ?? null : stop.logistics_location ?? null;
}

export function recommendRouteStopLeg(origin: RecommendationStop, destination: RecommendationStop, selectedMode?: string | null) {
  const originLocation = recommendationLocation(origin);
  const destinationLocation = recommendationLocation(destination);
  const originCoordinates = { latitude: originLocation?.latitude ?? null, longitude: originLocation?.longitude ?? null, verified: originLocation?.verified ?? false };
  const destinationCoordinates = { latitude: destinationLocation?.latitude ?? null, longitude: destinationLocation?.longitude ?? null, verified: destinationLocation?.verified ?? false };
  const transportMode = selectedMode === undefined ? origin.onward_transport : selectedMode;
  if (process.env.NODE_ENV === "development") console.debug("[BALO ROUTE DEBUG] RECOMMENDATION ENGINE INPUT", { originCoordinates, destinationCoordinates, transportMode });
  const recommendation = recommendRouteLeg(originCoordinates, destinationCoordinates, transportMode);
  if (process.env.NODE_ENV === "development") console.debug("[BALO ROUTE DEBUG] RECOMMENDATION ENGINE RESULT", {
    recommendation,
    calculatedDistance: recommendation.distanceKm,
    calculatedDuration: recommendation.durationHours,
    confidence: recommendation.confidence,
    unavailableReason: recommendation.metadata.unavailableReason ?? null,
  });
  return recommendation;
}

export function applyRouteRecommendations<T extends RecommendationStop>(stops: T[], calculatedAt = new Date().toISOString()) {
  return stops.map((stop, index) => {
    if (index === stops.length - 1) return stop;
    const recommendation = recommendRouteStopLeg(stop, stops[index + 1]);
    const recommendedStop = {
      ...stop,
      system_recommended_distance_km: recommendation.distanceKm,
      system_recommended_duration_hours: recommendation.durationHours,
      system_recommendation_confidence: recommendation.confidence,
      system_recommendation_metadata: recommendation.metadata,
      system_recommendation_calculated_at: calculatedAt,
    };
    if (process.env.NODE_ENV === "development" && index === 0) console.debug("[BALO ROUTE DEBUG] SHARED STATE AFTER PROPAGATION", {
      legIndex: index,
      systemRecommendedDurationHours: recommendedStop.system_recommended_duration_hours,
      systemRecommendedDistanceKm: recommendedStop.system_recommended_distance_km,
      administratorDurationHours: "estimated_duration_hours" in recommendedStop ? recommendedStop.estimated_duration_hours ?? null : null,
      administratorDistanceKm: "estimated_distance_km" in recommendedStop ? recommendedStop.estimated_distance_km ?? null : null,
    });
    return recommendedStop;
  });
}

export function effectiveEstimate(adminValue: number | null | undefined, systemValue: number | null | undefined) {
  return adminValue ?? systemValue ?? null;
}
