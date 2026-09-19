import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function load(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [pattern, replacement] of replacements) source = source.replace(pattern, replacement);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);
}

globalThis.__historyTestState = await load("../app/lib/shipment-state.ts");
const { presentCustomerHistoryNote: present } = await load("../app/lib/customer-history-note.ts", [
  [/import \{ canonicalizeShipmentStatus, normalizeShipmentStatus, type TransportKind \} from "\.\/shipment-state";/, "const { canonicalizeShipmentStatus, normalizeShipmentStatus } = globalThis.__historyTestState;"],
]);

const routine = [
  ["Shipment Created", "Shipment information has been received.", "Origin Warehouse", "air"],
  ["Collected", "Shipment collected from sender.", "Origin Warehouse", "air"],
  ["Origin Warehouse", "Shipment processed at Cape Town Warehouse.", "Cape Town Warehouse", "air"],
  ["Departed Origin Airport", "Shipment departed from OR Tambo International Airport.", "OR Tambo International Airport", "air"],
  ["In Flight", "Shipment is currently in air transit.", "In Flight", "air"],
  ["Arrived Transit Airport", "Shipment arrived at Dubai Airport.", "Dubai Airport", "air"],
  ["Arrived Transit Airport", "Your shipment has arrived at a transit checkpoint.", "Dubai Airport", "air"],
  ["Arrived Destination Airport", "Shipment has arrived at the destination airport.", "Bodensee Airport Friedrichshafen", "air"],
  ["At Sea", "Shipment is currently in sea transit.", "At Sea", "sea"],
  ["Port of Discharge", "Shipment has arrived at the destination port.", "Walvis Bay Port", "sea"],
  ["Road Transit", "Shipment is currently in road transit.", "In Road Transit", "road"],
  ["Destination Distribution Centre", "Shipment received at the destination logistics facility.", "Windhoek Hub", "road"],
  ["In Flight", "Shipment is currently in air transit.", "In Flight", "air"], // active air leg of a multimodal route
  ["In Transit", "Your shipment is currently moving through the logistics network.", "Transit Hub", "other"],
  ["Customs Clearance", "Shipment is undergoing customs processing.", "Customs Facility", "sea"],
  ["Delivered", "Shipment delivered successfully.", "Customer Address", "road"],
];
for (const [status, note, location, mode] of routine) {
  assert.equal(present(note, status, location, mode), null, `${status}: routine note is redundant`);
}

const important = [
  ["Customs Clearance", "Please submit the import permit by 17:00 today.", "air", "Customer action required"],
  ["Delayed", "Delayed due to a vessel schedule change; revised ETA will follow.", "sea", "Important update"],
  ["Shipment Issue", "Delivery issue: the receiver address needs confirmation.", "road", "Important update"],
  ["Payment Required", "Please pay USD 125 before customs release.", "air", "Customer action required"],
  ["Document Required", "Please upload the commercial invoice before departure.", "sea", "Customer action required"],
  ["In Transit", "Shipment security test -admin", "road", null],
  ["In Transit", "shipment test", "road", null],
  ["Collected", "Cargo includes 12 cartons; keep upright during handling.", "road", null],
  ["Delivered", "Parcel left with the building concierge as instructed.", "road", null],
  ["Customs Clearance", "Customs examination is scheduled for Thursday.", "air", "Customs update"],
];
for (const [status, note, mode, expectedLabel] of important) {
  assert.deepEqual(present(note, status, null, mode), { text: note, label: expectedLabel }, `${status}: meaningful note remains visible`);
}
assert.equal(present("Payment Required", "Payment Required", null, "air")?.text, "Payment Required");
assert.equal(present("Document Required", "Document Required", null, "sea")?.text, "Document Required");
assert.equal(present(null, "In Transit", null, "air"), null);

delete globalThis.__historyTestState;
console.log("Customer Journey History note-presentation tests passed.");
