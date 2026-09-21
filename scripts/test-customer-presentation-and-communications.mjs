import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importTypeScript(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const locations = await importTypeScript("../app/lib/route-location-presentation.ts");
assert.equal(locations.facilityNameWithCode({ name: "Cape Town International Airport", code: "CPT" }), "Cape Town International Airport (CPT)");
assert.equal(locations.facilityNameWithCode({ name: "Cape Town International Airport (CPT)", code: "CPT" }), "Cape Town International Airport (CPT)");
assert.equal(locations.cityCountryContext({ name: "Port", city: "Cape Town", country: "South Africa" }), "Cape Town, South Africa");
assert.equal(locations.cityCountryContext({ name: "Depot", city: "Windhoek, Namibia", country: "Namibia" }), "Windhoek, Namibia");

const templates = await importTypeScript("../app/lib/communication-template-engine.ts");
const shipment = { tracking_number: "TEST123", client_name: "Sender", receiver_name: "Customer", destination_country: "Namibia", current_location: "Port of Cape Town", shipment_status: "In Transit", estimated_delivery: null };
for (const updateType of templates.COMMUNICATION_UPDATE_TYPES) {
  const suggestion = templates.buildSmartCommunicationTemplate(updateType, { receiverName: shipment.receiver_name, trackingNumber: shipment.tracking_number, destination: shipment.destination_country, currentLocation: shipment.current_location, shipmentStatus: shipment.shipment_status });
  assert.ok(suggestion.title.includes("TEST123"));
  assert.ok(suggestion.message.includes("Hello Customer"));
  assert.doesNotMatch(suggestion.message, /undefined|null/i);
}
assert.ok(templates.buildSmartCommunicationTemplate("In Transit", { receiverName: shipment.receiver_name, trackingNumber: shipment.tracking_number, currentLocation: shipment.current_location }).message.includes("Port of Cape Town"));

const trackingPage = await readFile(new URL("../app/track/page.tsx", import.meta.url), "utf8");
assert.match(trackingPage, /showContainerDetails = activeMode === "sea"/);
assert.match(trackingPage, /activeMode === "road" && Boolean\(shipment\.container_number \|\| shipment\.seal_number\)/);
assert.match(trackingPage, /activeMode === "sea" && <InformationItem[^\n]+Vessel name/);
assert.match(trackingPage, /Declared cargo value/);

const migration = await readFile(new URL("../supabase/migrations/20260903_harden_document_communication_access.sql", import.meta.url), "utf8");
assert.match(migration, /public\.is_admin\(\)/);
assert.match(migration, /visible_to_customer and public\.customer_owns_shipment/);
assert.doesNotMatch(migration, /using \(true\)/i);
console.log("Customer presentation, communication template, and policy regression tests passed.");
