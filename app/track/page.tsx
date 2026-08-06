"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import ShipmentTimeline from "../ShipmentTimeline";
import { shipmentProgress, statusBadgeClasses } from "../lib/shipment-status";
import { supabase } from "../lib/supabase";

const ShipmentMap = dynamic(() => import("../components/ShipmentMap"), { ssr: false, loading: () => <div className="h-[26rem] animate-pulse rounded-[1.75rem] border border-slate-200 bg-slate-200/70" /> });

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
    setLoading(true); setMessage(""); setShipment(null); setHistory([]);
    const { data, error } = await supabase.from("shipments")
      .select("id, tracking_number, client_name, origin_country, destination_country, current_location, shipment_status, transport_mode, estimated_delivery, item_description, created_at, courier_name, weight_kg, package_count, package_type, declared_value, receiver_name, receiver_phone, receiver_address")
      .eq("tracking_number", query).maybeSingle();
    if (error) { setMessage("We could not retrieve tracking information. Please try again."); setLoading(false); return; }
    if (!data) { setMessage("No shipment found with that tracking number."); setLoading(false); return; }
    const typedShipment = data as Shipment;
    const { data: historyData } = await supabase.from("shipment_history").select("id, status, location, note, created_at").eq("shipment_id", typedShipment.id).order("created_at", { ascending: false });
    setShipment(typedShipment); setHistory((historyData ?? []) as ShipmentHistory[]); setLoading(false);
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
          <ShipmentTimeline shipmentStatus={shipment.shipment_status} history={history} />

          <section aria-labelledby="shipment-information-title">
            <div className="mb-5"><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-blue-600">Consignment details</p><h2 id="shipment-information-title" className="mt-1 text-2xl font-black tracking-tight text-slate-950">Shipment Information</h2></div>
            <div className="grid gap-5 lg:grid-cols-2">
              <OverviewCard shipment={shipment} />
              <RouteCard shipment={shipment} />
              <CargoCard shipment={shipment} />
              <DeliveryCard shipment={shipment} />
              {latestUpdate && <LatestUpdateCard update={latestUpdate} />}
            </div>
          </section>

          <ShipmentMap origin={shipment.origin_country} currentLocation={shipment.current_location} destination={shipment.destination_country} transportMode={shipment.transport_mode} />
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

function ShipmentSummary({ shipment, lastUpdated }: { shipment: Shipment; lastUpdated: string }) { const progress = shipmentProgress(shipment.shipment_status); return <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_22px_55px_-28px_rgba(15,23,42,.32)]" aria-labelledby="shipment-summary-title"><div className="relative overflow-hidden bg-[#071a33] p-6 text-white sm:p-8"><div aria-hidden="true" className="absolute right-0 top-0 h-full w-1/2 bg-[radial-gradient(circle_at_top_right,rgba(14,165,233,.22),transparent_55%)]"/><div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-cyan-300">Tracking number</p><h2 id="shipment-summary-title" className="mt-2 break-all text-2xl font-black sm:text-3xl">{shipment.tracking_number}</h2><p className="mt-2 text-sm text-blue-200">Last updated {formatDate(lastUpdated, true)}</p></div><span className={`w-fit rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-wider ring-1 ring-inset ${statusBadgeClasses(shipment.shipment_status)}`}>{shipment.shipment_status || "Shipment Created"}</span></div></div><div className="grid gap-px bg-slate-200 sm:grid-cols-2 lg:grid-cols-4"><SummaryItem label="Current location" value={shipment.current_location || "Update pending"}/><SummaryItem label="Route" value={`${shipment.origin_country} → ${shipment.destination_country}`}/><SummaryItem label="Transport" value={shipment.transport_mode || "Freight"}/><SummaryItem label="Estimated arrival" value={formatDate(shipment.estimated_delivery) || "To be confirmed"}/></div><div className="px-6 py-5 sm:px-8"><div className="flex items-center justify-between text-sm font-bold"><span className="text-slate-700">Overall progress</span><span className="text-blue-700">{progress}%</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-gradient-to-r from-blue-600 via-cyan-500 to-orange-500 transition-[width] duration-700" style={{ width: `${progress}%` }}/></div></div></section>; }

function OverviewCard({ shipment }: { shipment: Shipment }) { return <InfoCard eyebrow="Shipment" title="Shipment Overview" icon={<PackageIcon />}><FieldGrid fields={[["Tracking number", shipment.tracking_number], ["Client name", shipment.client_name], ["Courier", shipment.courier_name], ["Status", shipment.shipment_status]]}/></InfoCard>; }
function RouteCard({ shipment }: { shipment: Shipment }) { return <InfoCard eyebrow="Movement" title="Route" icon={<RouteIcon />}><div className="space-y-0"><RouteStop label="Origin" value={shipment.origin_country}/><RouteStop label="Current location" value={shipment.current_location} active/><RouteStop label="Destination" value={shipment.destination_country} last/></div>{hasValue(shipment.transport_mode) && <p className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-sm font-bold text-blue-700"><TransportIcon />{shipment.transport_mode} freight</p>}</InfoCard>; }
function CargoCard({ shipment }: { shipment: Shipment }) { const fields: [string, unknown][] = [["Description", shipment.item_description], ["Weight", shipment.weight_kg == null ? null : `${shipment.weight_kg} kg`], ["Packages", shipment.package_count], ["Package type", shipment.package_type], ["Declared value", shipment.declared_value == null ? null : money(shipment.declared_value)]]; if (!fields.some(([, value]) => hasValue(value))) return null; return <InfoCard eyebrow="Consignment" title="Cargo Details" icon={<CargoIcon />}><FieldGrid fields={fields}/></InfoCard>; }
function DeliveryCard({ shipment }: { shipment: Shipment }) { const fields: [string, unknown][] = [["Estimated arrival", formatDate(shipment.estimated_delivery)], ["Receiver", shipment.receiver_name], ["Receiver phone", shipment.receiver_phone], ["Delivery address", shipment.receiver_address]]; if (!fields.some(([, value]) => hasValue(value))) return null; return <InfoCard eyebrow="Final mile" title="Delivery" icon={<CalendarIcon />}><FieldGrid fields={fields}/></InfoCard>; }
function LatestUpdateCard({ update }: { update: ShipmentHistory }) { return <InfoCard eyebrow="Live update" title="Latest Update" icon={<PinIcon />} className="lg:col-span-2"><FieldGrid fields={[["Status", update.status], ["Location", update.location], ["Date and time", formatDate(update.created_at, true)], ["Update note", update.note]]}/></InfoCard>; }

function InfoCard({ eyebrow, title, icon, children, className = "" }: { eyebrow: string; title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) { return <article className={`rounded-[1.75rem] border border-slate-200/80 bg-white p-6 shadow-[0_18px_45px_-28px_rgba(15,23,42,.28)] sm:p-7 ${className}`}><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">{icon}</span><div><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p><h3 className="mt-0.5 text-xl font-black tracking-tight text-slate-950">{title}</h3></div></div><div className="mt-6">{children}</div></article>; }
function FieldGrid({ fields }: { fields: [string, unknown][] }) { const visible = fields.filter(([, value]) => hasValue(value)); return <dl className="grid gap-5 sm:grid-cols-2">{visible.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">{label}</dt><dd className="mt-1 break-words font-bold text-slate-800">{String(value)}</dd></div>)}</dl>; }
function RouteStop({ label, value, active = false, last = false }: { label: string; value: string | null; active?: boolean; last?: boolean }) { if (!hasValue(value)) return null; return <div className="relative flex gap-4 pb-6 last:pb-0">{!last && <span aria-hidden="true" className="absolute left-[15px] top-8 h-[calc(100%-1rem)] border-l-2 border-dashed border-slate-200"/>}<span className={`relative z-10 mt-1 h-8 w-8 shrink-0 rounded-full border-4 border-white shadow ${active ? "bg-orange-500 ring-4 ring-orange-100" : last ? "bg-emerald-500" : "bg-slate-950"}`}/><div><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.14em] text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-800">{value}</p></div></div>; }
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
function CalendarIcon() { return <SvgIcon><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></SvgIcon>; }
function PinIcon() { return <SvgIcon><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></SvgIcon>; }
function TransportIcon() { return <SvgIcon className="h-4 w-4"><path d="M4 12h16M14 6l6 6-6 6"/></SvgIcon>; }
