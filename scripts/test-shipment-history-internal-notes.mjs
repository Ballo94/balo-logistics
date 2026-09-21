import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function loadTrackingEvents(supabase) {
  globalThis.__privateNoteTestSupabase = supabase;
  globalThis.__privateNoteTestState = await load("../app/lib/shipment-state.ts");
  return load("../app/lib/tracking-events.ts", [
    [/import \{ deriveShipmentState \} from "\.\/shipment-state";/, "const { deriveShipmentState } = globalThis.__privateNoteTestState;"],
    [/import \{ supabase \} from "\.\/supabase";/, "const supabase = globalThis.__privateNoteTestSupabase;"],
  ]);
}

async function load(path, replacements = []) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [pattern, replacement] of replacements) source = source.replace(pattern, replacement);
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(js).toString("base64")}#${Math.random()}`);
}

function fakeSupabase({ latest = null, failPrivate = false } = {}) {
  const calls = { historyInserts: [], privateUpserts: [] };
  return {
    calls,
    from(table) {
      if (table === "shipment_history") return {
        select() {
          const chain = { eq: () => chain, order: () => chain, limit: () => chain, maybeSingle: async () => ({ data: latest, error: null }) };
          return chain;
        },
        insert(rows) {
          calls.historyInserts.push(...rows);
          return { select: () => ({ single: async () => ({ data: { id: 71 }, error: null }) }) };
        },
      };
      if (table === "shipment_history_internal_notes") return {
        async upsert(payload, options) {
          calls.privateUpserts.push({ payload, options });
          return { error: failPrivate ? { message: "private write failed" } : null };
        },
      };
      throw new Error(`Unexpected table: ${table}`);
    },
  };
}

const input = {
  shipmentId: 9, trackingNumber: "583104729641", status: "Customs Clearance", transportMode: "Air",
  currentLocation: "Windhoek Customs", originCountry: "South Africa", destinationCountry: "Namibia",
  customNote: "Please upload the import permit.", internalNote: "Supplier invoice discrepancy under review.",
  routeCheckpointId: "checkpoint-customs",
};

{
  const db = fakeSupabase();
  const { createTrackingEvent } = await loadTrackingEvents(db);
  const result = await createTrackingEvent(input);
  assert.equal(result.created, true);
  assert.equal(result.historyId, 71);
  assert.equal(db.calls.historyInserts.length, 1);
  assert.equal(db.calls.historyInserts[0].note, input.customNote);
  assert.equal(JSON.stringify(db.calls.historyInserts[0]).includes(input.internalNote), false);
  assert.deepEqual(db.calls.privateUpserts[0].options, { onConflict: "shipment_history_id" });
  assert.equal(db.calls.privateUpserts[0].payload.shipment_history_id, 71);
  assert.equal(db.calls.privateUpserts[0].payload.note, input.internalNote);
}

{
  const db = fakeSupabase();
  const { createTrackingEvent } = await loadTrackingEvents(db);
  await createTrackingEvent({ ...input, internalNote: null });
  assert.equal(db.calls.historyInserts[0].note, input.customNote, "customer-update-only text remains customer-facing");
  assert.equal(db.calls.privateUpserts.length, 0, "customer-update-only writes no private record");
}

{
  const db = fakeSupabase();
  const { createTrackingEvent } = await loadTrackingEvents(db);
  await createTrackingEvent({ ...input, customNote: null, internalNote: null });
  assert.match(db.calls.historyInserts[0].note, /customs processing/i, "routine checkpoint updates retain their automatic customer description");
  assert.equal(db.calls.privateUpserts.length, 0);
}

{
  const db = fakeSupabase({ latest: { id: 44, status: input.status, route_checkpoint_id: input.routeCheckpointId } });
  const { createTrackingEvent } = await loadTrackingEvents(db);
  const result = await createTrackingEvent(input);
  assert.equal(result.created, false);
  assert.equal(result.historyId, 44);
  assert.equal(db.calls.historyInserts.length, 0, "retry must not duplicate customer history");
  assert.equal(db.calls.privateUpserts.length, 1, "retry must upsert one private-note record");
  assert.equal(db.calls.privateUpserts[0].payload.shipment_history_id, 44);
}

{
  const db = fakeSupabase({ failPrivate: true });
  const { createTrackingEvent } = await loadTrackingEvents(db);
  const result = await createTrackingEvent(input);
  assert.equal(result.error, null);
  assert.equal(result.internalNoteError?.message, "private write failed");
  assert.equal(db.calls.historyInserts[0].note, input.customNote);
  assert.equal(JSON.stringify(db.calls.historyInserts[0]).includes(input.internalNote), false, "private write failure must not leak into public history");
}

{
  const db = fakeSupabase();
  const { createTrackingEvent } = await loadTrackingEvents(db);
  await createTrackingEvent({ ...input, customNote: null });
  assert.match(db.calls.historyInserts[0].note, /customs processing/i, "internal-only updates retain the routine customer description");
  assert.equal(db.calls.privateUpserts[0].payload.note, input.internalNote);
}

const publicFiles = [
  "../app/api/public-tracking/[trackingNumber]/route.ts",
  "../app/customer/CustomerShipmentDetails.tsx",
  "../app/lib/public-shipment-history.ts",
  "../app/lib/public-tracking.ts",
  "../app/ShipmentTimeline.tsx",
  "../app/components/ShipmentCommunications.tsx",
  "../app/components/ShipmentDocuments.tsx",
  "../app/customer/CustomerNotificationCenter.tsx",
];
for (const path of publicFiles) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  assert.equal(source.includes("shipment_history_internal_notes"), false, `${path} must not query the private table`);
  assert.equal(/\binternal_note\b/.test(source), false, `${path} must not serialize the shipment-history private note field`);
}

const adminHistorySource = await readFile(new URL("../app/lib/shipment-history-admin.ts", import.meta.url), "utf8");
const adminHistoryUi = await readFile(new URL("../app/components/AdminShipmentHistory.tsx", import.meta.url), "utf8");
assert.match(adminHistorySource, /\.from\("shipment_history"\)/);
assert.match(adminHistorySource, /\.from\("shipment_history_internal_notes"\)/);
assert.match(adminHistorySource, /\.order\("created_at", \{ ascending: false \}\)/);
assert.doesNotMatch(adminHistorySource, /\.(insert|update|upsert|delete)\(/, "admin history loader must remain read-only");
assert.doesNotMatch(adminHistoryUi, /\b(onEdit|onDelete|editHistory|deleteHistory)\b/, "admin history UI must remain read-only");
assert.match(adminHistoryUi, /Internal Note · Admin only/);
assert.match(adminHistoryUi, /Customer Update/);

const migration = await readFile(new URL("../supabase/migrations/20260920074445_add_shipment_history_internal_notes.sql", import.meta.url), "utf8");
assert.match(migration, /enable row level security/i);
assert.match(migration, /revoke all on table public\.shipment_history_internal_notes from public, anon, authenticated/i);
assert.match(migration, /using \(\(select public\.is_admin\(\)\)\)/i);
assert.doesNotMatch(migration, /to anon/i);
assert.doesNotMatch(migration, /customer_owns_shipment/i);

delete globalThis.__privateNoteTestSupabase;
delete globalThis.__privateNoteTestState;
console.log("Shipment-history private-note security and retry tests passed.");
