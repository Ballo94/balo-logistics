import assert from "node:assert/strict";
import { buildImportPreview, normalizeSeaportName } from "../app/lib/location-import.ts";

assert.equal(normalizeSeaportName("Port of Cape Town"), "cape town");
assert.equal(normalizeSeaportName("CAPE  TOWN"), "cape town");
assert.equal(normalizeSeaportName("Port of Walvis Bay"), "walvis bay");
assert.equal(normalizeSeaportName("Shanghai Port"), "shanghai");

const base = { country: "South Africa", country_code: "ZA", city: "Cape Town", location_type: "seaport", code: null, secondary_code: null, latitude: null, longitude: null, address: null, notes: null, source: "test", source_reference: null, verified: true, country_secondary: null, country_secondary_code: null };
const preview = buildImportPreview([
  { ...base, name: "Port of Cape Town" },
  { ...base, name: "CAPE TOWN" },
  { ...base, name: "Cape Town Container Terminal" },
]);
assert.equal(preview[0].status, "new");
assert.equal(preview[1].status, "duplicate");
assert.equal(preview[2].status, "new");

const airportBase = { ...base, location_type: "airport", name: "Cape Town International Airport" };
assert.equal(buildImportPreview([airportBase])[0].status, "review");
assert.equal(buildImportPreview([{ ...airportBase, code: "CPT" }])[0].status, "new");

console.log("Seaport normalization tests passed.");
