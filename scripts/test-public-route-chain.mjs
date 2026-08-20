import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importTypeScript(source, replacements) {
  let testable = source;
  for (const [pattern, replacement] of replacements) testable = testable.replace(pattern, replacement);
  const output = ts.transpileModule(testable, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const savedRoutesSource = await readFile(new URL("../app/lib/saved-routes.ts", import.meta.url), "utf8");
const { buildJourneyFromSavedRoute } = await importTypeScript(savedRoutesSource, [
  [/import \{ supabase \} from "\.\/supabase";/, "const supabase = {};"],
  [/import \{ effectiveEstimate, type RecommendationConfidence \} from "\.\/route-journey-estimates";/, "const effectiveEstimate = (admin, system) => admin ?? system ?? null;"],
]);

const names = ["Port of Walvis Bay", "Port of Cape Town", "Port of Durban", "Port of Dar es Salaam", "Jebel Ali Port"];
const cities = ["Walvis Bay", "Cape Town", "Durban", "Dar es Salaam", "Dubai"];
const stops = names.map((name, position) => ({
  id: `stop-${position}`,
  route_template_id: "route-1",
  position,
  name,
  city: cities[position],
  country: position === 4 ? "United Arab Emirates" : position === 0 ? "Namibia" : position === 3 ? "Tanzania" : "South Africa",
  stop_type: "port",
  code: ["NAWVB", "ZACPT", "ZADUR", "TZDAR", "AEJEA"][position],
  operational_notes: null,
  onward_transport: position === 4 ? null : "Sea",
  estimated_distance_km: position === 0 ? null : 100 + position,
  system_recommended_distance_km: position === 0 ? 1234.5 : null,
}));
const journey = buildJourneyFromSavedRoute({ id: "route-1", name: "Five ports", transport_mode: "Sea" }, stops);
assert.ok(journey);
assert.deepEqual(journey.legs.map((leg) => [leg.origin.name, leg.destination.name]), names.slice(0, -1).map((name, index) => [name, names[index + 1]]));
assert.equal(journey.legs.length, 4);
assert.equal(journey.legs[0].estimatedDistanceKm, 1234.5, "system distance is used when no admin override exists");
assert.equal(journey.legs[1].estimatedDistanceKm, 101, "administrator distance retains precedence");

const presentationSource = await readFile(new URL("../app/lib/route-intelligence/presentation.ts", import.meta.url), "utf8");
const { createRouteJourneyPresentation } = await importTypeScript(presentationSource, [
  [/import \{ canonicalizeShipmentStatus, normalizeShipmentStatus, type CanonicalShipmentStatus, type ShipmentState \} from "\.\.\/shipment-state";/, "const normalizeShipmentStatus = (value) => value.trim().toLowerCase(); const canonicalizeShipmentStatus = () => 'created';"],
]);
const state = { canonicalStatus: "created", displayStatus: "Shipment Created", normalizedStatus: "shipment created", nextStop: "legacy fallback" };
const expectedProgress = [
  ["Walvis Bay", "Port of Walvis Bay", "Port of Cape Town"],
  ["Port of Cape Town", "Port of Cape Town", "Port of Durban"],
  ["Port of Durban", "Port of Durban", "Port of Dar es Salaam"],
  ["Port of Dar es Salaam", "Port of Dar es Salaam", "Jebel Ali Port"],
  ["Jebel Ali Port", "Jebel Ali Port", "Journey Complete"],
];
for (const [recordedLocation, expectedCurrentPresentation, expectedNext] of expectedProgress) {
  const currentIndex = journey.checkpoints.findIndex((checkpoint) => checkpoint.location.name === expectedCurrentPresentation);
  assert.ok(currentIndex >= 0);
  const presentation = createRouteJourneyPresentation(journey, state, recordedLocation, currentIndex);
  assert.equal(presentation.currentLocation, expectedCurrentPresentation);
  assert.equal(presentation.nextStop, expectedNext);
  assert.notEqual(presentation.currentLocation, presentation.nextStop);
  assert.equal(presentation.orderedStops.length, 5);
  assert.equal(presentation.currentStop.name, expectedCurrentPresentation);
  assert.equal(presentation.orderedStops[presentation.currentStopIndex].name, expectedCurrentPresentation);
  assert.equal(presentation.orderedStops.filter((_, index) => index === presentation.currentStopIndex).length, 1);
  assert.deepEqual(presentation.orderedStops.map((location) => location.name), names);
}
assert.deepEqual([journey.origin, ...journey.transitStops, journey.destination].map((location) => location.name), names, "saved route order remains unchanged");

const apiSource = await readFile(new URL("../app/api/public-tracking/[trackingNumber]/route.ts", import.meta.url), "utf8");
assert.match(apiSource, /shipment_route_stops[^\n]+system_recommended_distance_km/);
assert.doesNotMatch(apiSource, /shipment_route_stops[^\n]+estimated_duration_hours/);

const timelineSource = await readFile(new URL("../app/ShipmentTimeline.tsx", import.meta.url), "utf8");
assert.match(timelineSource, /origin: orderedLocations\[index\]/);
assert.match(timelineSource, /destination: orderedLocations\[index \+ 1\]/);

const trackingPageSource = await readFile(new URL("../app/track/page.tsx", import.meta.url), "utf8");
assert.match(trackingPageSource, /route\.orderedStops\.map/);
assert.match(trackingPageSource, /index === route\.currentStopIndex/);
assert.match(trackingPageSource, />Current location</);
assert.doesNotMatch(trackingPageSource, /journey\.transitStops\.map[\s\S]{0,500}label: "Current location"/);

console.log("Public route-chain regression tests passed.");
