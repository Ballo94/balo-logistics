"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadAdminShipmentHistory, type AdminShipmentHistoryEntry } from "../lib/shipment-history-admin";
import { ADMIN_HISTORY_FILTERS, latestAdminShipmentHistoryId, matchesAdminShipmentHistoryFilter, orderAdminShipmentHistory, type AdminShipmentHistoryFilter, type AdminShipmentHistoryOrder } from "../lib/shipment-history-presentation";
import type { RouteJourney } from "../lib/route-intelligence";

export type AdminHistoryShipmentSummary = {
  id: number;
  tracking_number: string;
  client_name: string;
  receiver_name: string | null;
  transport_mode: string | null;
  origin_country: string;
  destination_country: string;
  shipment_status: string | null;
  current_location: string | null;
};

type Props = {
  shipment: AdminHistoryShipmentSummary;
  shipments: readonly AdminHistoryShipmentSummary[];
  journey: RouteJourney | null;
  onSwitchShipment: (shipmentId: number) => boolean;
};

export default function AdminShipmentHistory({ shipment, shipments, journey, onSwitchShipment }: Props) {
  const [entries, setEntries] = useState<AdminShipmentHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<AdminShipmentHistoryFilter>("All");
  const [order, setOrder] = useState<AdminShipmentHistoryOrder>("newest");
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchQuery, setSwitchQuery] = useState("");
  const checkpoints = useMemo(() => new Map((journey?.checkpoints ?? []).map((checkpoint) => [checkpoint.id, checkpoint])), [journey]);
  const latestEventId = useMemo(() => latestAdminShipmentHistoryId(entries), [entries]);
  const visibleEntries = useMemo(() => orderAdminShipmentHistory(entries.filter((entry) => matchesAdminShipmentHistoryFilter(entry, filter)), order), [entries, filter, order]);
  const matchingShipments = useMemo(() => {
    const query = switchQuery.trim().toLowerCase();
    return shipments.filter((candidate) => !query || [candidate.tracking_number, candidate.client_name, candidate.receiver_name, candidate.origin_country, candidate.destination_country].some((value) => value?.toLowerCase().includes(query))).slice(0, 12);
  }, [shipments, switchQuery]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const result = await loadAdminShipmentHistory(shipment.id);
    setEntries(result.entries);
    setError(result.error?.message ?? "");
    setLoading(false);
  }, [shipment.id]);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  return <section className="overflow-hidden rounded-xl border border-slate-200 bg-white" aria-labelledby="admin-shipment-history-title">
    <header className="border-b border-slate-100 bg-gradient-to-br from-[#071a33] to-[#0a3b72] px-3.5 py-3.5 text-white">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><p className="text-[0.58rem] font-black uppercase tracking-[0.15em] text-yellow-300">Complete operational record</p><h4 id="admin-shipment-history-title" className="mt-0.5 text-base font-black">Shipment History</h4><p className="mt-1 break-all text-xs font-bold text-blue-100">Tracking · {shipment.tracking_number}</p></div>
        <div className="flex flex-wrap items-center justify-end gap-2"><span className="rounded-full bg-white/10 px-2.5 py-1 text-[0.65rem] font-black text-white ring-1 ring-white/15">{entries.length} events</span><button type="button" disabled={loading} onClick={() => void refresh()} className="rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-[0.65rem] font-black text-white hover:bg-white/15 disabled:opacity-50">Refresh</button><button type="button" aria-expanded={switchOpen} onClick={() => setSwitchOpen((value) => !value)} className="rounded-lg bg-yellow-400 px-3 py-1.5 text-[0.65rem] font-black text-[#071a33] hover:bg-yellow-300">Switch shipment</button></div>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
        <SummaryItem label="Client / Receiver" value={shipment.receiver_name || shipment.client_name}/><SummaryItem label="Transport" value={transportLabel(shipment.transport_mode)}/><SummaryItem label="Route" value={routeLabel(shipment.origin_country, shipment.destination_country)}/><SummaryItem label="Current status" value={shipment.shipment_status}/><SummaryItem label="Current location" value={shipment.current_location}/>
      </div>
      {switchOpen && <div className="mt-3"><ShipmentSwitcher currentShipmentId={shipment.id} query={switchQuery} onQueryChange={setSwitchQuery} shipments={matchingShipments} onSelect={(shipmentId) => { if (onSwitchShipment(shipmentId)) { setSwitchOpen(false); setSwitchQuery(""); } }}/></div>}
    </header>
    <div className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50/80 px-3 py-2.5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex gap-1.5 overflow-x-auto pb-1 lg:pb-0" aria-label="Shipment history filters">{ADMIN_HISTORY_FILTERS.map((item) => <button key={item} type="button" onClick={() => setFilter(item)} aria-pressed={filter === item} className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[0.65rem] font-black ${filter === item ? "bg-blue-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-blue-300 hover:text-blue-700"}`}>{item}</button>)}</div>
      <label className="flex items-center gap-2 text-[0.65rem] font-black text-slate-500"><span>Order</span><select value={order} onChange={(event) => setOrder(event.target.value as AdminShipmentHistoryOrder)} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-blue-500"><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
    </div>
    {error && <p role="alert" className="m-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">History events loaded where available, but private notes could not be read. {error}</p>}
    {loading ? <div className="grid gap-2 p-3" aria-label="Loading shipment history">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-slate-100"/>)}</div> : !entries.length ? <EmptyState>No shipment history recorded.</EmptyState> : !visibleEntries.length ? <EmptyState>No events match this filter.</EmptyState> : <ol className="divide-y divide-slate-100">{visibleEntries.map((entry) => {
      const checkpoint = entry.route_checkpoint_id ? checkpoints.get(entry.route_checkpoint_id) : null;
      const timestamp = formatDateTime(entry.created_at);
      const latest = entry.id === latestEventId;
      const checkpointLocation = checkpoint ? locationContext(checkpoint.location.name, checkpoint.location.city, checkpoint.location.country, entry.location) : "";
      return <li key={entry.id} className="grid gap-2.5 px-3.5 py-3 sm:grid-cols-[1.9rem_minmax(0,1fr)_auto]">
        <span className={`mt-0.5 grid h-7 w-7 place-items-center rounded-full text-[0.6rem] font-black ${latest ? "bg-blue-600 text-white ring-4 ring-blue-100" : "bg-yellow-100 text-[#725600] ring-1 ring-yellow-200"}`}>{latest ? "●" : "✓"}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h5 className="text-sm font-black text-slate-900">{entry.status}</h5>{latest && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[0.58rem] font-black uppercase tracking-wider text-blue-700">Latest</span>}</div>
          {entry.location && <p className="mt-1 text-xs font-bold text-slate-700"><span className="text-slate-400">Location · </span>{entry.location}</p>}
          {checkpoint && <p className="mt-1 text-[0.7rem] text-slate-600"><span className="font-black uppercase tracking-wide text-slate-400">Facility · </span><span className="font-bold text-slate-700">{checkpoint.label}</span>{checkpointLocation}</p>}
          {entry.note && <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2"><p className="text-[0.58rem] font-black uppercase tracking-wider text-blue-700">Customer Update</p><p className="mt-1 whitespace-pre-line text-xs leading-5 text-slate-700">{entry.note}</p></div>}
          {entry.internal_note && <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"><p className="text-[0.58rem] font-black uppercase tracking-wider text-amber-800">Internal Note · Admin only</p><p className="mt-1 whitespace-pre-line text-xs leading-5 text-amber-950">{entry.internal_note}</p></div>}
        </div>
        <time dateTime={entry.created_at} className="text-left text-[0.66rem] font-semibold text-slate-500 sm:text-right"><span className="block font-bold text-slate-700">{timestamp.date}</span><span className="mt-0.5 block">{timestamp.time}</span></time>
      </li>;
    })}</ol>}
  </section>;
}

function formatDateTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return { date: value, time: "" }; return { date: new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date), time: new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(date) }; }
function normalized(value: string | null | undefined) { return value?.trim().toLowerCase() ?? ""; }
function locationContext(name: string, city: string, country: string, eventLocation: string | null) { const values = [name, city, country].filter((value, index, items) => value && normalized(value) !== normalized(eventLocation) && items.findIndex((item) => normalized(item) === normalized(value)) === index); return values.length ? ` · ${values.join(", ")}` : ""; }
function routeLabel(origin: string, destination: string) { return origin && destination ? `${origin} → ${destination}` : origin || destination || null; }
function transportLabel(mode: string | null) { return mode ? `${mode} Freight` : null; }
function SummaryItem({ label, value }: { label: string; value: string | null | undefined }) { if (!value) return null; return <div className="min-w-0 rounded-lg bg-white/8 px-2.5 py-2 ring-1 ring-white/10"><p className="text-[0.55rem] font-black uppercase tracking-wider text-blue-200">{label}</p><p className="mt-0.5 break-words font-bold text-white">{value}</p></div>; }
function EmptyState({ children }: { children: React.ReactNode }) { return <p className="px-4 py-8 text-center text-xs font-semibold text-slate-500">{children}</p>; }
function ShipmentSwitcher({ currentShipmentId, query, onQueryChange, shipments, onSelect }: { currentShipmentId: number; query: string; onQueryChange: (value: string) => void; shipments: readonly AdminHistoryShipmentSummary[]; onSelect: (shipmentId: number) => void }) { return <div className="ml-auto w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white text-slate-900 shadow-xl"><div className="border-b border-slate-100 p-3"><label className="text-[0.58rem] font-black uppercase tracking-wider text-slate-500">Find shipment</label><input autoFocus value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Tracking, client, origin or destination" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"/></div><div className="max-h-72 overflow-y-auto p-1.5">{shipments.length ? shipments.map((candidate) => { const current = candidate.id === currentShipmentId; return <button key={candidate.id} type="button" disabled={current} onClick={() => onSelect(candidate.id)} className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-blue-50 disabled:bg-slate-50 disabled:opacity-60"><span className="block break-all text-xs font-black text-blue-700">{candidate.tracking_number}{current ? " · Current" : ""}</span><span className="mt-0.5 block truncate text-xs font-bold text-slate-800">{candidate.receiver_name || candidate.client_name || "Client not provided"}</span><span className="mt-0.5 block truncate text-[0.68rem] text-slate-500">{routeLabel(candidate.origin_country, candidate.destination_country) || "Route not provided"} · {transportLabel(candidate.transport_mode) || "Mode not provided"}</span></button>; }) : <p className="px-3 py-7 text-center text-xs font-semibold text-slate-500">No shipments match this search.</p>}</div></div>; }
