"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createDocumentUrl, formatFileSize, loadAdminShipmentDocuments, SHIPMENT_DOCUMENT_BUCKET, SHIPMENT_DOCUMENT_TYPES, storagePathFromUrl, type ShipmentDocument, type ShipmentDocumentType } from "../lib/shipment-document-records";
import { supabase } from "../lib/supabase";

export default function ShipmentDocumentsManager({ shipmentId }: { shipmentId: number }) {
  const [documents, setDocuments] = useState<ShipmentDocument[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<ShipmentDocumentType>("Commercial Invoice");
  const [notes, setNotes] = useState("");
  const [visible, setVisible] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [ascending, setAscending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => { const { data, error: loadError } = await loadAdminShipmentDocuments(shipmentId, ascending); if (loadError) setError(loadError.message); else setDocuments((data ?? []) as ShipmentDocument[]); }, [ascending, shipmentId]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);
  const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return documents.filter((item) => !query || item.document_name.toLowerCase().includes(query) || item.document_type.toLowerCase().includes(query)); }, [documents, search]);

  function chooseFile(selected: File | null) { setFile(selected); if (selected && !name.trim()) setName(selected.name); setError(""); setMessage(""); }
  function startEdit(document: ShipmentDocument) { setEditingId(document.id); setName(document.document_name); setType(document.document_type); setNotes(document.notes ?? ""); setVisible(document.visible_to_customer); setFile(null); setError(""); setMessage(""); }
  function reset() { setEditingId(null); setFile(null); setName(""); setType("Commercial Invoice"); setNotes(""); setVisible(true); setError(""); }

  async function uploadFile(selected: File) {
    const extension = selected.name.includes(".") ? `.${selected.name.split(".").pop()}` : "";
    const path = `${shipmentId}/${crypto.randomUUID()}${extension.toLowerCase()}`;
    const result = await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).upload(path, selected, { contentType: selected.type || undefined, upsert: false });
    return { path, error: result.error };
  }

  async function save() {
    if (!name.trim()) { setError("Document name is required."); return; }
    if (!editingId && !file) { setError("Choose a file to upload."); return; }
    if (file && file.size > 25 * 1024 * 1024) { setError("Documents must be 25 MB or smaller."); return; }
    setBusy(true); setError(""); setMessage("");
    const base = { document_name: name.trim(), document_type: type, notes: notes.trim() || null, visible_to_customer: visible };
    if (editingId) {
      const existing = documents.find((item) => item.id === editingId);
      let replacement: { path: string; error: Error | null } | null = null;
      if (file) replacement = await uploadFile(file);
      if (replacement?.error) { setError(replacement.error.message); setBusy(false); return; }
      const payload = replacement ? { ...base, file_url: replacement.path, file_size: file!.size, uploaded_at: new Date().toISOString() } : base;
      const { error: updateError } = await supabase.from("shipment_documents").update(payload).eq("id", editingId);
      if (updateError) { if (replacement) await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).remove([replacement.path]); setError(updateError.message); }
      else { const oldPath = existing ? storagePathFromUrl(existing.file_url) ?? existing.file_url : null; if (replacement && oldPath) await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).remove([oldPath]); setMessage(replacement ? "Document replaced successfully." : "Document details updated."); reset(); await refresh(); }
      setBusy(false); return;
    }
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) { setError("Your admin session could not be verified."); setBusy(false); return; }
    const uploaded = await uploadFile(file!);
    if (uploaded.error) { setError(uploaded.error.message); setBusy(false); return; }
    const { error: insertError } = await supabase.from("shipment_documents").insert({ shipment_id: shipmentId, ...base, file_url: uploaded.path, file_size: file!.size, created_by: userData.user.id });
    if (insertError) { await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).remove([uploaded.path]); setError(insertError.message); } else { setMessage("Document uploaded successfully."); reset(); await refresh(); }
    setBusy(false);
  }

  async function openDocument(document: ShipmentDocument, download = false) { setError(""); const { data, error: urlError } = await createDocumentUrl(document.file_url, download ? document.document_name : undefined); if (urlError) setError(urlError.message); else window.open(data.signedUrl, "_blank", "noopener,noreferrer"); }
  async function remove(document: ShipmentDocument) { if (!window.confirm(`Delete “${document.document_name}”?`)) return; setBusy(true); setError(""); const path = storagePathFromUrl(document.file_url) ?? document.file_url; const { error: storageError } = await supabase.storage.from(SHIPMENT_DOCUMENT_BUCKET).remove([path]); if (storageError) { setError(storageError.message); setBusy(false); return; } const { error: deleteError } = await supabase.from("shipment_documents").delete().eq("id", document.id); if (deleteError) setError(deleteError.message); else { setMessage("Document deleted."); await refresh(); } setBusy(false); }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_36px_-28px_rgba(15,23,42,.35)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3"><div><p className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-blue-600">Shipment files</p><h3 className="font-black text-[#071a33]">Shipment Documents Manager</h3><p className="mt-0.5 text-xs text-slate-500">Private storage with customer visibility controls.</p></div><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700">{documents.length}</span></div><div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)]">
    <div className="grid content-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"><label><span className={labelClass}>{editingId ? "Replacement File (optional)" : "Document File *"}</span><input type="file" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} className="block w-full rounded-xl border border-dashed border-blue-300 bg-blue-50/50 p-3 text-xs font-semibold file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-3 file:py-2 file:font-bold file:text-white" /></label><label><span className={labelClass}>Document Name *</span><input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} /></label><label><span className={labelClass}>Document Type *</span><select value={type} onChange={(event) => setType(event.target.value as ShipmentDocumentType)} className={inputClass}>{SHIPMENT_DOCUMENT_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label><label><span className={labelClass}>Internal Notes</span><textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className={inputClass} placeholder="Visible to administrators only" /></label><label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="text-xs font-black text-slate-700">Visible to Customer</span><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} className="h-4 w-4 accent-blue-600" /></label>{error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{message}</p>}<div className="flex gap-2">{editingId && <button type="button" onClick={reset} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button>}<button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? "Saving…" : editingId ? file ? "Replace Document" : "Save Changes" : "Upload Document"}</button></div></div>
    <div className="min-w-0"><div className="mb-2 flex flex-col gap-2 sm:flex-row"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or type" className={`${inputClass} h-10 flex-1`} /><button type="button" onClick={() => setAscending((value) => !value)} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-black text-slate-700">Upload date {ascending ? "↑" : "↓"}</button></div><div className="overflow-hidden rounded-xl border border-slate-200">{!filtered.length ? <p className="px-4 py-8 text-center text-xs font-semibold text-slate-500">No matching shipment documents.</p> : <ul className="divide-y divide-slate-100">{filtered.map((document) => <li key={document.id} className="px-3 py-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"><DocumentIcon /></span><div className="min-w-0"><p className="truncate text-xs font-black text-slate-800">{document.document_name}</p><p className="text-[0.66rem] font-semibold text-blue-700">{document.document_type}</p><p className="text-[0.64rem] text-slate-500">{formatDate(document.uploaded_at)} · {formatFileSize(document.file_size)} · <span className={document.visible_to_customer ? "text-emerald-700" : "text-amber-700"}>{document.visible_to_customer ? "Customer visible" : "Internal only"}</span></p>{document.notes && <p className="mt-1 text-[0.66rem] italic text-slate-500">{document.notes}</p>}</div></div><div className="flex shrink-0 flex-wrap gap-1.5"><button type="button" onClick={() => void openDocument(document)} className={actionClass}>Preview</button><button type="button" onClick={() => void openDocument(document, true)} className={actionClass}>Download</button><button type="button" onClick={() => startEdit(document)} className={`${actionClass} text-blue-700`}>Edit</button><button type="button" disabled={busy} onClick={() => void remove(document)} className={`${actionClass} text-red-700`}>Delete</button></div></div></li>)}</ul>}</div></div>
  </div></section>;
}

const labelClass = "mb-1.5 block text-[0.62rem] font-black uppercase tracking-[0.12em] text-slate-500";
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
const actionClass = "inline-flex items-center rounded-lg bg-slate-100 px-2.5 py-2 text-[0.66rem] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40";
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
function DocumentIcon() { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M6 3h8l4 4v14H6Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>; }
