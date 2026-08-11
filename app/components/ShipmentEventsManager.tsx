"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createShipmentEvent, deleteShipmentEvent, loadShipmentEvents, SHIPMENT_EVENT_TYPES, updateShipmentEvent, type ShipmentEvent, type ShipmentEventType } from "../lib/shipment-events";
import { supabase } from "../lib/supabase";

type FormState = { title: string; description: string; country: string; city: string; event_type: ShipmentEventType; event_time: string };
const emptyForm = (): FormState => ({ title: "", description: "", country: "", city: "", event_type: "Shipment Created", event_time: toLocalDateTime(new Date().toISOString()) });

export default function ShipmentEventsManager({ shipmentId }: { shipmentId: number }) {
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [locations, setLocations] = useState<{ country: string; city: string }[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    const { data, error: loadError } = await loadShipmentEvents(shipmentId);
    if (loadError) setError(loadError.message);
    else setEvents((data ?? []) as ShipmentEvent[]);
  }, [shipmentId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
      void supabase.from("logistics_locations").select("country, city").order("country").order("city").range(0, 4999).then(({ data }) => {
        const unique = new Map<string, { country: string; city: string }>();
        for (const item of data ?? []) if (item.country && item.city) unique.set(`${item.country}\u0000${item.city}`, { country: item.country, city: item.city });
        setLocations([...unique.values()]);
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const countries = useMemo(() => [...new Set(locations.map((item) => item.country))], [locations]);
  const cities = useMemo(() => [...new Set(locations.filter((item) => item.country === form.country).map((item) => item.city))], [form.country, locations]);

  function change(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value, ...(field === "country" ? { city: "" } : {}) }));
    setError(""); setMessage("");
  }

  function startEdit(event: ShipmentEvent) {
    setEditingId(event.id);
    setForm({ title: event.title, description: event.description ?? "", country: event.country, city: event.city, event_type: event.event_type, event_time: toLocalDateTime(event.event_time) });
    setError(""); setMessage("");
  }

  function reset() { setEditingId(null); setForm(emptyForm()); setError(""); }

  async function save() {
    if (!form.title.trim() || !form.country || !form.city || !form.event_time) { setError("Title, country, city, event type, and event time are required."); return; }
    setBusy(true); setError(""); setMessage("");
    const payload = { title: form.title.trim(), description: form.description.trim() || null, country: form.country, city: form.city, event_type: form.event_type, event_time: new Date(form.event_time).toISOString() };
    const result = editingId ? await updateShipmentEvent(editingId, payload) : await createShipmentEvent({ ...payload, shipment_id: shipmentId });
    if (result.error) setError(result.error.message);
    else { setMessage(editingId ? "Shipment event updated." : "Shipment event added."); reset(); await refresh(); }
    setBusy(false);
  }

  async function remove(event: ShipmentEvent) {
    if (!window.confirm(`Delete “${event.title}”?`)) return;
    setBusy(true); const { error: deleteError } = await deleteShipmentEvent(event.id);
    if (deleteError) setError(deleteError.message); else { setMessage("Shipment event deleted."); await refresh(); }
    setBusy(false);
  }

  async function move(index: number, direction: -1 | 1) {
    const otherIndex = index + direction;
    if (!events[otherIndex]) return;
    setBusy(true); setError("");
    const current = events[index], other = events[otherIndex];
    const [first, second] = await Promise.all([
      supabase.from("shipment_events").update({ event_time: other.event_time }).eq("id", current.id),
      supabase.from("shipment_events").update({ event_time: current.event_time }).eq("id", other.id),
    ]);
    const reorderError = first.error ?? second.error;
    if (reorderError) setError(reorderError.message); else { setMessage("Event order updated."); await refresh(); }
    setBusy(false);
  }

  return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_14px_36px_-28px_rgba(15,23,42,.35)]">
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/80 px-4 py-3"><div><p className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-blue-600">Customer tracking</p><h3 className="font-black text-[#071a33]">Shipment Events Manager</h3><p className="mt-0.5 text-xs text-slate-500">Events are displayed newest first on public tracking.</p></div><span className="rounded-full bg-blue-100 px-2.5 py-1 text-xs font-black text-blue-700">{events.length}</span></div>
    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1.1fr)]">
      <div className="grid content-start gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="grid gap-3 sm:grid-cols-2"><EventInput label="Title" value={form.title} onChange={(value) => change("title", value)} required /><EventSelect label="Event Type" value={form.event_type} options={SHIPMENT_EVENT_TYPES} onChange={(value) => change("event_type", value)} /></div>
        <div className="grid gap-3 sm:grid-cols-2"><EventSelect label="Country" value={form.country} options={countries} onChange={(value) => change("country", value)} placeholder="Select country" /><EventSelect label="City" value={form.city} options={cities} onChange={(value) => change("city", value)} placeholder={form.country ? "Select city" : "Select country first"} /></div>
        <EventInput label="Event Date & Time" type="datetime-local" value={form.event_time} onChange={(value) => change("event_time", value)} required />
        <label><span className={labelClass}>Optional Note</span><textarea rows={2} value={form.description} onChange={(event) => change("description", event.target.value)} className={inputClass} placeholder="Customer-facing event note" /></label>
        {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">{message}</p>}
        <div className="flex gap-2">{editingId && <button type="button" onClick={reset} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">Cancel</button>}<button type="button" disabled={busy} onClick={() => void save()} className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-black text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{busy ? "Saving…" : editingId ? "Update Event" : "+ Add Event"}</button></div>
      </div>
      <div className="max-h-[28rem] overflow-y-auto rounded-xl border border-slate-200"><div className="sticky top-0 z-10 grid grid-cols-[minmax(0,1fr)_auto] bg-slate-100 px-3 py-2 text-[0.58rem] font-black uppercase tracking-wider text-slate-500"><span>Events by time</span><span>Actions</span></div>{!events.length ? <p className="px-4 py-8 text-center text-xs font-semibold text-slate-500">No shipment events have been recorded.</p> : <ol className="divide-y divide-slate-100">{events.map((event, index) => <li key={event.id} className="flex items-start justify-between gap-3 px-3 py-3"><div className="min-w-0"><p className="text-xs font-black text-slate-800">{event.title}</p><p className="mt-0.5 text-[0.66rem] font-semibold text-blue-700">{event.event_type} · {event.city}, {event.country}</p><time className="mt-1 block text-[0.64rem] text-slate-500">{formatDate(event.event_time)}</time>{event.description && <p className="mt-1 text-[0.68rem] leading-4 text-slate-600">{event.description}</p>}</div><div className="flex shrink-0 gap-1"><button type="button" disabled={busy || index === 0} onClick={() => void move(index, -1)} aria-label={`Move ${event.title} newer`} className={actionClass}>↑</button><button type="button" disabled={busy || index === events.length - 1} onClick={() => void move(index, 1)} aria-label={`Move ${event.title} older`} className={actionClass}>↓</button><button type="button" disabled={busy} onClick={() => startEdit(event)} className={`${actionClass} text-blue-700`}>Edit</button><button type="button" disabled={busy} onClick={() => void remove(event)} className={`${actionClass} text-red-700`}>Delete</button></div></li>)}</ol>}</div>
    </div>
  </section>;
}

const labelClass = "mb-1.5 block text-[0.62rem] font-black uppercase tracking-[0.12em] text-slate-500";
const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
const actionClass = "rounded-md bg-slate-100 px-2 py-1.5 text-[0.64rem] font-bold text-slate-600 hover:bg-slate-200 disabled:cursor-not-allowed disabled:opacity-30";
function EventInput({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) { return <label><span className={labelClass}>{label}{required && " *"}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>; }
function EventSelect({ label, value, options, onChange, placeholder }: { label: string; value: string; options: readonly string[]; onChange: (value: string) => void; placeholder?: string }) { return <label><span className={labelClass}>{label} *</span><select value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}><option value="">{placeholder ?? `Select ${label.toLowerCase()}`}</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>; }
function toLocalDateTime(value: string) { const date = new Date(value); const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 16); }
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date); }
