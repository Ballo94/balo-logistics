import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "../../../lib/supabase-admin";

export const runtime = "nodejs";

const MAX_FILE_SIZE = 25 * 1024 * 1024;
const SHIPMENT_DOCUMENT_BUCKET = "shipment-documents";
const ALLOWED_FILES: Record<string, readonly string[]> = {
  pdf: ["application/pdf"],
  jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"], webp: ["image/webp"],
  doc: ["application/msword", "application/octet-stream"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/zip", "application/octet-stream"],
  xls: ["application/vnd.ms-excel", "application/octet-stream"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/zip", "application/octet-stream"],
};

type RequestRecord = { id: number; shipment_id: number; document_name: string; document_type: string; document_direction: string; file_url: string | null; file_size: number | null; visible_to_customer: boolean; uploaded_at: string; lifecycle_status: string; required_for: string | null; replacement_reason: string | null; submitted_at: string | null; completed_at: string | null };

export async function POST(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  if (!origin || origin !== requestUrl.origin) return NextResponse.json({ error: "Invalid upload origin." }, { status: 403 });

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "Invalid upload request." }, { status: 400 }); }
  const trackingNumber = textField(form.get("trackingNumber"));
  const requestIdValue = textField(form.get("requestId"));
  const requestId = Number(requestIdValue);
  const file = form.get("file");
  if (!trackingNumber || !Number.isSafeInteger(requestId) || requestId <= 0) return NextResponse.json({ error: "Shipment and document request are required." }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size <= 0) return NextResponse.json({ error: "The selected file is empty." }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: "Files must be 25 MB or smaller." }, { status: 413 });

  const originalName = file.name.trim();
  const extension = originalName.includes(".") ? originalName.split(".").pop()!.toLowerCase() : "";
  const allowedMimeTypes = ALLOWED_FILES[extension];
  if (!allowedMimeTypes || !allowedMimeTypes.includes(file.type || "application/octet-stream")) return NextResponse.json({ error: "Upload a PDF, JPG, PNG, WEBP, DOC, DOCX, XLS, or XLSX file." }, { status: 415 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!hasExpectedSignature(extension, bytes)) return NextResponse.json({ error: "The file content does not match its document format." }, { status: 415 });

  const supabase = createSupabaseAdminClient();
  const { data: shipment, error: shipmentError } = await supabase.from("shipments").select("id, tracking_number").eq("tracking_number", trackingNumber).maybeSingle();
  if (shipmentError) return NextResponse.json({ error: "The shipment could not be verified." }, { status: 500 });
  if (!shipment) return NextResponse.json({ error: "Shipment not found." }, { status: 404 });

  const { data: requestRecord, error: requestError } = await supabase.from("shipment_documents").select("id, shipment_id, document_name, document_type, document_direction, file_url, file_size, visible_to_customer, uploaded_at, lifecycle_status, required_for, replacement_reason, submitted_at, completed_at").eq("id", requestId).maybeSingle();
  if (requestError) return NextResponse.json({ error: "The document request could not be verified." }, { status: 500 });
  if (!requestRecord || requestRecord.shipment_id !== shipment.id) return NextResponse.json({ error: "Document request not found for this shipment." }, { status: 404 });
  const isInitialRequest = requestRecord.lifecycle_status === "requested" && requestRecord.document_direction === "Document Request" && !requestRecord.file_url && requestRecord.file_size === null;
  const isReplacementRequest = requestRecord.lifecycle_status === "replacement_required";
  if (!requestRecord.visible_to_customer || (!isInitialRequest && !isReplacementRequest)) return NextResponse.json({ error: "This document request is no longer available for upload." }, { status: 409 });

  const safeName = sanitizeFilename(originalName, extension);
  const objectPath = `${shipment.id}/customer-responses/${requestRecord.id}/${crypto.randomUUID()}-${safeName}`;
  const { error: uploadError } = await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).upload(objectPath, bytes, { contentType: file.type || allowedMimeTypes[0], upsert: false });
  if (uploadError) return NextResponse.json({ error: "The document could not be stored." }, { status: 500 });

  const uploadedAt = new Date().toISOString();
  const updateQuery = supabase.from("shipment_documents").update({ file_url: objectPath, file_size: file.size, uploaded_at: uploadedAt, document_direction: "Received from Customer", lifecycle_status: "received", replacement_reason: null, submitted_at: null, completed_at: null }).eq("id", requestRecord.id).eq("shipment_id", shipment.id).eq("lifecycle_status", requestRecord.lifecycle_status).eq("visible_to_customer", true);
  const { data: updated, error: updateError } = await (isInitialRequest ? updateQuery.eq("document_direction", "Document Request").is("file_url", null) : updateQuery).select("id, shipment_id, document_name, document_type, document_direction, file_url, file_size, visible_to_customer, uploaded_at, lifecycle_status, required_for, replacement_reason, submitted_at, completed_at").maybeSingle();
  if (updateError || !updated) {
    await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).remove([objectPath]);
    return NextResponse.json({ error: updateError ? "The document request could not be completed." : "This request was already completed." }, { status: updateError ? 500 : 409 });
  }
  if (isReplacementRequest && requestRecord.file_url) await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).remove([storagePathFromUrl(requestRecord.file_url)]);
  const [view, download] = await Promise.all([
    supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).createSignedUrl(objectPath, 3600),
    supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).createSignedUrl(objectPath, 3600, { download: originalName }),
  ]);
  return NextResponse.json({ document: { ...updated, view_url: view.data?.signedUrl ?? "", download_url: download.data?.signedUrl ?? "" } satisfies RequestRecord & { view_url: string; download_url: string }, filename: originalName });
}

function textField(value: FormDataEntryValue | null) { return typeof value === "string" ? value.trim() : ""; }
function storagePathFromUrl(pathOrUrl: string) { const marker = `/storage/v1/object/public/${SHIPMENT_DOCUMENT_BUCKET}/`; const index = pathOrUrl.indexOf(marker); return index < 0 ? pathOrUrl : decodeURIComponent(pathOrUrl.slice(index + marker.length).split("?")[0]); }
function sanitizeFilename(name: string, extension: string) { const base = name.slice(0, Math.max(0, name.length - extension.length - 1)).normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^[._-]+|[._-]+$/g, "").slice(0, 80) || "customer-document"; return `${base}.${extension}`; }
function hasExpectedSignature(extension: string, bytes: Uint8Array) {
  if (extension === "pdf") return startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]);
  if (extension === "jpg" || extension === "jpeg") return startsWith(bytes, [0xff, 0xd8, 0xff]);
  if (extension === "png") return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (extension === "webp") return startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (extension === "doc" || extension === "xls") return startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  return (extension === "docx" || extension === "xlsx") && startsWith(bytes, [0x50, 0x4b, 0x03, 0x04]);
}
function startsWith(bytes: Uint8Array, signature: readonly number[]) { return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value); }
