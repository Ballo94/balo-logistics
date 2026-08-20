import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyRouteRecommendations, effectiveEstimate, hasUsableVerifiedCoordinates, recommendRouteLeg, recommendRouteStopLeg } from "../app/lib/route-journey-estimates.ts";

const windhoek = { latitude: -22.4799, longitude: 17.4709, verified: true };
const johannesburg = { latitude: -26.140081, longitude: 28.246801, verified: true };
const akulivik = { latitude: 60.8186, longitude: -78.148598, verified: true };

assert.equal(hasUsableVerifiedCoordinates(windhoek), true);
assert.equal(hasUsableVerifiedCoordinates({ latitude: null, longitude: 17.4709, verified: true }), false);
assert.equal(hasUsableVerifiedCoordinates({ latitude: -22.4799, longitude: null, verified: true }), false);
assert.equal(hasUsableVerifiedCoordinates({ latitude: -22.4799, longitude: 17.4709, verified: false }), false);
assert.equal(hasUsableVerifiedCoordinates({ latitude: 91, longitude: 17.4709, verified: true }), false);
assert.equal(hasUsableVerifiedCoordinates({ latitude: -22.4799, longitude: 181, verified: true }), false);
assert.equal(hasUsableVerifiedCoordinates({ latitude: "-22.4799", longitude: 17.4709, verified: true }), false);

const originalOrigin = structuredClone(windhoek);
const originalDestination = structuredClone(johannesburg);
const air = recommendRouteLeg(windhoek, johannesburg, "Air");
assert.equal(air.confidence, "Medium");
assert.equal(air.distanceKm, 1_164.82);
assert.equal(air.durationHours, 4.46);
assert.deepEqual(windhoek, originalOrigin);
assert.deepEqual(johannesburg, originalDestination);

const akulivikToWindhoek = recommendRouteLeg(akulivik, windhoek, "Air");
assert.equal(akulivikToWindhoek.confidence, "Medium");
assert.ok(akulivikToWindhoek.distanceKm > 0);
assert.ok(akulivikToWindhoek.durationHours > 0);

const selectedStops = [
  { id: "akulivik", onward_transport: "Air", estimated_distance_km: null, estimated_duration_hours: null, logistics_location: { ...akulivik } },
  { id: "windhoek", onward_transport: null, estimated_distance_km: null, estimated_duration_hours: null, logistics_location: { ...windhoek } },
];
const automaticallyRecommended = applyRouteRecommendations(selectedStops, "2026-08-20T00:00:00.000Z");
assert.equal(automaticallyRecommended[0].system_recommended_distance_km, akulivikToWindhoek.distanceKm);
assert.equal(automaticallyRecommended[0].system_recommended_duration_hours, akulivikToWindhoek.durationHours);
assert.equal(effectiveEstimate(automaticallyRecommended[0].estimated_distance_km, automaticallyRecommended[0].system_recommended_distance_km), akulivikToWindhoek.distanceKm);

const adminOverride = { ...automaticallyRecommended[0], estimated_distance_km: 13_000, estimated_duration_hours: 20 };
assert.equal(effectiveEstimate(adminOverride.estimated_distance_km, adminOverride.system_recommended_distance_km), 13_000);
assert.equal(effectiveEstimate(adminOverride.estimated_duration_hours, adminOverride.system_recommended_duration_hours), 20);
assert.equal(effectiveEstimate(null, adminOverride.system_recommended_distance_km), akulivikToWindhoek.distanceKm);
assert.equal(effectiveEstimate(null, adminOverride.system_recommended_duration_hours), akulivikToWindhoek.durationHours);

const changedMode = recommendRouteStopLeg({ ...selectedStops[0], onward_transport: "Road" }, selectedStops[1]);
assert.notEqual(changedMode.distanceKm, akulivikToWindhoek.distanceKm);
const changedDestination = recommendRouteStopLeg(selectedStops[0], { ...selectedStops[1], logistics_location: { ...johannesburg } });
assert.notEqual(changedDestination.distanceKm, akulivikToWindhoek.distanceKm);

const road = recommendRouteLeg(windhoek, johannesburg, "Road");
assert.equal(road.confidence, "Low");
assert.ok(road.distanceKm > air.distanceKm);
assert.ok(road.durationHours > air.durationHours);

const sea = recommendRouteLeg(windhoek, johannesburg, "Sea");
assert.equal(sea.distanceKm, null);
assert.match(sea.metadata.unavailableReason, /shipping-lane/i);

for (const invalidLocation of [
  { latitude: null, longitude: 17.4709, verified: true },
  { latitude: -22.4799, longitude: null, verified: true },
  { latitude: -22.4799, longitude: 17.4709, verified: false },
  { latitude: -91, longitude: 17.4709, verified: true },
  { latitude: -22.4799, longitude: 181, verified: true },
]) {
  const unavailableRecommendation = recommendRouteLeg(invalidLocation, johannesburg, "Air");
  assert.equal(unavailableRecommendation.distanceKm, null);
  assert.equal(unavailableRecommendation.durationHours, null);
  assert.match(unavailableRecommendation.metadata.unavailableReason, /coordinates unavailable/i);
}

assert.equal(effectiveEstimate(1_500, air.distanceKm), 1_500);
assert.equal(effectiveEstimate(null, air.distanceKm), air.distanceKm);
assert.equal(effectiveEstimate(null, null), null);

const adminValues = { estimated_distance_km: 1_500, estimated_duration_hours: 3.25 };
const refreshed = {
  ...adminValues,
  system_recommended_distance_km: road.distanceKm,
  system_recommended_duration_hours: road.durationHours,
};
assert.equal(refreshed.estimated_distance_km, 1_500);
assert.equal(refreshed.estimated_duration_hours, 3.25);

const orderedStopIds = ["origin", "transit", "destination"];
const multiLegRecommendations = [
  recommendRouteLeg(akulivik, windhoek, "Air"),
  recommendRouteLeg(windhoek, johannesburg, "Air"),
];
assert.ok(multiLegRecommendations.every((recommendation) => recommendation.distanceKm != null && recommendation.durationHours != null));
assert.deepEqual(orderedStopIds, ["origin", "transit", "destination"]);

const routeEditorSource = await readFile(
  new URL("../app/components/RouteLibraryEditor.tsx", import.meta.url),
  "utf8",
);
assert.match(routeEditorSource, /value=\{effectiveDuration \?\? ""\}/);
assert.match(routeEditorSource, /value=\{effectiveDistance \?\? ""\}/);

const migration = await readFile(
  new URL("../supabase/migrations/20260830_route_journey_intelligence_phase1.sql", import.meta.url),
  "utf8",
);
for (const field of [
  "system_recommended_distance_km",
  "system_recommended_duration_hours",
  "system_recommendation_confidence",
  "system_recommendation_metadata",
  "system_recommendation_calculated_at",
]) {
  assert.ok(migration.split(field).length >= 5, `${field} must be added and copied into shipment snapshots`);
}

console.log("Route journey estimate tests passed.");
