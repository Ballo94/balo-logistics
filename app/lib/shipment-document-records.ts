import { supabase } from "./supabase";

export const SHIPMENT_DOCUMENT_TYPES = [
  "Commercial Invoice", "Packing List", "Air Waybill", "Bill of Lading", "Customs Declaration",
  "Delivery Note", "Insurance Certificate", "Import Permit", "Export Permit", "Proof of Delivery", "Other",
  "Cargo Received Photo", "Packing Photo", "Loading Photo", "Offloading Photo", "Customs / Inspection Photo",
  "In-Transit Photo", "Delivery Photo", "Other Photo",
] as const;
export const SHIPMENT_DOCUMENT_BUCKET = "shipment-documents";
export type ShipmentDocumentType = (typeof SHIPMENT_DOCUMENT_TYPES)[number];
export type ShipmentDocumentDirection = "Sent to Customer" | "Received from Customer" | "Document Request" | "Internal / Admin";
export type ShipmentDocument = {
  id: number;
  shipment_id?: number;
  document_name: string;
  document_type: ShipmentDocumentType;
  document_direction: ShipmentDocumentDirection;
  file_url: string | null;
  file_size: number | null;
  visible_to_customer: boolean;
  uploaded_at: string;
  created_by?: string | null;
  notes?: string | null;
  view_url?: string;
  download_url?: string;
};

const ADMIN_DOCUMENT_COLUMNS = "id, shipment_id, document_name, document_type, document_direction, file_url, file_size, visible_to_customer, uploaded_at, created_by, notes";

export function loadAdminShipmentDocuments(shipmentId: number, ascending = false) {
  return supabase.from("shipment_documents").select(ADMIN_DOCUMENT_COLUMNS).eq("shipment_id", shipmentId).order("uploaded_at", { ascending }).order("id", { ascending });
}

export function loadPublicShipmentDocuments(trackingNumber: string) { return supabase.rpc("get_public_shipment_documents", { target_tracking_number: trackingNumber }); }
export function createDocumentUrl(pathOrUrl: string, download?: string) { const path = storagePathFromUrl(pathOrUrl) ?? pathOrUrl; return supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined); }
export function storagePathFromUrl(url: string) { const marker = `/storage/v1/object/public/${SHIPMENT_DOCUMENT_BUCKET}/`; const index = url.indexOf(marker); return index < 0 ? null : decodeURIComponent(url.slice(index + marker.length).split("?")[0]); }
export function formatFileSize(bytes: number | null) { if (bytes === null) return "No file"; if (bytes < 1024) return `${bytes} B`; if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`; return `${(bytes / (1024 * 1024)).toFixed(1)} MB`; }
