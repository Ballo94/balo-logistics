import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

let source = await readFile(new URL("../app/lib/shipment-history-presentation.ts", import.meta.url), "utf8");
source = source.replace(/import type \{ AdminShipmentHistoryEntry \} from "\.\/shipment-history-admin";\r?\n/, "");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const presentation = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const entries = [
  { id: 1, status: "Shipment Created", note: null, internal_note: null, created_at: "2026-09-20T08:00:00Z" },
  { id: 2, status: "Customs Clearance", note: "Please provide the import permit.", internal_note: "Private review.", created_at: "2026-09-20T09:00:00Z" },
  { id: 3, status: "Delayed", note: "Weather disruption.", internal_note: null, created_at: "2026-09-20T10:00:00Z" },
  { id: 4, status: "Road Transit", note: "shipment test -admin", internal_note: null, created_at: "2026-09-20T11:00:00Z" },
];

assert.deepEqual(entries.filter((entry) => presentation.matchesAdminShipmentHistoryFilter(entry, "All")).map((entry) => entry.id), [1, 2, 3, 4]);
assert.deepEqual(entries.filter((entry) => presentation.matchesAdminShipmentHistoryFilter(entry, "Movement")).map((entry) => entry.id), [1, 4]);
assert.deepEqual(entries.filter((entry) => presentation.matchesAdminShipmentHistoryFilter(entry, "Customs")).map((entry) => entry.id), [2]);
assert.deepEqual(entries.filter((entry) => presentation.matchesAdminShipmentHistoryFilter(entry, "Customer Updates")).map((entry) => entry.id), [2, 3, 4]);
assert.deepEqual(entries.filter((entry) => presentation.matchesAdminShipmentHistoryFilter(entry, "Internal Notes")).map((entry) => entry.id), [2]);
assert.deepEqual(entries.filter((entry) => presentation.matchesAdminShipmentHistoryFilter(entry, "Exceptions")).map((entry) => entry.id), [3]);
assert.deepEqual(presentation.orderAdminShipmentHistory(entries, "newest").map((entry) => entry.id), [4, 3, 2, 1]);
assert.deepEqual(presentation.orderAdminShipmentHistory(entries, "oldest").map((entry) => entry.id), [1, 2, 3, 4]);
assert.equal(presentation.latestAdminShipmentHistoryId(entries), 4);
assert.equal(entries[3].note, "shipment test -admin", "stored test/admin text must never be hidden by presentation rules");

const component = await readFile(new URL("../app/components/AdminShipmentHistory.tsx", import.meta.url), "utf8");
assert.match(component, /Switch shipment/);
assert.match(component, /Internal Note · Admin only/);
assert.match(component, /Customer Update/);
assert.match(component, /entry\.id === latestEventId/);
assert.doesNotMatch(component, /\.from\(|\.insert\(|\.update\(|\.delete\(/, "history component remains presentation-only");

console.log("Admin Shipment History viewer tests passed.");
