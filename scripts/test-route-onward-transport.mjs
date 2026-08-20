import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../app/lib/route-onward-transport.ts", import.meta.url), "utf8");
const executable = source
  .replace(/^import type .*;\r?\n/gm, "")
  .replace(/type RouteMode = .*;\r?\n/, "")
  .replace(/type StopIdentity = .*;\r?\n/, "")
  .replace(/<EditableRouteStop\["stop_type"\]>/g, "")
  .replace(/: StopIdentity/g, "")
  .replace(/: RouteMode/g, "")
  .replace(/: JourneyLegMode \| null/g, "")
  .replace(/stops: EditableRouteStop\[\]/g, "stops")
  .replace(/automaticallyManagedIds: ReadonlySet<string>/g, "automaticallyManagedIds")
  .replace(/inferenceEligibleIds: ReadonlySet<string>/g, "inferenceEligibleIds")
  .replace(/export function/g, "function")
  .concat("\nreturn { inferOnwardTransport, reconcileInferredOnwardTransport };\n");
const { inferOnwardTransport, reconcileInferredOnwardTransport } = Function(executable)();

const stop = (id, stop_type, onward_transport = null) => ({ id, stop_type, onward_transport });

assert.equal(inferOnwardTransport(stop("a", "airport"), stop("b", "airport"), "Multimodal"), "Air");
assert.equal(inferOnwardTransport(stop("a", "port"), stop("b", "port"), "Multimodal"), "Sea");
assert.equal(inferOnwardTransport(stop("a", "border"), stop("b", "warehouse"), "Multimodal"), "Road");
assert.equal(inferOnwardTransport(stop("a", "airport"), stop("b", "port"), "Multimodal"), null);
assert.equal(inferOnwardTransport(stop("a", "airport"), stop("b", "port"), "Air"), "Air");
assert.equal(inferOnwardTransport(stop("a", "port"), stop("b", "airport"), "Sea"), "Sea");
assert.equal(inferOnwardTransport(stop("a", "warehouse"), stop("b", "airport"), "Road"), "Road");

const newIds = new Set(["a", "b", "c"]);
let result = reconcileInferredOnwardTransport([stop("a", "airport"), stop("b", "airport")], "Air", new Set(), newIds);
assert.equal(result.stops[0].onward_transport, "Air");
assert.equal(result.stops[1].onward_transport, null, "final destination has no onward mode");

result = reconcileInferredOnwardTransport([stop("a", "airport", "Road"), stop("b", "airport")], "Air", new Set(), new Set());
assert.equal(result.stops[0].onward_transport, "Road", "explicit values are preserved");

result = reconcileInferredOnwardTransport([stop("a", "airport", "Air"), stop("b", "port")], "Multimodal", new Set(["a"]), newIds);
assert.equal(result.stops[0].onward_transport, null, "an automatic value is cleared when a reordered multimodal leg becomes ambiguous");

result = reconcileInferredOnwardTransport([stop("a", "port"), stop("b", "port"), stop("c", "airport")], "Multimodal", new Set(), newIds);
assert.equal(result.stops[0].onward_transport, "Sea");
assert.equal(result.stops[1].onward_transport, null, "ambiguous multimodal transition remains for admin selection");

result = reconcileInferredOnwardTransport([stop("b", "airport"), stop("a", "airport")], "Air", new Set(["a"]), newIds);
assert.equal(result.stops[0].onward_transport, "Air", "newly eligible stops default after reordering");
assert.equal(result.stops[1].onward_transport, null, "the reordered final stop remains clear");

console.log("Route onward-transport inference tests passed.");
