import { canonicalizeShipmentStatus, normalizeShipmentStatus, type TransportKind } from "./shipment-state";

export type CustomerHistoryNote = { text: string; label: string | null };

function normalizeSentence(value: string) {
  return normalizeShipmentStatus(value).replace(/[.!?]+$/g, "").trim();
}

/** Hide only exact, routine milestone boilerplate; uncertain or specific notes remain visible. */
export function presentCustomerHistoryNote(
  note: string | null | undefined,
  status: string,
  location: string | null | undefined,
  mode: TransportKind,
): CustomerHistoryNote | null {
  const text = note?.trim();
  if (!text) return null;

  const normalized = normalizeSentence(text);
  const milestone = normalizeSentence(status);
  const stage = canonicalizeShipmentStatus(status);
  const routine = stage !== "exception" && !/\b(payment|document|customs|clearance|delay|exception|warning|issue|action|required)\b/i.test(status);
  const exactRestatements = new Set([
    milestone,
    `shipment ${milestone}`,
    `shipment is ${milestone}`,
    `your shipment ${milestone}`,
    `your shipment is ${milestone}`,
  ]);
  if (routine && exactRestatements.has(normalized)) return null;

  const boilerplate = new Set<string>();
  const add = (...messages: string[]) => messages.forEach((message) => boilerplate.add(normalizeSentence(message)));

  if (stage === "created") add("Shipment information has been received.", "Your shipment has been registered and is being prepared for its journey.");
  if (stage === "collected") add("Shipment collected from sender.", "Your shipment has been collected and is progressing toward the next logistics checkpoint.");
  if (stage === "warehouse" || stage === "destination_hub") add(
    "Shipment received at origin logistics facility.",
    "Shipment received at origin airport logistics facility.",
    "Shipment received at origin port facility.",
    "Shipment received at origin distribution centre.",
    "Shipment received at the destination logistics facility.",
    "Your shipment is being processed at the logistics facility.",
  );
  if (stage === "awaiting_departure") add(
    "Shipment is ready for departure from the origin airport.",
    "Shipment has been loaded for sea freight departure.",
    "Shipment is ready to depart the origin distribution centre.",
    "Your shipment is being processed at the logistics facility.",
  );
  if (stage === "transit") add(
    "Shipment is currently in air transit.",
    "Shipment is currently in sea transit.",
    "Shipment is currently in road transit.",
    "Shipment is currently in transit.",
    "Shipment departed from origin airport.",
    "Shipment departed from origin port.",
    "Your shipment is currently in transit to the next checkpoint.",
    "Your shipment has arrived at a transit checkpoint.",
    "Your shipment has departed the transit checkpoint and is continuing its journey.",
  );
  if (stage === "arrived_destination") add(
    "Shipment has arrived at the destination airport.",
    "Shipment has arrived at the destination port.",
    "Shipment has arrived at the destination distribution centre.",
    "Your shipment has arrived at the destination airport and is progressing to the next processing stage.",
    "Your shipment has arrived at the destination port and is progressing to the next processing stage.",
  );
  if (stage === "customs") add("Shipment is undergoing customs processing.", "Your shipment is undergoing customs processing.");
  if (stage === "out_for_delivery") add("Shipment is with the local delivery team.", "Your shipment is on its final delivery journey.");
  if (stage === "delivered") add("Shipment delivered successfully.", "Your shipment has been delivered successfully.");

  if (["transit", "arrived_destination", "warehouse", "awaiting_departure"].includes(stage)) {
    const transport = mode === "air" ? "air freight" : mode === "sea" ? "sea freight" : mode === "road" ? "road transport" : "logistics";
    add(`Your shipment is currently moving through the ${transport} network.`);
  }

  const place = location?.trim();
  if (place && ["warehouse", "awaiting_departure", "transit", "arrived_destination", "destination_hub"].includes(stage)) {
    add(
      `Shipment received at ${place}.`,
      `Shipment processed at ${place}.`,
      `Shipment arrived at ${place}.`,
      `Shipment departed from ${place}.`,
      `Vessel departed from ${place}.`,
    );
  }
  if (boilerplate.has(normalized)) return null;

  const actionRequired = /\b(payment required|document required|customer action required|please (pay|provide|upload|submit|contact|confirm)|must (pay|provide|upload|submit|contact|confirm)|action required)\b/i.test(text);
  const label = actionRequired ? "Customer action required"
    : /\b(customs|clearance)\b/i.test(text) ? "Customs update"
      : /\b(delay|delayed|exception|warning|delivery issue|held)\b/i.test(text) ? "Important update" : null;
  return { text, label };
}
