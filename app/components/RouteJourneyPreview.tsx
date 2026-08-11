"use client";

import type { RouteJourney } from "../lib/route-intelligence";

export function parseTransitStops(value: string) { return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean); }

type Props = { journey: RouteJourney | null; hasLocations: boolean; compact?: boolean; currentIndex?: number; progress?: number; currentStop?: string; nextStop?: string; transportSummary?: string };

export default function RouteJourneyPreview({ journey, hasLocations, compact = false, currentIndex = 0, progress = 0, currentStop, nextStop, transportSummary }: Props) {
  if (!hasLocations) return <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-xs font-semibold text-slate-500">Add an origin and destination to generate the journey preview.</p>;
  if (!journey) return <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800">Complete the route to generate its operational journey.</p>;
  const safeIndex = Math.max(0, Math.min(currentIndex, journey.checkpoints.length - 1));
  const current = journey.checkpoints[safeIndex];
  const next = journey.checkpoints[safeIndex + 1];
  return <section className="overflow-hidden rounded-2xl border border-blue-100 bg-[#071a33] text-white shadow-lg" aria-label="Generated shipment journey preview">
    <div className="p-4"><p className="text-[0.6rem] font-black uppercase tracking-[0.15em] text-yellow-300">Live journey preview</p><h4 className="mt-1 text-sm font-black">{journey.origin.name} → {journey.destination.name}</h4><div className="mt-3 grid grid-cols-2 gap-2"><PreviewMetric label="Progress" value={`${progress}%`} /><PreviewMetric label="Transport" value={transportSummary ?? journey.transportMode} /><PreviewMetric label="Current stop" value={currentStop ?? current.location.name} /><PreviewMetric label="Next stop" value={nextStop ?? next?.location.name ?? "Journey complete"} /></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-yellow-300 transition-[width]" style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} /></div></div>
    <div className="bg-blue-50/95 p-4 text-slate-900"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-[0.6rem] font-black uppercase tracking-[0.15em] text-blue-600">Customer timeline preview</p><p className="mt-0.5 text-xs font-bold text-slate-600">Milestones update immediately as stops move.</p></div><span className="rounded-full bg-white px-3 py-1 text-[0.65rem] font-black uppercase text-blue-700 shadow-sm">{journey.checkpoints.length} checkpoints</span></div>
      <ol className={`mt-4 grid ${compact ? "max-h-52 overflow-y-auto pr-1" : "max-h-72 overflow-y-auto pr-1"}`}>
        {journey.checkpoints.map((item, index) => { const complete = index < safeIndex; const active = index === safeIndex; return <li key={item.id} className="relative flex gap-3 pb-3 last:pb-0">{index < journey.checkpoints.length - 1 && <span aria-hidden="true" className="absolute left-2.5 top-5 h-[calc(100%-0.5rem)] w-px bg-blue-200"/>}<span className={`relative z-10 mt-1 h-5 w-5 shrink-0 rounded-full border-4 border-blue-100 ${complete ? "bg-yellow-400" : active ? "bg-blue-600 ring-4 ring-blue-100" : "bg-slate-300"}`}/><div className="min-w-0"><p className={`text-xs font-black ${active ? "text-blue-700" : "text-slate-800"}`}>{item.label}</p><p className="mt-0.5 truncate text-[0.68rem] font-semibold text-slate-500">{item.location.name}</p></div></li>; })}
      </ol>
    </div>
  </section>;
}

function PreviewMetric({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-white/10 bg-white/5 p-2"><p className="text-[0.55rem] font-black uppercase tracking-wider text-blue-300">{label}</p><p className="mt-1 break-words text-xs font-bold text-white">{value}</p></div>; }
