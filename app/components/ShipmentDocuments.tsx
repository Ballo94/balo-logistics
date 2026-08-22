"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { generateDocumentRequestMessage } from "../lib/document-customer-messages";
import { createDocumentUrl, effectiveDocumentLifecycleStatus, formatFileSize, type ShipmentDocument } from "../lib/shipment-document-records";

export default function ShipmentDocuments({ documents, trackingNumber, urlsAreResolved = false, requestedUploadId = null, onRequestedUploadHandled, onDocumentResolved }: { documents: ShipmentDocument[]; trackingNumber: string; urlsAreResolved?: boolean; requestedUploadId?: number | null; onRequestedUploadHandled?: () => void; onDocumentResolved?: (document: ShipmentDocument) => void }) {
  const [rows, setRows] = useState(documents);
  const [urls, setUrls] = useState<Record<number, { view: string; download: string }>>({});
  const [uploading, setUploading] = useState<ShipmentDocument | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const uploadingReplacement = uploading ? effectiveDocumentLifecycleStatus(uploading) === "replacement_required" : false;
  useEffect(() => { const timer = window.setTimeout(() => setRows(documents), 0); return () => window.clearTimeout(timer); }, [documents]);
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all(rows.filter((document) => document.file_url).map(async (document) => {
        if (urlsAreResolved) return [document.id, { view: document.view_url ?? "", download: document.download_url ?? "" }] as const;
        const [view, download] = await Promise.all([createDocumentUrl(document.file_url!), createDocumentUrl(document.file_url!, document.document_name)]);
        return [document.id, { view: view.data?.signedUrl ?? "", download: download.data?.signedUrl ?? "" }] as const;
      })).then((entries) => { if (active) setUrls(Object.fromEntries(entries)); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [rows, urlsAreResolved]);
  useEffect(() => { if (!uploading) return; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { setUploading(null); setFile(null); setError(""); } }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [busy, uploading]);
  useEffect(() => {
    if (requestedUploadId === null) return;
    const timer = window.setTimeout(() => {
      const request = rows.find((document) => document.id === requestedUploadId && document.visible_to_customer && ["requested", "replacement_required"].includes(effectiveDocumentLifecycleStatus(document) ?? ""));
      if (request) { setUploading(request); setFile(null); setError(""); }
      onRequestedUploadHandled?.();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [onRequestedUploadHandled, requestedUploadId, rows]);

  function openUpload(document: ShipmentDocument) { setUploading(document); setFile(null); setError(""); }
  function closeUpload() { if (busy) return; setUploading(null); setFile(null); setError(""); }
  async function submitUpload() {
    if (!uploading || !file) { setError("Choose a file to upload."); return; }
    setBusy(true); setError("");
    const body = new FormData();
    body.set("trackingNumber", trackingNumber);
    body.set("requestId", String(uploading.id));
    body.set("file", file);
    try {
      const response = await fetch("/api/shipment-documents/respond", { method: "POST", body });
      const result = await response.json() as { document?: ShipmentDocument; error?: string };
      if (!response.ok || !result.document) { setError(result.error ?? "The document could not be uploaded."); return; }
      setRows((current) => current.map((item) => item.id === result.document!.id ? { ...item, ...result.document } : item));
      onDocumentResolved?.(result.document);
      setUploading(null); setFile(null);
    } catch { setError("The document could not be uploaded. Check your connection and try again."); }
    finally { setBusy(false); }
  }

  return <section id="shipment-documents" aria-labelledby="shipment-documents-title">
    <div className="mb-2.5"><p className="text-[0.58rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">Secure files</p><h2 id="shipment-documents-title" className="text-lg font-black tracking-tight text-slate-950">Shipment Documents</h2></div>
    <div className="overflow-hidden rounded-[1.25rem] border border-slate-200/70 bg-white shadow-[0_15px_38px_-27px_rgba(15,23,42,.34)]">
      {!rows.length ? <div className="flex items-center gap-3 px-4 py-3.5"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600 ring-1 ring-blue-100"><DocumentIcon /></span><p className="text-sm font-semibold text-slate-600">No shipment documents are currently available.</p></div> : <ul className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">{rows.map((document) => <DocumentCard key={document.id} document={document} urls={urls[document.id]} onUpload={() => openUpload(document)} />)}</ul>}
    </div>
    {uploading && createPortal(<div className="fixed inset-0 z-[9999] grid place-items-center overflow-y-auto bg-slate-950/60 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeUpload(); }}><section role="dialog" aria-modal="true" aria-labelledby="document-upload-title" className="relative w-full max-w-md rounded-2xl bg-white p-4 text-slate-950 shadow-2xl sm:p-5"><button type="button" disabled={busy} onClick={closeUpload} aria-label="Close upload dialog" className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-lg bg-slate-100 text-lg font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-50">×</button><div className="pr-9"><h3 id="document-upload-title" className="text-base font-black text-slate-950">{uploading.document_name}</h3><p className="mt-1 text-xs text-slate-500">{uploadingReplacement ? "Upload the requested replacement below." : "Upload the requested document below."}</p></div><label className="mt-4 block"><span className="mb-1.5 block text-[0.62rem] font-black uppercase tracking-wider text-slate-500">Choose File</span><input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setError(""); }} className="block w-full rounded-xl border border-dashed border-blue-300 bg-blue-50/40 p-3 text-xs font-semibold file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-bold file:text-white"/></label>{file && <p className="mt-2 truncate rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700" title={file.name}>{file.name}</p>}{error && <p role="alert" className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}<div className="mt-4 flex justify-end gap-2"><button type="button" disabled={busy} onClick={closeUpload} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50">Cancel</button><button type="button" disabled={busy || !file} onClick={() => void submitUpload()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? "Uploading…" : uploadingReplacement ? "Upload Replacement" : "Upload Document"}</button></div></section></div>, document.body)}
  </section>;
}

function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function filenameFromPath(path: string) { const last = decodeURIComponent(path.split("/").pop() ?? "document"); return last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i, ""); }
function DocumentCard({ document, urls, onUpload }: { document: ShipmentDocument; urls?: { view: string; download: string }; onUpload: () => void }) {
  const lifecycle = effectiveDocumentLifecycleStatus(document);
  const outstanding = lifecycle === "requested";
  const replacementRequired = lifecycle === "replacement_required";
  const received = lifecycle === "received";
  return <li className="flex min-w-0 flex-col bg-white p-3.5">
    <div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 ring-1 ring-blue-100"><DocumentIcon /></span><div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-900" title={document.document_name}>{document.document_name}</h3><span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-wider text-blue-700">{document.document_type}</span><p className="mt-1 text-[0.62rem] font-semibold text-slate-500">{document.document_direction}</p></div></div>
    {outstanding && <LifecycleMessage tone="attention" title="Document required" message={generateDocumentRequestMessage(document.document_name, document.required_for)} requiredFor={document.required_for} actionRequired />}
    {received && <LifecycleMessage tone="success" title="Document received" message="Thank you. Your document has been received and is being prepared for the relevant shipment process. We’ll let you know if any additional information is required." />}
    {lifecycle === "submitted" && <LifecycleMessage tone="info" title="Document submitted" message="Your document has been forwarded for the relevant shipment processing. No action is required from you at this time." />}
    {lifecycle === "completed" && <LifecycleMessage tone="success" title="Document completed" message="This document requirement has been completed. No further action is required from you." />}
    {replacementRequired && <LifecycleMessage tone="attention" title="Updated document required" message={document.replacement_reason?.trim() || "An updated or replacement copy of this document is required to continue processing your shipment. Please upload the requested replacement when convenient."} requiredFor={document.required_for} actionRequired />}
    <dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 text-[0.65rem]"><div><dt className="font-bold uppercase tracking-wider text-slate-400">{document.file_url ? "Uploaded" : "Requested"}</dt><dd className="mt-0.5 font-semibold text-slate-700">{formatDate(document.uploaded_at)}</dd></div><div><dt className="font-bold uppercase tracking-wider text-slate-400">{document.file_url ? "File" : "File size"}</dt><dd className="mt-0.5 truncate font-semibold text-slate-700" title={document.file_url ? filenameFromPath(document.file_url) : undefined}>{document.file_url ? filenameFromPath(document.file_url) : formatFileSize(document.file_size)}</dd></div></dl>
    <div className="mt-3 flex flex-wrap gap-2">{document.file_url && <><a href={urls?.view || undefined} target="_blank" rel="noreferrer" aria-disabled={!urls?.view} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 aria-disabled:pointer-events-none aria-disabled:opacity-40"><ViewIcon />View</a><a href={urls?.download || undefined} aria-disabled={!urls?.download} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-600 bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 aria-disabled:pointer-events-none aria-disabled:opacity-40"><DownloadIcon />Download</a></>}{(outstanding || replacementRequired) && document.visible_to_customer && <button type="button" onClick={onUpload} className="min-w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white hover:bg-blue-700">{replacementRequired ? "Upload Replacement" : "Upload Document"}</button>}</div>
  </li>;
}
function LifecycleMessage({ tone, title, message, requiredFor, reason, actionRequired = false }: { tone: "attention" | "info" | "success"; title: string; message: string; requiredFor?: string | null; reason?: string | null; actionRequired?: boolean }) { const style = tone === "attention" ? "border-amber-200 bg-amber-50 text-amber-900" : tone === "info" ? "border-blue-200 bg-blue-50 text-blue-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"; return <div className={`mt-3 rounded-xl border px-3 py-2.5 ${style}`}><p className="text-xs font-black">{title}</p>{requiredFor && <p className="mt-1 text-[0.68rem] font-bold">Required for: {requiredFor}</p>}<p className="mt-1 text-[0.68rem] leading-4 text-slate-600">{message}</p>{reason && <p className="mt-1.5 text-[0.68rem] font-bold">Reason: {reason}</p>}<p className="mt-1.5 text-[0.68rem] font-black">{actionRequired ? "Action required from you." : "No action required from you at this time."}</p></div>; }
function Icon({ children }: { children: React.ReactNode }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">{children}</svg>; }
function DocumentIcon() { return <Icon><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></Icon>; }
function ViewIcon() { return <Icon><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></Icon>; }
function DownloadIcon() { return <Icon><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></Icon>; }
