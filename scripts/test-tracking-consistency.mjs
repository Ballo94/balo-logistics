import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [pattern, replacement] of replacements) source = source.replace(pattern, replacement);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

const stateModule = await load("../app/lib/shipment-state.ts");
globalThis.__trackingState = stateModule;
const routePresentation = await load("../app/lib/route-intelligence/presentation.ts", [
  [/import \{ canonicalizeShipmentStatus, normalizeShipmentStatus, type CanonicalShipmentStatus, type ShipmentState \} from "\.\.\/shipment-state";/, "const { canonicalizeShipmentStatus, normalizeShipmentStatus } = globalThis.__trackingState;"],
]);
globalThis.__trackingPresentation = routePresentation;
const { buildJourneyFromSavedRoute } = await load("../app/lib/saved-routes.ts", [
  [/import \{ supabase \} from "\.\/supabase";/, "const supabase = {};"],
  [/import \{ effectiveEstimate, type RecommendationConfidence \} from "\.\/route-journey-estimates";/, "const effectiveEstimate = (admin, system) => admin ?? system ?? null;"],
]);
const { automateShipmentOperations } = await load("../app/lib/operations-automation.ts", [
  [/import \{ deriveShipmentState, normalizeShipmentStatus, type ShipmentState \} from "\.\/shipment-state";/, "const { deriveShipmentState, normalizeShipmentStatus } = globalThis.__trackingState;"],
  [/import \{ tryBuildRouteJourney, type RouteCheckpoint, type RouteJourney, type RouteLocationInput \} from "\.\/route-intelligence";/, "const tryBuildRouteJourney = () => null;"],
  [/import \{ checkpointIndexForShipmentStatus \} from "\.\/route-intelligence\/presentation";/, "const { checkpointIndexForShipmentStatus } = globalThis.__trackingPresentation;"],
]);
const { reconcilePublicShipmentHistory } = await load("../app/lib/public-shipment-history.ts", [
  [/import \{ canonicalizeShipmentStatus, normalizeShipmentStatus \} from "\.\/shipment-state";/, "const { canonicalizeShipmentStatus, normalizeShipmentStatus } = globalThis.__trackingState;"],
  [/import \{ checkpointIndexForStatus \} from "\.\/route-intelligence\/presentation";/, "const { checkpointIndexForStatus } = globalThis.__trackingPresentation;"],
]);
const { journeyLegStates } = await load("../app/lib/journey-leg-progress.ts");

function route(types, names, transport, legModes = []) {
  const stops = names.map((name, position) => ({
    id: `stop-${position}`, route_template_id: "test-route", position, name,
    city: name, country: "Testland", stop_type: types[position], code: null,
    operational_notes: null, onward_transport: legModes[position] ?? null,
  }));
  const journey = buildJourneyFromSavedRoute({ id: "test-route", name: "Manual test route", transport_mode: transport }, stops);
  assert.ok(journey);
  assert.deepEqual(journey.legs.map((leg) => [leg.origin.name, leg.destination.name]), names.slice(0, -1).map((name, index) => [name, names[index + 1]]));
  return journey;
}

function at(journey, status, location, mode) {
  const checkpointIndex = journey.checkpoints.findIndex((checkpoint) => checkpoint.label === status && checkpoint.location.name === location);
  assert.ok(checkpointIndex >= 0, `${status} at ${location} exists in the manual journey`);
  const checkpoint = journey.checkpoints[checkpointIndex];
  const state = stateModule.deriveShipmentState({ shipmentStatus: status, transportMode: mode, currentLocation: location, originCountry: "Testland", destinationCountry: "Testland" });
  const operations = automateShipmentOperations({ shipmentStatus: status, transportMode: mode, origin: journey.origin, destination: journey.destination, journey, exactCheckpointId: checkpoint.id });
  const view = routePresentation.createRouteJourneyPresentation(journey, state, location, operations.checkpointIndex);
  return { checkpointIndex, checkpoint, state, operations, view };
}

const air = route(["airport", "airport", "airport", "airport"], ["Origin Airport", "Transit Airport A", "Transit Airport B", "Bodensee Airport Friedrichshafen"], "Air");
const airArrival = at(air, "Arrived Destination Airport", "Bodensee Airport Friedrichshafen", "Air");
assert.equal(at(air, "Collected", "Origin Airport", "Air").operations.nextCheckpoint, "Origin Airport");
assert.equal(at(air, "Departed Origin Airport", "Origin Airport", "Air").operations.nextCheckpoint, "In Flight");
assert.equal(airArrival.view.nextStop, "Import Customs");
assert.equal(airArrival.operations.nextCheckpoint, "Import Customs");
assert.ok(airArrival.operations.progress < 100);
const localStatus = "With Local Delivery Partner / Destination Facility";
assert.equal(stateModule.canonicalizeShipmentStatus(localStatus), "destination_hub");
const localState = stateModule.deriveShipmentState({ shipmentStatus: localStatus, transportMode: "Air", currentLocation: "Windhoek Delivery Facility", originCountry: "Testland", destinationCountry: "Testland" });
const localOperations = automateShipmentOperations({ shipmentStatus: localStatus, transportMode: "Air", origin: air.origin, destination: air.destination, journey: air });
const localView = routePresentation.createRouteJourneyPresentation(air, localState, "Windhoek Delivery Facility", localOperations.checkpointIndex);
assert.equal(localView.currentLocation, "Windhoek Delivery Facility");
assert.equal(localView.currentStage, localStatus);
assert.equal(localView.nextStop, "Out For Delivery");
assert.ok(localOperations.progress < 100);
assert.match(localOperations.customerNote, /local delivery partner/i);
const destinationCityAir = route(["airport", "airport"], ["Origin Airport", "Bodensee Airport Friedrichshafen"], "Air");
destinationCityAir.destination.city = "Friedrichshafen";
destinationCityAir.destination.country = "Germany";
const cityLocation = "Friedrichshafen, Germany";
const cityState = stateModule.deriveShipmentState({ shipmentStatus: localStatus, transportMode: "Air", currentLocation: cityLocation, originCountry: "Testland", destinationCountry: "Germany" });
const cityOperations = automateShipmentOperations({ shipmentStatus: localStatus, transportMode: "Air", origin: destinationCityAir.origin, destination: destinationCityAir.destination, journey: destinationCityAir });
const cityView = routePresentation.createRouteJourneyPresentation(destinationCityAir, cityState, cityLocation, cityOperations.checkpointIndex);
assert.equal(cityView.currentLocation, cityLocation, "a saved destination city must not be mistaken for the airport and replaced with a placeholder");
assert.equal(cityView.currentStage, localStatus);
assert.equal(cityView.nextStop, "Out For Delivery");
for (const [journey, mode, hub, arrivalStatus] of [
  [air, "Air", "Bodensee Airport Friedrichshafen", "Arrived Destination Airport"],
  [route(["port", "port"], ["Loading Port", "Destination Seaport"], "Sea"), "Sea", "Destination Seaport", "Port of Discharge"],
  [route(["warehouse", "border", "distribution_centre"], ["Origin Warehouse", "Border Post", "Destination Hub"], "Road"), "Road", "Destination Hub", "Destination Distribution Centre"],
]) {
  const arrival = at(journey, arrivalStatus, hub, mode);
  assert.equal(routePresentation.routeOverviewPoints(arrival.view, arrival.state).at(-1).state, "current", `${mode} destination hub is current on arrival`);
  for (const [status, location, expectedNext] of [
    [localStatus, "Local Delivery Facility", "Out For Delivery"],
    ["Out For Delivery", "Receiver delivery area", "Delivered"],
    ["Delivered", "12 Receiver Street", "Journey Complete"],
  ]) {
    const state = stateModule.deriveShipmentState({ shipmentStatus: status, transportMode: mode, currentLocation: location, originCountry: "Testland", destinationCountry: "Testland" });
    const operations = automateShipmentOperations({ shipmentStatus: status, transportMode: mode, origin: journey.origin, destination: journey.destination, journey });
    const view = routePresentation.createRouteJourneyPresentation(journey, state, location, operations.checkpointIndex);
    const points = routePresentation.routeOverviewPoints(view, state);
    assert.equal(view.currentLocation, location, `${mode} ${status} uses the actual saved location`);
    assert.equal(view.nextStop, expectedNext, `${mode} ${status} has the correct next stage`);
    assert.equal(points.at(-1).state, "complete", `${mode} destination hub is no longer current during final-mile delivery`);
    assert.equal(points.some((point) => point.state === "current"), false, `${mode} route overview does not claim to show the physical final-mile location`);
    const recorded = reconcilePublicShipmentHistory([{ status, location, created_at: "2026-01-04T12:00:00Z" }], journey, view.currentCheckpoint.id);
    assert.equal(recorded[0].location, location, `${mode} journey history preserves the actual event location`);
  }
  const noAddress = stateModule.deriveShipmentState({ shipmentStatus: "Delivered", transportMode: mode, currentLocation: null, receiverAddress: null, originCountry: "Testland", destinationCountry: "Testland" });
  assert.equal(noAddress.currentLocation, "Delivered to Receiver", `${mode} missing address does not invent a destination`);
}
const clearedOperations = automateShipmentOperations({ shipmentStatus: "Customs Cleared", transportMode: "Air", origin: air.origin, destination: air.destination, journey: air });
assert.equal(clearedOperations.currentCheckpoint, "Customs Cleared");
assert.match(clearedOperations.customerNote, /completed customs clearance/i);
const deliveredAtReceiver = stateModule.deriveShipmentState({ shipmentStatus: "Delivered", transportMode: "Air", currentLocation: "12 Receiver Street, Windhoek", originCountry: "Testland", destinationCountry: "Testland" });
assert.equal(deliveredAtReceiver.currentLocation, "12 Receiver Street, Windhoek");
const staleAirportDelivery = stateModule.deriveShipmentState({ shipmentStatus: "Delivered", transportMode: "Air", currentLocation: "Bodensee Airport Friedrichshafen", originCountry: "Testland", destinationCountry: "Testland" });
assert.equal(staleAirportDelivery.currentLocation, "Delivered to Receiver");
assert.equal(routePresentation.createRouteJourneyPresentation(air, staleAirportDelivery, "Bodensee Airport Friedrichshafen").currentLocation, "Delivered to Receiver", "a stale airport name is not a delivery address");
const receiverRoute = route(["airport", "airport", "customer_address"], ["Origin Airport", "Destination Airport", "Receiver Address"], "Air");
for (const [status, expectedDestinationState] of [[localStatus, "future"], ["Out For Delivery", "future"], ["Delivered", "complete"]]) {
  const state = stateModule.deriveShipmentState({ shipmentStatus: status, transportMode: "Air", currentLocation: "12 Receiver Street", originCountry: "Testland", destinationCountry: "Testland" });
  const view = routePresentation.createRouteJourneyPresentation(receiverRoute, state, "12 Receiver Street");
  const points = routePresentation.routeOverviewPoints(view, state);
  assert.equal(points.at(-2).state, "complete", "the airport is a completed transport stop during final-mile delivery");
  assert.equal(points.at(-1).state, expectedDestinationState, "the manually selected receiver stop is not completed before delivery");
  assert.equal(points.some((point) => point.state === "current"), false);
}
assert.deepEqual(journeyLegStates(air, airArrival.checkpointIndex, false), ["completed", "completed", "completed"]);
assert.equal(stateModule.canonicalizeShipmentStatus("Arrived Transit Airport"), "transit");
assert.equal(stateModule.canonicalizeShipmentStatus("Arrived Transit Port"), "transit");
assert.equal(stateModule.canonicalizeShipmentStatus("Transit Airport Processing"), "transit");
assert.equal(stateModule.canonicalizeShipmentStatus("Origin Distribution Centre"), "warehouse");

const transitArrivals = air.checkpoints.filter((checkpoint) => checkpoint.label === "Arrived Transit Airport");
assert.equal(transitArrivals.length, 2);
const transitHistory = transitArrivals.map((checkpoint, index) => ({ status: checkpoint.label, location: checkpoint.location.name, created_at: `2026-01-0${index + 1}T12:00:00Z`, route_checkpoint_id: checkpoint.id }));
assert.deepEqual(reconcilePublicShipmentHistory(transitHistory, air, airArrival.checkpoint.id).map((row) => row.checkpoint_index), transitArrivals.map((checkpoint) => checkpoint.sequence));
assert.ok(reconcilePublicShipmentHistory(transitHistory, air, airArrival.checkpoint.id).every((row) => !("route_checkpoint_id" in row)));
assert.deepEqual(reconcilePublicShipmentHistory(transitHistory.map((row) => ({ status: row.status, location: row.location, created_at: row.created_at })), air, airArrival.checkpoint.id).map((row) => row.checkpoint_index), transitArrivals.map((checkpoint) => checkpoint.sequence));
assert.equal(reconcilePublicShipmentHistory([{ status: "Arrived Transit Airport", location: null, created_at: "2026-01-03T12:00:00Z" }], air, airArrival.checkpoint.id)[0].checkpoint_index, null, "ambiguous legacy history must not complete an arbitrary transit checkpoint");
assert.deepEqual(reconcilePublicShipmentHistory([], air, airArrival.checkpoint.id), [], "no history event is fabricated");

const sea = route(["port", "port"], ["Loading Port", "Destination Seaport"], "Sea");
const seaArrival = at(sea, "Port of Discharge", "Destination Seaport", "Sea");
assert.equal(seaArrival.view.nextStop, "Discharged from Vessel");
assert.equal(seaArrival.state.canonicalStatus, "arrived_destination");
assert.ok(seaArrival.operations.progress < 100);

const road = route(["warehouse", "border", "distribution_centre"], ["Origin Warehouse", "Border Post", "Destination Hub"], "Road");
const roadArrival = at(road, "Destination Distribution Centre", "Destination Hub", "Road");
assert.equal(roadArrival.view.nextStop, "Out For Delivery");
assert.ok(roadArrival.operations.progress < 100);

const multimodal = route(["warehouse", "airport", "airport", "warehouse"], ["Origin Warehouse", "Departure Airport", "Arrival Airport", "Final Warehouse"], "Multimodal", ["Road", "Air"]);
assert.deepEqual(multimodal.legs.map((leg) => leg.transportMode), ["road", "air", "multimodal"]);
const rail = route(["warehouse", "rail_terminal"], ["Rail Origin", "Rail Terminal"], "Multimodal", ["Rail"]);
assert.equal(rail.legs[0].displayMode, "Rail");
assert.equal(rail.legs[0].transportMode, "multimodal", "a rail leg must not be relabelled as road transit");
const flight = at(multimodal, "In Flight", "Departure Airport", "Multimodal");
assert.equal(flight.operations.currentLocation, "In Flight");
assert.equal(flight.view.currentLocation.startsWith("In Flight"), true);

assert.equal(routePresentation.checkpointIdForFallbackStatus("In Transit", airArrival.checkpoint.id), "");
assert.equal(routePresentation.checkpointIdForFallbackStatus("Delayed", airArrival.checkpoint.id), airArrival.checkpoint.id);
const staleDelivered = automateShipmentOperations({ shipmentStatus: "Delivered", transportMode: "Air", origin: air.origin, destination: air.destination, journey: air, exactCheckpointId: airArrival.checkpoint.id });
assert.equal(staleDelivered.currentCheckpoint, "Delivered", "an incompatible stored checkpoint cannot override the saved delivered status");
assert.equal(routePresentation.createRouteJourneyPresentation(air, airArrival.state, "Reported off-route facility", airArrival.checkpointIndex).currentLocation, "Reported off-route facility");
const delivered = at(air, "Delivered", "Bodensee Airport Friedrichshafen", "Air");
assert.equal(delivered.operations.progress, 100);
assert.equal(delivered.view.nextStop, "Journey Complete");

delete globalThis.__trackingState;
delete globalThis.__trackingPresentation;
console.log("Tracking consistency regression tests passed.");
