import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/public-shipment-history.ts", import.meta.url), "utf8");
const testable = source
  .replace(/import \{ canonicalizeShipmentStatus, normalizeShipmentStatus \} from "\.\/shipment-state";/, `const normalizeShipmentStatus = (value) => String(value ?? "").toLowerCase(); const canonicalizeShipmentStatus = (value) => ["delayed", "shipment issue"].includes(normalizeShipmentStatus(value)) ? "exception" : normalizeShipmentStatus(value) === "delivered" ? "delivered" : "transit";`)
  .replace(/import \{ checkpointIndexForStatus \} from "\.\/route-intelligence\/presentation";/, "const checkpointIndexForStatus = () => 0;")
  .replace(/import type \{ RouteJourney \} from "\.\/route-intelligence";/, "");
const output = ts.transpileModule(testable, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { reconcilePublicShipmentHistory } = await import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);

const journey = { checkpoints: ["A", "B", "C", "D", "E"].map((label) => ({ id: label, label })) };
const rows = [
  { status: "A", location: "A", created_at: "2026-01-01", route_checkpoint_id: "A" },
  { status: "B", location: "B", created_at: "2026-01-02", route_checkpoint_id: "B" },
  { status: "D", location: "D", created_at: "2026-01-03", route_checkpoint_id: "D" },
  { status: "Delivered", location: "E", created_at: "2026-01-04", route_checkpoint_id: "E" },
  { status: "B", location: "B", created_at: "2026-01-05", route_checkpoint_id: "B" },
  { status: "Delayed", location: "B", created_at: "2026-01-06", route_checkpoint_id: "B" },
];
const publicRows = reconcilePublicShipmentHistory(rows, journey, "B");
assert.deepEqual(publicRows.map((row) => row.status), ["A", "B", "B", "Delayed"]);
assert.ok(publicRows.every((row) => !("route_checkpoint_id" in row)), "immutable checkpoint IDs stay server-side");

const operations = await readFile(new URL("../app/lib/operations-automation.ts", import.meta.url), "utf8");
assert.match(operations, /canonicalStatus === "exception"[\s\S]{0,180}index/);
assert.match(operations, /exactCheckpointId/);
console.log("Route correction and exception-state regression tests passed.");
