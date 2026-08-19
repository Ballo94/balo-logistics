"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { effectiveEstimate, recommendRouteLeg } from "../lib/route-journey-estimates";
import { routeLocationMetadata, type EditableRouteStop, type SavedRouteStopType, type SavedRouteTemplate } from "../lib/saved-routes";
import { locationTypeLabel, type LogisticsLocationType } from "../lib/logistics-location-library";
import LogisticsLocationSelector, { countryFlag } from "./LogisticsLocationSelector";
import JourneyLegPreview from "./JourneyLegPreview";

type EditorValue = {
  id: string | null;
  name: string;
  transport_mode: SavedRouteTemplate["transport_mode"];
  estimated_transit_days: string;
  route_status: "Active" | "Archived";
  notes: string;
  library_root_id: string | null;
  version: number;
  stops: EditableRouteStop[];
};

const STOP_LABELS: Record<SavedRouteStopType, string> = {
  airport: "Airport", port: "Port", border: "Border Post", warehouse: "Warehouse",
  distribution_centre: "Distribution Centre", customs: "Customs", transit_hub: "Transit Hub",
  rail_terminal: "Rail Terminal", delivery_depot: "Delivery Depot", customer_address: "Customer Address", other: "Other",
};

function recommendationForLeg(origin: EditableRouteStop, destination: EditableRouteStop, selectedMode?: EditableRouteStop["onward_transport"]) {
  const originLocation = routeLocationMetadata(origin);
  const destinationLocation = routeLocationMetadata(destination);
  return recommendRouteLeg(
    { latitude: originLocation?.latitude ?? null, longitude: originLocation?.longitude ?? null, verified: originLocation?.verified ?? false },
    { latitude: destinationLocation?.latitude ?? null, longitude: destinationLocation?.longitude ?? null, verified: destinationLocation?.verified ?? false },
    selectedMode === undefined ? origin.onward_transport : selectedMode,
  );
}

type Props = {
  value: EditorValue;
  saving: boolean;
  dragged: number | null;
  onDragged: Dispatch<SetStateAction<number | null>> | ((index: number | null) => void);
  onChange: (value: EditorValue) => void;
  onClose: () => void;
  onSave: () => void;
  onDuplicate: () => void;
};

export default function RouteLibraryEditor({ value, saving, dragged, onDragged, onChange, onClose, onSave, onDuplicate }: Props) {
  const [insertAt, setInsertAt] = useState<number | "end">("end");
  const patch = (next: Partial<EditorValue>) => onChange({ ...value, ...next });
  const updateStop = (index: number, next: Partial<EditableRouteStop>) => patch({ stops: value.stops.map((stop, stopIndex) => stopIndex === index ? { ...stop, ...next } : stop) });
  const calculateRecommendation = (index: number, selectedMode?: EditableRouteStop["onward_transport"]) => {
    const stop = value.stops[index];
    const destination = value.stops[index + 1];
    const recommendation = recommendationForLeg(stop, destination, selectedMode);
    updateStop(index, {
      ...(selectedMode !== undefined ? { onward_transport: selectedMode } : {}),
      system_recommended_distance_km: recommendation.distanceKm,
      system_recommended_duration_hours: recommendation.durationHours,
      system_recommendation_confidence: recommendation.confidence,
      system_recommendation_metadata: recommendation.metadata,
      system_recommendation_calculated_at: new Date().toISOString(),
    });
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.stops.length || from === to) return;
    const stops = [...value.stops];
    const [item] = stops.splice(from, 1);
    stops.splice(to, 0, item);
    patch({ stops });
  };

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm">
    <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-[#f4f7fb] shadow-2xl">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-[#071a33] px-5 py-4 text-white">
        <div><p className="text-xs font-black uppercase tracking-wider text-yellow-300">Verified route template editor</p><h2 className="mt-1 text-xl font-black">{value.id ? "Edit Route" : "Create Route"}</h2></div>
        <button type="button" onClick={onClose} className="rounded-xl bg-white/10 px-3 py-2 font-black hover:bg-white/15">Close</button>
      </header>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid gap-4">
          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Route Name"><input value={value.name} onChange={(event) => patch({ name: event.target.value })} className="workflow-field"/></Field>
              <Field label="Transport Mode"><select value={value.transport_mode} onChange={(event) => patch({ transport_mode: event.target.value as EditorValue["transport_mode"] })} className="workflow-field"><option>Air</option><option>Sea</option><option>Road</option><option>Multimodal</option></select></Field>
              <Field label="Estimated Transit Days"><input type="number" min="0" value={value.estimated_transit_days} onChange={(event) => patch({ estimated_transit_days: event.target.value })} className="workflow-field"/></Field>
              <Field label="Status"><select value={value.route_status} onChange={(event) => patch({ route_status: event.target.value as EditorValue["route_status"] })} className="workflow-field"><option>Active</option><option>Archived</option></select></Field>
              <Field label="Notes" wide><textarea rows={2} value={value.notes} onChange={(event) => patch({ notes: event.target.value })} className="workflow-field h-auto py-2"/></Field>
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-[0.6rem] font-black uppercase tracking-wider text-blue-600">Insert location</p><p className="mt-1 text-xs text-slate-500">Choose where the next verified location should be inserted.</p></div><select value={insertAt} onChange={(event) => setInsertAt(event.target.value === "end" ? "end" : Number(event.target.value))} className="workflow-field max-w-xs"><option value="end">At end of journey</option>{value.stops.map((stop, index) => <option key={stop.id} value={index + 1}>After {stop.name}</option>)}</select></div></section>
          <LogisticsLocationSelector key={value.transport_mode} transportMode={value.transport_mode} onAdd={(stop) => { const index = insertAt === "end" ? value.stops.length : Math.min(insertAt, value.stops.length); const stops = [...value.stops]; stops.splice(index, 0, stop); patch({ stops }); setInsertAt("end"); }}/>

          <section className="rounded-2xl bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3"><div><h3 className="font-black">Ordered Stops</h3><p className="text-xs text-slate-500">The administrator controls every stop. Drag cards to change the journey.</p></div><span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">{value.stops.length} stops</span></div>
            <ol className="mt-4 grid gap-3">
              {value.stops.map((stop, index) => { const metadata = routeLocationMetadata(stop); const liveRecommendation = index < value.stops.length - 1 ? recommendationForLeg(stop, value.stops[index + 1]) : null; const hasSavedRecommendation = Boolean(stop.system_recommendation_calculated_at || stop.system_recommendation_confidence || stop.system_recommendation_metadata || stop.system_recommended_distance_km != null || stop.system_recommended_duration_hours != null); const recommendationDistance = hasSavedRecommendation ? stop.system_recommended_distance_km : liveRecommendation?.distanceKm; const recommendationDuration = hasSavedRecommendation ? stop.system_recommended_duration_hours : liveRecommendation?.durationHours; const recommendationConfidence = hasSavedRecommendation ? stop.system_recommendation_confidence : liveRecommendation?.confidence; const recommendationReason = hasSavedRecommendation ? stop.system_recommendation_metadata?.unavailableReason : liveRecommendation?.metadata.unavailableReason; return <li key={stop.id} draggable onDragStart={() => onDragged(index)} onDragEnd={() => onDragged(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (dragged != null) move(dragged, index); onDragged(null); }} className={`rounded-xl border bg-slate-50 p-3 transition ${dragged === index ? "border-blue-400 opacity-60" : "border-slate-200"}`}>
                <div className="flex flex-wrap justify-between gap-3"><div className="flex items-center gap-2"><span className="cursor-grab rounded-lg bg-slate-200 px-2 py-1 text-[0.6rem] font-black text-slate-600">{index < value.stops.length - 1 ? "DRAG LEG" : "DRAG"}</span><div><p className="text-[0.6rem] font-black uppercase tracking-wider text-blue-700">{index === 0 ? "Origin" : index === value.stops.length - 1 ? "Destination" : `Checkpoint ${index}`}</p><p className="mt-0.5 text-sm font-black text-slate-900">{stop.name}</p></div></div><div className="flex gap-1"><Action disabled={index === 0} onClick={() => move(index, index - 1)}>Up</Action><Action disabled={index === value.stops.length - 1} onClick={() => move(index, index + 1)}>Down</Action><Action danger onClick={() => patch({ stops: value.stops.filter((_, stopIndex) => stopIndex !== index) })}>{index < value.stops.length - 1 ? "Delete Leg" : "Remove"}</Action></div></div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <ReadOnly label="Location" value={stop.name}/><ReadOnly label="Type" value={metadata?.location_type ? locationTypeLabel(metadata.location_type as LogisticsLocationType, stop.name) : STOP_LABELS[stop.stop_type]}/><ReadOnly label="City" value={stop.city}/><ReadOnly label="Country" value={`${countryFlag(metadata?.country_code)} ${stop.country}`}/><ReadOnly label="Official Code" value={[stop.code, metadata?.secondary_code].filter(Boolean).join(" / ") || "—"}/>
                  <Field label="Estimated Arrival (day offset)"><input type="number" min="0" value={stop.expected_arrival_offset ?? ""} onChange={(event) => updateStop(index, { expected_arrival_offset: event.target.value === "" ? null : Number(event.target.value) })} className="workflow-field"/></Field>
                  <Field label="Estimated Departure (day offset)"><input type="number" min="0" value={stop.expected_departure_offset ?? ""} onChange={(event) => updateStop(index, { expected_departure_offset: event.target.value === "" ? null : Number(event.target.value) })} className="workflow-field"/></Field>
                  <Field label="Default Status" wide><input value={stop.default_status_text ?? ""} onChange={(event) => updateStop(index, { default_status_text: event.target.value })} className="workflow-field"/></Field>
                  <Field label="Internal Notes" wide><input value={stop.operational_notes ?? ""} onChange={(event) => updateStop(index, { operational_notes: event.target.value })} className="workflow-field"/></Field>
                </div>
                {index < value.stops.length - 1 && <section className="mt-3 rounded-xl border border-blue-100 bg-white p-3" aria-label={`Journey leg ${index + 1}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[0.58rem] font-black uppercase tracking-[0.14em] text-blue-600">Journey Leg {index + 1}</p><p className="mt-1 text-xs font-black text-slate-800">{stop.name} <span className="px-1 text-blue-500">→</span> {value.stops[index + 1].name}</p></div><button type="button" onClick={() => calculateRecommendation(index)} className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-[0.62rem] font-black text-blue-700">{stop.system_recommendation_calculated_at ? "Refresh recommendation" : "Calculate Balo estimate"}</button></div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Field label="Transport Mode"><select value={stop.onward_transport ?? ""} onChange={(event) => calculateRecommendation(index, event.target.value ? event.target.value as NonNullable<EditableRouteStop["onward_transport"]> : null)} className="workflow-field"><option value="">Choose mode</option><option>Road</option><option>Air</option><option>Sea</option><option>Rail</option><option>Courier</option><option>Internal Transfer</option></select></Field><Field label="Admin duration (hours)"><input type="number" min="0" step="0.25" value={stop.estimated_duration_hours ?? ""} onChange={(event) => updateStop(index, { estimated_duration_hours: event.target.value === "" ? null : Number(event.target.value) })} className="workflow-field"/></Field><Field label="Admin distance (km)"><input type="number" min="0" step="0.1" value={stop.estimated_distance_km ?? ""} onChange={(event) => updateStop(index, { estimated_distance_km: event.target.value === "" ? null : Number(event.target.value) })} className="workflow-field"/></Field><Field label="Internal Notes"><input value={stop.leg_internal_notes ?? ""} onChange={(event) => updateStop(index, { leg_internal_notes: event.target.value })} className="workflow-field"/></Field></div>
                  <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
                    <p className="text-sm font-black text-[#071a33]">Balo Recommendation — {formatRecommendation(recommendationDistance, recommendationDuration, recommendationConfidence)}</p>
                    {recommendationReason && <p className="mt-1 text-[0.62rem] leading-4 text-blue-700">{recommendationReason}</p>}
                  </div>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <EstimatePanel title="Operational estimate" distance={stop.estimated_distance_km} duration={stop.estimated_duration_hours} detail="Administrator controlled"/>
                    <EstimatePanel title="Effective estimate" distance={effectiveEstimate(stop.estimated_distance_km, recommendationDistance)} duration={effectiveEstimate(stop.estimated_duration_hours, recommendationDuration)} detail={stop.estimated_distance_km != null || stop.estimated_duration_hours != null ? "Uses available admin overrides" : "Uses Balo recommendation"}/>
                  </div>
                </section>}
              </li>; })}
            </ol>
            {!value.stops.length && <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs font-bold text-slate-500">Search the verified location library to add the origin.</p>}
          </section>
        </div>
        <JourneyLegPreview stops={value.stops}/>
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-2 border-t bg-white px-5 py-4"><button type="button" onClick={onDuplicate} disabled={saving || !value.id} className="rounded-xl border px-4 py-2.5 text-sm font-black disabled:opacity-40">Duplicate</button><button type="button" onClick={onSave} disabled={saving} className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-black text-white disabled:opacity-50">{saving ? "Saving..." : "Save Route"}</button></footer>
    </div>
  </div>;
}

function Field({ label, wide, children }: { label: string; wide?: boolean; children: React.ReactNode }) { return <label className={wide ? "sm:col-span-2" : ""}><span className="mb-1 block text-[0.6rem] font-black uppercase tracking-wider text-slate-500">{label}</span>{children}</label>; }
function ReadOnly({ label, value }: { label: string; value: string }) { return <div><span className="block text-[0.6rem] font-black uppercase tracking-wider text-slate-500">{label}</span><span className="mt-1 block text-xs font-bold text-slate-800">{value}</span></div>; }
function EstimatePanel({ title, distance, duration, detail }: { title: string; distance?: number | null; duration?: number | null; detail: string }) { return <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"><p className="text-[0.56rem] font-black uppercase tracking-wider text-slate-500">{title}</p><p className="mt-1 text-xs font-black text-slate-800">{formatDistance(distance)} · {formatDuration(duration)}</p><p className="mt-1 text-[0.6rem] leading-4 text-slate-500">{detail}</p></div>; }
function formatDistance(value?: number | null) { return value == null ? "Distance unavailable" : `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} km`; }
function formatDuration(value?: number | null) { if (value == null) return "Duration unavailable"; const totalMinutes = Math.round(value * 60); return `${Math.floor(totalMinutes / 60)}h ${(totalMinutes % 60).toString().padStart(2, "0")}m`; }
function formatRecommendation(distance?: number | null, duration?: number | null, confidence?: string | null) { return distance == null || duration == null ? "Unavailable" : `${formatDistance(distance)} · approx. ${formatDuration(duration)}${confidence ? ` · ${confidence} confidence` : ""}`; }
function Action({ children, onClick, disabled, danger }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; danger?: boolean }) { return <button type="button" onClick={onClick} disabled={disabled} className={`rounded-lg border px-2.5 py-1.5 text-[0.65rem] font-black disabled:opacity-30 ${danger ? "border-red-200 text-red-600" : "border-slate-200 text-slate-600"}`}>{children}</button>; }
