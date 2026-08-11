"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { buildJourneyFromSavedRoute, loadRouteTemplates, loadSavedRoute, routeLocationMetadata, type EditableRouteStop, type SavedRouteStop, type SavedRouteStopType, type SavedRouteTemplate } from "../lib/saved-routes";
import type { OperationsAutomation } from "../lib/operations-automation";
import type { RouteJourney } from "../lib/route-intelligence";
import RouteJourneyPreview from "./RouteJourneyPreview";
import LogisticsLocationSelector, { countryFlag } from "./LogisticsLocationSelector";

const STOP_TYPES: Array<{ value: SavedRouteStopType; label: string; short: string }> = [
  { value: "airport", label: "Airport", short: "AP" },
  { value: "port", label: "Port", short: "PT" },
  { value: "warehouse", label: "Warehouse", short: "WH" },
  { value: "border", label: "Border Post", short: "BP" },
  { value: "distribution_centre", label: "Distribution Centre", short: "DC" },
  { value: "customer_address", label: "Customer Address", short: "CA" },
  { value: "customs", label: "Customs", short: "CU" },
  { value: "transit_hub", label: "Transit Hub", short: "TH" },
  { value: "rail_terminal", label: "Rail Terminal", short: "RT" },
  { value: "delivery_depot", label: "Delivery Depot", short: "DD" },
  { value: "other", label: "Other", short: "OT" },
];
const MODES = ["Air", "Sea", "Road", "Multimodal"] as const;

type Props = {
  value: string | null;
  onChange: (routeId: string | null) => void;
  onJourneyChange?: (journey: RouteJourney | null) => void;
  preview?: OperationsAutomation | null;
  compact?: boolean;
};

function persistedStops(routeId: string, stops: EditableRouteStop[]): SavedRouteStop[] {
  return stops.map((stop, position) => ({ ...stop, route_template_id: routeId, position }));
}

function validateRoute(name: string, stops: EditableRouteStop[]) {
  if (!name.trim()) return "Enter a route name.";
  if (stops.length < 2) return "Every route must contain an origin and destination.";
  if (stops.some((stop) => !stop.name.trim() || !stop.country.trim() || !stop.city.trim())) return "Every stop requires a name, city, and country.";
  if (stops.slice(0, -1).some((stop) => !stop.onward_transport)) return "Choose onward transport for every stop except the destination.";
  const identity = (stop: EditableRouteStop) => stop.code?.trim() ? `code:${stop.code.trim().toLowerCase()}` : `place:${stop.name}|${stop.city}|${stop.country}`.trim().toLowerCase();
  const duplicateIndex = stops.findIndex((stop, index) => index > 0 && identity(stop) === identity(stops[index - 1]));
  if (duplicateIndex >= 0) return `Stops ${duplicateIndex} and ${duplicateIndex + 1} cannot be the same location.`;
  return "";
}

export default function RouteBuilder({ value, onChange, onJourneyChange, preview, compact = false }: Props) {
  const [templates, setTemplates] = useState<SavedRouteTemplate[]>([]);
  const [routeId, setRouteId] = useState<string | null>(value);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<SavedRouteTemplate["transport_mode"]>("Air");
  const [stops, setStops] = useState<EditableRouteStop[]>([]);
  const [dragged, setDragged] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");

  const refreshTemplates = useCallback(async () => {
    const { data } = await loadRouteTemplates();
    setTemplates((data ?? []) as SavedRouteTemplate[]);
  }, []);
  const journey = useMemo(() => stops.length >= 2 ? buildJourneyFromSavedRoute({ id: routeId ?? "draft-route", name: name || "Unsaved Route", transport_mode: mode }, persistedStops(routeId ?? "draft-route", stops)) : null, [mode, name, routeId, stops]);
  const validation = useMemo(() => validateRoute(name, stops), [name, stops]);

  useEffect(() => {
    // Supabase is the external route library backing this interactive client control.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshTemplates();
  }, [refreshTemplates]);
  useEffect(() => { onJourneyChange?.(journey); }, [journey, onJourneyChange]);
  useEffect(() => {
    if (!value) return;
    let active = true;
    void loadSavedRoute(value).then(({ template, stops: savedStops }) => {
      if (!active || !template) return;
      setRouteId(template.id); setName(template.name); setMode(template.transport_mode);
      setStops(savedStops.map((stop) => ({ id: stop.id, name: stop.name, country: stop.country, city: stop.city, stop_type: stop.stop_type, code: stop.code, operational_notes: stop.operational_notes, onward_transport: stop.onward_transport, estimated_duration_hours: stop.estimated_duration_hours, estimated_distance_km: stop.estimated_distance_km, leg_internal_notes: stop.leg_internal_notes, expected_arrival_offset: stop.expected_arrival_offset, expected_departure_offset: stop.expected_departure_offset, default_status_text: stop.default_status_text, logistics_location_id: stop.logistics_location_id, logistics_location: stop.logistics_location ?? null })));
      setDirty(false);
    });
    return () => { active = false; };
  }, [value]);

  async function loadTemplate(id: string) {
    if (!id) { startNewRoute(); return; }
    const saved = await loadSavedRoute(id);
    if (!saved.template) { setMessage(saved.error?.message ?? "Unable to load this route."); return; }
    setRouteId(saved.template.id); setName(saved.template.name); setMode(saved.template.transport_mode);
    setStops(saved.stops.map((stop) => ({ id: stop.id, name: stop.name, country: stop.country, city: stop.city, stop_type: stop.stop_type, code: stop.code, operational_notes: stop.operational_notes, onward_transport: stop.onward_transport, estimated_duration_hours: stop.estimated_duration_hours, estimated_distance_km: stop.estimated_distance_km, leg_internal_notes: stop.leg_internal_notes, expected_arrival_offset: stop.expected_arrival_offset, expected_departure_offset: stop.expected_departure_offset, default_status_text: stop.default_status_text, logistics_location_id: stop.logistics_location_id, logistics_location: stop.logistics_location ?? null })));
    setDirty(false);
    setMessage(value === id ? "Assigned route loaded." : "Route loaded. Review it, then assign it to this shipment.");
  }

  function startNewRoute() { setRouteId(null); setName(""); setMode("Air"); setStops([]); setDirty(true); setMessage("New route started. Add the origin first and destination last."); }
  function updateStop(index: number, patch: Partial<EditableRouteStop>) { setStops((current) => current.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...patch } : stop)); setDirty(true); setMessage(""); }
  function move(from: number, to: number) { if (from === to || to < 0 || to >= stops.length) return; setStops((current) => { const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }); setDirty(true); setMessage(""); }
  function addLibraryStop(stop: EditableRouteStop) { setStops((current) => [...current, stop]); setDirty(true); setMessage(""); }

  async function persistRoute(forceNew = false) {
    const issue = validateRoute(name, stops);
    if (issue) { setMessage(issue); return null; }
    setSaving(true); setMessage("");
    let savedId = forceNew ? null : routeId;
    const routeName = forceNew ? `${name.trim()} Copy` : name.trim();
    if (!savedId) {
      const { data, error } = await supabase.from("route_templates").insert([{ name: routeName, transport_mode: mode }]).select("id").single();
      if (error) { setMessage(error.message); setSaving(false); return null; }
      savedId = data.id as string;
    } else {
      const originalId = savedId;
      const { count, error: assignmentError } = await supabase.from("shipments").select("id", { count: "exact", head: true }).eq("route_template_id", originalId);
      if (assignmentError) { setMessage(assignmentError.message); setSaving(false); return null; }
      if ((count ?? 0) > 0) {
        const currentTemplate = templates.find((template) => template.id === originalId);
        const { data, error } = await supabase.from("route_templates").insert([{ name: routeName, transport_mode: mode, estimated_transit_days: currentTemplate?.estimated_transit_days ?? null, route_status: currentTemplate?.route_status ?? "Active", notes: currentTemplate?.notes ?? null, library_root_id: currentTemplate?.library_root_id ?? originalId, version: (currentTemplate?.version ?? 1) + 1, is_current: true }]).select("id").single();
        if (error) { setMessage(error.message); setSaving(false); return null; }
        savedId = data.id as string;
        await supabase.from("route_templates").update({ is_current: false }).eq("id", originalId);
      } else {
        const { error } = await supabase.from("route_templates").update({ name: routeName, transport_mode: mode, updated_at: new Date().toISOString() }).eq("id", originalId);
        if (error) { setMessage(error.message); setSaving(false); return null; }
        const { error: deleteError } = await supabase.from("route_stops").delete().eq("route_template_id", originalId);
        if (deleteError) { setMessage(deleteError.message); setSaving(false); return null; }
      }
    }
    const rows = stops.map((stop, position) => ({ route_template_id: savedId, position, name: stop.name.trim(), country: stop.country.trim(), city: stop.city.trim(), stop_type: stop.stop_type, code: stop.code?.trim() || null, operational_notes: stop.operational_notes?.trim() || null, onward_transport: position === stops.length - 1 ? null : stop.onward_transport, estimated_duration_hours: position === stops.length - 1 ? null : stop.estimated_duration_hours ?? null, estimated_distance_km: position === stops.length - 1 ? null : stop.estimated_distance_km ?? null, leg_internal_notes: position === stops.length - 1 ? null : stop.leg_internal_notes?.trim() || null, expected_arrival_offset: stop.expected_arrival_offset ?? null, expected_departure_offset: stop.expected_departure_offset ?? null, default_status_text: stop.default_status_text?.trim() || null, logistics_location_id: stop.logistics_location_id ?? null }));
    const { error: stopError } = await supabase.from("route_stops").insert(rows);
    if (stopError) { setMessage(stopError.message); setSaving(false); return null; }
    setRouteId(savedId); setName(routeName); setDirty(false); await refreshTemplates(); setSaving(false);
    setMessage(forceNew ? "Route duplicated. Assign it when ready." : "Route saved and available in the template library.");
    return savedId;
  }

  async function renameRoute() {
    if (!routeId || !name.trim()) { setMessage("Load a saved route and enter its new name first."); return; }
    setSaving(true);
    const { error } = await supabase.from("route_templates").update({ name: name.trim(), updated_at: new Date().toISOString() }).eq("id", routeId);
    setSaving(false); setMessage(error ? error.message : "Route renamed successfully.");
    if (!error) setDirty(false);
    if (!error) await refreshTemplates();
  }

  async function deleteRoute() {
    if (!routeId) return;
    const { count, error: assignmentError } = await supabase.from("shipments").select("id", { count: "exact", head: true }).eq("route_template_id", routeId);
    if (assignmentError) { setMessage(assignmentError.message); return; }
    if ((count ?? 0) > 0) { setMessage(`This route is assigned to ${count} shipment${count === 1 ? "" : "s"}. Reassign those shipments before deleting it.`); return; }
    if (!window.confirm(`Delete route template “${name}”?`)) return;
    setSaving(true);
    const { error } = await supabase.from("route_templates").delete().eq("id", routeId);
    setSaving(false);
    if (error) { setMessage(error.message); return; }
    if (value === routeId) onChange(null);
    startNewRoute(); await refreshTemplates(); setMessage("Route template deleted.");
  }

  function assignRoute() {
    if (!routeId) { setMessage("Save this route before assigning it."); return; }
    if (validation) { setMessage(validation); return; }
    if (dirty) { setMessage("Save the latest route changes before assigning this template."); return; }
    onChange(routeId); setMessage("Route assigned to this shipment. Save the shipment to confirm the assignment.");
  }

  return <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm" aria-labelledby="route-builder-title">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50/80 p-4">
      <div><p className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-blue-600">Operational route planning</p><h3 id="route-builder-title" className="mt-1 text-lg font-black text-[#071a33]">Route Builder</h3><p className="mt-1 text-xs leading-5 text-slate-500">Choose every stop and transport leg. Customer milestones are generated automatically.</p></div>
      <button type="button" onClick={startNewRoute} className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-xs font-black text-blue-700 transition hover:bg-blue-50">New Route</button>
    </header>

    <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(18rem,.75fr)]">
      <div className="min-w-0">
        <div className="grid gap-3 sm:grid-cols-2">
          <label><FieldLabel>Route template library</FieldLabel><select value={routeId ?? ""} onChange={(event) => void loadTemplate(event.target.value)} className="field"><option value="">Create a new route</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{value === template.id ? " — Assigned" : ""}</option>)}</select></label>
          <label><FieldLabel>Route name</FieldLabel><input value={name} onChange={(event) => { setName(event.target.value); setDirty(true); setMessage(""); }} placeholder="Johannesburg to Windhoek" className="field" /></label>
          <label><FieldLabel>Route mode</FieldLabel><select value={mode} onChange={(event) => { setMode(event.target.value as typeof mode); setDirty(true); }} className="field">{MODES.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        <div className="mt-4"><LogisticsLocationSelector transportMode={mode} onAdd={addLibraryStop} /></div>

        <ol className="mt-4 grid" aria-label="Ordered route stops">
          {stops.map((stop, index) => { const meta = STOP_TYPES.find((item) => item.value === stop.stop_type)!; const role = index === 0 ? "Origin" : index === stops.length - 1 ? "Destination" : `Stop ${index + 1}`; return <li key={stop.id} className="relative pl-10 pb-3 last:pb-0" draggable onDragStart={() => setDragged(index)} onDragEnd={() => setDragged(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged != null) move(dragged, index); setDragged(null); }}>
            {index < stops.length - 1 && <span aria-hidden="true" className="absolute bottom-0 left-[1.15rem] top-10 border-l-2 border-dashed border-blue-200" />}
            <span className="absolute left-0 top-3 grid h-9 w-9 place-items-center rounded-xl border-4 border-white bg-blue-600 text-[0.55rem] font-black text-white shadow-md">{meta.short}</span>
            <article className={`rounded-xl border bg-white p-3 shadow-sm transition ${dragged === index ? "border-blue-400 opacity-60" : "border-slate-200 hover:border-blue-200"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><button type="button" aria-label={`Drag ${role}`} title="Drag to reorder" className="cursor-grab rounded-lg bg-slate-100 px-2 py-1 text-[0.65rem] font-black text-slate-500 active:cursor-grabbing">DRAG</button><div><p className="text-[0.58rem] font-black uppercase tracking-[0.13em] text-blue-600">{role} · {meta.label}</p><p className="text-xs font-black text-slate-800">{countryFlag(routeLocationMetadata(stop)?.country_code)} {stop.name || meta.label}{stop.code ? ` (${stop.code})` : ""}</p><p className="mt-0.5 text-[0.62rem] font-semibold text-slate-500">{stop.city}, {stop.country}</p></div></div><div className="flex gap-1"><MiniButton label="Move up" disabled={index === 0} onClick={() => move(index, index - 1)}>Up</MiniButton><MiniButton label="Move down" disabled={index === stops.length - 1} onClick={() => move(index, index + 1)}>Down</MiniButton><MiniButton label={`Remove ${role}`} danger onClick={() => { setStops((current) => current.filter((_, stopIndex) => stopIndex !== index)); setDirty(true); }}>Remove</MiniButton></div></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><label><FieldLabel>Type</FieldLabel><select value={stop.stop_type} onChange={(event) => updateStop(index, { stop_type: event.target.value as SavedRouteStopType })} className="field">{STOP_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label><label className="lg:col-span-2"><FieldLabel>Location name</FieldLabel><input value={stop.name} onChange={(event) => updateStop(index, { name: event.target.value })} className="field" /></label><label><FieldLabel>Code / reference</FieldLabel><input value={stop.code ?? ""} onChange={(event) => updateStop(index, { code: event.target.value })} placeholder="JNB" className="field" /></label><label><FieldLabel>City</FieldLabel><input value={stop.city} onChange={(event) => updateStop(index, { city: event.target.value })} className="field" /></label><label><FieldLabel>Country</FieldLabel><input value={stop.country} onChange={(event) => updateStop(index, { country: event.target.value })} className="field" /></label><label><FieldLabel>Next transport leg</FieldLabel><select value={stop.onward_transport ?? ""} disabled={index === stops.length - 1} onChange={(event) => updateStop(index, { onward_transport: event.target.value as EditableRouteStop["onward_transport"] })} className="field disabled:bg-slate-100"><option value="">Final destination</option><option>Air</option><option>Sea</option><option>Road</option></select></label><label><FieldLabel>Operational notes</FieldLabel><input value={stop.operational_notes ?? ""} onChange={(event) => updateStop(index, { operational_notes: event.target.value })} placeholder="Optional" className="field" /></label></div>
            </article>
          </li>; })}
        </ol>
        {!stops.length && <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"><p className="text-sm font-black text-slate-700">Start with the shipment origin</p><p className="mt-1 text-xs text-slate-500">Select a stop type above, then add each location in operational order.</p></div>}

        {message && <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-xs font-bold ${/saved|assigned|renamed|loaded|started|duplicated/i.test(message) ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>{message}</p>}
        {!message && validation && stops.length > 0 && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{validation}</p>}

        <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
          <button type="button" disabled={saving} onClick={() => void persistRoute()} className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-50">{saving ? "Working..." : "Save Route"}</button>
          <button type="button" disabled={saving || !routeId} onClick={() => void persistRoute(true)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40">Duplicate</button>
          <button type="button" disabled={saving || !routeId} onClick={() => void renameRoute()} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:opacity-40">Rename</button>
          <button type="button" disabled={saving || !routeId} onClick={() => void deleteRoute()} className="rounded-xl border border-red-200 bg-white px-4 py-2.5 text-xs font-black text-red-600 hover:bg-red-50 disabled:opacity-40">Delete</button>
          <button type="button" disabled={!routeId || Boolean(validation) || dirty} onClick={assignRoute} className="ml-auto rounded-xl bg-[#071a33] px-5 py-2.5 text-xs font-black text-white hover:bg-blue-900 disabled:opacity-40">{dirty ? "Save Before Assigning" : value === routeId ? "Route Assigned" : "Assign Route"}</button>
        </div>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-24 xl:h-fit">
        <RouteJourneyPreview journey={journey} hasLocations={stops.length >= 2} compact={compact} currentIndex={preview?.checkpointIndex} progress={preview?.progress} currentStop={preview?.currentLocation} nextStop={preview?.nextLocation} transportSummary={mode} />
      </aside>
    </div>
  </section>;
}

function FieldLabel({ children }: { children: React.ReactNode }) { return <span className="mb-1 block text-[0.6rem] font-black uppercase tracking-[0.1em] text-slate-500">{children}</span>; }
function MiniButton({ label, children, onClick, disabled, danger }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) { return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className={`mini ${danger ? "text-red-600" : ""}`}>{children}</button>; }
