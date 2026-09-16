export const COMMUNICATION_UPDATE_TYPES = [
  "Shipment Created",
  "Collected / Picked Up",
  "Received at Warehouse / Facility",
  "Processing",
  "Ready for Dispatch",
  "Departed Origin",
  "In Transit",
  "Arrived Transit Location",
  "Departed Transit Location",
  "Customs / Customs Clearance",
  "Customs Cleared",
  "Delay / Exception",
  "Arrived Destination",
  "Out for Delivery",
  "Delivered",
  "Document Required",
  "Document Received",
  "General Information",
] as const;

export type CommunicationUpdateType = (typeof COMMUNICATION_UPDATE_TYPES)[number];
export type SmartCommunicationCategory = "Information" | "Delay" | "Customs" | "Payment" | "Arrival" | "Delivery" | "Warning" | "Success";

export const COMMUNICATION_SITUATIONS = {
  Customs: ["General Customs Update", "Customs Processing", "Customs Documentation Required", "Customs Documentation Received", "Customs Cleared"],
  Payment: ["General Payment Update", "Payment Required", "Payment Pending", "Payment Received", "Payment Confirmed", "Additional Charge / Amount Due"],
  Delay: ["General Delay", "Customs Delay", "Transit Delay", "Operational Delay", "Delivery Delay", "Other / Unspecified Delay"],
  Warning: ["General Warning", "Action Required"],
} as const;
export type SituationCategory = keyof typeof COMMUNICATION_SITUATIONS;
export type CommunicationSituation = (typeof COMMUNICATION_SITUATIONS)[SituationCategory][number];

export type SmartCommunicationShipment = {
  receiverName?: string | null;
  trackingNumber: string;
  transportMode?: string | null;
  shipmentStatus?: string | null;
  currentCheckpoint?: string | null;
  currentLocation?: string | null;
  nextCheckpoint?: string | null;
  nextLocation?: string | null;
  origin?: string | null;
  destination?: string | null;
  estimatedDelivery?: string | null;
  courier?: string | null;
  trackingUrl?: string | null;
};

export type SmartCommunicationTemplate = {
  updateType: CommunicationUpdateType;
  category: SmartCommunicationCategory;
  situation: CommunicationSituation | null;
  title: string;
  message: string;
  whatsappMessage: string;
};

export function hasEditedCommunication(title: string, message: string, suggestion: SmartCommunicationTemplate, existingRecord: boolean) {
  return existingRecord || title !== suggestion.title || message !== suggestion.message;
}

export function publicTrackingUrl(siteUrl: string | null | undefined, trackingNumber: string) {
  const base = siteUrl?.trim().replace(/\/$/, "");
  if (!base || !/^https:\/\//i.test(base) || /localhost|127\.0\.0\.1/i.test(base)) return null;
  return `${base}/track?tracking=${encodeURIComponent(trackingNumber)}`;
}

type EffectiveMode = "air" | "sea" | "road" | "neutral";

const CATEGORY_BY_TYPE: Record<CommunicationUpdateType, SmartCommunicationCategory> = {
  "Shipment Created": "Information",
  "Collected / Picked Up": "Information",
  "Received at Warehouse / Facility": "Arrival",
  Processing: "Information",
  "Ready for Dispatch": "Information",
  "Departed Origin": "Information",
  "In Transit": "Information",
  "Arrived Transit Location": "Arrival",
  "Departed Transit Location": "Information",
  "Customs / Customs Clearance": "Customs",
  "Customs Cleared": "Success",
  "Delay / Exception": "Delay",
  "Arrived Destination": "Arrival",
  "Out for Delivery": "Delivery",
  Delivered: "Success",
  "Document Required": "Warning",
  "Document Received": "Success",
  "General Information": "Information",
};

const TITLE_BY_TYPE: Record<CommunicationUpdateType, string> = {
  "Shipment Created": "Shipment registered",
  "Collected / Picked Up": "Shipment collected",
  "Received at Warehouse / Facility": "Shipment received at facility",
  Processing: "Shipment processing update",
  "Ready for Dispatch": "Shipment ready for dispatch",
  "Departed Origin": "Shipment departed origin",
  "In Transit": "Shipment in transit",
  "Arrived Transit Location": "Shipment arrived at transit location",
  "Departed Transit Location": "Shipment departed transit location",
  "Customs / Customs Clearance": "Customs processing update",
  "Customs Cleared": "Shipment cleared by customs",
  "Delay / Exception": "Important shipment update",
  "Arrived Destination": "Shipment arrived at destination",
  "Out for Delivery": "Shipment out for delivery",
  Delivered: "Shipment delivered",
  "Document Required": "Document required",
  "Document Received": "Document received",
  "General Information": "Shipment information update",
};

export function defaultCommunicationCategory(updateType: CommunicationUpdateType): SmartCommunicationCategory {
  return CATEGORY_BY_TYPE[updateType];
}

export function defaultCommunicationSituation(category: SmartCommunicationCategory, updateType: CommunicationUpdateType): CommunicationSituation | null {
  if (category === "Customs") {
    if (updateType === "Customs Cleared") return "Customs Cleared";
    if (updateType === "Document Required") return "Customs Documentation Required";
    if (updateType === "Document Received") return "Customs Documentation Received";
    return "Customs Processing";
  }
  if (category === "Payment") return "General Payment Update";
  if (category === "Delay") return "General Delay";
  if (category === "Warning") return "General Warning";
  return null;
}

export function buildSmartCommunicationTemplate(updateType: CommunicationUpdateType, shipment: SmartCommunicationShipment, options?: { forceNeutral?: boolean; category?: SmartCommunicationCategory; situation?: CommunicationSituation | null }): SmartCommunicationTemplate {
  const name = firstName(shipment.receiverName);
  const tracking = clean(shipment.trackingNumber) || "Not available";
  const place = clean(shipment.currentLocation) || clean(shipment.currentCheckpoint);
  const destination = clean(shipment.destination);
  const eta = clean(shipment.estimatedDelivery);
  const mode = options?.forceNeutral ? "neutral" : resolveEffectiveMode(shipment);
  const category = options?.category ?? defaultCommunicationCategory(updateType);
  const offeredSituations: readonly string[] = category in COMMUNICATION_SITUATIONS ? COMMUNICATION_SITUATIONS[category as SituationCategory] : [];
  const situation = options?.situation && offeredSituations.includes(options.situation)
    ? options.situation
    : defaultCommunicationSituation(category, updateType);
  const context = { mode, place, origin: clean(shipment.origin), destination, courier: clean(shipment.courier), status: clean(shipment.shipmentStatus) };
  const { title: subject, update } = categoryCopy(category, updateType, situation, context);
  const detailLines = [`Tracking: ${tracking}`];
  if (eta && category !== "Payment" && category !== "Warning" && ["Ready for Dispatch", "Departed Origin", "In Transit", "Arrived Destination", "Out for Delivery"].includes(updateType)) detailLines.push(`Estimated delivery: ${eta}`);
  const delivered = updateType === "Delivered" && (category === "Information" || category === "Delivery" || category === "Success");
  const closing = delivered
    ? "Thank you for choosing Balo Logistics."
    : updateType === "Document Required" && category !== "Payment" && category !== "Customs"
      ? "Please contact Balo Logistics if you need help providing the document."
      : "We’ll keep you updated as your shipment continues toward delivery.";
  const message = `Hello ${name},\n\n${update}\n\n${detailLines.join("\n")}\n\n${closing}\n\nBalo Logistics`;
  const trackingLink = clean(shipment.trackingUrl);
  const whatsappMessage = trackingLink ? `${message}\n\nTrack your shipment:\n${trackingLink}` : message;
  return { updateType, category, situation, title: `${subject} - ${tracking}`, message, whatsappMessage };
}

type CopyContext = { mode: EffectiveMode; place: string; origin: string; destination: string; courier: string; status: string };

function categoryCopy(category: SmartCommunicationCategory, updateType: CommunicationUpdateType, situation: CommunicationSituation | null, context: CopyContext) {
  const atPlace = context.place ? ` at ${context.place}` : "";
  if (category === "Customs") {
    switch (situation) {
      case "Customs Documentation Required": return { title: "Customs document required", update: "A document is required for customs processing. Please contact Balo Logistics for the exact document and instructions before submitting anything." };
      case "Customs Documentation Received": return { title: "Customs document received", update: "Thank you. We have received the customs document. We will update you when the next processing step is confirmed." };
      case "Customs Cleared": return { title: "Shipment cleared by customs", update: `Your shipment has completed customs clearance${atPlace} and can proceed to its next logistics stage.` };
      case "General Customs Update": return { title: "Customs update", update: "We have an update about customs processing for your shipment. We’ll share confirmed details as processing continues." };
      default: return { title: "Customs processing update", update: `Your shipment is currently undergoing customs processing${atPlace}. We’ll keep you updated as processing continues.` };
    }
  }
  if (category === "Payment") {
    switch (situation) {
      case "Payment Required": return { title: "Payment required for shipment", update: "A payment is required in connection with your shipment. Please contact Balo Logistics for the payment details and instructions before making payment. We’ll update you once payment has been confirmed." };
      case "Payment Pending": return { title: "Shipment payment pending", update: "A payment related to your shipment is pending confirmation. Please contact Balo Logistics if you need payment details or assistance." };
      case "Payment Received": return { title: "Shipment payment received", update: "We have received a payment related to your shipment. We’ll share another update after the next confirmed processing step." };
      case "Payment Confirmed": return { title: "Shipment payment confirmed", update: "Payment for your shipment has been confirmed. We’ll continue to update you as your shipment progresses." };
      case "Additional Charge / Amount Due": return { title: "Shipment payment details required", update: "There is an additional amount due in connection with your shipment. Please contact Balo Logistics for the confirmed amount, reason, and payment instructions before making payment." };
      default: return { title: "Shipment payment update", update: "We have a payment-related update for your shipment. Please contact Balo Logistics for the confirmed details and instructions." };
    }
  }
  if (category === "Delay") {
    const kind = situation === "Customs Delay" ? "customs processing" : situation === "Transit Delay" ? "transit" : situation === "Operational Delay" ? "operations" : situation === "Delivery Delay" ? "delivery" : null;
    return { title: kind ? `${kind[0].toUpperCase()}${kind.slice(1)} delay update` : "Shipment delay update", update: kind
      ? `Your shipment has experienced a delay during ${kind}. We are monitoring the situation and will share confirmed information when it becomes available.`
      : "Your shipment has experienced a delay. We are monitoring the situation and will share confirmed information when it becomes available." };
  }
  if (category === "Warning") return situation === "Action Required"
    ? { title: "Action required for shipment", update: "Your shipment needs your attention. Please contact Balo Logistics for the confirmed action and instructions before proceeding." }
    : { title: "Important shipment notice", update: "We have an important update about your shipment. Please contact Balo Logistics if you need details or assistance." };
  if (category === "Arrival") {
    if (updateType === "Arrived Destination") return { title: TITLE_BY_TYPE[updateType], update: arrivedDestination(context.mode, context.place, context.destination) };
    if (updateType === "Arrived Transit Location") return { title: TITLE_BY_TYPE[updateType], update: eventCopy(updateType, context) };
    return { title: "Shipment arrival update", update: context.place ? `Your shipment has arrived at ${context.place} and is progressing to its next confirmed stage.` : `Your shipment has arrived at a ${facility(context.mode)} and is progressing to its next confirmed stage.` };
  }
  if (category === "Delivery") {
    if (updateType === "Delivered" || updateType === "Out for Delivery") return { title: TITLE_BY_TYPE[updateType], update: eventCopy(updateType, context) };
    return { title: "Shipment delivery update", update: "We have an update about the delivery stage of your shipment. We’ll share confirmed details as they become available." };
  }
  if (category === "Success") {
    if (["Delivered", "Customs Cleared", "Document Received"].includes(updateType)) return { title: TITLE_BY_TYPE[updateType], update: eventCopy(updateType, context) };
    if (["Shipment Created", "Collected / Picked Up", "Received at Warehouse / Facility", "Arrived Transit Location", "Arrived Destination"].includes(updateType)) {
      return { title: TITLE_BY_TYPE[updateType], update: eventCopy(updateType, context) };
    }
    return { title: "Shipment information update", update: "We have an update about your shipment. Please review the confirmed details from Balo Logistics." };
  }
  return { title: TITLE_BY_TYPE[updateType], update: eventCopy(updateType, context) };
}

export function inferCommunicationUpdateType(status: string | null | undefined): CommunicationUpdateType {
  const value = status?.trim().toLowerCase() || "";
  if (/document.*(received|submitted)/.test(value)) return "Document Received";
  if (/document.*(required|request|needed)/.test(value)) return "Document Required";
  if (/deliver(ed|y complete)|journey complete/.test(value)) return "Delivered";
  if (/out for delivery|final delivery|with courier/.test(value)) return "Out for Delivery";
  if (/delay|exception|issue|held/.test(value)) return "Delay / Exception";
  if (/custom.*clear(ed|ance complete)/.test(value)) return "Customs Cleared";
  if (/custom|clearance|border processing/.test(value)) return "Customs / Customs Clearance";
  if (/arrived.*destination|destination arrival/.test(value)) return "Arrived Destination";
  if (/departed.*transit|transit departure/.test(value)) return "Departed Transit Location";
  if (/arrived.*transit|transit arrival/.test(value)) return "Arrived Transit Location";
  if (/departed.*origin|flight departure|sea departure/.test(value)) return "Departed Origin";
  if (/ready.*dispatch|awaiting departure|loaded on/.test(value)) return "Ready for Dispatch";
  if (/processing/.test(value)) return "Processing";
  if (/warehouse|facility received|received at/.test(value)) return "Received at Warehouse / Facility";
  if (/collect|picked up|pickup complete/.test(value)) return "Collected / Picked Up";
  if (/in flight|at sea|road transit|rail transit|in transit|on route/.test(value)) return "In Transit";
  if (/created|registered/.test(value)) return "Shipment Created";
  return "General Information";
}

function eventCopy(type: CommunicationUpdateType, context: CopyContext) {
  const { mode, place, origin, destination, courier, status } = context;
  const atPlace = place ? ` at ${place}` : "";
  switch (type) {
    case "Shipment Created": return "Your shipment has been registered and is being prepared for its journey.";
    case "Collected / Picked Up": return "Your shipment has been collected and is moving to the next confirmed logistics checkpoint.";
    case "Received at Warehouse / Facility": return `Your shipment has been received${atPlace || ` at ${facility(mode)}`} and is being prepared for its next stage.`;
    case "Processing": return `Your shipment is being processed${atPlace}. We will share another update when its next movement is confirmed.`;
    case "Ready for Dispatch": return `Your shipment is ready for dispatch${atPlace} and awaiting its next confirmed movement.`;
    case "Departed Origin": return departedOrigin(mode, place, origin);
    case "In Transit": return inTransit(mode, place);
    case "Arrived Transit Location": return `Your shipment has arrived${atPlace || ` at a transit ${facility(mode)}`} and is progressing through the next handling stage.`;
    case "Departed Transit Location": return `Your shipment has departed${atPlace || ` the transit ${facility(mode)}`} and is continuing to its next confirmed checkpoint.`;
    case "Customs / Customs Clearance": return `Your shipment is undergoing customs processing${atPlace}. Clearance timing remains subject to the relevant authorities.`;
    case "Customs Cleared": return `Your shipment has completed customs clearance${atPlace} and can proceed to its next logistics stage.`;
    case "Delay / Exception": return `Your shipment is experiencing a delay${atPlace}. Our operations team is monitoring the situation and will share confirmed information when it becomes available.`;
    case "Arrived Destination": return arrivedDestination(mode, place, destination);
    case "Out for Delivery": return courier
      ? `Your shipment is out for delivery with ${courier}${destination ? ` and is progressing toward ${destination}` : ""}.`
      : destination
        ? `Your shipment is out for delivery and is progressing toward ${destination}.`
        : "Your shipment is with the local delivery team and is progressing toward final delivery.";
    case "Delivered": return "Your shipment has been delivered successfully.";
    case "Document Required": return "A document is required before shipment processing can continue. Please provide the requested document using the instructions supplied by Balo Logistics.";
    case "Document Received": return "Thank you. We have received the requested document and will provide another update after the next confirmed processing step.";
    case "General Information": return status ? `We have a new update for your shipment. Its current status is ${status}${atPlace}.` : `We have a new update for your shipment${atPlace}.`;
  }
}

function resolveEffectiveMode(shipment: SmartCommunicationShipment): EffectiveMode {
  const declared = clean(shipment.transportMode).toLowerCase();
  if (declared.includes("air") && !declared.includes("multi")) return "air";
  if (declared.includes("sea") && !declared.includes("multi")) return "sea";
  if ((declared.includes("road") || declared.includes("truck")) && !declared.includes("multi")) return "road";
  if (declared.includes("multi")) {
    const currentContext = [shipment.currentCheckpoint, shipment.currentLocation].map(clean).join(" ").toLowerCase();
    const indicated = [
      /airport|air freight|aircraft|flight/.test(currentContext) ? "air" : null,
      /seaport|\bport\b|vessel|ocean|sea freight|at sea/.test(currentContext) ? "sea" : null,
      /border|road|truck|highway/.test(currentContext) ? "road" : null,
    ].filter(Boolean);
    return indicated.length === 1 ? indicated[0] as EffectiveMode : "neutral";
  }
  return "neutral";
}

function departedOrigin(mode: EffectiveMode, place: string, origin: string) {
  const confirmedOrigin = place || origin;
  if (confirmedOrigin) return `Your shipment has departed ${confirmedOrigin} and is continuing to its next confirmed checkpoint.`;
  if (mode === "air") return "Your shipment has departed the origin airport and is continuing by air freight.";
  if (mode === "sea") return "Your shipment has departed the origin port and is continuing by sea freight.";
  if (mode === "road") return "Your shipment has departed the origin facility and is continuing by road.";
  return "Your shipment has departed its origin and is continuing to the next confirmed checkpoint.";
}

function inTransit(mode: EffectiveMode, place: string) {
  if (mode === "air") return place ? `Your shipment is in air transit from ${place} to its next confirmed checkpoint.` : "Your shipment is currently in air transit to its next confirmed checkpoint.";
  if (mode === "sea") return place ? `Your shipment is in sea transit from ${place} to its next confirmed port.` : "Your shipment is currently in sea transit to its next confirmed port.";
  if (mode === "road") return place ? `Your shipment is in road transit from ${place} to its next confirmed checkpoint.` : "Your shipment is currently in road transit to its next confirmed checkpoint.";
  return place ? `Your shipment is in transit from ${place} to its next confirmed checkpoint.` : "Your shipment is currently in transit to its next confirmed checkpoint.";
}

function arrivedDestination(mode: EffectiveMode, place: string, destination: string) {
  if (place) return `Your shipment has arrived at ${place} and is progressing to the next processing stage.`;
  if (mode === "air") return "Your shipment has arrived at the destination airport and is progressing to the next processing stage.";
  if (mode === "sea") return "Your shipment has arrived at the destination port and is progressing through the next handling stage.";
  if (mode === "road") return "Your shipment has reached the destination facility and is progressing toward final delivery.";
  return destination ? `Your shipment has arrived at ${destination} and is progressing to the next processing stage.` : "Your shipment has arrived at its destination and is progressing to the next processing stage.";
}

function facility(mode: EffectiveMode) {
  if (mode === "air") return "airport";
  if (mode === "sea") return "port";
  if (mode === "road") return "warehouse or distribution facility";
  return "logistics facility";
}

function firstName(value: string | null | undefined) {
  return clean(value).split(/\s+/)[0] || "Customer";
}

function clean(value: string | null | undefined) {
  return value?.trim() || "";
}
