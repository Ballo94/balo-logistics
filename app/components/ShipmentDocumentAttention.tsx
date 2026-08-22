"use client";

import { useEffect, useMemo, useState } from "react";
import { generateDocumentRequestMessage } from "../lib/document-customer-messages";
import { effectiveDocumentLifecycleStatus, type ShipmentDocument } from "../lib/shipment-document-records";

type Props = {
  documents: ShipmentDocument[];
  trackingNumber: string;
  onUpload: (requestId: number) => void;
};

export function unresolvedCustomerDocumentRequests(documents: ShipmentDocument[]) {
  return documents.filter((document) => document.visible_to_customer && ["requested", "replacement_required"].includes(effectiveDocumentLifecycleStatus(document) ?? ""));
}

export default function ShipmentDocumentAttention({ documents, trackingNumber, onUpload }: Props) {
  const outstanding = useMemo(() => unresolvedCustomerDocumentRequests(documents), [documents]);
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<number>>(new Set());
  const [acknowledgementsLoaded, setAcknowledgementsLoaded] = useState(false);
  const storageKey = `balo-document-request-acknowledged:${trackingNumber}`;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "[]") as unknown;
        setAcknowledgedIds(new Set(Array.isArray(stored) ? stored.filter((value): value is number => typeof value === "number") : []));
      } catch {
        setAcknowledgedIds(new Set());
      }
      setAcknowledgementsLoaded(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  if (!outstanding.length) return null;

  const firstUnacknowledged = acknowledgementsLoaded ? outstanding.find((document) => !acknowledgedIds.has(document.id)) : undefined;
  const primaryRequest = firstUnacknowledged ?? outstanding[0];
  const firstName = primaryRequest.document_name.replace(/\s+Required$/i, "");
  const replacementRequired = effectiveDocumentLifecycleStatus(primaryRequest) === "replacement_required";

  function scrollToRequest(requestId?: number) {
    const requestedName = outstanding.find((request) => request.id === requestId)?.document_name;
    const requestCard = requestedName ? [...document.querySelectorAll<HTMLElement>("#shipment-documents li")].find((item) => item.querySelector("h3")?.textContent === requestedName) : null;
    const target = requestCard ?? document.getElementById("shipment-documents");
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function acknowledge() {
    const next = new Set(acknowledgedIds);
    outstanding.forEach((document) => next.add(document.id));
    setAcknowledgedIds(next);
    window.sessionStorage.setItem(storageKey, JSON.stringify([...next]));
  }

  return <>
    {firstUnacknowledged && <section className="rounded-[1.2rem] border border-amber-200 bg-gradient-to-r from-amber-50 to-white px-4 py-3.5 shadow-[0_14px_36px_-28px_rgba(146,64,14,.55)] sm:px-5" aria-labelledby="document-attention-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-sm font-black text-amber-700" aria-hidden="true">!</span><div><p className="text-[0.58rem] font-black uppercase tracking-[0.16em] text-amber-700">Action Required</p><h2 id="document-attention-title" className="text-base font-black text-slate-950">{replacementRequired ? "Updated document required" : "Document required for your shipment"}</h2></div></div>
          <p className="mt-2 text-sm font-black text-slate-900">{firstName}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{replacementRequired ? primaryRequest.replacement_reason?.trim() || "An updated or replacement copy of this document is required to continue processing your shipment. Please upload the requested replacement when convenient." : generateDocumentRequestMessage(primaryRequest.document_name, primaryRequest.required_for)}</p>
          {outstanding.length > 1 && <p className="mt-1 text-[0.68rem] font-bold text-amber-800">{outstanding.length - 1} additional {outstanding.length === 2 ? "document is" : "documents are"} also required.</p>}
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={() => { scrollToRequest(firstUnacknowledged.id); onUpload(firstUnacknowledged.id); }} className="rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-black text-white hover:bg-blue-700">{replacementRequired ? "Upload Replacement" : "Upload Document"}</button>
          <button type="button" onClick={() => scrollToRequest(firstUnacknowledged.id)} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-black text-slate-700 hover:border-blue-300 hover:bg-blue-50">View Request</button>
          <button type="button" onClick={acknowledge} className="rounded-lg px-3 py-2 text-xs font-black text-slate-500 hover:bg-white hover:text-slate-700">Dismiss</button>
        </div>
      </div>
    </section>}
    <button type="button" onClick={() => scrollToRequest()} className="inline-flex w-fit items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-800 shadow-sm hover:border-amber-300 hover:bg-amber-100">
      <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
      {outstanding.length} {outstanding.length === 1 ? "document" : "documents"} required
    </button>
  </>;
}
