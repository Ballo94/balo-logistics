import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const helperSource = await readFile(new URL("../app/lib/client-delivery-estimate.ts", import.meta.url), "utf8");
assert.match(helperSource, /canonicalizeShipmentStatus/);
const testableSource = helperSource.replace(
  /import \{ canonicalizeShipmentStatus \} from "\.\/shipment-state";/,
  "const canonicalizeShipmentStatus = (status: string) => status;",
);
const transpiled = ts.transpileModule(testableSource, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { getClientDeliveryEstimate } = await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);

const adminEstimate = getClientDeliveryEstimate("transit", "2026-08-30");
assert.equal(adminEstimate.label, "Estimated delivery window");
assert.equal(adminEstimate.estimatedDelivery, "2026-08-30");
assert.equal(adminEstimate.isPaused, false);
assert.match(adminEstimate.message, /customs clearance/i);

const noEstimate = getClientDeliveryEstimate("transit", null);
assert.equal(noEstimate.estimatedDelivery, null);
assert.equal(noEstimate.isPaused, false);

const customs = getClientDeliveryEstimate("customs", "2026-08-20");
assert.equal(customs.label, "Customs clearance in progress");
assert.equal(customs.estimatedDelivery, null);
assert.equal(customs.isPaused, true);
assert.match(customs.message, /after clearance/i);

const delayed = getClientDeliveryEstimate("exception", "2026-08-20");
assert.equal(delayed.label, "Delivery estimate under review");
assert.equal(delayed.estimatedDelivery, null);
assert.equal(delayed.isPaused, true);

const apiSource = await readFile(new URL("../app/api/public-tracking/[trackingNumber]/route.ts", import.meta.url), "utf8");
const timelineSource = await readFile(new URL("../app/ShipmentTimeline.tsx", import.meta.url), "utf8");
assert.doesNotMatch(apiSource, /shipment_route_stops[^\n]+estimated_duration_hours/);
assert.doesNotMatch(apiSource, /route_stops[^\n]+estimated_duration_hours/);
assert.doesNotMatch(timelineSource, /Estimated duration/);
assert.doesNotMatch(timelineSource, /formatDuration/);

console.log("Client delivery estimate tests passed.");
