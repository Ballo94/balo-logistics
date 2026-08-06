"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import ShipmentTimeline from "../ShipmentTimeline";

const ShipmentMap = dynamic(() => import("../components/ShipmentMap"), {
  ssr: false,
  loading: () => <div className="h-[22rem] animate-pulse rounded-[1.5rem] border border-slate-200 bg-slate-200/70 sm:h-[28rem] lg:col-span-2" />,
});

type Shipment = {
  id: number;
  tracking_number: string;
  client_name: string;
  origin_country: string;
  destination_country: string;
  current_location: string | null;
  shipment_status: string | null;
  transport_mode: string | null;
  estimated_delivery: string | null;
  item_description: string | null;
};

type ShipmentHistory = {
  id: number;
  status: string;
  location: string | null;
  note: string | null;
  created_at: string;
};

function displayValue(value: string | null | undefined) {
  return value?.trim() || "Not available";
}

function displayDate(value: string | null) {
  if (!value) return "Not available";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

function statusBadgeClass(status: string | null) {
  const value = status?.trim().toLowerCase() ?? "";
  if (/delivered|complete/.test(value)) return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (/delayed|issue|exception/.test(value)) return "bg-red-50 text-red-700 ring-red-600/20";
  if (/out for delivery/.test(value)) return "bg-violet-50 text-violet-700 ring-violet-600/20";
  return "bg-blue-50 text-blue-700 ring-blue-600/20";
}

export default function TrackPage() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [history, setHistory] = useState<ShipmentHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const shipmentId = shipment?.id;

  useEffect(() => {
    if (!shipmentId) return;

    const channel = supabase
      .channel(`customer-tracking-${shipmentId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "shipments", filter: `id=eq.${shipmentId}` },
        (payload) => setShipment((current) => current ? { ...current, ...payload.new } as Shipment : current),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "shipment_history", filter: `shipment_id=eq.${shipmentId}` },
        (payload) => setHistory((current) => [payload.new as ShipmentHistory, ...current]),
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [shipmentId]);

  async function searchShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = trackingNumber.trim();

    if (!query) {
      setShipment(null);
      setHistory([]);
      setMessage("Please enter a tracking number.");
      return;
    }

    setLoading(true);
    setMessage("");
    setShipment(null);
    setHistory([]);

    const { data, error } = await supabase
      .from("shipments")
      .select(
        "id, tracking_number, client_name, origin_country, destination_country, current_location, shipment_status, transport_mode, estimated_delivery, item_description"
      )
      .eq("tracking_number", query)
      .maybeSingle();

    if (error) {
      setMessage("We could not retrieve tracking information. Please try again.");
      setLoading(false);
      return;
    }

    if (!data) {
      setMessage("No shipment found with that tracking number.");
      setLoading(false);
      return;
    }

    const typedShipment = data as Shipment;
    const { data: historyData } = await supabase
      .from("shipment_history")
      .select("id, status, location, note, created_at")
      .eq("shipment_id", typedShipment.id)
      .order("created_at", { ascending: false });

    setShipment(typedShipment);
    setHistory((historyData ?? []) as ShipmentHistory[]);
    setLoading(false);
  }

  const details = shipment
    ? [
        ["Tracking Number", shipment.tracking_number],
        ["Client Name", shipment.client_name],
      ]
    : [];

  const isDelivered = shipment?.shipment_status
    ?.trim()
    .toLowerCase()
    .match(/delivered|complete/);

  return (
    <main className="min-h-screen bg-[#f4f6f9] text-slate-950">
      <header className="relative z-20 border-b border-white/10 bg-[#06172d] text-white shadow-lg shadow-slate-950/10">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="group flex items-center gap-3" aria-label="Balo Logistics home">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-white/10 bg-blue-600 shadow-lg shadow-blue-950/30 transition group-hover:-translate-y-0.5 group-hover:bg-blue-500" aria-label="Company logo placeholder">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></svg>
            </span>
            <span>
              <span className="block text-xl font-extrabold tracking-[-0.02em]">Balo Logistics</span>
              <span className="block text-[0.65rem] font-bold uppercase tracking-[0.2em] text-blue-200">Fast · Secure · Reliable</span>
            </span>
          </Link>
          <Link href="/" className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-bold text-white transition hover:border-white/20 hover:bg-white/10">
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="m15 18-6-6 6-6" /></svg>
            <span className="hidden sm:inline">Back to home</span><span className="sm:hidden">Home</span>
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#082952] px-4 pb-36 pt-20 text-white sm:px-6 sm:pb-40 sm:pt-24 lg:px-8 lg:pb-44 lg:pt-28">
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(115deg,rgba(37,99,235,0.56),transparent_52%,rgba(6,20,40,0.62))]" />
        <div aria-hidden="true" className="absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:44px_44px]" />
        <div aria-hidden="true" className="absolute -right-20 -top-44 h-[32rem] w-[32rem] rounded-full border-[90px] border-white/[0.04]" />
        <div aria-hidden="true" className="absolute -bottom-44 -left-36 h-96 w-96 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="track-reveal relative mx-auto max-w-4xl text-center">
          <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-950/30 px-4 py-2 text-xs font-extrabold uppercase tracking-[0.2em] text-blue-100 backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-orange-400 shadow-[0_0_0_5px_rgba(251,146,60,0.15)]" /> Live shipment tracking
          </div>
          <h1 className="text-4xl font-black leading-[1.02] tracking-[-0.05em] sm:text-6xl lg:text-[4.75rem]">Track every mile.<br className="hidden sm:block" /> Trust every delivery.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-blue-100/90 sm:text-lg">
            Real-time global shipment visibility from origin to final delivery, powered by Balo Logistics.
          </p>
        </div>
      </section>

      <div className="relative mx-auto -mt-24 max-w-7xl px-4 pb-24 sm:px-6 lg:px-8">
        <form onSubmit={searchShipment} className="track-reveal track-reveal-delay rounded-[1.75rem] border border-white bg-white p-5 shadow-[0_28px_75px_-22px_rgba(15,23,42,0.35)] sm:p-8 lg:p-9">
          <div className="mb-3 flex items-center justify-between gap-4">
            <label htmlFor="tracking-number" className="block text-sm font-extrabold text-slate-800">Tracking Number</label>
            <span className="hidden items-center gap-2 text-xs font-semibold text-slate-400 sm:inline-flex"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-emerald-500"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg>Secure real-time lookup</span>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-blue-600">
                <path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" strokeWidth="1.8" strokeLinejoin="round" />
                <circle cx="7" cy="18" r="2" strokeWidth="1.8" /><circle cx="18" cy="18" r="2" strokeWidth="1.8" />
              </svg>
              <input
                id="tracking-number"
                type="text"
                value={trackingNumber}
                onChange={(event) => setTrackingNumber(event.target.value)}
                placeholder="Enter your tracking number"
                autoComplete="off"
                className="h-[4.5rem] w-full rounded-2xl border border-slate-200 bg-slate-50/80 pl-14 pr-5 text-lg font-semibold tracking-wide outline-none transition placeholder:font-normal placeholder:tracking-normal placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <button type="submit" disabled={loading} className="inline-flex h-[4.5rem] min-w-48 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-9 text-base font-extrabold text-white shadow-lg shadow-blue-600/25 transition hover:-translate-y-0.5 hover:bg-blue-700 hover:shadow-xl focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0">
              {loading ? "Tracking..." : "Track shipment"}
              {!loading && <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5"><path d="m9 18 6-6-6-6" /></svg>}
            </button>
          </div>
          <p className="mt-3.5 flex items-center gap-2 text-sm text-slate-500"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-slate-400"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/></svg>Your tracking number appears on your shipment confirmation.</p>
        </form>

        {message && (
          <div role="status" className={`mt-6 rounded-xl border px-5 py-4 text-center font-semibold ${message === "No shipment found with that tracking number." ? "border-amber-200 bg-amber-50 text-amber-800" : "border-red-200 bg-red-50 text-red-700"}`}>
            {message}
          </div>
        )}

        {shipment && (
          <div className="mt-10 space-y-7" aria-live="polite">
            <section className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-[0_18px_45px_-22px_rgba(15,23,42,0.28)]">
              <div className="relative overflow-hidden border-b-4 border-blue-600 bg-[#071a33] p-6 text-white sm:p-7">
                <div aria-hidden="true" className="absolute -right-10 -top-16 h-40 w-40 rounded-full border-[28px] border-white/[0.04]" />
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="relative">
                    <p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-300">Shipment details</p>
                    <h2 className="mt-2 break-all text-2xl font-extrabold tracking-[-0.02em]">{shipment.tracking_number}</h2>
                  </div>
                  {isDelivered && (
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white shadow-sm">
                      <span aria-hidden="true">✓</span> Delivered
                    </span>
                  )}
                </div>
              </div>
              <dl className="divide-y divide-slate-100 px-6 sm:px-7">
                {details.map(([label, value]) => (
                  <div key={label} className="grid gap-1.5 py-[1.1rem] sm:grid-cols-[9rem_1fr] sm:items-baseline sm:gap-4">
                    <dt className="text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">{label}</dt>
                    <dd className="break-words font-bold text-slate-800 sm:text-right">{value}</dd>
                  </div>
                ))}
                <div className="grid gap-2 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
                  <dt className="text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-slate-400">Shipment Status</dt>
                  <dd className="sm:text-right">
                    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ring-1 ring-inset ${statusBadgeClass(shipment.shipment_status)}`}>
                      {displayValue(shipment.shipment_status)}
                    </span>
                  </dd>
                </div>
              </dl>
            </section>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-12">
              <InfoCard title="Route Information" eyebrow="Global route" className="xl:col-span-5" icon={<RouteIcon />}>
                <div className="mt-1 flex items-center gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-950 text-xs font-black text-white">A</span><div className="min-w-0"><p className="text-[0.65rem] font-extrabold uppercase tracking-wider text-slate-400">Origin Country</p><p className="mt-1 truncate font-bold text-slate-800">{shipment.origin_country}</p></div></div>
                <div className="ml-5 h-8 border-l-2 border-dashed border-blue-300" />
                <div className="flex items-center gap-4"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-xs font-black text-white">B</span><div className="min-w-0"><p className="text-[0.65rem] font-extrabold uppercase tracking-wider text-slate-400">Destination Country</p><p className="mt-1 truncate font-bold text-slate-800">{shipment.destination_country}</p></div></div>
              </InfoCard>

              <InfoCard title="Estimated Delivery" eyebrow="Delivery target" className="xl:col-span-3" icon={<CalendarIcon />} featured>
                <p className="mt-4 text-2xl font-black tracking-tight text-slate-950">{displayDate(shipment.estimated_delivery)}</p><p className="mt-2 text-sm leading-6 text-slate-500">Latest estimated arrival based on the current shipment plan.</p>
              </InfoCard>

              <InfoCard title="Current Location" eyebrow="Live position" className="xl:col-span-4" icon={<LocationIcon />}>
                <p className="mt-4 text-xl font-black text-slate-900">{displayValue(shipment.current_location)}</p><div className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-extrabold text-blue-700"><span className="h-2 w-2 animate-pulse rounded-full bg-blue-600" />Latest reported location</div>
              </InfoCard>

              <InfoCard title="Transport Information" eyebrow="Freight mode" className="xl:col-span-6" icon={<TransportIcon />}>
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[0.65rem] font-extrabold uppercase tracking-wider text-slate-400">Transport Mode</p><p className="mt-1 text-xl font-black text-slate-900">{displayValue(shipment.transport_mode)}</p></div><span className="w-fit rounded-xl bg-blue-50 px-4 py-3 text-sm font-extrabold text-blue-700">{shipment.transport_mode?.toLowerCase() === "sea" ? "Ocean Freight" : shipment.transport_mode?.toLowerCase() === "air" ? "Air Freight" : "Freight Service"}</span></div>
              </InfoCard>

              <InfoCard title="Cargo Information" eyebrow="Consignment contents" className="xl:col-span-6" icon={<CargoIcon />}>
                <p className="mt-4 text-lg font-black text-slate-900">{displayValue(shipment.item_description)}</p><p className="mt-2 text-sm leading-6 text-slate-500">Cargo description recorded against this tracking number.</p>
              </InfoCard>
            </div>

            <ShipmentTimeline shipmentStatus={shipment.shipment_status} history={history} />

            <ShipmentMap
              origin={shipment.origin_country}
              currentLocation={shipment.current_location}
              destination={shipment.destination_country}
            />
          </div>
        )}
      </div>
    </main>
  );
}

function InfoCard({ title, eyebrow, icon, className, featured = false, children }: { title: string; eyebrow: string; icon: React.ReactNode; className: string; featured?: boolean; children: React.ReactNode }) {
  return <article className={`rounded-[1.5rem] border p-6 shadow-[0_16px_40px_-24px_rgba(15,23,42,0.25)] ${featured ? "border-blue-200 bg-gradient-to-br from-blue-50 to-white" : "border-slate-200/80 bg-white"} ${className}`}><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-blue-50 text-blue-700">{icon}</span><div><p className="text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">{eyebrow}</p><h3 className="mt-0.5 text-lg font-black tracking-tight text-slate-900">{title}</h3></div></div><div className="mt-5">{children}</div></article>;
}

function CardIcon({ children }: { children: React.ReactNode }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">{children}</svg>;
}

function RouteIcon() { return <CardIcon><circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18h3a2 2 0 0 0 2-2V8a2 2 0 0 1 2-2h3"/></CardIcon>; }
function CalendarIcon() { return <CardIcon><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></CardIcon>; }
function LocationIcon() { return <CardIcon><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></CardIcon>; }
function TransportIcon() { return <CardIcon><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></CardIcon>; }
function CargoIcon() { return <CardIcon><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></CardIcon>; }
