"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import ShipmentTimeline from "../ShipmentTimeline";
import { shipmentProgress } from "../lib/shipment-status";
import { supabase } from "../lib/supabase";

type Shipment = {
  id: number; tracking_number: string; client_name: string; origin_country: string; destination_country: string;
  current_location: string | null; shipment_status: string | null; transport_mode: string | null;
  estimated_delivery: string | null; item_description: string | null; created_at: string;
  courier_name: string | null; weight_kg: number | null; package_count: number | null; package_type: string | null;
  declared_value: number | null; receiver_name: string | null; receiver_phone: string | null; receiver_address: string | null;
};
type ShipmentHistory = { id: number; status: string; location: string | null; note: string | null; created_at: string };

function hasValue(value: unknown): value is string | number { return value !== null && value !== undefined && String(value).trim() !== ""; }
function formatDate(value: string | null | undefined, includeTime = false) {
  if (!value) return "";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", includeTime ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" } : { day: "2-digit", month: "long", year: "numeric" }).format(date);
}
function money(value: number) { return new Intl.NumberFormat("en", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(value); }

export default function TrackPage() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [history, setHistory] = useState<ShipmentHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const shipmentId = shipment?.id;

  const loadShipment = useCallback(async (query: string) => {
    setLoading(true); setMessage(""); setShipment(null); setHistory([]);
    const { data, error } = await supabase.from("shipments")
      .select("id, tracking_number, client_name, origin_country, destination_country, current_location, shipment_status, transport_mode, estimated_delivery, item_description, created_at, courier_name, weight_kg, package_count, package_type, declared_value, receiver_name, receiver_phone, receiver_address")
      .eq("tracking_number", query).maybeSingle();
    if (error) { setMessage("We could not retrieve tracking information. Please try again."); setLoading(false); return; }
    if (!data) { setMessage("No shipment found with that tracking number."); setLoading(false); return; }
    const typedShipment = data as Shipment;
    const { data: historyData } = await supabase.from("shipment_history").select("id, status, location, note, created_at").eq("shipment_id", typedShipment.id).order("created_at", { ascending: false });
    setShipment(typedShipment); setHistory((historyData ?? []) as ShipmentHistory[]); setLoading(false);
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get("tracking")?.trim();
    if (!query) return;
    const timer = window.setTimeout(() => {
      setTrackingNumber(query);
      void loadShipment(query);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadShipment]);

  useEffect(() => {
    if (!shipmentId) return;
    const channel = supabase.channel(`customer-tracking-${shipmentId}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "shipments", filter: `id=eq.${shipmentId}` }, (payload) => setShipment((current) => current ? { ...current, ...payload.new } as Shipment : current))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "shipment_history", filter: `shipment_id=eq.${shipmentId}` }, (payload) => setHistory((current) => [payload.new as ShipmentHistory, ...current]))
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [shipmentId]);

  async function searchShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = trackingNumber.trim();
    if (!query) { setShipment(null); setHistory([]); setMessage("Please enter a tracking number to continue."); return; }
    window.history.replaceState(null, "", `/track?tracking=${encodeURIComponent(query)}`);
    await loadShipment(query);
  }

  const latestUpdate = useMemo(() => [...history].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))[0], [history]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f4f7fb] text-slate-950">
      <TrackingHeader open={mobileMenuOpen} onToggle={() => setMobileMenuOpen((value) => !value)} />
      <TrackingHero />

      <div className="relative mx-auto -mt-24 max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <TrackingSearch value={trackingNumber} onChange={setTrackingNumber} onSubmit={searchShipment} loading={loading} />
        <div aria-live="polite" aria-atomic="true">
          {message && <div role="status" className={`mt-6 flex items-start gap-3 rounded-2xl border px-5 py-4 font-semibold shadow-sm ${message.startsWith("No shipment") ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-700"}`}><AlertIcon /><span>{message}</span></div>}
        </div>

        {!shipment && !message && <TrackingEmptyState />}

        {shipment && <div className="track-results mt-10 space-y-7" aria-live="polite">
          <ShipmentSummary shipment={shipment} lastUpdated={latestUpdate?.created_at ?? shipment.created_at} />
          <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1.65fr)_minmax(19rem,.75fr)]">
            <ShipmentTimeline shipmentStatus={shipment.shipment_status} history={history} originCountry={shipment.origin_country} destinationCountry={shipment.destination_country} transportMode={shipment.transport_mode} />
            <div className="grid gap-7">
              <LiveStatusCard shipment={shipment} />
              <RouteOverview shipment={shipment} history={history} />
            </div>
          </div>
          <ShipmentInformation shipment={shipment} />
          <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1.4fr)_minmax(20rem,.8fr)]">
            <ShipmentHistoryList history={history} shipment={shipment} />
            <div className="grid gap-7">
              <TrustIndicators shipment={shipment} />
              <SupportCard />
            </div>
          </div>
        </div>}
      </div>
      <TrackingFooter />
    </main>
  );
}

function TrackingHeader({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const links = [["Home", "/"], ["Track Shipment", "/track"], ["Services", "/#services"], ["Contact", "/#contact"]] as const;
  return <header className="absolute inset-x-0 top-0 z-30 border-b border-white/10 bg-[#06172d]/85 text-white backdrop-blur-xl">
    <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8"><Brand />
      <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">{links.map(([label, href]) => <Link key={label} href={href} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300 ${label === "Track Shipment" ? "bg-white/10 text-cyan-200" : "text-blue-50"}`}>{label}</Link>)}<Link href="/login" className="ml-3 rounded-xl border border-white/20 bg-white px-4 py-2.5 text-sm font-extrabold text-[#071a33] transition hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-cyan-300">Admin Login</Link></nav>
      <button type="button" onClick={onToggle} aria-expanded={open} aria-controls="mobile-navigation" aria-label="Toggle navigation" className="grid h-11 w-11 place-items-center rounded-xl border border-white/15 bg-white/5 focus:outline-none focus:ring-2 focus:ring-cyan-300 lg:hidden"><MenuIcon open={open}/></button>
    </div>
    {open && <nav id="mobile-navigation" className="border-t border-white/10 bg-[#06172d] px-4 py-4 lg:hidden" aria-label="Mobile navigation"><div className="mx-auto grid max-w-7xl gap-1">{links.map(([label, href]) => <Link key={label} href={href} className="rounded-xl px-4 py-3 text-sm font-bold text-blue-50 hover:bg-white/10">{label}</Link>)}<Link href="/login" className="mt-2 rounded-xl bg-white px-4 py-3 text-center text-sm font-extrabold text-[#071a33]">Admin Login</Link></div></nav>}
  </header>;
}

function TrackingHero() { return <section className="relative overflow-hidden bg-[#071e3b] px-4 pb-40 pt-40 text-white sm:px-6 sm:pb-44 sm:pt-44 lg:px-8 lg:pb-48 lg:pt-48">
  <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_75%_25%,rgba(14,165,233,.22),transparent_30%),linear-gradient(115deg,rgba(37,99,235,.42),transparent_55%,rgba(2,12,27,.7))]" />
  <div aria-hidden="true" className="absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,.65)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.65)_1px,transparent_1px)] [background-size:48px_48px]" />
  <svg aria-hidden="true" viewBox="0 0 600 280" className="absolute right-[-8rem] top-24 hidden w-[44rem] opacity-25 lg:block"><path d="M15 205C150 50 340 255 570 38" fill="none" stroke="#38bdf8" strokeWidth="2" strokeDasharray="8 10"/><circle cx="15" cy="205" r="7" fill="#f97316"/><circle cx="300" cy="157" r="6" fill="#38bdf8"/><circle cx="570" cy="38" r="7" fill="#34d399"/></svg>
  <div className="track-reveal relative mx-auto max-w-5xl text-center"><div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-blue-950/35 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-cyan-100 backdrop-blur"><span className="h-2 w-2 animate-pulse rounded-full bg-orange-400"/>Live shipment tracking</div><h1 className="text-4xl font-black leading-[1.02] tracking-[-0.05em] sm:text-6xl lg:text-[4.8rem]">Your shipment, in sight.</h1><p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-blue-100/90 sm:text-lg">Real-time visibility across every stage of your shipment—from collection and customs to final delivery.</p>
    <ul className="mx-auto mt-8 flex max-w-4xl flex-wrap justify-center gap-x-6 gap-y-3 text-sm font-semibold text-blue-100">{["Secure tracking", "International logistics", "Air and sea freight", "Door-to-door delivery"].map((item) => <li key={item} className="flex items-center gap-2"><CheckCircleIcon />{item}</li>)}</ul>
  </div>
</section>; }

function TrackingSearch({ value, onChange, onSubmit, loading }: { value: string; onChange: (value: string) => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; loading: boolean }) { return <form onSubmit={onSubmit} className="track-reveal track-reveal-delay rounded-[1.75rem] border border-white bg-white p-5 shadow-[0_30px_80px_-25px_rgba(15,23,42,.38)] sm:p-8 lg:p-10"><div className="mb-6"><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-blue-600">Global tracking</p><h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">Track your shipment</h2><p className="mt-2 text-sm leading-6 text-slate-500">Enter the tracking number from your shipment confirmation.</p></div><div className="flex flex-col gap-3 sm:flex-row"><label htmlFor="tracking-number" className="sr-only">Tracking number</label><div className="relative flex-1"><TruckIcon className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-600"/><input id="tracking-number" type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder="e.g. BALO123456789" autoComplete="off" className="h-[4.5rem] w-full rounded-2xl border border-slate-200 bg-slate-50 pl-14 pr-5 text-lg font-semibold uppercase tracking-wide outline-none transition placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"/></div><button type="submit" disabled={loading} className="inline-flex h-[4.5rem] min-w-52 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-8 font-extrabold text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0">{loading ? <><SpinnerIcon />Tracking shipment</> : <>Track Shipment<ArrowIcon /></>}</button></div></form>; }

function TrackingEmptyState() { return <section className="track-results mt-8 rounded-[1.75rem] border border-slate-200/80 bg-white px-6 py-12 text-center shadow-[0_18px_50px_-32px_rgba(15,23,42,.3)] sm:px-10 sm:py-16"><span className="mx-auto grid h-20 w-20 place-items-center rounded-3xl bg-blue-50 text-blue-700"><PackageIcon className="h-9 w-9"/></span><h2 className="mt-6 text-2xl font-black tracking-tight text-slate-950">Enter your tracking number to view shipment progress</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">You’ll find it on your booking confirmation, shipping documents, or the latest notification from Balo Logistics.</p><div className="mx-auto mt-7 flex max-w-xl flex-col justify-center gap-3 text-sm font-bold text-slate-600 sm:flex-row"><span className="rounded-xl bg-slate-50 px-4 py-3">Secure real-time lookup</span><span className="rounded-xl bg-slate-50 px-4 py-3">Need help? Contact support</span></div></section>; }

function ShipmentSummary({ shipment, lastUpdated }: { shipment: Shipment; lastUpdated: string }) { return <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_22px_55px_-28px_rgba(15,23,42,.32)]" aria-labelledby="shipment-summary-title"><div className="relative overflow-hidden bg-[#071a33] p-6 text-white sm:p-8 lg:p-10"><div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(246,201,69,.18),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(14,165,233,.22),transparent_48%)]"/><div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-yellow-300">Shipment details</p><h2 id="shipment-summary-title" className="mt-2 break-all text-2xl font-black sm:text-3xl">{shipment.tracking_number}</h2><p className="mt-2 text-sm text-blue-200">Last updated {formatDate(lastUpdated, true)}</p></div><span className={`w-fit rounded-2xl px-5 py-3 text-sm font-black uppercase tracking-wider ring-1 ring-inset ${summaryStatusClasses(shipment.shipment_status)}`}>{shipment.shipment_status || "Pending"}</span></div></div><div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4"><SummaryItem label="Tracking number" value={shipment.tracking_number}/><SummaryItem label="Current status" value={shipment.shipment_status || "Pending"}/><SummaryItem label="Current location" value={shipment.current_location || "Update pending"}/><SummaryItem label="Estimated delivery" value={formatDate(shipment.estimated_delivery) || "To be confirmed"}/><SummaryItem label="Transport mode" value={shipment.transport_mode || "Freight"}/><SummaryItem label="Courier" value={shipment.courier_name || "To be assigned"}/><SummaryItem label="Shipment type" value={shipment.package_type || shipment.item_description || "General cargo"}/><SummaryItem label="Insurance" value={shipment.declared_value == null ? "Not provided" : "Active"}/></div></section>; }

function summaryStatusClasses(status: string | null) { const value = status?.toLowerCase() ?? ""; if (value.includes("delivered")) return "bg-emerald-100 text-emerald-800 ring-emerald-300"; if (value.includes("delay")) return "bg-red-100 text-red-800 ring-red-300"; if (value.includes("pending") || value.includes("created")) return "bg-amber-100 text-amber-900 ring-amber-300"; return "bg-blue-100 text-blue-800 ring-blue-300"; }

function ShipmentInformation({ shipment }: { shipment: Shipment }) { return <section aria-labelledby="shipment-information-title"><SectionHeading eyebrow="Route and cargo" title="Route Information" id="shipment-information-title"/><div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3"><InformationCard icon={<RouteIcon/>} label="Origin" value={shipment.origin_country}/><InformationCard icon={<PinIcon/>} label="Destination" value={shipment.destination_country}/><InformationCard icon={<SupplierIcon/>} label="Supplier" value={shipment.client_name || "Not provided"}/><InformationCard icon={<ReceiverIcon/>} label="Receiver" value={shipment.receiver_name || "Not provided"}/><InformationCard icon={<CargoIcon/>} label="Weight" value={shipment.weight_kg == null ? "Not provided" : `${shipment.weight_kg} kg`}/><InformationCard icon={<PackageIcon/>} label="Quantity" value={shipment.package_count == null ? "Not provided" : `${shipment.package_count}${shipment.package_type ? ` ${shipment.package_type}` : ""}`}/><InformationCard icon={<DimensionsIcon/>} label="Dimensions" value="Not provided"/><InformationCard icon={<ShieldIcon/>} label="Insurance" value={shipment.declared_value == null ? "Not provided" : `Active · ${money(shipment.declared_value)}`}/><InformationCard icon={<TransportIcon/>} label="Transport mode" value={shipment.transport_mode || "Not provided"}/><InformationCard icon={<ContainerIcon/>} label="Container number" value="Not provided"/><InformationCard icon={<SealIcon/>} label="Seal number" value="Not provided"/></div></section>; }

function InformationCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <article className="flex min-w-0 items-start gap-4 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_14px_35px_-26px_rgba(15,23,42,.35)]"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">{icon}</span><div className="min-w-0"><p className="text-[0.64rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className={`mt-1 break-words font-bold ${value === "Not provided" ? "text-slate-400" : "text-slate-800"}`}>{value}</p></div></article>; }

function RouteOverview({ shipment, history }: { shipment: Shipment; history: ShipmentHistory[] }) { const ordered = [...history].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)); const routeValues: (string | null)[] = [shipment.origin_country, ...ordered.map((item) => item.location), shipment.current_location, shipment.destination_country]; const stops = routeValues.filter((stop): stop is string => hasValue(stop)).filter((stop, index, list) => list.findIndex((item) => item.toLowerCase() === stop.toLowerCase()) === index); return <InfoCard eyebrow="Shipment journey" title="Route Overview" icon={<RouteIcon/>}><ol aria-label="Shipment route" className="mt-1">{stops.map((stop, index) => <li key={`${stop}-${index}`} className="relative flex min-h-20 gap-4 last:min-h-0">{index < stops.length - 1 && <span aria-hidden="true" className="absolute left-4 top-9 h-[calc(100%-1rem)] border-l-2 border-dashed border-blue-200"/>}<span className={`relative z-10 mt-0.5 h-8 w-8 shrink-0 rounded-full border-[6px] border-white shadow-[0_0_0_1px_rgba(148,163,184,.35)] ${stop === shipment.current_location ? "bg-amber-400 ring-4 ring-amber-100" : index === stops.length - 1 ? "bg-emerald-500" : "bg-blue-700"}`}/><div className="pb-6"><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">{index === 0 ? "Origin" : index === stops.length - 1 ? "Destination" : stop === shipment.current_location ? "Current location" : `Checkpoint ${index}`}</p><p className="mt-1 font-black text-slate-800">{stop}</p></div></li>)}</ol><p className="mt-3 inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700"><TransportIcon/>{shipment.transport_mode || "Multimodal"} freight</p></InfoCard>; }

function LiveStatusCard({ shipment }: { shipment: Shipment }) { const progress = shipmentProgress(shipment.shipment_status); return <article className="relative overflow-hidden rounded-[1.75rem] border border-blue-900/10 bg-[#071a33] p-6 text-white shadow-[0_22px_55px_-28px_rgba(7,26,51,.7)] sm:p-7"><div aria-hidden="true" className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-blue-500/20 blur-3xl"/><div className="relative"><div className="flex items-start justify-between gap-4"><div><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-yellow-300">Live status</p><h2 className="mt-1 text-xl font-black tracking-tight">Shipment in motion</h2></div><span className="text-4xl font-black tracking-[-0.06em] text-yellow-300">{progress}%</span></div><dl className="mt-6 grid gap-4"><LiveField label="Current location" value={shipment.current_location || "Update pending"}/><LiveField label="Next destination" value={shipment.destination_country}/><LiveField label="Estimated arrival" value={formatDate(shipment.estimated_delivery) || "To be confirmed"}/></dl><div className="mt-6"><div className="flex justify-between text-xs font-bold text-blue-200"><span>Shipment progress</span><span>{progress}% complete</span></div><div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10"><span className="block h-full rounded-full bg-[#f6c945] transition-[width] duration-700" style={{ width: `${progress}%` }}/></div></div></div></article>; }
function LiveField({ label, value }: { label: string; value: string }) { return <div className="border-b border-white/10 pb-3 last:border-0 last:pb-0"><dt className="text-[0.62rem] font-extrabold uppercase tracking-[0.13em] text-blue-300">{label}</dt><dd className="mt-1 break-words font-bold text-white">{value}</dd></div>; }

function ShipmentHistoryList({ history, shipment }: { history: ShipmentHistory[]; shipment: Shipment }) { const updates = history.length ? [...history].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)) : [{ id: -1, status: shipment.shipment_status || "Shipment Created", location: shipment.current_location, note: "Your shipment record has been created. Detailed operational updates will appear here.", created_at: shipment.created_at }]; return <section aria-labelledby="shipment-history-title"><SectionHeading eyebrow="Latest first" title="Shipment History" id="shipment-history-title"/><ol className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_18px_45px_-28px_rgba(15,23,42,.28)]">{updates.map((update, index) => { const date = splitDateTime(update.created_at); return <li key={update.id} className={`grid gap-4 p-5 sm:grid-cols-[8rem_minmax(0,1fr)] sm:p-6 ${index ? "border-t border-slate-100" : ""}`}><div><time dateTime={update.created_at} className="text-sm font-black text-slate-800">{date.date}</time><p className="mt-1 text-xs font-semibold text-slate-400">{date.time}</p></div><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-extrabold text-blue-700">{update.status}</span>{update.location && <span className="inline-flex min-w-0 items-center gap-1.5 text-sm font-semibold text-slate-600"><PinIcon/>{update.location}</span>}</div><p className="mt-2 text-sm leading-6 text-slate-600">{update.note || "Shipment milestone recorded by Balo Logistics."}</p></div></li>; })}</ol></section>; }

function TrustIndicators({ shipment }: { shipment: Shipment }) { const cleared = /custom|clearance|out for delivery|delivered/i.test(shipment.shipment_status || ""); const badges = [{ label: "Shipment Verified", active: true }, { label: "Secure Handling", active: true }, { label: "Customs Cleared", active: cleared }, { label: "Insurance Active", active: shipment.declared_value != null }, { label: "Real-Time Tracking", active: true }]; return <InfoCard eyebrow="Balo assurance" title="Trust Indicators" icon={<ShieldIcon/>}><ul className="grid gap-3">{badges.map((badge) => <li key={badge.label} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold ${badge.active ? "bg-yellow-50 text-[#725600]" : "bg-slate-50 text-slate-500"}`}><span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full ${badge.active ? "bg-[#f6c945] text-[#071a33]" : "bg-slate-300 text-white"}`}><CheckSmallIcon/></span>{badge.label}</li>)}</ul></InfoCard>; }

function SupportCard() { return <InfoCard eyebrow="Customer care" title="Need Help?" icon={<SupportIcon/>}><p className="text-sm leading-6 text-slate-600">Our logistics team can help with shipment documents, delivery questions, and tracking updates.</p><div className="mt-5 grid gap-3"><SupportLink icon={<ChatIcon/>} label="WhatsApp" value="Message our support team"/><SupportLink icon={<MailIcon/>} label="Email" value="Contact customer care"/><SupportLink icon={<PhoneIcon/>} label="Phone" value="Request a callback"/><SupportLink icon={<ClockIcon/>} label="Business Hours" value="Monday–Friday, 08:00–17:00"/></div></InfoCard>; }

function SupportLink({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <Link href="/#contact" className="group flex items-center gap-3 rounded-xl border border-slate-200 px-4 py-3 transition hover:border-blue-300 hover:bg-blue-50/60 focus:outline-none focus:ring-4 focus:ring-blue-100"><span className="text-blue-700">{icon}</span><span className="min-w-0"><span className="block text-xs font-extrabold uppercase tracking-wider text-slate-400">{label}</span><span className="mt-0.5 block text-sm font-bold text-slate-800 group-hover:text-blue-800">{value}</span></span></Link>; }

function SectionHeading({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) { return <div className="mb-5"><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-blue-600">{eyebrow}</p><h2 id={id} className="mt-1 text-2xl font-black tracking-tight text-slate-950">{title}</h2></div>; }
function splitDateTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return { date: value, time: "" }; return { date: new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date), time: new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(date) }; }

function InfoCard({ eyebrow, title, icon, children, className = "" }: { eyebrow: string; title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) { return <article className={`rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,.28)] sm:p-7 ${className}`}><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">{icon}</span><div><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p><h3 className="mt-0.5 text-xl font-black tracking-tight text-slate-950">{title}</h3></div></div><div className="mt-6">{children}</div></article>; }
function SummaryItem({ label, value }: { label: string; value: string }) { return <div className="bg-white px-6 py-5"><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-1.5 truncate font-bold text-slate-800" title={value}>{value}</p></div>; }

function TrackingFooter() { return <footer className="bg-[#06172d] text-white"><div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8"><div><Brand/><p className="mt-4 max-w-sm text-sm leading-6 text-blue-200">Reliable shipment visibility for air, sea, and door-to-door logistics.</p></div><div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-300">Quick links</p><div className="mt-4 grid gap-3 text-sm font-semibold text-blue-100"><Link href="/track">Track Shipment</Link><Link href="/#services">Services</Link><Link href="/#contact">Contact</Link></div></div><div><p className="text-xs font-extrabold uppercase tracking-[0.18em] text-cyan-300">Operations</p><div className="mt-4 grid gap-3 text-sm font-semibold text-blue-100"><Link href="/login">Admin Login</Link><span>International logistics</span><span>Air & sea freight</span></div></div></div><div className="border-t border-white/10 px-4 py-5 text-center text-xs text-blue-300">© {new Date().getFullYear()} Balo Logistics. All rights reserved.</div></footer>; }
function Brand() { return <Link href="/" className="group flex items-center gap-3" aria-label="Balo Logistics home"><span className="relative grid h-11 w-11 place-items-center overflow-hidden rounded-2xl bg-blue-600 text-xl font-black shadow-lg shadow-blue-950/30"><span className="relative z-10">B</span><span aria-hidden="true" className="absolute -bottom-2 -right-2 h-6 w-8 rotate-[-28deg] rounded-full border-2 border-cyan-300"/></span><span><strong className="block text-lg font-extrabold tracking-tight">Balo Logistics</strong><span className="block text-[0.6rem] font-bold uppercase tracking-[0.18em] text-blue-200">Fast • Secure • Reliable</span></span></Link>; }

function SvgIcon({ children, className = "h-5 w-5" }: { children: React.ReactNode; className?: string }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>; }
function MenuIcon({ open }: { open: boolean }) { return <SvgIcon>{open ? <><path d="m6 6 12 12M18 6 6 18"/></> : <><path d="M4 7h16M4 12h16M4 17h16"/></>}</SvgIcon>; }
function CheckCircleIcon() { return <SvgIcon className="h-4 w-4 text-cyan-300"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></SvgIcon>; }
function TruckIcon({ className = "h-5 w-5" }: { className?: string }) { return <SvgIcon className={className}><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></SvgIcon>; }
function ArrowIcon() { return <SvgIcon><path d="m9 18 6-6-6-6"/></SvgIcon>; }
function SpinnerIcon() { return <SvgIcon className="h-5 w-5 animate-spin"><path d="M21 12a9 9 0 1 1-5.2-8.2"/></SvgIcon>; }
function AlertIcon() { return <SvgIcon className="mt-0.5 h-5 w-5 shrink-0"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></SvgIcon>; }
function PackageIcon({ className = "h-5 w-5" }: { className?: string }) { return <SvgIcon className={className}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></SvgIcon>; }
function RouteIcon() { return <SvgIcon><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h3a2 2 0 0 0 2-2V8a2 2 0 0 1 2-2h3"/></SvgIcon>; }
function CargoIcon() { return <PackageIcon/>; }
function PinIcon() { return <SvgIcon><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></SvgIcon>; }
function TransportIcon() { return <SvgIcon className="h-4 w-4"><path d="M4 12h16M14 6l6 6-6 6"/></SvgIcon>; }
function ShieldIcon() { return <SvgIcon><path d="M12 3 4.5 6v5.5c0 4.5 3.1 7.6 7.5 9.5 4.4-1.9 7.5-5 7.5-9.5V6L12 3Z"/><path d="m8.5 12 2.2 2.2 4.8-5"/></SvgIcon>; }
function ReceiverIcon() { return <SvgIcon><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></SvgIcon>; }
function SupplierIcon() { return <SvgIcon><path d="M3 21h18M5 21V8l7-4 7 4v13M9 12h6M9 16h6"/></SvgIcon>; }
function ContainerIcon() { return <SvgIcon><path d="M3 7h18v12H3zM7 7v12M11 7v12M15 7v12M19 7v12"/></SvgIcon>; }
function DimensionsIcon() { return <SvgIcon><path d="M4 7h16v10H4zM4 4v3M20 4v3M7 4H4M20 4h-3M4 20v-3M20 20v-3M7 20H4M20 20h-3"/></SvgIcon>; }
function SealIcon() { return <SvgIcon><circle cx="12" cy="9" r="5"/><path d="m9 13-2 8 5-3 5 3-2-8"/></SvgIcon>; }
function SupportIcon() { return <SvgIcon><path d="M4 13v-1a8 8 0 0 1 16 0v1M4 13a2 2 0 0 0 0 4h2v-6H4v2ZM20 13a2 2 0 0 1 0 4h-2v-6h2v2ZM18 17c0 2-2 3-5 3"/></SvgIcon>; }
function ChatIcon() { return <SvgIcon><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 21l2.1-5.4A8.5 8.5 0 1 1 21 11.5Z"/></SvgIcon>; }
function MailIcon() { return <SvgIcon><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></SvgIcon>; }
function PhoneIcon() { return <SvgIcon><path d="M5 3h4l2 5-2.5 1.8a16 16 0 0 0 5.7 5.7L16 13l5 2v4c0 1.1-.9 2-2 2A16 16 0 0 1 3 5c0-1.1.9-2 2-2Z"/></SvgIcon>; }
function ClockIcon() { return <SvgIcon><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></SvgIcon>; }
function CheckSmallIcon() { return <SvgIcon className="h-3.5 w-3.5"><path d="m5 12 4 4L19 6"/></SvgIcon>; }
