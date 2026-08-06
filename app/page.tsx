"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState } from "react";
import { supabase } from "./lib/supabase";

type Shipment = {
  tracking_number: string;
  shipment_status: string | null;
  current_location: string | null;
  origin_country: string;
  destination_country: string;
  courier_name: string | null;
  estimated_delivery: string | null;
  transport_mode: string | null;
  cargo_type?: string | null;
  commodity?: string | null;
  quantity?: number | null;
  unit?: string | null;
  container_number?: string | null;
  next_checkpoint?: string | null;
};

export default function Home() {
  const [trackingNumber, setTrackingNumber] = useState("");
  const [shipment, setShipment] = useState<Shipment | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);

  async function searchShipment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = trackingNumber.trim();
    if (!query) { setMessage("Enter a tracking number to continue."); setShipment(null); return; }
    setLoading(true); setMessage("");
    const { data, error } = await supabase.from("shipments").select("*").eq("tracking_number", query).single();
    if (error) { setShipment(null); setMessage("No shipment found with that tracking number."); }
    else { setShipment(data as Shipment); }
    setLoading(false);
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f5f7fa] text-slate-950">
      <section className="relative isolate min-h-[54rem] overflow-hidden bg-[#1676b5] text-white sm:min-h-[56rem] lg:min-h-[52rem]">
        <Image src="/balo-port-hero.webp" alt="Container vessel, cargo cranes, and aircraft at a global port in daylight" fill priority sizes="100vw" className="object-cover object-[62%_center]" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,43,82,.78)_0%,rgba(12,91,151,.5)_42%,rgba(67,155,211,.16)_72%,rgba(255,214,96,.06)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,49,89,.3)_0%,transparent_35%,rgba(5,44,78,.38)_100%)]" />
        <WorldOverlay />

        <header className="relative z-20 border-b border-white/20 bg-[#07558f]/40 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
            <Brand />
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary navigation">
              <NavLink href="#home" active>Home</NavLink><NavLink href="#services">Services</NavLink><NavLink href="/track">Track Shipment</NavLink><NavLink href="#contact">Contact</NavLink>
              <Link href="/login" className="ml-3 rounded-xl bg-[#f6c945] px-5 py-3 text-sm font-black text-[#071a33] shadow-lg shadow-amber-950/20 transition hover:-translate-y-0.5 hover:bg-[#ffd968] focus:outline-none focus:ring-4 focus:ring-yellow-300/40">Admin Login</Link>
            </nav>
            <button type="button" onClick={() => setMenuOpen((value) => !value)} aria-expanded={menuOpen} aria-label="Toggle navigation" className="grid h-11 w-11 place-items-center rounded-xl border border-white/20 bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#f6c945] lg:hidden"><MenuIcon open={menuOpen}/></button>
          </div>
          {menuOpen && <nav className="border-t border-white/15 bg-[#07558f]/95 px-4 py-4 lg:hidden" aria-label="Mobile navigation"><div className="mx-auto grid max-w-7xl gap-1"><NavLink href="#home" active>Home</NavLink><NavLink href="#services">Services</NavLink><NavLink href="/track">Track Shipment</NavLink><NavLink href="#contact">Contact</NavLink><Link href="/login" className="mt-2 rounded-xl bg-[#f6c945] px-4 py-3 text-center text-sm font-black text-[#071a33]">Admin Login</Link></div></nav>}
        </header>

        <div id="home" className="relative z-10 mx-auto grid max-w-7xl gap-12 px-4 pb-20 pt-20 sm:px-6 sm:pt-24 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:px-8 lg:pb-28 lg:pt-32">
          <div className="home-reveal max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-yellow-300/25 bg-yellow-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.2em] text-yellow-200 backdrop-blur"><span className="h-2 w-2 rounded-full bg-[#f6c945] shadow-[0_0_0_5px_rgba(246,201,69,.15)]"/>Moving business forward</div>
            <h1 className="mt-7 text-5xl font-black leading-[.98] tracking-[-0.055em] text-white sm:text-6xl lg:text-[5rem]">Logistics without borders.</h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-blue-100 sm:text-xl">Connected air, ocean, and road freight solutions engineered to move your cargo securely across the world.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><a href="#tracking" className="inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#f6c945] px-7 font-black text-[#071a33] shadow-xl shadow-amber-950/20 transition hover:-translate-y-0.5 hover:bg-[#ffd968] focus:outline-none focus:ring-4 focus:ring-yellow-300/40">Track your shipment<ArrowIcon /></a><a href="#services" className="inline-flex min-h-14 items-center justify-center rounded-xl border border-white/25 bg-white/10 px-7 font-extrabold text-white backdrop-blur transition hover:bg-white/15 focus:outline-none focus:ring-4 focus:ring-white/20">Explore our services</a></div>
            <ul className="mt-10 flex flex-wrap gap-x-7 gap-y-3 text-sm font-bold text-blue-100"><li className="flex items-center gap-2"><CheckIcon/>Global network</li><li className="flex items-center gap-2"><CheckIcon/>End-to-end visibility</li><li className="flex items-center gap-2"><CheckIcon/>Secure handling</li></ul>
          </div>

          <form id="tracking" onSubmit={searchShipment} className="home-reveal home-reveal-delay rounded-[2rem] border border-white/40 bg-[#07558f]/42 p-5 shadow-[0_35px_90px_-28px_rgba(3,44,78,.55)] backdrop-blur-2xl sm:p-7 lg:p-8">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-300">Live shipment visibility</p><h2 className="mt-2 text-3xl font-black tracking-tight text-white">Track your shipment</h2><p className="mt-3 text-sm leading-6 text-blue-100">Enter your Balo Logistics tracking number for the latest status and location.</p>
            <label htmlFor="home-tracking-number" className="mt-7 block text-xs font-extrabold uppercase tracking-[0.14em] text-blue-100">Tracking number</label>
            <div className="relative mt-2"><PackageIcon className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#dcae22]"/><input id="home-tracking-number" value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} placeholder="Enter tracking number" autoComplete="off" className="h-16 w-full rounded-xl border border-white/30 bg-white/95 pl-12 pr-4 text-base font-bold uppercase tracking-wide text-[#071a33] outline-none transition placeholder:font-normal placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-400 focus:border-[#f6c945] focus:ring-4 focus:ring-yellow-300/30"/></div>
            <button type="submit" disabled={loading} className="mt-3 inline-flex h-16 w-full items-center justify-center gap-2 rounded-xl bg-[#f6c945] px-6 font-black text-[#071a33] shadow-lg shadow-amber-950/20 transition hover:-translate-y-0.5 hover:bg-[#ffd968] focus:outline-none focus:ring-4 focus:ring-yellow-300/40 disabled:cursor-wait disabled:opacity-70 disabled:hover:translate-y-0">{loading ? <><SpinnerIcon/>Searching securely</> : <>Track Shipment<ArrowIcon/></>}</button>
            <div aria-live="polite">{message && <p role="status" className="mt-4 rounded-xl border border-red-300/30 bg-red-950/45 px-4 py-3 text-sm font-semibold text-red-100">{message}</p>}</div>
            {shipment && <ShipmentResult shipment={shipment}/>}<p className="mt-5 flex items-center gap-2 text-xs text-blue-100"><LockIcon/>Secure, real-time shipment lookup</p>
          </form>
        </div>

        <div className="absolute inset-x-0 bottom-0 z-10 border-t border-white/15 bg-[#07558f]/58 backdrop-blur-md"><div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/15 px-4 sm:grid-cols-4 sm:px-6 lg:px-8"><Metric value="30+" label="Trade routes"/><Metric value="24/7" label="Shipment visibility"/><Metric value="Air + Sea" label="Multimodal freight"/><Metric value="Global" label="Delivery network"/></div></div>
      </section>

      <section id="services" className="bg-white px-4 py-20 sm:px-6 lg:px-8 lg:py-28"><div className="mx-auto max-w-7xl"><p className="text-xs font-black uppercase tracking-[0.2em] text-[#b88a00]">Connected logistics</p><div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between"><h2 className="max-w-2xl text-4xl font-black tracking-[-0.04em] text-[#071a33] sm:text-5xl">One partner. Every mode. Every milestone.</h2><p className="max-w-xl text-base leading-7 text-slate-600">From urgent air cargo to high-volume ocean freight, Balo coordinates the route, documentation, and visibility your supply chain needs.</p></div><div className="mt-12 grid gap-5 md:grid-cols-3"><ServiceCard title="Air Freight" text="Time-critical cargo moved through dependable international air networks." icon={<PlaneIcon/>}/><ServiceCard title="Ocean Freight" text="Flexible containerized shipping for reliable global reach and scale." icon={<ShipIcon/>}/><ServiceCard title="Door-to-Door" text="Coordinated pickup, customs support, and final-mile delivery." icon={<TruckIcon/>}/></div></div></section>
      <section id="contact" className="bg-[#071a33] px-4 py-16 text-white sm:px-6 lg:px-8"><div className="mx-auto flex max-w-7xl flex-col gap-8 lg:flex-row lg:items-center lg:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.2em] text-yellow-300">A world in motion</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Ready to move your next shipment?</h2><p className="mt-3 max-w-2xl text-blue-200">Talk to Balo Logistics about a secure, connected freight solution built around your route.</p></div><Link href="/track" className="inline-flex min-h-14 w-fit items-center justify-center gap-2 rounded-xl bg-[#f6c945] px-7 font-black text-[#071a33] transition hover:bg-[#ffd968]">Start tracking<ArrowIcon/></Link></div></section>
    </main>
  );
}

function ShipmentResult({ shipment }: { shipment: Shipment }) { return <div className="mt-5 rounded-2xl border border-white/20 bg-[#041326]/75 p-5 text-left text-white"><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-[0.16em] text-yellow-300">Shipment found</p><span className="rounded-full bg-blue-500/20 px-3 py-1 text-xs font-bold text-blue-100">{shipment.shipment_status || "Status pending"}</span></div><p className="mt-2 break-all text-xl font-black">{shipment.tracking_number}</p><div className="mt-4 grid gap-3 text-sm sm:grid-cols-2"><ResultItem label="Current location" value={shipment.current_location}/><ResultItem label="Route" value={`${shipment.origin_country} → ${shipment.destination_country}`}/><ResultItem label="Transport" value={shipment.transport_mode}/><ResultItem label="Courier" value={shipment.courier_name}/></div><Link href="/track" className="mt-5 inline-flex items-center gap-2 text-sm font-black text-yellow-300 hover:text-yellow-200">View complete tracking details<ArrowIcon/></Link></div>; }
function ResultItem({ label, value }: { label: string; value: string | null }) { if (!value) return null; return <div><p className="text-[0.62rem] font-extrabold uppercase tracking-wider text-blue-300">{label}</p><p className="mt-1 font-bold">{value}</p></div>; }
function Metric({ value, label }: { value: string; label: string }) { return <div className="px-3 py-5 text-center sm:px-5"><p className="text-lg font-black text-yellow-300 sm:text-xl">{value}</p><p className="mt-1 text-[0.65rem] font-bold uppercase tracking-wider text-blue-200">{label}</p></div>; }
function ServiceCard({ title, text, icon }: { title: string; text: string; icon: React.ReactNode }) { return <article className="group rounded-[1.75rem] border border-slate-200 bg-[#f8fafc] p-7 transition hover:-translate-y-1 hover:border-yellow-300 hover:bg-white hover:shadow-[0_24px_60px_-32px_rgba(15,23,42,.35)]"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-[#071a33] text-[#f6c945] shadow-lg shadow-blue-950/15">{icon}</span><h3 className="mt-6 text-xl font-black text-[#071a33]">{title}</h3><p className="mt-3 text-sm leading-6 text-slate-600">{text}</p><span className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[#987200]">Explore service<ArrowIcon/></span></article>; }
function NavLink({ href, children, active = false }: { href: string; children: React.ReactNode; active?: boolean }) { return <Link href={href} className={`rounded-xl px-4 py-2.5 text-sm font-extrabold transition focus:outline-none focus:ring-2 focus:ring-[#f6c945] ${active ? "bg-[#f6c945]/15 text-yellow-300" : "text-white hover:bg-white/10"}`}>{children}</Link>; }
function Brand() { return <Link href="/" className="flex items-center gap-3" aria-label="Balo Logistics home"><span className="relative grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-[#f6c945] text-xl font-black text-[#071a33] shadow-lg shadow-black/20">B<span aria-hidden="true" className="absolute -bottom-2 -right-2 h-7 w-9 -rotate-[28deg] rounded-full border-2 border-[#071a33]/35"/></span><span><strong className="block text-xl font-black tracking-tight">Balo Logistics</strong><span className="block text-[0.62rem] font-extrabold uppercase tracking-[0.18em] text-blue-200">Fast • Secure • Reliable</span></span></Link>; }
function WorldOverlay() { return <svg aria-hidden="true" viewBox="0 0 1200 600" className="absolute inset-0 h-full w-full opacity-[0.13]"><g fill="none" stroke="#93c5fd" strokeWidth="1"><ellipse cx="600" cy="300" rx="430" ry="210"/><path d="M170 300h860M230 205h740M230 395h740M600 90c-130 110-130 310 0 420M600 90c130 110 130 310 0 420"/></g><g fill="#f6c945"><circle cx="280" cy="255" r="5"/><circle cx="510" cy="330" r="5"/><circle cx="780" cy="235" r="5"/><circle cx="920" cy="365" r="5"/></g><g fill="none" stroke="#f6c945" strokeDasharray="7 8"><path className="global-route" d="M280 255Q400 170 510 330T780 235T920 365"/></g></svg>; }
function SvgIcon({ children, className = "h-5 w-5" }: { children: React.ReactNode; className?: string }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>{children}</svg>; }
function MenuIcon({ open }: { open: boolean }) { return <SvgIcon>{open ? <><path d="m6 6 12 12M18 6 6 18"/></> : <><path d="M4 7h16M4 12h16M4 17h16"/></>}</SvgIcon>; }
function ArrowIcon() { return <SvgIcon className="h-4 w-4"><path d="m9 18 6-6-6-6"/></SvgIcon>; }
function CheckIcon() { return <SvgIcon className="h-4 w-4 text-yellow-300"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></SvgIcon>; }
function PackageIcon({ className = "h-5 w-5" }: { className?: string }) { return <SvgIcon className={className}><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></SvgIcon>; }
function LockIcon() { return <SvgIcon className="h-4 w-4 text-yellow-300"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></SvgIcon>; }
function SpinnerIcon() { return <SvgIcon className="h-5 w-5 animate-spin"><path d="M21 12a9 9 0 1 1-5.2-8.2"/></SvgIcon>; }
function PlaneIcon() { return <SvgIcon className="h-7 w-7"><path d="m2 16 20-8-6 7 5 3-19-1 5-2Z"/></SvgIcon>; }
function ShipIcon() { return <SvgIcon className="h-7 w-7"><path d="M3 15h18l-3 5H7Z"/><path d="M7 15V8h10v7M10 8V4h4v4M3 21c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/></SvgIcon>; }
function TruckIcon() { return <SvgIcon className="h-7 w-7"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></SvgIcon>; }
