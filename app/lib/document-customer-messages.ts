export const DOCUMENT_REQUIRED_FOR_PRESETS = [
  "Customs clearance", "Export processing", "Import clearance", "Carrier requirement",
  "Port / terminal processing", "Security / compliance requirement", "Shipment documentation",
  "Delivery processing", "Other",
] as const;

export const DOCUMENT_REPLACEMENT_REASON_PRESETS = [
  "Document unclear / unreadable", "Information incomplete", "Missing page(s)",
  "Incorrect document uploaded", "Document expired", "Details do not match shipment information",
  "Updated document required", "Other",
] as const;

export type DocumentReplacementReasonPreset = (typeof DOCUMENT_REPLACEMENT_REASON_PRESETS)[number];

export function customerDocumentName(name: string) {
  return name.trim().replace(/\s+Required$/i, "") || "requested document";
}

export function generateDocumentRequestMessage(documentName: string, requiredFor?: string | null) {
  const name = customerDocumentName(documentName);
  switch (requiredFor?.trim()) {
    case "Customs clearance": return `A ${name} is required as part of the customs documentation for this shipment. Please upload a clear copy so the required clearance documentation can be prepared and submitted.`;
    case "Export processing": return `A ${name} is required to support the export documentation for this shipment. Please upload a clear copy so export processing can continue.`;
    case "Import clearance": return `A ${name} is required as part of the import documentation for this shipment. Please upload a clear copy so the required import documentation can be prepared.`;
    case "Carrier requirement": return `A ${name} is required for the relevant transport documentation for this shipment. Please upload a clear copy so the shipment documentation can be completed.`;
    case "Port / terminal processing": return `A ${name} is required to support the relevant port or terminal processing for this shipment. Please upload a clear copy so shipment handling can continue.`;
    case "Security / compliance requirement": return `A ${name} is required to support the applicable shipment security or compliance documentation. Please upload a clear copy so processing can continue.`;
    case "Shipment documentation": return `A ${name} is required to complete the documentation for this shipment. Please upload a clear copy so shipment processing can continue.`;
    case "Delivery processing": return `A ${name} is required to support delivery processing for this shipment. Please upload a clear copy so the delivery documentation can be completed.`;
    default: return requiredFor?.trim() ? `A ${name} is required for ${requiredFor.trim()}. Please upload a clear copy so shipment processing can continue.` : `A ${name} is required to continue processing your shipment. Please upload a clear copy when convenient.`;
  }
}

export function generateReplacementExplanation(documentName: string, reason: DocumentReplacementReasonPreset) {
  const name = customerDocumentName(documentName);
  switch (reason) {
    case "Document unclear / unreadable": return `A clearer copy of the ${name} is required because some of the information on the uploaded document cannot be read clearly. Please upload a clear replacement copy so shipment processing can continue.`;
    case "Information incomplete": return `The information provided on the ${name} is incomplete. Please upload an updated copy containing the missing information so shipment processing can continue.`;
    case "Missing page(s)": return `The ${name} appears to be incomplete. Please upload a complete copy including all pages so shipment processing can continue.`;
    case "Incorrect document uploaded": return `The uploaded file does not appear to be the requested ${name}. Please upload the correct document so shipment processing can continue.`;
    case "Document expired": return `The ${name} provided is no longer current. Please upload a valid updated copy so shipment processing can continue.`;
    case "Details do not match shipment information": return `Some information on the ${name} does not match the shipment information currently provided. Please upload an updated copy with the correct shipment details.`;
    case "Updated document required": return `An updated copy of the ${name} is required to continue processing this shipment. Please upload the latest available copy when convenient.`;
    case "Other": return "";
  }
}
