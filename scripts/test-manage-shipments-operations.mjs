import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/manage-shipments.ts", import.meta.url), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const operations = await import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}`);

const shipments = [
  { tracking_number: "557367964876", client_name: "Sender One", receiver_name: "Joe Receiver", client_company_name: "Supplier GmbH", receiver_company_name: null, origin_country: "Windhoek", destination_country: "Friedrichshafen", transport_mode: "Air", shipment_status: "Customs Clearance", estimated_delivery: "2026-09-30", created_at: "2026-09-20T08:00:00Z" },
  { tracking_number: "111111111111", client_name: "Ocean Client", receiver_name: "Port Receiver", client_company_name: null, receiver_company_name: null, origin_country: "Shanghai", destination_country: "Walvis Bay", transport_mode: "Sea", shipment_status: "Delayed", estimated_delivery: null, created_at: "2026-09-18T08:00:00Z" },
  { tracking_number: "222222222222", client_name: "Road Sender", receiver_name: "Lusaka Receiver", client_company_name: null, receiver_company_name: null, origin_country: "Johannesburg", destination_country: "Lusaka", transport_mode: "Road", shipment_status: "Out For Delivery", estimated_delivery: "2026-09-25", created_at: "2026-09-19T08:00:00Z" },
  { tracking_number: "333333333333", client_name: "Mixed Sender", receiver_name: null, client_company_name: null, receiver_company_name: null, origin_country: "Dubai", destination_country: "Kigali", transport_mode: "Multimodal", shipment_status: "Delivered", estimated_delivery: "2026-09-22", created_at: "2026-09-17T08:00:00Z" },
];
const before = JSON.stringify(shipments);

const base = { transport: "All", status: "", sort: "created-newest" };
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "557367" }).map((item) => item.tracking_number), ["557367964876"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "joe receiver" }).map((item) => item.tracking_number), ["557367964876"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "supplier gmbh" }).map((item) => item.tracking_number), ["557367964876"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "windhoek" }).map((item) => item.tracking_number), ["557367964876"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "kigali" }).map((item) => item.tracking_number), ["333333333333"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "  JOE RECEIVER  " }).map((item) => item.tracking_number), ["557367964876"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "receiver", transport: "Road", status: "Out For Delivery" }).map((item) => item.tracking_number), ["222222222222"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "missing shipment" }), []);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "", transport: "Sea" }).map((item) => item.tracking_number), ["111111111111"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "", transport: "Road" }).map((item) => item.tracking_number), ["222222222222"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "", transport: "Multimodal" }).map((item) => item.tracking_number), ["333333333333"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "", status: "Customs Clearance" }).map((item) => item.tracking_number), ["557367964876"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "", sort: "eta-soonest" }).map((item) => item.tracking_number), ["333333333333", "222222222222", "557367964876", "111111111111"]);
assert.deepEqual(operations.filterAndSortShipments(shipments, { ...base, search: "", sort: "eta-latest" }).map((item) => item.tracking_number), ["557367964876", "222222222222", "333333333333", "111111111111"]);
assert.deepEqual(operations.shipmentOperationCounts(shipments), { total: 4, active: 3, customs: 1, exceptions: 1, outForDelivery: 1, delivered: 1 });
assert.equal(operations.operationalAttention("Customs Clearance"), "customs");
assert.equal(operations.operationalAttention("Customs Cleared"), null);
assert.equal(operations.operationalAttention("Delayed"), "exception");
assert.equal(operations.operationalAttention("Shipment Issue"), "exception");
assert.equal(operations.operationalAttention("Returned"), "exception");
assert.equal(operations.operationalAttention("Out For Delivery"), "delivery");
assert.deepEqual(operations.paginateShipments(Array.from({ length: 27 }, (_, index) => index + 1), 2, 10), { items: [11, 12, 13, 14, 15, 16, 17, 18, 19, 20], page: 2, totalPages: 3, start: 11, end: 20 });
assert.deepEqual(operations.paginateShipments(Array.from({ length: 11 }, (_, index) => index + 1), 3, 10), { items: [11], page: 2, totalPages: 2, start: 11, end: 11 });
assert.deepEqual(operations.paginateShipments([], 4, 10), { items: [], page: 1, totalPages: 1, start: 0, end: 0 });
assert.equal(JSON.stringify(shipments), before, "filtering, sorting and pagination must not modify shipment records");

const managePage = await readFile(new URL("../app/manage/page.tsx", import.meta.url), "utf8");
assert.match(managePage, /const viewRequestId = useRef\(0\)/, "view requests must be protected from stale history responses");
assert.match(managePage, /if \(viewRequestId\.current !== requestId\) return;/, "only the latest shipment history request may update the modal");
assert.match(managePage, /setPage\(Math\.max\(1, pagination\.page - 1\)\)/, "previous-page navigation must use the clamped visible page");
assert.match(managePage, /setPage\(Math\.min\(pagination\.totalPages, pagination\.page \+ 1\)\)/, "next-page navigation must use the clamped visible page");
assert.match(managePage, /loadAdminShipmentHistory\(shipment\.id\)/);
assert.match(managePage, /createTrackingEvent\(\{/);
assert.match(managePage, /supabase\.from\("shipments"\)\.delete\(\)\.eq\("id", shipment\.id\)/);
assert.match(managePage, /<ShipmentEditor shipment=\{editing\}/);

console.log("Manage Shipments operations tests passed.");
