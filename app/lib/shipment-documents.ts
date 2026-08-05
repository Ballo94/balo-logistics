import type { jsPDF as JsPdfType } from "jspdf";

export type ShipmentDocumentData = {
  id: number;
  tracking_number: string;
  client_name: string;
  client_email?: string | null;
  origin_country: string;
  destination_country: string;
  current_location?: string | null;
  shipment_status?: string | null;
  transport_mode?: string | null;
  estimated_delivery?: string | null;
  created_at: string;
  courier_name?: string | null;
  item_description?: string | null;
  receiver_name?: string | null;
  receiver_email?: string | null;
  receiver_phone?: string | null;
  receiver_address?: string | null;
  weight_kg?: number | null;
  package_count?: number | null;
  package_type?: string | null;
  declared_value?: number | null;
  sender_name?: string | null;
  sender_address?: string | null;
  shipping_charges?: number | null;
  payment_status?: string | null;
  invoice_number?: string | null;
};

export type DocumentKind = "waybill" | "label" | "invoice";
export type DocumentAction = "download" | "print" | "email";

const NAVY = "#071a33";
const BLUE = "#2563eb";
const SLATE = "#475569";
const LIGHT = "#f1f5f9";

function value(input: string | number | null | undefined) {
  return input === null || input === undefined || input === "" ? "Not specified" : String(input);
}

function date(input: string | null | undefined) {
  if (!input) return "Not specified";
  const parsed = new Date(input.includes("T") ? input : `${input}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? input : new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(parsed);
}

function money(input: number | null | undefined) {
  return input == null ? "Not specified" : new Intl.NumberFormat("en", { style: "currency", currency: "USD" }).format(input);
}

function header(pdf: JsPdfType, title: string, reference: string, width: number) {
  pdf.setFillColor(NAVY);
  pdf.rect(0, 0, width, 36, "F");
  pdf.setFillColor(BLUE);
  pdf.roundedRect(14, 10, 16, 16, 3, 3, "F");
  pdf.setTextColor("#ffffff");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.text("B", 22, 21, { align: "center" });
  pdf.setFontSize(15);
  pdf.text("BALO LOGISTICS", 35, 16);
  pdf.setFontSize(7);
  pdf.setTextColor("#bfdbfe");
  pdf.text("FAST  |  SECURE  |  RELIABLE", 35, 22);
  pdf.setTextColor("#ffffff");
  pdf.setFontSize(16);
  pdf.text(title, width - 14, 16, { align: "right" });
  pdf.setFontSize(8);
  pdf.setTextColor("#bfdbfe");
  pdf.text(reference, width - 14, 23, { align: "right" });
}

function footer(pdf: JsPdfType, width: number, height: number) {
  pdf.setDrawColor("#cbd5e1");
  pdf.line(14, height - 17, width - 14, height - 17);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(SLATE);
  pdf.text("Balo Logistics  |  Professional Shipment Management", 14, height - 10);
  pdf.text(`Generated ${new Date().toLocaleString("en")}`, width - 14, height - 10, { align: "right" });
}

function sectionTitle(pdf: JsPdfType, title: string, y: number, x = 14, width = 182) {
  pdf.setFillColor(LIGHT);
  pdf.roundedRect(x, y, width, 9, 2, 2, "F");
  pdf.setTextColor(NAVY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.text(title.toUpperCase(), x + 4, y + 6);
}

function field(pdf: JsPdfType, label: string, content: string, x: number, y: number, width: number) {
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(6.5);
  pdf.setTextColor("#94a3b8");
  pdf.text(label.toUpperCase(), x, y);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(NAVY);
  const lines = pdf.splitTextToSize(content, width) as string[];
  pdf.text(lines.slice(0, 2), x, y + 5);
}

async function qrData(trackingNumber: string) {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(trackingNumber, { width: 360, margin: 1, color: { dark: NAVY, light: "#ffffff" } });
}

async function createWaybill(shipment: ShipmentDocumentData) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const qr = await qrData(shipment.tracking_number);
  header(pdf, "WAYBILL", shipment.tracking_number, 210);
  pdf.addImage(qr, "PNG", 164, 43, 30, 30);
  field(pdf, "Tracking number", shipment.tracking_number, 14, 49, 65);
  field(pdf, "Created", date(shipment.created_at), 14, 61, 65);
  field(pdf, "Shipment status", value(shipment.shipment_status), 85, 49, 65);
  field(pdf, "Transport mode", value(shipment.transport_mode), 85, 61, 65);

  sectionTitle(pdf, "Routing information", 82);
  field(pdf, "Origin", shipment.origin_country, 18, 98, 48);
  field(pdf, "Current location", value(shipment.current_location), 77, 98, 52);
  field(pdf, "Destination", shipment.destination_country, 140, 98, 50);
  pdf.setDrawColor(BLUE);
  pdf.setLineWidth(1);
  pdf.line(38, 113, 172, 113);
  [38, 105, 172].forEach((x, index) => { pdf.setFillColor(index === 1 ? BLUE : NAVY); pdf.circle(x, 113, index === 1 ? 3 : 2.4, "F"); });

  sectionTitle(pdf, "Shipment parties", 124);
  field(pdf, "Sender", value(shipment.sender_name ?? shipment.client_name), 18, 140, 78);
  field(pdf, "Sender address / origin", value(shipment.sender_address ?? shipment.origin_country), 18, 153, 78);
  field(pdf, "Receiver", value(shipment.receiver_name), 108, 140, 78);
  field(pdf, "Receiver phone", value(shipment.receiver_phone), 108, 153, 78);
  field(pdf, "Receiver address", value(shipment.receiver_address ?? shipment.destination_country), 108, 166, 78);

  sectionTitle(pdf, "Package information", 181);
  field(pdf, "Description", value(shipment.item_description), 18, 197, 82);
  field(pdf, "Package type", value(shipment.package_type), 108, 197, 38);
  field(pdf, "Packages", value(shipment.package_count), 152, 197, 34);
  field(pdf, "Weight", shipment.weight_kg == null ? "Not specified" : `${shipment.weight_kg} kg`, 108, 211, 38);
  field(pdf, "Estimated delivery", date(shipment.estimated_delivery), 152, 211, 34);
  field(pdf, "Courier", value(shipment.courier_name), 18, 218, 82);

  sectionTitle(pdf, "Acceptance", 235);
  pdf.setFontSize(7);
  pdf.setTextColor(SLATE);
  pdf.text("SHIPPER SIGNATURE", 18, 252);
  pdf.text("CARRIER SIGNATURE", 110, 252);
  pdf.setDrawColor("#94a3b8");
  pdf.line(18, 266, 88, 266);
  pdf.line(110, 266, 180, 266);
  footer(pdf, 210, 297);
  return pdf;
}

async function createLabel(shipment: ShipmentDocumentData) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: [105, 148] });
  const qr = await qrData(shipment.tracking_number);
  header(pdf, "SHIPPING LABEL", shipment.transport_mode ? `MODE: ${shipment.transport_mode.toUpperCase()}` : "BALO EXPRESS", 148);
  pdf.setDrawColor(NAVY);
  pdf.setLineWidth(0.7);
  pdf.roundedRect(7, 41, 134, 56, 3, 3);
  pdf.addImage(qr, "PNG", 12, 47, 41, 41);
  pdf.setTextColor(NAVY);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(shipment.tracking_number, 58, 53);
  pdf.setFontSize(7);
  pdf.setTextColor(SLATE);
  pdf.text("SCAN TO IDENTIFY SHIPMENT", 58, 59);
  field(pdf, "Ship to", value(shipment.receiver_name), 58, 69, 73);
  field(pdf, "Destination", shipment.destination_country, 58, 81, 73);
  field(pdf, "Address", value(shipment.receiver_address), 58, 91, 73);
  pdf.setFillColor(BLUE);
  pdf.roundedRect(115, 45, 21, 12, 2, 2, "F");
  pdf.setTextColor("#ffffff");
  pdf.setFontSize(6);
  pdf.text("PACKAGES", 125.5, 49, { align: "center" });
  pdf.setFontSize(10);
  pdf.text(value(shipment.package_count ?? 1), 125.5, 54.5, { align: "center" });
  return pdf;
}

async function createInvoice(shipment: ShipmentDocumentData) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const invoiceNumber = shipment.invoice_number || `INV-${shipment.id.toString().padStart(5, "0")}`;
  header(pdf, "INVOICE", invoiceNumber, 210);
  field(pdf, "Invoice date", date(new Date().toISOString()), 14, 49, 50);
  field(pdf, "Tracking number", shipment.tracking_number, 75, 49, 55);
  field(pdf, "Payment status", value(shipment.payment_status ?? "Pending"), 142, 49, 54);

  sectionTitle(pdf, "Billing and delivery", 66);
  field(pdf, "Sender / billed to", value(shipment.sender_name ?? shipment.client_name), 18, 82, 78);
  field(pdf, "Sender address", value(shipment.sender_address ?? shipment.origin_country), 18, 95, 78);
  field(pdf, "Receiver", value(shipment.receiver_name), 108, 82, 78);
  field(pdf, "Receiver address", value(shipment.receiver_address ?? shipment.destination_country), 108, 95, 78);
  field(pdf, "Receiver phone", value(shipment.receiver_phone), 108, 108, 78);

  sectionTitle(pdf, "Shipment details", 124);
  const rows = [
    ["DESCRIPTION", "ROUTE", "MODE", "AMOUNT"],
    [value(shipment.item_description), `${shipment.origin_country} to ${shipment.destination_country}`, value(shipment.transport_mode), money(shipment.shipping_charges ?? shipment.declared_value)],
  ];
  const columns = [18, 86, 144, 173];
  rows.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
    pdf.setFont("helvetica", rowIndex === 0 ? "bold" : "normal");
    pdf.setFontSize(rowIndex === 0 ? 7 : 8);
    pdf.setTextColor(rowIndex === 0 ? SLATE : NAVY);
    pdf.text((pdf.splitTextToSize(cell, columnIndex === 0 ? 62 : columnIndex === 1 ? 52 : 25) as string[]).slice(0, 2), columns[columnIndex], 143 + rowIndex * 15);
  }));
  pdf.setDrawColor("#cbd5e1");
  pdf.line(14, 149, 196, 149);
  pdf.line(14, 174, 196, 174);
  pdf.setFillColor(NAVY);
  pdf.roundedRect(128, 186, 68, 30, 3, 3, "F");
  pdf.setTextColor("#bfdbfe");
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("TOTAL CHARGES", 135, 197);
  pdf.setTextColor("#ffffff");
  pdf.setFontSize(15);
  pdf.text(money(shipment.shipping_charges ?? shipment.declared_value), 189, 207, { align: "right" });

  sectionTitle(pdf, "Payment information", 230);
  field(pdf, "Status", value(shipment.payment_status ?? "Pending"), 18, 246, 50);
  field(pdf, "Invoice number", invoiceNumber, 78, 246, 50);
  field(pdf, "Reference", shipment.tracking_number, 138, 246, 50);
  pdf.setFontSize(8);
  pdf.setTextColor(SLATE);
  pdf.text("Thank you for choosing Balo Logistics.", 14, 270);
  footer(pdf, 210, 297);
  return pdf;
}

async function createPdf(kind: DocumentKind, shipment: ShipmentDocumentData) {
  if (kind === "waybill") return createWaybill(shipment);
  if (kind === "label") return createLabel(shipment);
  return createInvoice(shipment);
}

export async function buildShipmentPdf(kind: DocumentKind, shipment: ShipmentDocumentData) {
  return createPdf(kind, shipment);
}

export async function generateShipmentDocument(kind: DocumentKind, action: DocumentAction, shipment: ShipmentDocumentData) {
  const pdf = await createPdf(kind, shipment);
  const filename = `balo-${kind}-${shipment.tracking_number}.pdf`;
  const blob = pdf.output("blob");

  if (action === "download") {
    pdf.save(filename);
    return "downloaded";
  }

  if (action === "print") {
    pdf.autoPrint();
    window.open(pdf.output("bloburl"), "_blank", "noopener,noreferrer");
    return "opened for printing";
  }

  const file = new File([blob], filename, { type: "application/pdf" });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ title: `Balo Logistics ${kind}`, text: `Shipment ${shipment.tracking_number}`, files: [file] });
    return "shared";
  }

  pdf.save(filename);
  window.location.href = `mailto:?subject=${encodeURIComponent(`Balo Logistics ${kind} - ${shipment.tracking_number}`)}&body=${encodeURIComponent(`The ${kind} PDF has been downloaded and is ready to attach.`)}`;
  return "downloaded for email attachment";
}
