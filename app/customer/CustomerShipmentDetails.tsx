"use client";

import { useEffect, useMemo, useState } from "react";
import ShipmentTimeline from "../ShipmentTimeline";
import ShipmentEventHistory from "../components/ShipmentEventHistory";
import ShipmentCommunications from "../components/ShipmentCommunications";
import ShipmentDocuments from "../components/ShipmentDocuments";
import { deriveShipmentState } from "../lib/shipment-state";
import { automateShipmentOperations } from "../lib/operations-automation";
import { createRouteJourneyPresentation } from "../lib/route-intelligence/presentation";
import { loadShipmentRouteSnapshot } from "../lib/shipment-route-snapshots";
import { loadSavedRoute } from "../lib/saved-routes";
import { loadShipmentEvents, type ShipmentEvent } from "../lib/shipment-events";
import { loadPublicShipmentDocuments, type ShipmentDocument } from "../lib/shipment-document-records";
import { loadPublicCommunications, type ShipmentCommunication } from "../lib/shipment-communications";
import { supabase } from "../lib/supabase";
import type { CustomerShipment } from "./page";

type History = { id: number; status: string; location: string | null; note: string | null; created_at: string };

export default function CustomerShipmentDetails({ shipment, onClose, onRead }: { shipment: CustomerShipment; onClose: () => void; onRead: () => void }) {
  const [history, setHistory] = useState<History[]>([]);
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [documents, setDocuments] = useState<ShipmentDocument[]>([]);
  const [communications, setCommunications] = useState<ShipmentCommunication[]>([]);
  const [journey, setJourney] = useState<Awaited<ReturnType<typeof loadShipmentRouteSnapshot>>["journey"]>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(async () => {
      const [historyResult, eventResult, documentResult, communicationResult, snapshotResult] = await Promise.all([
        supabase.from("shipment_history").select("id, status, location, note, created_at").eq("shipment_id", shipment.id).order("created_at", { ascending: false }),
        loadShipmentEvents(shipment.id), loadPublicShipmentDocuments(shipment.tracking_number), loadPublicCommunications(shipment.tracking_number), loadShipmentRouteSnapshot(shipment.id),
      ]);
      let resolvedJourney = snapshotResult.journey;
      if (!resolvedJourney && shipment.route_template_id) resolvedJourney = (await loadSavedRoute(shipment.route_template_id)).journey;
      if (!active) return;
      setHistory((historyResult.data ?? []) as History[]); setEvents((eventResult.data ?? []) as ShipmentEvent[]); setDocuments((documentResult.data ?? []) as ShipmentDocument[]); setCommunications((communicationResult.data ?? []) as ShipmentCommunication[]); setJourney(resolvedJourney); setLoading(false);
      await supabase.rpc("mark_customer_shipment_read", { target_shipment_id: shipment.id }); onRead();
    }, 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [onRead, shipment]);

  const latest = history[0];
  const state = useMemo(() => deriveShipmentState({ shipmentStatus: shipment.shipment_status, transportMode: shipment.transport_mode, currentLocation: shipment.current_location, originCountry: shipment.origin_country, destinationCountry: shipment.destination_country, receiverAddress: shipment.receiver_address, courierName: shipment.courier_name, estimatedDelivery: shipment.estimated_delivery, latestUpdateNote: latest?.note }), [latest?.note, shipment]);
  const operations = useMemo(() => automateShipmentOperations({ shipmentStatus: shipment.shipment_status, transportMode: shipment.transport_mode ?? "", origin: shipment.origin_country, destination: shipment.destination_country, journey: journey ?? undefined, receiverAddress: shipment.receiver_address, estimatedDelivery: shipment.estimated_delivery, operationalNote: latest?.note }), [journey, latest?.note, shipment]);
  const routeJourney = operations.journey;
  const route = routeJourney ? createRouteJourneyPresentation(routeJourney, state, shipment.current_location) : null;

  return <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="customer-shipment-title" className="mx-auto max-w-7xl overflow-hidden rounded-[1.5rem] bg-[#f4f7fb] shadow-2xl"><header className="sticky top-0 z-20 flex items-center justify-between gap-4 bg-gradient-to-r from-[#071a33] to-[#0b3d70] px-4 py-3.5 text-white sm:px-6"><div><p className="text-[0.6rem] font-black uppercase tracking-[0.18em] text-yellow-300">Shipment details</p><h2 id="customer-shipment-title" className="text-xl font-black">{shipment.tracking_number}</h2></div><button type="button" onClick={onClose} aria-label="Close shipment details" className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-xl">×</button></header>{loading ? <DetailsSkeleton/> : <div className="grid gap-3 p-3 sm:p-5"><div className="grid gap-3 lg:grid-cols-4"><SummaryCard label="Current Status" value={state.displayStatus}/><SummaryCard label="Current Location" value={route?.currentLocation ?? state.currentLocation}/><SummaryCard label="Estimated Delivery" value={formatDate(shipment.estimated_delivery)}/><SummaryCard label="Transport Mode" value={state.transportLabel}/></div><div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(18rem,.7fr)]"><ShipmentTimeline state={state} journey={routeJourney} route={route} history={history} originCountry={shipment.origin_country} destinationCountry={shipment.destination_country}/><aside className="grid gap-3"><InfoPanel title="Route Overview"><Info label="Origin" value={routeJourney?.origin.name ?? shipment.origin_country}/><Info label="Destination" value={routeJourney?.destination.name ?? shipment.destination_country}/><Info label="Next Stop" value={route?.nextStop ?? state.nextStop}/><Info label="Progress" value={`${operations.progress}%`}/></InfoPanel><InfoPanel title="Map"><div className="grid min-h-36 place-items-center rounded-xl border border-dashed border-blue-200 bg-blue-50/50 text-center text-xs font-bold text-blue-700">Live GPS map integration<br/>coming in a future phase</div></InfoPanel></aside></div><ShipmentEventHistory events={events}/><ShipmentCommunications communications={communications}/><ShipmentDocuments documents={documents} trackingNumber={shipment.tracking_number}/><div className="grid gap-3 lg:grid-cols-2"><InfoPanel title="Receiver Information"><Info label="Receiver" value={shipment.receiver_name}/><Info label="Phone" value={shipment.receiver_phone}/><Info label="Email" value={shipment.receiver_email}/><Info label="Address" value={shipment.receiver_address}/></InfoPanel><InfoPanel title="Package Information"><Info label="Description" value={shipment.item_description}/><Info label="Weight" value={shipment.weight_kg == null ? null : `${shipment.weight_kg} kg`}/><Info label="Quantity" value={shipment.package_count == null ? null : `${shipment.package_count} ${shipment.package_type ?? "packages"}`}/><Info label="Payment Status" value="Not provided"/></InfoPanel></div></div>}</section></div>;
}

function DetailsSkeleton() { return <div className="grid animate-pulse gap-3 p-5"><div className="grid gap-3 sm:grid-cols-4">{[1,2,3,4].map((item) => <div key={item} className="h-24 rounded-xl bg-slate-200"/>)}</div><div className="h-80 rounded-xl bg-slate-200"/><div className="h-44 rounded-xl bg-slate-200"/></div>; }
function SummaryCard({ label, value }: { label: string; value: string }) { return <article className="rounded-xl border border-slate-200/70 bg-white p-3.5 shadow-sm"><p className="text-[0.58rem] font-black uppercase tracking-wider text-blue-600">{label}</p><p className="mt-1 text-sm font-black text-slate-900">{value}</p></article>; }
function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) { return <section className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm"><h3 className="mb-3 text-sm font-black text-[#071a33]">{title}</h3><dl className="grid gap-2.5">{children}</dl></section>; }
function Info({ label, value }: { label: string; value: string | null | undefined }) { return <div><dt className="text-[0.58rem] font-black uppercase tracking-wider text-slate-400">{label}</dt><dd className="mt-0.5 text-xs font-bold text-slate-700">{value || "Not provided"}</dd></div>; }
function formatDate(value: string | null) { if (!value) return "To be confirmed"; const date = new Date(value.includes("T") ? value : `${value}T00:00:00`); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date); }
