"use client";

import { useMemo, useState } from "react";
import type { EditableRouteStop, JourneyLegMode, SavedRouteStop } from "../lib/saved-routes";

type Stop = EditableRouteStop | SavedRouteStop;
const ICONS: Record<JourneyLegMode, string> = { Air: "✈", Sea: "⚓", Road: "🚚", Rail: "🚆", Courier: "📦", "Internal Transfer": "↔" };

export default function JourneyLegPreview({ stops, title = "Visual Route Preview" }: { stops: Stop[]; title?: string }) {
  const [expanded, setExpanded] = useState(false);
  const legs = useMemo(() => stops.slice(0, -1).map((from, index) => ({ from, to: stops[index + 1], order: index + 1 })), [stops]);
  const collapsible = legs.length > 5;
  const visible = !collapsible || expanded ? legs : [...legs.slice(0, 2), ...legs.slice(-2)];
  const hidden = legs.length - visible.length;

  return <aside className="h-fit overflow-hidden rounded-2xl bg-[#071a33] text-white shadow-lg lg:sticky lg:top-20" aria-labelledby="journey-leg-preview-title">
    <div className="border-b border-white/10 p-4"><p className="text-[0.6rem] font-black uppercase tracking-[0.16em] text-yellow-300">Route operations</p><div className="mt-1 flex items-center justify-between gap-3"><h3 id="journey-leg-preview-title" className="text-sm font-black">{title}</h3><span className="rounded-full bg-white/10 px-2.5 py-1 text-[0.6rem] font-black text-blue-100">{legs.length} legs</span></div></div>
    {!legs.length ? <p className="p-5 text-sm text-blue-200">Add at least two verified locations to create the first journey leg.</p> : <div className="p-4"><ol className="grid gap-3">{visible.map((leg, visibleIndex) => { const mode = leg.from.onward_transport; const showGap = !expanded && collapsible && visibleIndex === 2; return <li key={`${leg.from.id}-${leg.to.id}`} className="relative">{showGap && <div className="mb-3 flex items-center gap-2 text-[0.62rem] font-bold text-blue-300"><span className="h-px flex-1 bg-white/10"/><span>{hidden} legs collapsed</span><span className="h-px flex-1 bg-white/10"/></div>}<article className="rounded-xl border border-white/10 bg-white/[0.06] p-3"><div className="flex items-center justify-between gap-3"><span className="text-[0.58rem] font-black uppercase tracking-[0.14em] text-blue-300">Leg {leg.order}</span><span className="flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[0.62rem] font-black text-white"><span aria-hidden="true" className="text-sm">{mode ? ICONS[mode] : "○"}</span>{mode || "Mode required"}</span></div><div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2"><Endpoint label="Departure" name={leg.from.name} city={leg.from.city}/><span aria-hidden="true" className="text-lg font-black text-yellow-300">→</span><Endpoint label="Arrival" name={leg.to.name} city={leg.to.city} align="right"/></div><dl className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3"><Metric label="Travel time" value={leg.from.estimated_duration_hours == null ? "Not set" : `${leg.from.estimated_duration_hours} hr`}/><Metric label="Distance" value={leg.from.estimated_distance_km == null ? "Not set" : `${leg.from.estimated_distance_km} km`}/></dl>{leg.from.leg_internal_notes && <p className="mt-2 rounded-lg bg-black/10 px-2.5 py-2 text-[0.65rem] leading-4 text-blue-100">{leg.from.leg_internal_notes}</p>}</article></li>; })}</ol>{collapsible && <button type="button" onClick={() => setExpanded((current) => !current)} aria-expanded={expanded} className="mt-3 w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-black text-blue-100 hover:bg-white/10">{expanded ? "Collapse route" : `Expand all ${legs.length} legs`}</button>}</div>}
  </aside>;
}

function Endpoint({ label, name, city, align }: { label: string; name: string; city: string; align?: "right" }) { return <div className={align === "right" ? "min-w-0 text-right" : "min-w-0"}><p className="text-[0.55rem] font-black uppercase tracking-wider text-blue-300">{label}</p><p className="mt-1 break-words text-xs font-black text-white">{name}</p><p className="mt-0.5 truncate text-[0.6rem] text-blue-200">{city}</p></div>; }
function Metric({ label, value }: { label: string; value: string }) { return <div><dt className="text-[0.53rem] font-black uppercase tracking-wider text-blue-300">{label}</dt><dd className="mt-0.5 text-xs font-bold text-white">{value}</dd></div>; }
