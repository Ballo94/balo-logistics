"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createDocumentUrl, formatFileSize, loadAdminShipmentDocuments, SHIPMENT_DOCUMENT_BUCKET,
  SHIPMENT_DOCUMENT_TYPES, storagePathFromUrl,
  type ShipmentDocument, type ShipmentDocumentDirection, type ShipmentDocumentType,
} from "../lib/shipment-document-records";
import { supabase } from "../lib/supabase";

const DOCUMENT_DIRECTIONS = ["Sent to Customer", "Received from Customer", "Document Request"] as const satisfies readonly ShipmentDocumentDirection[];
const CARGO_CONTEXTS = ["General Cargo", "Copper / Copper Cathodes", "Gold", "Diamonds / Precious Stones", "Other / Custom Commodity"] as const;
const REQUEST_TRANSPORT_MODES = ["Air", "Sea", "Road"] as const;
type CargoContext = (typeof CARGO_CONTEXTS)[number];
type RequestTransportMode = (typeof REQUEST_TRANSPORT_MODES)[number];
type CatalogueEntry = { name: string; storedType: ShipmentDocumentType; cargo: readonly CargoContext[] | "all"; modes: readonly RequestTransportMode[] | "all"; keywords: readonly string[]; rank: number; cargoBoost?: Partial<Record<CargoContext, number>> };
const DOCUMENT_CATALOGUE: readonly CatalogueEntry[] = [
  { name: "Commercial Invoice", storedType: "Commercial Invoice", cargo: "all", modes: "all", keywords: ["commercial", "invoice", "customs", "import", "export"], rank: 100 },
  { name: "Packing List", storedType: "Packing List", cargo: "all", modes: "all", keywords: ["packing", "cargo", "customs"], rank: 98 },
  { name: "Certificate of Origin", storedType: "Other", cargo: "all", modes: "all", keywords: ["origin", "certificate", "customs", "export"], rank: 82, cargoBoost: { "Copper / Copper Cathodes": 14, Gold: 14, "Diamonds / Precious Stones": 14, "Other / Custom Commodity": 14 } },
  { name: "Export Customs Declaration", storedType: "Customs Declaration", cargo: "all", modes: "all", keywords: ["export", "customs", "declaration"], rank: 86, cargoBoost: { "Copper / Copper Cathodes": 10, Gold: 10, "Diamonds / Precious Stones": 10, "Other / Custom Commodity": 10 } },
  { name: "Import Customs Declaration", storedType: "Customs Declaration", cargo: "all", modes: "all", keywords: ["import", "customs", "declaration"], rank: 70 },
  { name: "Export Permit / Licence", storedType: "Export Permit", cargo: "all", modes: "all", keywords: ["export", "permit", "licence", "license"], rank: 69 },
  { name: "Import Permit / Licence", storedType: "Import Permit", cargo: "all", modes: "all", keywords: ["import", "permit", "licence", "license"], rank: 65 },
  { name: "Insurance Certificate", storedType: "Insurance Certificate", cargo: "all", modes: "all", keywords: ["insurance", "cover", "certificate"], rank: 66 },
  { name: "Inspection Certificate", storedType: "Other", cargo: "all", modes: "all", keywords: ["inspection", "quality", "certificate"], rank: 58 },
  { name: "Weight Certificate", storedType: "Other", cargo: "all", modes: "all", keywords: ["weight", "mass", "certificate"], rank: 62, cargoBoost: { "Copper / Copper Cathodes": 10, Gold: 10, "Other / Custom Commodity": 10 } },
  { name: "Proof of Delivery", storedType: "Proof of Delivery", cargo: "all", modes: "all", keywords: ["delivery", "proof", "pod"], rank: 48 },
  { name: "Air Waybill", storedType: "Air Waybill", cargo: "all", modes: ["Air"], keywords: ["air", "airwaybill", "air waybill", "awb"], rank: 99 },
  { name: "Air Cargo Security Declaration", storedType: "Other", cargo: "all", modes: ["Air"], keywords: ["air", "cargo", "security", "declaration"], rank: 55 },
  { name: "Bill of Lading", storedType: "Bill of Lading", cargo: "all", modes: ["Sea"], keywords: ["sea", "ocean", "shipping", "bill of lading", "bol"], rank: 99 },
  { name: "Shipping Instructions", storedType: "Other", cargo: "all", modes: ["Sea"], keywords: ["sea", "shipping", "instructions"], rank: 64 },
  { name: "Verified Gross Mass (VGM)", storedType: "Other", cargo: "all", modes: ["Sea"], keywords: ["sea", "vgm", "verified", "gross", "mass", "weight"], rank: 60 },
  { name: "Road Consignment Note / CMR", storedType: "Other", cargo: "all", modes: ["Road"], keywords: ["road", "cmr", "consignment", "transport"], rank: 99 },
  { name: "Customs Transit Document", storedType: "Other", cargo: "all", modes: ["Road"], keywords: ["road", "transit", "customs"], rank: 77 },
  { name: "Border / Transit Supporting Document", storedType: "Other", cargo: "all", modes: ["Road"], keywords: ["road", "transit", "border", "customs"], rank: 57 },
  { name: "Inspection / Assay / Quality Certificate", storedType: "Other", cargo: ["Copper / Copper Cathodes", "Gold", "Diamonds / Precious Stones", "Other / Custom Commodity"], modes: "all", keywords: ["inspection", "assay", "quality", "copper", "gold", "diamond", "mineral"], rank: 97 },
  { name: "Mineral Export Permit / Licence", storedType: "Export Permit", cargo: ["Copper / Copper Cathodes", "Gold", "Diamonds / Precious Stones", "Other / Custom Commodity"], modes: "all", keywords: ["mineral", "copper", "gold", "diamond", "export", "permit", "licence"], rank: 96 },
  { name: "Kimberley Process Certificate (rough diamonds, where applicable)", storedType: "Other", cargo: ["Diamonds / Precious Stones"], modes: "all", keywords: ["rough diamond", "kimberley", "precious", "certificate"], rank: 61 },
  { name: "Dangerous Goods Declaration (where applicable)", storedType: "Other", cargo: "all", modes: "all", keywords: ["dangerous", "hazardous", "dg", "declaration"], rank: 42 },
];

function inferCargoContext(description: string): CargoContext { const value = description.toLowerCase(); if (value.includes("copper")) return "Copper / Copper Cathodes"; if (value.includes("gold")) return "Gold"; if (value.includes("diamond") || value.includes("precious")) return "Diamonds / Precious Stones"; if (value.includes("mineral") || value.includes("ore")) return "Other / Custom Commodity"; return "General Cargo"; }
function inferTransportMode(mode: string): RequestTransportMode { if (mode.toLowerCase().includes("air")) return "Air"; if (mode.toLowerCase().includes("road")) return "Road"; return "Sea"; }

export default function ShipmentDocumentsManager({ shipmentId, transportMode = "", cargoDescription = "" }: { shipmentId: number; transportMode?: string; cargoDescription?: string }) {
  const formRef = useRef<HTMLDivElement>(null);
  const [documents, setDocuments] = useState<ShipmentDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<ShipmentDocumentType>("Commercial Invoice");
  const [direction, setDirection] = useState<ShipmentDocumentDirection>("Sent to Customer");
  const [requestMode, setRequestMode] = useState(false);
  const [requestSearch, setRequestSearch] = useState("");
  const [requestCargo, setRequestCargo] = useState<CargoContext>(() => inferCargoContext(cargoDescription));
  const [customCommodity, setCustomCommodity] = useState("");
  const [requestTransportMode, setRequestTransportMode] = useState<RequestTransportMode>(() => inferTransportMode(transportMode));
  const [customDocumentMode, setCustomDocumentMode] = useState(false);
  const [customDocumentName, setCustomDocumentName] = useState("");
  const [notes, setNotes] = useState("");
  const [visible, setVisible] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [ascending, setAscending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const isRequest = direction === "Document Request";
  const requestSuggestions = useMemo(() => {
    const query = requestSearch.trim().toLowerCase();
    return DOCUMENT_CATALOGUE.map((entry) => {
      const cargoMatch = entry.cargo === "all" || entry.cargo.includes(requestCargo);
      const modeMatch = entry.modes === "all" || entry.modes.includes(requestTransportMode);
      const textMatch = !query || entry.name.toLowerCase().includes(query) || entry.keywords.some((keyword) => keyword.includes(query) || query.includes(keyword));
      const score = entry.rank + (entry.cargoBoost?.[requestCargo] ?? 0) + (textMatch && query ? 50 : 0);
      return { ...entry, score, cargoMatch, modeMatch, textMatch };
    }).filter((entry) => entry.cargoMatch && entry.modeMatch && (!query || entry.textMatch)).sort((a, b) => b.score - a.score).slice(0, 14);
  }, [requestCargo, requestSearch, requestTransportMode]);
  const groupedRequestSuggestions = [{ label: "Most relevant", entries: requestSuggestions.slice(0, 7) }, { label: "Other useful suggestions", entries: requestSuggestions.slice(7) }].filter((group) => group.entries.length);

  const refresh = useCallback(async () => { const { data, error: loadError } = await loadAdminShipmentDocuments(shipmentId, ascending); if (loadError) setError(loadError.message); else setDocuments((data ?? []) as ShipmentDocument[]); }, [ascending, shipmentId]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return documents.filter((item) => !query || item.document_name.toLowerCase().includes(query) || item.document_type.toLowerCase().includes(query) || item.document_direction.toLowerCase().includes(query)); }, [documents, search]);

  function chooseFile(selected: File | null) { setFile(selected); if (selected && !name.trim()) setName(selected.name); setError(""); setMessage(""); }
  function startEdit(document: ShipmentDocument) { const inferredCargo = inferCargoContext(cargoDescription); setEditingId(document.id); setName(document.document_name); setType(document.document_type); setDirection(document.document_direction); setRequestMode(document.document_direction === "Document Request"); setRequestSearch(""); setRequestCargo(inferredCargo); setCustomCommodity(inferredCargo === "Other / Custom Commodity" ? cargoDescription.trim() : ""); setRequestTransportMode(inferTransportMode(transportMode)); setCustomDocumentMode(false); setCustomDocumentName(""); setNotes(document.notes ?? ""); setVisible(document.visible_to_customer); setFile(null); setError(""); setMessage(""); formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  function reset() { setEditingId(null); setFile(null); setName(""); setType("Commercial Invoice"); setDirection("Sent to Customer"); setRequestMode(false); setRequestSearch(""); setCustomCommodity(""); setCustomDocumentMode(false); setCustomDocumentName(""); setNotes(""); setVisible(true); setError(""); }
  function beginRequest() { const inferredCargo = inferCargoContext(cargoDescription); reset(); setDirection("Document Request"); setRequestMode(true); setRequestCargo(inferredCargo); setCustomCommodity(inferredCargo === "Other / Custom Commodity" ? cargoDescription.trim() : ""); setRequestTransportMode(inferTransportMode(transportMode)); setVisible(true); setMessage("Choose the document you would like the customer to provide."); formRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
  function selectRequestedDocument(document: CatalogueEntry) { setCustomDocumentMode(false); setCustomDocumentName(""); setType(document.storedType); setName(`${document.name} Required`); setNotes(`Please provide the ${document.name} for this shipment when convenient. Thank you.`); setError(""); }
  function changeCustomDocumentName(value: string) { const previous = customDocumentName.trim(); const next = value.trim(); const previousRequestName = previous ? `${previous} Required` : ""; const previousMessage = previous ? `Please provide the ${previous} for this shipment when convenient. Thank you.` : ""; setCustomDocumentName(value); setType("Other"); if (!name || name === previousRequestName) setName(next ? `${next} Required` : ""); if (!notes || notes === previousMessage) setNotes(next ? `Please provide the ${next} for this shipment when convenient. Thank you.` : ""); setError(""); }

  async function uploadFile(selected: File) {
    const extension = selected.name.includes(".") ? `.${selected.name.split(".").pop()}` : "";
    const path = `${shipmentId}/${crypto.randomUUID()}${extension.toLowerCase()}`;
    const result = await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).upload(path, selected, { contentType: selected.type || undefined, upsert: false });
    return { path, error: result.error };
  }

  async function save() {
    const existing = editingId ? documents.find((item) => item.id === editingId) : undefined;
    if (!name.trim()) { setError(isRequest ? "Request name is required." : "Document name is required."); return; }
    if (!isRequest && !file && !existing?.file_url) { setError("Choose a file to upload."); return; }
    if (file && file.size > 25 * 1024 * 1024) { setError("Documents must be 25 MB or smaller."); return; }
    setBusy(true); setError(""); setMessage("");
    const base = { document_name: name.trim(), document_type: type, document_direction: direction, notes: notes.trim() || null, visible_to_customer: visible };
    if (editingId) {
      let replacement: { path: string; error: Error | null } | null = null;
      if (file) replacement = await uploadFile(file);
      if (replacement?.error) { setError(replacement.error.message); setBusy(false); return; }
      const payload = replacement ? { ...base, file_url: replacement.path, file_size: file!.size, uploaded_at: new Date().toISOString() } : base;
      const { error: updateError } = await supabase.from("shipment_documents").update(payload).eq("id", editingId);
      if (updateError) { if (replacement) await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).remove([replacement.path]); setError(updateError.message); }
      else { const oldPath = existing?.file_url ? storagePathFromUrl(existing.file_url) ?? existing.file_url : null; if (replacement && oldPath) await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).remove([oldPath]); setMessage(replacement ? "Document replaced successfully." : "Document details updated."); reset(); await refresh(); }
      setBusy(false); return;
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) { setError("Your admin session could not be verified."); setBusy(false); return; }
    if (isRequest) {
      const { error: insertError } = await supabase.from("shipment_documents").insert({ shipment_id: shipmentId, ...base, file_url: null, file_size: null, created_by: userData.user.id });
      if (insertError) setError(insertError.message); else { setMessage("Document request created."); reset(); await refresh(); }
      setBusy(false); return;
    }
    const uploaded = await uploadFile(file!);
    if (uploaded.error) { setError(uploaded.error.message); setBusy(false); return; }
    const { error: insertError } = await supabase.from("shipment_documents").insert({ shipment_id: shipmentId, ...base, file_url: uploaded.path, file_size: file!.size, created_by: userData.user.id });
    if (insertError) { await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).remove([uploaded.path]); setError(insertError.message); } else { setMessage("Document uploaded successfully."); reset(); await refresh(); }
    setBusy(false);
  }

  async function openDocument(document: ShipmentDocument, download = false) { if (!document.file_url) return; setError(""); const { data, error: urlError } = await createDocumentUrl(document.file_url, download ? document.document_name : undefined); if (urlError) setError(urlError.message); else window.open(data.signedUrl, "_blank", "noopener,noreferrer"); }
  async function remove(document: ShipmentDocument) { if (!window.confirm(`Delete “${document.document_name}”?`)) return; setBusy(true); setError(""); if (document.file_url) { const path = storagePathFromUrl(document.file_url) ?? document.file_url; const { error: storageError } = await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).remove([path]); if (storageError) { setError(storageError.message); setBusy(false); return; } } const { error: deleteError } = await supabase.from("shipment_documents").delete().eq("id", document.id); if (deleteError) setError(deleteError.message); else { setMessage("Document deleted."); await refresh(); } setBusy(false); }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_36px_-28px_rgba(15,23,42,.35)]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3"><div><p className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-blue-600">Shipment files</p><h3 className="font-black text-[#071a33]">Shipment Documents Manager</h3><p className="mt-0.5 text-xs text-slate-500">Private storage with customer visibility controls.</p></div><div className="flex items-center gap-2"><button type="button" onClick={beginRequest} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-50">Request Document from Customer</button><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700">{documents.length}</span></div></div>
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)]">
      <div ref={formRef} className="grid content-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        {!isRequest && <label><span className={labelClass}>{editingId ? "Replacement File (optional)" : "Document / Image File *"}</span><input type="file" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} className="block w-full rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-3 text-xs font-semibold file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-bold file:text-white" /></label>}
        {!requestMode && <label><span className={labelClass}>Document Name *</span><input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>}
        {requestMode ? <div><span className={labelClass}>Find Document</span><div className="grid items-start gap-2 sm:grid-cols-2"><label><span className="mb-1 block text-[0.62rem] font-bold text-slate-500">Cargo / Commodity</span><select value={requestCargo} onChange={(event) => { const next = event.target.value as CargoContext; setRequestCargo(next); if (next !== "Other / Custom Commodity") setCustomCommodity(""); }} className={inputClass}>{CARGO_CONTEXTS.map((option) => <option key={option}>{option}</option>)}</select>{requestCargo === "Other / Custom Commodity" && <><span className="mb-1 mt-2 block text-[0.62rem] font-bold text-slate-500">Commodity name</span><input value={customCommodity} onChange={(event) => setCustomCommodity(event.target.value)} className={inputClass} placeholder="Gypsum, Lithium Ore, Manganese, Zinc Concentrate…"/></>}</label><label><span className="mb-1 block text-[0.62rem] font-bold text-slate-500">Transport Mode</span><select value={requestTransportMode} onChange={(event) => setRequestTransportMode(event.target.value as RequestTransportMode)} className={inputClass}>{REQUEST_TRANSPORT_MODES.map((option) => <option key={option}>{option}</option>)}</select></label></div><input type="search" value={requestSearch} onChange={(event) => setRequestSearch(event.target.value)} className={`${inputClass} mt-2`} placeholder="Search documents (optional)…" aria-label="Search documents"/><p className="mt-1 text-[0.66rem] text-slate-500">Suggestions{requestCargo === "Other / Custom Commodity" && customCommodity.trim() ? ` for ${customCommodity.trim()}` : ""} vary by commodity, route, Incoterms and authorities. Confirm what applies to this shipment.</p><div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5">{groupedRequestSuggestions.length ? groupedRequestSuggestions.map((group) => <div key={group.label} className="mb-1 last:mb-0"><p className="px-2.5 pb-1 pt-1.5 text-[0.58rem] font-black uppercase tracking-wider text-slate-400">{group.label}</p>{group.entries.map((document) => <button key={document.name} type="button" onClick={() => selectRequestedDocument(document)} className={`block w-full rounded-lg px-2.5 py-2 text-left text-xs font-bold ${!customDocumentMode && name === `${document.name} Required` ? "bg-blue-50 text-blue-700" : "text-slate-700 hover:bg-slate-50"}`}>{document.name}</button>)}</div>) : <p className="px-2.5 py-3 text-xs text-slate-500">No matching document suggestions.</p>}</div><button type="button" onClick={() => { setCustomDocumentMode(true); setCustomDocumentName(""); setType("Other"); setName(""); setNotes(""); }} className="mt-2 text-xs font-black text-blue-700 hover:text-blue-800">+ Add Custom Document</button>{customDocumentMode && <label className="mt-2 block"><span className="mb-1 block text-[0.62rem] font-bold text-slate-500">Document name</span><input value={customDocumentName} onChange={(event) => changeCustomDocumentName(event.target.value)} className={inputClass} placeholder="Enter document name"/></label>}</div> : <label><span className={labelClass}>Document Type *</span><select value={type} onChange={(event) => setType(event.target.value as ShipmentDocumentType)} className={inputClass}>{SHIPMENT_DOCUMENT_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label>}
        {requestMode && <label><span className={labelClass}>Request Name *</span><input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label>}
        {requestMode ? <div><span className={labelClass}>Document Direction</span><div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm font-black text-blue-700">Document Request</div></div> : <label><span className={labelClass}>Document Direction</span><select value={direction} onChange={(event) => { const next = event.target.value as ShipmentDocumentDirection; setDirection(next); if (next === "Document Request") { setRequestMode(true); setVisible(true); } }} className={inputClass}>{direction === "Internal / Admin" && <option>Internal / Admin</option>}{DOCUMENT_DIRECTIONS.map((option) => <option key={option} disabled={Boolean(editingId && documents.find((item) => item.id === editingId)?.file_url && option === "Document Request")}>{option}</option>)}</select></label>}
        <label><span className={labelClass}>{requestMode ? "Customer Message / Internal Note" : "Internal Notes"}</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} placeholder={requestMode ? "Add a polite request message" : "Visible to administrators only"} /></label>
        <label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="text-xs font-black text-slate-700">Visible to Customer</span><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} className="h-4 w-4 accent-blue-600" /></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{message}</p>}
        <div className="flex gap-2">{editingId && <button type="button" onClick={reset} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button>}<button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? "Saving…" : editingId ? file ? "Replace Document" : "Save Changes" : isRequest ? "Create Document Request" : "Upload Document"}</button></div>
      </div>
      <div className="min-w-0"><div className="mb-2 flex flex-col gap-2 sm:flex-row"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, type, or direction" className={`${inputClass} h-10 flex-1`} /><button type="button" onClick={() => setAscending((value) => !value)} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700">Upload date {ascending ? "↑" : "↓"}</button></div><div className="overflow-hidden rounded-xl border border-slate-200">{!filtered.length ? <p className="px-4 py-8 text-center text-xs font-semibold text-slate-500">No matching shipment documents.</p> : <ul className="divide-y divide-slate-100">{filtered.map((document) => <li key={document.id} className="px-3 py-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><DocumentIcon /></span><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{document.document_name}</p><p className="text-[0.66rem] font-semibold text-blue-700">{document.document_type}</p><p className="text-[0.64rem] font-semibold text-slate-600">{document.document_direction}</p><p className="text-[0.64rem] text-slate-500">{formatDate(document.uploaded_at)} · {formatFileSize(document.file_size)} · <span className={document.visible_to_customer ? "text-emerald-700" : "text-amber-700"}>{document.visible_to_customer ? "Customer visible" : "Internal only"}</span></p>{document.notes && <p className="mt-1 text-[0.66rem] italic text-slate-500">{document.notes}</p>}</div></div><div className="flex shrink-0 flex-wrap gap-1.5">{document.file_url && <><button type="button" onClick={() => void openDocument(document)} className={actionClass}>Preview</button><button type="button" onClick={() => void openDocument(document, true)} className={actionClass}>Download</button></>}<button type="button" onClick={() => startEdit(document)} className={`${actionClass} text-blue-700`}>Edit</button><button type="button" disabled={busy} onClick={() => void remove(document)} className={`${actionClass} text-red-700`}>Delete</button></div></div></li>)}</ul>}</div></div>
    </div>
  </section>;
}

const labelClass = "mb-1.5 block text-[0.62rem] font-black uppercase tracking-[0.12em] text-slate-500";
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
const actionClass = "inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-2 text-[0.66rem] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40";
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function DocumentIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>; }
