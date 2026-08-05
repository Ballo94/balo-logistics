"use client";

import { useEffect, useState } from "react";

import { DocumentAction, DocumentKind, generateShipmentDocument, ShipmentDocumentData } from "../lib/shipment-documents";

const DOCUMENTS: { kind: DocumentKind; title: string; description: string; icon: string }[] = [
  { kind: "waybill", title: "Waybill", description: "Complete routing, parties, package details and acceptance record.", icon: "WB" },
  { kind: "label", title: "Shipping Label", description: "Print-ready package label with a scannable tracking QR code.", icon: "QR" },
  { kind: "invoice", title: "Invoice", description: "Branded invoice with shipment, billing, charges and payment details.", icon: "IN" },
];

export default function ShipmentDocumentCenter({ shipment, onClose }: { shipment: ShipmentDocumentData; onClose: () => void }) {
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function run(kind: DocumentKind, action: DocumentAction) {
    const key = `${kind}-${action}`;
    setWorking(key);
    setMessage("");
    setError("");
    try {
      const result = await generateShipmentDocument(kind, action, shipment);
      setMessage(`${DOCUMENTS.find((item) => item.kind === kind)?.title} ${result}.`);
    } catch (documentError) {
      if (documentError instanceof DOMException && documentError.name === "AbortError") return;
      setError(documentError instanceof Error ? documentError.message : "Unable to generate the document.");
    } finally {
      setWorking("");
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="document-center-title" className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[1.5rem] bg-[#f5f7fa] shadow-2xl"><header className="sticky top-0 z-10 flex items-start justify-between border-b border-white/10 bg-[#071a33] px-6 py-5 text-white sm:px-8"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-300">Balo document center</p><h2 id="document-center-title" className="mt-1 text-2xl font-black">{shipment.tracking_number}</h2><p className="mt-1 text-sm text-blue-100">Generate fresh shipment documents at any time.</p></div><button type="button" onClick={onClose} aria-label="Close document center" className="rounded-xl bg-white/10 px-3 py-2 text-xl hover:bg-white/15">×</button></header><div className="grid gap-5 p-5 sm:p-8 lg:grid-cols-3">{DOCUMENTS.map((document) => <article key={document.kind} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-50 text-sm font-black text-blue-700">{document.icon}</div><h3 className="mt-5 text-lg font-black">{document.title}</h3><p className="mt-2 min-h-16 text-sm leading-6 text-slate-500">{document.description}</p><div className="mt-5 space-y-2"><DocumentButton disabled={Boolean(working)} loading={working === `${document.kind}-print`} onClick={() => void run(document.kind, "print")}>Print</DocumentButton><DocumentButton disabled={Boolean(working)} loading={working === `${document.kind}-download`} onClick={() => void run(document.kind, "download")} primary>Download PDF</DocumentButton><DocumentButton disabled={Boolean(working)} loading={working === `${document.kind}-email`} onClick={() => void run(document.kind, "email")}>Email PDF</DocumentButton></div></article>)}</div>{message && <p role="status" className="mx-5 mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700 sm:mx-8 sm:mb-8">{message}</p>}{error && <p role="alert" className="mx-5 mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 sm:mx-8 sm:mb-8">{error}</p>}</section></div>;
}

function DocumentButton({ children, onClick, disabled, loading, primary = false }: { children: React.ReactNode; onClick: () => void; disabled: boolean; loading: boolean; primary?: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`w-full rounded-xl px-4 py-2.5 text-sm font-extrabold transition disabled:opacity-50 ${primary ? "bg-blue-600 text-white hover:bg-blue-700" : "border border-slate-200 text-slate-700 hover:border-blue-300 hover:text-blue-700"}`}>{loading ? "Generating..." : children}</button>;
}
