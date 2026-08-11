"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { COMMUNICATION_TYPES, loadAdminCommunications, type CommunicationType, type ShipmentCommunication } from "../lib/shipment-communications";
import { supabase } from "../lib/supabase";

const FILTERS = ["All", "Visible", "Hidden", "Delivered", "Delay", "Customs"] as const;
type Filter = (typeof FILTERS)[number];

export default function ShipmentCommunicationsManager({ shipmentId }: { shipmentId: number }) {
  const [items, setItems] = useState<ShipmentCommunication[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<CommunicationType>("Information");
  const [visible, setVisible] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => { const { data, error: loadError } = await loadAdminCommunications(shipmentId); if (loadError) setError(loadError.message); else setItems((data ?? []) as ShipmentCommunication[]); }, [shipmentId]);
  useEffect(() => { const timer = window.setTimeout(() => void refresh(), 0); return () => window.clearTimeout(timer); }, [refresh]);

  const filtered = useMemo(() => { const query = search.trim().toLowerCase(); return items.filter((item) => {
    const matchesSearch = !query || item.title.toLowerCase().includes(query) || item.message.toLowerCase().includes(query) || item.type.toLowerCase().includes(query);
    const matchesFilter = filter === "All" || (filter === "Visible" ? item.visible_to_customer : filter === "Hidden" ? !item.visible_to_customer : filter === "Delivered" ? item.type === "Delivery" || item.type === "Success" : item.type === filter);
    return matchesSearch && matchesFilter;
  }); }, [filter, items, search]);

  function reset() { setEditingId(null); setTitle(""); setMessage(""); setType("Information"); setVisible(true); setError(""); }
  function edit(item: ShipmentCommunication) { setEditingId(item.id); setTitle(item.title); setMessage(item.message); setType(item.type); setVisible(item.visible_to_customer); setError(""); setStatus(""); }

  async function save() {
    if (!title.trim() || !message.trim()) { setError("Title and message are required."); return; }
    setBusy(true); setError(""); setStatus("");
    const payload = { title: title.trim(), message: message.trim(), type, visible_to_customer: visible, viewed_at: null };
    if (editingId) {
      const { error: updateError } = await supabase.from("shipment_communications").update(payload).eq("id", editingId);
      if (updateError) setError(updateError.message); else { setStatus("Communication updated."); reset(); await refresh(); }
    } else {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) setError("Your admin session could not be verified.");
      else { const { error: insertError } = await supabase.from("shipment_communications").insert({ shipment_id: shipmentId, ...payload, created_by: userData.user.id }); if (insertError) setError(insertError.message); else { setStatus("Communication created."); reset(); await refresh(); } }
    }
    setBusy(false);
  }

  async function toggle(item: ShipmentCommunication) { setBusy(true); const next = !item.visible_to_customer; const { error: updateError } = await supabase.from("shipment_communications").update({ visible_to_customer: next, ...(next ? { viewed_at: null } : {}) }).eq("id", item.id); if (updateError) setError(updateError.message); else { setStatus(next ? "Communication shown to customer." : "Communication hidden from customer."); await refresh(); } setBusy(false); }
  async function remove(item: ShipmentCommunication) { if (!window.confirm(`Delete “${item.title}”?`)) return; setBusy(true); const { error: deleteError } = await supabase.from("shipment_communications").delete().eq("id", item.id); if (deleteError) setError(deleteError.message); else { setStatus("Communication deleted."); await refresh(); } setBusy(false); }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_36px_-28px_rgba(15,23,42,.35)]"><div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3"><div><p className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-blue-600">Customer care</p><h3 className="font-black text-[#071a33]">Communication Center</h3><p className="mt-0.5 text-xs text-slate-500">Create shipment-specific customer updates and monitor read status.</p></div><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700">{items.length}</span></div><div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,.82fr)_minmax(0,1.18fr)]">
    <div className="grid content-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"><label><span className={labelClass}>Title *</span><input value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} /></label><label><span className={labelClass}>Type *</span><select value={type} onChange={(event) => setType(event.target.value as CommunicationType)} className={inputClass}>{COMMUNICATION_TYPES.map((option) => <option key={option}>{option}</option>)}</select></label><label><span className={labelClass}>Message *</span><textarea rows={4} value={message} onChange={(event) => setMessage(event.target.value)} className={inputClass} /></label><label className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2.5"><span className="text-xs font-black text-slate-700">Visible to Customer</span><input type="checkbox" checked={visible} onChange={(event) => setVisible(event.target.checked)} className="h-4 w-4 accent-blue-600" /></label>{error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}{status && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{status}</p>}<div className="flex gap-2">{editingId && <button type="button" onClick={reset} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Cancel</button>}<button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50">{busy ? "Saving…" : editingId ? "Update Message" : "Create Message"}</button></div></div>
    <div className="min-w-0"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search communications" className={`${inputClass} h-10`} /><div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">{FILTERS.map((option) => <button key={option} type="button" onClick={() => setFilter(option)} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[0.66rem] font-black ${filter === option ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"}`}>{option}</button>)}</div><div className="mt-2 overflow-hidden rounded-xl border border-slate-200">{!filtered.length ? <p className="px-4 py-8 text-center text-xs font-semibold text-slate-500">No matching communications.</p> : <ul className="divide-y divide-slate-100">{filtered.map((item) => <li key={item.id} className="px-3 py-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className={`rounded-full px-2 py-0.5 text-[0.58rem] font-black uppercase ${tone(item.type)}`}>{item.type}</span><span className={`text-[0.62rem] font-bold ${item.visible_to_customer ? "text-emerald-700" : "text-amber-700"}`}>{item.visible_to_customer ? "Visible" : "Hidden"}</span><span className={`text-[0.62rem] font-bold ${item.viewed_at ? "text-blue-700" : "text-slate-400"}`}>{item.viewed_at ? `Viewed ${formatDate(item.viewed_at)}` : "Not viewed"}</span></div><p className="mt-1 text-xs font-black text-slate-800">{item.title}</p><p className="mt-1 text-[0.68rem] leading-4 text-slate-600">{item.message}</p><time className="mt-1 block text-[0.62rem] text-slate-400">{formatDate(item.created_at)}</time></div><div className="flex shrink-0 flex-col gap-1"><button type="button" onClick={() => edit(item)} className={actionClass}>Edit</button><button type="button" disabled={busy} onClick={() => void toggle(item)} className={actionClass}>{item.visible_to_customer ? "Hide" : "Show"}</button><button type="button" disabled={busy} onClick={() => void remove(item)} className={`${actionClass} text-red-700`}>Delete</button></div></div></li>)}</ul>}</div></div>
  </div></section>;
}

const labelClass = "mb-1.5 block text-[0.62rem] font-black uppercase tracking-[0.12em] text-slate-500";
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
const actionClass = "rounded-lg bg-slate-100 px-2.5 py-1.5 text-[0.64rem] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40";
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date); }
function tone(type: CommunicationType) { if (type === "Delay") return "bg-orange-100 text-orange-800"; if (type === "Warning") return "bg-red-100 text-red-800"; if (type === "Customs") return "bg-purple-100 text-purple-800"; if (type === "Delivery" || type === "Success" || type === "Arrival") return "bg-emerald-100 text-emerald-800"; return "bg-blue-100 text-blue-800"; }
