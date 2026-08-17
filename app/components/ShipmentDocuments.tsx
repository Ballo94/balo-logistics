"use client";

import { useEffect, useState } from "react";
import { createDocumentUrl, formatFileSize, type ShipmentDocument } from "../lib/shipment-document-records";

export default function ShipmentDocuments({ documents }: { documents: ShipmentDocument[] }) {
  const [urls, setUrls] = useState<Record<number, { view: string; download: string }>>({});
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void Promise.all(documents.filter((document) => document.file_url).map(async (document) => {
        const [view, download] = await Promise.all([createDocumentUrl(document.file_url!), createDocumentUrl(document.file_url!, document.document_name)]);
        return [document.id, { view: view.data?.signedUrl ?? "", download: download.data?.signedUrl ?? "" }] as const;
      })).then((entries) => { if (active) setUrls(Object.fromEntries(entries)); });
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [documents]);
  return <section aria-labelledby="shipment-documents-title">
    <div className="mb-2.5"><p className="text-[0.58rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">Secure files</p><h2 id="shipment-documents-title" className="text-lg font-black tracking-tight text-slate-950">Shipment Documents</h2></div>
    <div className="overflow-hidden rounded-[1.25rem] border border-slate-200/70 bg-white shadow-[0_15px_38px_-27px_rgba(15,23,42,.34)]">
      {!documents.length ? <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No shipment documents are available.</p> : <ul className="grid gap-px bg-slate-100 sm:grid-cols-2 xl:grid-cols-3">{documents.map((document) => <li key={document.id} className="flex min-w-0 flex-col bg-white p-3.5"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-50 to-blue-100 text-blue-700 ring-1 ring-blue-100"><DocumentIcon /></span><div className="min-w-0"><h3 className="truncate text-sm font-black text-slate-900" title={document.document_name}>{document.document_name}</h3><span className="mt-1 inline-flex rounded-full bg-blue-50 px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-wider text-blue-700">{document.document_type}</span><p className="mt-1 text-[0.62rem] font-semibold text-slate-500">{document.document_direction}</p></div></div><dl className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2.5 text-[0.65rem]"><div><dt className="font-bold uppercase tracking-wider text-slate-400">{document.file_url ? "Uploaded" : "Requested"}</dt><dd className="mt-0.5 font-semibold text-slate-700">{formatDate(document.uploaded_at)}</dd></div><div><dt className="font-bold uppercase tracking-wider text-slate-400">File size</dt><dd className="mt-0.5 font-semibold text-slate-700">{formatFileSize(document.file_size)}</dd></div></dl>{document.file_url ? <div className="mt-3 flex gap-2"><a href={urls[document.id]?.view || undefined} target="_blank" rel="noreferrer" aria-disabled={!urls[document.id]?.view} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 aria-disabled:pointer-events-none aria-disabled:opacity-40"><ViewIcon />View</a><a href={urls[document.id]?.download || undefined} aria-disabled={!urls[document.id]?.download} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 aria-disabled:pointer-events-none aria-disabled:opacity-40"><DownloadIcon />Download</a></div> : <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-center text-xs font-black text-amber-700">Document requested</p>}</li>)}</ul>}
    </div>
  </section>;
}

function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function Icon({ children }: { children: React.ReactNode }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">{children}</svg>; }
function DocumentIcon() { return <Icon><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></Icon>; }
function ViewIcon() { return <Icon><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/></Icon>; }
function DownloadIcon() { return <Icon><path d="M12 3v12M7 10l5 5 5-5M5 21h14"/></Icon>; }
