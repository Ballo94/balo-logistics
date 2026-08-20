import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const createShipment = await readFile(new URL("../app/components/CreateShipment.tsx", import.meta.url), "utf8");
const routeBuilder = await readFile(new URL("../app/components/RouteBuilder.tsx", import.meta.url), "utf8");

assert.match(createShipment, /useState<RouteChoice>\("new"\)/);
assert.match(createShipment, /title="Create New Route"/);
assert.match(createShipment, /title="Use Saved Route"/);
assert.match(createShipment, /routeChoice === "saved" && <Field label="Saved Route"/);
assert.match(createShipment, /routeChoice === "saved" \? "Select a saved route/);
assert.match(createShipment, /<RouteBuilder[\s\S]+?showTemplateLibrary=\{false\}/);
assert.match(routeBuilder, /showTemplateLibrary\?: boolean/);
assert.match(routeBuilder, /onChange\(null\)/);

const routePersistence = routeBuilder.slice(routeBuilder.indexOf("async function persistRoute"), routeBuilder.indexOf("async function renameRoute"));
for (const shipmentOnlyField of ["supplier_name", "receiver_name", "item_description", "tracking_number", "shipment_status"]) {
  assert.doesNotMatch(routePersistence, new RegExp(shipmentOnlyField));
}

console.log("Create Shipment route-choice tests passed.");
