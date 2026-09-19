import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/shipment-current-location.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { buildFinalMileLocationChoices, defaultFinalMileLocation, isFinalMileStatus, requiresReceiverDeliveryAddress, routeBasedCurrentLocation, LOCAL_DELIVERY_STATUS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

const stops = [
  { id: "origin", position: 0, name: "Luanda Warehouse", stop_type: "warehouse" },
  { id: "departure", position: 1, name: "Luanda Airport", stop_type: "airport" },
  { id: "arrival", position: 2, name: "Windhoek Airport", stop_type: "airport" },
  { id: "facility", position: 3, name: "Windhoek Distribution Centre", stop_type: "distribution_centre" },
];
const locations = stops.map((stop) => ({ id: stop.id, name: stop.name, city: stop.id === "arrival" || stop.id === "facility" ? "Windhoek" : "Luanda", country: stop.id === "arrival" || stop.id === "facility" ? "Namibia" : "Angola", kind: stop.stop_type }));
const journey = { origin: locations[0], transitStops: locations.slice(1, -1), destination: locations.at(-1), checkpoints: [] };
const choices = buildFinalMileLocationChoices({ previousLocation: "Windhoek Airport", currentLocation: "Windhoek Distribution Centre", receiverAddress: "12 Independence Avenue, Windhoek", journey, stops });
assert.deepEqual(choices.map((choice) => choice.value), ["Windhoek Distribution Centre", "12 Independence Avenue, Windhoek", "Windhoek, Namibia"]);
assert.equal(choices[0].label, "Destination facility — Windhoek Distribution Centre");
assert.equal(defaultFinalMileLocation(LOCAL_DELIVERY_STATUS, choices), "Windhoek Distribution Centre");
assert.equal(defaultFinalMileLocation(LOCAL_DELIVERY_STATUS, [{ value: "Arrival Hub", source: "facility" }, ...choices]), "Windhoek Distribution Centre");
assert.equal(defaultFinalMileLocation("Out For Delivery", choices), "12 Independence Avenue, Windhoek");
assert.equal(defaultFinalMileLocation("Delivered", choices), "12 Independence Avenue, Windhoek");
assert.equal(requiresReceiverDeliveryAddress(journey), false);
assert.equal(requiresReceiverDeliveryAddress({ ...journey, destination: { ...journey.destination, kind: "customer_address" } }), true);
assert.equal(isFinalMileStatus("Out for Delivery"), true);
assert.equal(isFinalMileStatus("Import Customs"), false);

const airportOnly = { origin: locations[1], transitStops: [], destination: locations[2], checkpoints: [] };
const airportChoices = buildFinalMileLocationChoices({ previousLocation: "Windhoek Airport", receiverAddress: null, journey: airportOnly, stops: stops.slice(1, 3) });
assert.deepEqual(airportChoices.map((choice) => choice.value), ["Windhoek, Namibia"]);
assert.equal(defaultFinalMileLocation("Out For Delivery", airportChoices), "", "missing receiver data must not produce an assumed delivery location");
assert.equal(defaultFinalMileLocation("Delivered", airportChoices), "", "an airport city is a choice, not an assumed delivery address");

const customs = { kind: "import_customs", label: "Import Customs", location: locations[2] };
const flight = { kind: "linehaul", label: "In Flight", location: locations[1] };
assert.equal(routeBasedCurrentLocation("Import Customs", customs, airportOnly), "Windhoek Airport");
assert.equal(routeBasedCurrentLocation("In Flight", flight, airportOnly), "In Flight");
assert.equal(routeBasedCurrentLocation("Customs Cleared", undefined, { ...airportOnly, checkpoints: [customs] }), "Windhoek Airport");
assert.equal(routeBasedCurrentLocation("Arrived Transit Airport", undefined, { ...airportOnly, checkpoints: [{ label: "Arrived Transit Airport", kind: "transit_arrival", location: locations[2] }] }), "Windhoek Airport");
assert.equal(routeBasedCurrentLocation("Arrived Transit Airport", undefined, { ...airportOnly, checkpoints: [{ label: "Arrived Transit Airport", kind: "transit_arrival", location: locations[1] }, { label: "Arrived Transit Airport", kind: "transit_arrival", location: locations[2] }] }), null);

console.log("Shipment current-location selector tests passed.");
