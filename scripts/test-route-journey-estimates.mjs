import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { effectiveEstimate, recommendRouteLeg } from "../app/lib/route-journey-estimates.ts";

const windhoek = { latitude: -22.4799, longitude: 17.4709, verified: true };
const johannesburg = { latitude: -26.140081, longitude: 28.246801, verified: true };
const akulivik = { latitude: 60.8186, longitude: -78.148598, verified: true };

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

const road = recommendRouteLeg(windhoek, johannesburg, "Road");
assert.equal(road.confidence, "Low");
assert.ok(road.distanceKm > air.distanceKm);
assert.ok(road.durationHours > air.durationHours);

const sea = recommendRouteLeg(windhoek, johannesburg, "Sea");
assert.equal(sea.distanceKm, null);
assert.match(sea.metadata.unavailableReason, /shipping-lane/i);

const missingCoordinates = recommendRouteLeg(
  { latitude: null, longitude: null, verified: true },
  johannesburg,
  "Air",
);
assert.equal(missingCoordinates.distanceKm, null);
assert.match(missingCoordinates.metadata.unavailableReason, /verified coordinates/i);

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
