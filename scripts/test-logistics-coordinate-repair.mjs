import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { hasUsableVerifiedCoordinates } from "../app/lib/route-journey-estimates.ts";

const migration = await readFile(
  new URL("../supabase/migrations/20260831_repair_legacy_airport_coordinates.sql", import.meta.url),
  "utf8",
);

const referencePattern = /\('([A-Z]{3})', '([A-Z]{4})', '([A-Z]{2})',\s*(-?\d+\.\d+)::numeric,\s*(-?\d+\.\d+)::numeric\)/g;
const migrationRows = [...migration.matchAll(referencePattern)].map((match) => ({
  iata: match[1],
  icao: match[2],
  countryCode: match[3],
  latitude: Number(match[4]),
  longitude: Number(match[5]),
}));

// The same reference CTE appears once for validation and once for the update.
assert.equal(migrationRows.length, 36);
const repairRows = migrationRows.slice(0, 18);
assert.deepEqual(migrationRows.slice(18), repairRows);
assert.equal(new Set(repairRows.map(({ iata, countryCode }) => `${countryCode}:${iata}`)).size, 18);
assert.equal(new Set(repairRows.map(({ icao, countryCode }) => `${countryCode}:${icao}`)).size, 18);

const airportFiles = (await readdir(new URL("../supabase/data/global-locations/", import.meta.url)))
  .filter((name) => /^airports-\d+\.json$/.test(name));
const bundledAirports = (
  await Promise.all(
    airportFiles.map(async (name) => JSON.parse(await readFile(new URL(`../supabase/data/global-locations/${name}`, import.meta.url), "utf8"))),
  )
).flat();

for (const reference of repairRows) {
  const matches = bundledAirports.filter(
    (airport) => airport.code === reference.iata && airport.country_code === reference.countryCode,
  );
  assert.equal(matches.length, 1, `${reference.iata} must match exactly one bundled airport`);
  const [bundled] = matches;
  assert.equal(bundled.secondary_code, reference.icao);
  assert.equal(Number(Number(bundled.latitude).toFixed(6)), reference.latitude);
  assert.equal(Number(Number(bundled.longitude).toFixed(6)), reference.longitude);
  assert.equal(hasUsableVerifiedCoordinates({ ...reference, verified: true }), true);
}

const jnb = repairRows.find(({ iata }) => iata === "JNB");
assert.ok(jnb);
const legacyJnb = { latitude: null, longitude: null, verified: true };
const repairedJnb = {
  ...legacyJnb,
  latitude: legacyJnb.latitude ?? jnb.latitude,
  longitude: legacyJnb.longitude ?? jnb.longitude,
};
assert.equal(hasUsableVerifiedCoordinates(legacyJnb), false);
assert.equal(hasUsableVerifiedCoordinates(repairedJnb), true);

const existingCoordinates = { latitude: -26.2, longitude: 28.3, verified: true };
const guardedRepair = {
  ...existingCoordinates,
  latitude: existingCoordinates.latitude ?? jnb.latitude,
  longitude: existingCoordinates.longitude ?? jnb.longitude,
};
assert.deepEqual(guardedRepair, existingCoordinates);

assert.match(migration, /latitude = coalesce\(location\.latitude, reference\.latitude\)/);
assert.match(migration, /longitude = coalesce\(location\.longitude, reference\.longitude\)/);
assert.match(migration, /location\.latitude is null or location\.longitude is null/);
assert.match(migration, /having count\(\*\) > 1/);

console.log("Legacy airport coordinate repair tests passed.");
