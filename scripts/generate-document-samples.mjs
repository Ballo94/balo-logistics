import { mkdir, writeFile } from "node:fs/promises";

import { buildShipmentPdf } from "../app/lib/shipment-documents.ts";

const shipment = {
  id: 42,
  tracking_number: "BALO-2026-0042",
  client_name: "Acme Trading Namibia",
  origin_country: "Windhoek, Namibia",
  destination_country: "Cape Town, South Africa",
  current_location: "Keetmanshoop Distribution Hub",
  shipment_status: "In Transit",
  transport_mode: "Road",
  estimated_delivery: "2026-08-12",
  created_at: "2026-08-05T09:30:00Z",
  courier_name: "Balo Express",
  item_description: "Commercial electronics and secured accessories",
  receiver_name: "Thandi Mbeki",
  receiver_phone: "+27 21 555 0188",
  receiver_address: "14 Harbour Logistics Park, Cape Town",
  weight_kg: 128.5,
  package_count: 4,
  package_type: "Palletized cartons",
  declared_value: 2850,
  sender_name: "Acme Trading Namibia",
  sender_address: "12 Independence Avenue, Windhoek",
  shipping_charges: 2850,
  payment_status: "Paid",
  invoice_number: "INV-2026-0042",
};

await mkdir("tmp/pdfs", { recursive: true });
for (const kind of ["waybill", "label", "invoice"]) {
  const pdf = await buildShipmentPdf(kind, shipment);
  await writeFile(`tmp/pdfs/${kind}-sample.pdf`, Buffer.from(pdf.output("arraybuffer")));
}
