import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";

async function importTypeScript(path, transform = (value) => value) {
  const source = transform(await readFile(new URL(path, import.meta.url), "utf8"));
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(output).toString("base64")}`);
}

const phones = await importTypeScript("../app/lib/phone-normalization.ts");
assert.deepEqual(phones.normalizeInternationalPhone("+264 81 123 4567"), { ok: true, e164: "+264811234567" });
assert.deepEqual(phones.normalizeInternationalPhone("00264 81 123 4567"), { ok: true, e164: "+264811234567" });
assert.deepEqual(phones.normalizeInternationalPhone("+49 (170) 1234567"), { ok: true, e164: "+491701234567" });
assert.equal(phones.normalizeInternationalPhone("081 123 4567").ok, false);
assert.equal(phones.resolveCustomerPhone(null, "+264811234567").e164, "+264811234567");
assert.equal(phones.resolveCustomerPhone("invalid", "+264811234567").ok, false, "An invalid receiver phone must not silently fall back.");
assert.equal(phones.buildManualWhatsAppUrl("+264811234567", "Hello & welcome"), "https://wa.me/264811234567?text=Hello%20%26%20welcome");

const messages = await importTypeScript("../app/lib/communication-template-engine.ts");
const base = { receiverName: "Michael Customer", trackingNumber: "TEST123", currentLocation: "Windhoek", trackingUrl: "https://example.com/track?tracking=TEST123" };
assert.match(messages.buildSmartCommunicationTemplate("In Transit", { ...base, transportMode: "Air" }).message, /air transit/);
assert.match(messages.buildSmartCommunicationTemplate("In Transit", { ...base, transportMode: "Sea" }).message, /sea transit/);
assert.match(messages.buildSmartCommunicationTemplate("In Transit", { ...base, transportMode: "Road" }).message, /road transit/);
assert.doesNotMatch(messages.buildSmartCommunicationTemplate("In Transit", { ...base, transportMode: "Multimodal" }).message, /air transit|sea transit|road transit/);
assert.match(messages.buildSmartCommunicationTemplate("In Transit", { ...base, transportMode: "Multimodal", currentCheckpoint: "Transit Airport" }).message, /air transit/);
assert.doesNotMatch(messages.buildSmartCommunicationTemplate("Delivered", base).message, /keep you updated as your shipment continues/);
assert.equal(messages.publicTrackingUrl("http://localhost:3000", "TEST123"), null);

const testedEvents = ["Shipment Created", "Departed Origin", "In Transit", "Arrived Transit Location", "Customs / Customs Clearance", "Delay / Exception", "Arrived Destination", "Out for Delivery", "Delivered", "Document Required", "Document Received"];
for (const transportMode of ["Air", "Sea", "Road", "Multimodal"]) {
  for (const updateType of testedEvents) {
    const result = messages.buildSmartCommunicationTemplate(updateType, { receiverName: null, trackingNumber: "TEST123", transportMode });
    assert.ok(result.title.includes("TEST123"));
    assert.ok(result.message.includes("Hello Customer"));
    assert.doesNotMatch(result.message, /undefined|null| at \./i);
  }
}
const airArrival = messages.buildSmartCommunicationTemplate("Arrived Destination", { ...base, currentLocation: null, transportMode: "Air" }).message;
const seaArrival = messages.buildSmartCommunicationTemplate("Arrived Destination", { ...base, currentLocation: null, transportMode: "Sea" }).message;
const roadArrival = messages.buildSmartCommunicationTemplate("Arrived Destination", { ...base, currentLocation: null, transportMode: "Road" }).message;
assert.match(airArrival, /destination airport/); assert.doesNotMatch(airArrival, /destination port/);
assert.match(seaArrival, /destination port/); assert.doesNotMatch(seaArrival, /destination airport/);
assert.match(roadArrival, /destination facility/); assert.doesNotMatch(roadArrival, /destination airport|destination port/);
assert.doesNotMatch(messages.buildSmartCommunicationTemplate("Delay / Exception", { trackingNumber: "TEST123", transportMode: "Air" }).message, /reason|new estimated|undefined|null/i);
assert.match(messages.buildSmartCommunicationTemplate("Customs / Customs Clearance", base).message, /undergoing customs processing/);
assert.doesNotMatch(messages.buildSmartCommunicationTemplate("Customs / Customs Clearance", base).message, /completed customs clearance/);
assert.match(messages.buildSmartCommunicationTemplate("Customs Cleared", base).message, /completed customs clearance/);
const arrivalContext = { ...base, currentLocation: "Cape Town Port", transportMode: "Sea" };
const customsInsteadOfArrival = messages.buildSmartCommunicationTemplate("Arrived Destination", arrivalContext, { category: "Customs" });
assert.match(customsInsteadOfArrival.title, /Customs processing/);
assert.match(customsInsteadOfArrival.message, /undergoing customs processing/);
assert.doesNotMatch(customsInsteadOfArrival.message, /has arrived/);
assert.match(customsInsteadOfArrival.whatsappMessage, /undergoing customs processing/);
assert.doesNotMatch(customsInsteadOfArrival.whatsappMessage, /has arrived/);
const paymentInsteadOfArrival = messages.buildSmartCommunicationTemplate("Arrived Destination", arrivalContext, { category: "Payment" });
assert.match(paymentInsteadOfArrival.title, /payment update/);
assert.doesNotMatch(paymentInsteadOfArrival.message, /has arrived|port|terminal/);
assert.match(messages.buildSmartCommunicationTemplate("General Information", base, { category: "Payment", situation: "Payment Required" }).message, /payment details and instructions/);
assert.doesNotMatch(messages.buildSmartCommunicationTemplate("General Information", base, { category: "Payment", situation: "Payment Required" }).message, /\$|bank|deadline|tax|duty/i);
for (const category of ["Information", "Delay", "Customs", "Payment", "Arrival", "Delivery", "Warning", "Success"]) {
  for (const transportMode of ["Air", "Sea", "Road", "Multimodal"]) {
    const result = messages.buildSmartCommunicationTemplate("Arrived Destination", { trackingNumber: "TEST123", transportMode }, { category });
    assert.equal(result.category, category);
    assert.ok(result.whatsappMessage.startsWith(result.message));
    assert.doesNotMatch(result.message, /undefined|null|NaN|\[tracking\]|\[customer\]/i);
    if (transportMode === "Road") assert.doesNotMatch(result.message, /airport|flight|\bport\b|vessel/i);
    if (transportMode === "Sea") assert.doesNotMatch(result.message, /airport|flight/i);
    if (transportMode === "Air") assert.doesNotMatch(result.message, /\bport\b|vessel/i);
  }
}
const airToSea = messages.buildSmartCommunicationTemplate("Arrived Destination", { trackingNumber: "TEST123", transportMode: "Sea" }, { category: "Arrival" });
assert.match(airToSea.message, /destination port/);
assert.doesNotMatch(airToSea.message, /airport|flight/);
const unknownMultimodal = messages.buildSmartCommunicationTemplate("In Transit", { trackingNumber: "TEST123", transportMode: "Multimodal", nextCheckpoint: "Destination Airport" });
assert.doesNotMatch(unknownMultimodal.message, /air transit|sea transit|road transit/);
const warehouseMultimodal = messages.buildSmartCommunicationTemplate("In Transit", { trackingNumber: "TEST123", transportMode: "Multimodal", currentLocation: "Windhoek Warehouse" });
assert.doesNotMatch(warehouseMultimodal.message, /air transit|sea transit|road transit/);
const conflictingMultimodal = messages.buildSmartCommunicationTemplate("In Transit", { trackingNumber: "TEST123", transportMode: "Multimodal", currentCheckpoint: "Airport", currentLocation: "Port of Durban" });
assert.doesNotMatch(conflictingMultimodal.message, /air transit|sea transit|road transit/);
const noFacts = messages.buildSmartCommunicationTemplate("Document Required", { trackingNumber: "TEST123" });
assert.doesNotMatch(noFacts.message, /undefined|null|NaN|estimated delivery|passport|invoice/i);
assert.match(messages.buildSmartCommunicationTemplate("Document Received", { trackingNumber: "TEST123" }).message, /received the requested document/);
assert.doesNotMatch(messages.buildSmartCommunicationTemplate("Customs / Customs Clearance", { trackingNumber: "TEST123" }, { category: "Customs" }).message, /completed customs clearance/);
assert.doesNotMatch(messages.buildSmartCommunicationTemplate("Delay / Exception", { trackingNumber: "TEST123" }, { category: "Success" }).message, /positive milestone|delivered|cleared/);
assert.equal(messages.hasEditedCommunication(airToSea.title, airToSea.message, airToSea, false), false);
assert.equal(messages.hasEditedCommunication("Custom title", airToSea.message, airToSea, false), true);
assert.equal(messages.hasEditedCommunication(airToSea.title, "Custom message", airToSea, false), true);
assert.equal(messages.hasEditedCommunication(airToSea.title, airToSea.message, airToSea, true), true);
const managerSource = await readFile(new URL("../app/components/ShipmentCommunicationsManager.tsx", import.meta.url), "utf8");
assert.match(managerSource, /onChange=\{\(event\) => selectUpdateType/);
assert.match(managerSource, /onChange=\{\(event\) => selectCategory/);
assert.match(managerSource, /selectSituation/);
assert.match(managerSource, /window\.confirm\("Replace the edited title and message/);
assert.match(managerSource, /setType\(nextCategory\)/);
assert.match(managerSource, /setTitle\(suggestion\.title\)/);
assert.match(managerSource, /setMessage\(suggestion\.message\)/);
assert.match(managerSource, /function prepareWhatsApp/);
assert.match(managerSource, /function openWhatsApp/);
assert.match(managerSource, /visible_to_customer: visible/);

const authorization = await importTypeScript("../app/lib/admin-authorization.ts");
assert.equal(authorization.isVerifiedAdminUser({ app_metadata: { role: "admin" } }), true);
assert.equal(authorization.isVerifiedAdminUser({ email: "admin@example.com", app_metadata: {} }, "admin@example.com"), true);
assert.equal(authorization.isVerifiedAdminUser({ email: "customer@example.com", app_metadata: { role: "customer" } }, "admin@example.com"), false);

const twilio = await importTypeScript("../app/lib/twilio-whatsapp.ts", (source) => source.replace('import "server-only";',''));
const saved = { enabled: process.env.TWILIO_WHATSAPP_ENABLED, sid: process.env.TWILIO_ACCOUNT_SID, token: process.env.TWILIO_AUTH_TOKEN, from: process.env.TWILIO_WHATSAPP_FROM };
delete process.env.TWILIO_WHATSAPP_ENABLED; delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_WHATSAPP_FROM;
assert.equal((await twilio.sendTwilioWhatsApp({ recipientE164: "+264811234567", message: "Test" })).status, "Provider Not Configured");
process.env.TWILIO_ACCOUNT_SID = "AC-test"; process.env.TWILIO_AUTH_TOKEN = "test-token"; process.env.TWILIO_WHATSAPP_FROM = "+14155238886";
assert.equal(twilio.isTwilioWhatsAppConfigured(), false, "Credentials alone must not activate automatic WhatsApp sending.");
if (saved.enabled) process.env.TWILIO_WHATSAPP_ENABLED = saved.enabled; else delete process.env.TWILIO_WHATSAPP_ENABLED; if (saved.sid) process.env.TWILIO_ACCOUNT_SID = saved.sid; else delete process.env.TWILIO_ACCOUNT_SID; if (saved.token) process.env.TWILIO_AUTH_TOKEN = saved.token; else delete process.env.TWILIO_AUTH_TOKEN; if (saved.from) process.env.TWILIO_WHATSAPP_FROM = saved.from; else delete process.env.TWILIO_WHATSAPP_FROM;
const url = "https://example.com/api/communications/whatsapp/status"; const parameters = new URLSearchParams({ MessageSid: "SM123", MessageStatus: "delivered" }); const token = "test-token"; let payload = url; for (const key of [...parameters.keys()].sort()) payload += key + parameters.get(key); const signature = createHmac("sha1", token).update(payload).digest("base64");
assert.equal(twilio.validateTwilioSignature({ signature, url, parameters, authToken: token }), true);
assert.equal(twilio.validateTwilioSignature({ signature: "invalid", url, parameters, authToken: token }), false);

const migration = await readFile(new URL("../supabase/migrations/20260905_whatsapp_communications_phase1.sql", import.meta.url), "utf8");
assert.match(migration, /communication_id bigint/);
assert.match(migration, /on delete set null/);
assert.doesNotMatch(migration, /drop table|truncate|delete from/i);

const manualRoute = await readFile(new URL("../app/api/communications/whatsapp/manual/route.ts", import.meta.url), "utf8");
assert.match(manualRoute, /status: "Draft"/);
assert.match(manualRoute, /delivery_mode: "Save Only"/);
assert.match(manualRoute, /source: "manual_whatsapp_open"/);
assert.match(manualRoute, /customer_visible: false/);
assert.doesNotMatch(manualRoute, /status: "(?:Pending|Scheduled|Sent|Delivered)"/);
console.log("WhatsApp Phase 1 regression tests passed.");
