"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import CreateShipment from "../components/CreateShipment";
import ShipmentDocumentCenter from "../components/ShipmentDocumentCenter";
import NotificationCenter from "../components/NotificationCenter";
import { getAdminName, logout } from "../lib/auth";
import type { ShipmentDocumentData } from "../lib/shipment-documents";
import { supabase } from "../lib/supabase";

type Shipment = ShipmentDocumentData & {
  id: number;
  tracking_number: string;
  client_name: string;
  origin_country: string;
  destination_country: string;
  current_location: string | null;
  shipment_status: string | null;
  transport_mode: string | null;
  estimated_delivery: string | null;
  created_at: string;
  courier_name?: string | null;
  item_description?: string | null;
  receiver_name?: string | null;
  receiver_phone?: string | null;
  receiver_address?: string | null;
  weight_kg?: number | null;
  package_count?: number | null;
  package_type?: string | null;
  declared_value?: number | null;
};

type StatusUpdate = {
  id: number;
  shipment_id: number;
  status: string;
  location: string | null;
  note: string | null;
  created_at: string;
};

type SortKey = "tracking_number" | "client_name" | "origin_country" | "destination_country" | "shipment_status" | "transport_mode" | "estimated_delivery" | "created_at";
type SortDirection = "asc" | "desc";

const PAGE_SIZE = 10;

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function formatDate(value: string | null, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", includeTime
    ? { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function statusStyle(status: string | null) {
  const value = normalize(status);
  if (value === "delivered") return "bg-emerald-50 text-emerald-700 ring-emerald-600/20";
  if (value === "delayed" || value === "shipment issue") return "bg-red-50 text-red-700 ring-red-600/20";
  if (value === "out for delivery") return "bg-violet-50 text-violet-700 ring-violet-600/20";
  if (value === "in transit") return "bg-blue-50 text-blue-700 ring-blue-600/20";
  return "bg-amber-50 text-amber-700 ring-amber-600/20";
}

function countBy(items: Shipment[], key: "shipment_status" | "origin_country" | "destination_country" | "transport_mode") {
  const counts = new Map<string, number>();
  items.forEach((item) => {
    const value = item[key]?.trim() || "Not specified";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });
  return [...counts.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

function downloadFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number | null) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

function xmlCell(value: string | number | null) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export default function AdminPage() {
  const router = useRouter();
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [updates, setUpdates] = useState<StatusUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adminName, setAdminName] = useState("Administrator");
  const [documentShipment, setDocumentShipment] = useState<Shipment | null>(null);
  const [filters, setFilters] = useState({ tracking: "", client: "", status: "", origin: "", destination: "", from: "", to: "", mode: "" });
  const [sort, setSort] = useState<{ key: SortKey; direction: SortDirection }>({ key: "created_at", direction: "desc" });
  const [page, setPage] = useState(1);

  useEffect(() => {
    void supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) {
        router.replace("/login");
        return;
      }
      setAdminName(getAdminName(session.user));

      const [shipmentResult, historyResult] = await Promise.all([
        supabase.from("shipments").select("*").order("created_at", { ascending: false }),
        supabase.from("shipment_history").select("id, shipment_id, status, location, note, created_at").order("created_at", { ascending: false }).limit(50),
      ]);

      if (shipmentResult.error) setError(shipmentResult.error.message);
      else setShipments((shipmentResult.data ?? []) as Shipment[]);
      if (!historyResult.error) setUpdates((historyResult.data ?? []) as StatusUpdate[]);
      setLoading(false);
    });
  }, [router]);

  const filteredShipments = useMemo(() => shipments.filter((shipment) => {
    const created = shipment.created_at.slice(0, 10);
    return (!filters.tracking || normalize(shipment.tracking_number).includes(normalize(filters.tracking)))
      && (!filters.client || normalize(shipment.client_name).includes(normalize(filters.client)))
      && (!filters.status || normalize(shipment.shipment_status) === normalize(filters.status))
      && (!filters.origin || normalize(shipment.origin_country).includes(normalize(filters.origin)))
      && (!filters.destination || normalize(shipment.destination_country).includes(normalize(filters.destination)))
      && (!filters.mode || normalize(shipment.transport_mode) === normalize(filters.mode))
      && (!filters.from || created >= filters.from)
      && (!filters.to || created <= filters.to);
  }), [filters, shipments]);

  const sortedShipments = useMemo(() => [...filteredShipments].sort((a, b) => {
    const left = normalize(String(a[sort.key] ?? ""));
    const right = normalize(String(b[sort.key] ?? ""));
    return left.localeCompare(right) * (sort.direction === "asc" ? 1 : -1);
  }), [filteredShipments, sort]);

  const pageCount = Math.max(1, Math.ceil(sortedShipments.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paginatedShipments = sortedShipments.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const statuses = useMemo(() => countBy(shipments, "shipment_status"), [shipments]);
  const origins = useMemo(() => countBy(shipments, "origin_country").slice(0, 5), [shipments]);
  const destinations = useMemo(() => countBy(shipments, "destination_country").slice(0, 5), [shipments]);
  const air = shipments.filter((item) => normalize(item.transport_mode) === "air").length;
  const sea = shipments.filter((item) => normalize(item.transport_mode) === "sea").length;
  const delivered = shipments.filter((item) => normalize(item.shipment_status) === "delivered");
  const delayed = shipments.filter((item) => normalize(item.shipment_status) === "delayed");
  const active = shipments.filter((item) => normalize(item.shipment_status) !== "delivered").length;
  const shipmentById = new Map(shipments.map((shipment) => [shipment.id, shipment]));
  const recent = [...shipments].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 5);
  const recentlyDelivered = [...delivered].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 5);
  const upcoming = shipments.filter((item) => item.estimated_delivery && new Date(`${item.estimated_delivery.slice(0, 10)}T23:59:59`) >= new Date()).sort((a, b) => String(a.estimated_delivery).localeCompare(String(b.estimated_delivery))).slice(0, 5);

  const trend = useMemo(() => {
    const result: { label: string; value: number }[] = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - offset);
      const key = date.toISOString().slice(0, 10);
      result.push({ label: date.toLocaleDateString("en", { weekday: "short" }), value: shipments.filter((item) => item.created_at.slice(0, 10) === key).length });
    }
    return result;
  }, [shipments]);

  function changeSort(key: SortKey) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
    setPage(1);
  }

  function exportRows(kind: "csv" | "excel") {
    const headers = ["Tracking Number", "Client Name", "Status", "Origin", "Destination", "Transport Mode", "Estimated Delivery", "Created Date"];
    const rows = sortedShipments.map((item) => [item.tracking_number, item.client_name, item.shipment_status, item.origin_country, item.destination_country, item.transport_mode, item.estimated_delivery, item.created_at]);
    if (kind === "csv") {
      downloadFile("balo-shipments.csv", [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
      return;
    }
    const tableRows = [headers, ...rows].map((row) => `<Row>${row.map((value) => `<Cell><Data ss:Type="String">${xmlCell(value)}</Data></Cell>`).join("")}</Row>`).join("");
    const workbook = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Shipments"><Table>${tableRows}</Table></Worksheet></Workbook>`;
    downloadFile("balo-shipments.xls", workbook, "application/vnd.ms-excel");
  }

  async function signOut() {
    try {
      await logout();
      router.replace("/login");
      router.refresh();
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Unable to sign out.");
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-100"><div className="text-center"><div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" /><p className="mt-4 font-semibold text-slate-600">Loading operations center...</p></div></main>;

  return (
    <main className="min-h-screen bg-[#f3f5f8] text-slate-900">
      <header className="print-hidden bg-[#071a33] text-white shadow-xl shadow-slate-950/10">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-5 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-center gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-blue-600 text-xl font-black shadow-lg shadow-blue-950/40">B</div>
            <div><p className="text-xs font-bold uppercase tracking-[0.22em] text-blue-300">Balo Logistics</p><h1 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">Operations Center</h1><p className="mt-1 text-xs text-blue-200">Welcome, {adminName}</p></div>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm font-bold">
            <Link href="/manage" className="rounded-xl bg-blue-600 px-4 py-2.5 hover:bg-blue-500">Manage Shipments</Link>
            <Link href="/admin/routes" className="rounded-xl bg-white/10 px-4 py-2.5 hover:bg-white/15">Route Library</Link>
            <Link href="/admin/locations" className="rounded-xl bg-white/10 px-4 py-2.5 hover:bg-white/15">Locations</Link>
            <Link href="/admin/locations/import" className="rounded-xl bg-white/10 px-4 py-2.5 hover:bg-white/15">Import Data</Link>
            <Link href="/track" className="rounded-xl bg-white/10 px-4 py-2.5 hover:bg-white/15">Customer Tracking</Link>
            <Link href="/settings" className="rounded-xl bg-white/10 px-4 py-2.5 hover:bg-white/15">Settings</Link>
            <Link href="/admin/profile" className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 hover:bg-white/15"><span className="grid h-6 w-6 place-items-center rounded-full bg-blue-500 text-[0.65rem] font-black">{adminName.charAt(0).toUpperCase()}</span>{adminName}</Link>
            <button onClick={() => void signOut()} className="rounded-xl border border-white/15 px-4 py-2.5 hover:bg-white/10">Logout</button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1600px] space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 font-semibold text-red-700">{error}</div>}

        <section>
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">Network overview</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight">Today at a glance</h2></div><p className="text-sm text-slate-500">Live portfolio totals</p></div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <KpiCard label="Total Shipments" value={shipments.length} accent="blue" icon="▦" />
            <KpiCard label="Active Shipments" value={active} accent="violet" icon="↗" />
            <KpiCard label="Delivered Shipments" value={delivered.length} accent="emerald" icon="✓" />
            <KpiCard label="Delayed Shipments" value={delayed.length} accent="red" icon="!" />
            <KpiCard label="Air Shipments" value={air} accent="sky" icon="✈" />
            <KpiCard label="Sea Shipments" value={sea} accent="cyan" icon="≋" />
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-12">
          <ChartCard title="Shipment trend over time" subtitle="New shipments · last 7 days" className="xl:col-span-5"><TrendChart data={trend} /></ChartCard>
          <ChartCard title="Shipment status distribution" subtitle="Current portfolio by status" className="xl:col-span-4"><BarList data={statuses.slice(0, 6)} color="bg-blue-600" /></ChartCard>
          <ChartCard title="Air vs Sea comparison" subtitle="Primary freight modes" className="xl:col-span-3"><ModeChart air={air} sea={sea} /></ChartCard>
          <ChartCard title="Origin countries" subtitle="Top shipment origins" className="xl:col-span-6"><BarList data={origins} color="bg-violet-500" /></ChartCard>
          <ChartCard title="Destination countries" subtitle="Top delivery markets" className="xl:col-span-6"><BarList data={destinations} color="bg-emerald-500" /></ChartCard>
        </section>

        <section>
          <div className="mb-5"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">Operational feeds</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight">Priority activity</h2></div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            <ActivityWidget title="Recent Shipments" items={recent.map((item) => ({ primary: item.tracking_number, secondary: item.client_name, meta: formatDate(item.created_at) }))} empty="No recent shipments" />
            <ActivityWidget title="Recently Delivered" items={recentlyDelivered.map((item) => ({ primary: item.tracking_number, secondary: item.destination_country, meta: "Delivered" }))} empty="No delivered shipments" accent="emerald" />
            <ActivityWidget title="Latest Status Updates" items={updates.slice(0, 5).map((item) => ({ primary: shipmentById.get(item.shipment_id)?.tracking_number ?? `Shipment #${item.shipment_id}`, secondary: `${item.status}${item.location ? ` · ${item.location}` : ""}`, meta: formatDate(item.created_at, true) }))} empty="No status updates" accent="violet" />
            <ActivityWidget title="Upcoming Deliveries" items={upcoming.map((item) => ({ primary: item.tracking_number, secondary: item.destination_country, meta: formatDate(item.estimated_delivery) }))} empty="No upcoming deliveries" accent="amber" />
          </div>
        </section>

        <NotificationCenter shipments={shipments} />

        <section className="print-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">Search & filter</p><h2 className="mt-1 text-xl font-extrabold">Find shipments</h2></div><button type="button" onClick={() => { setFilters({ tracking: "", client: "", status: "", origin: "", destination: "", from: "", to: "", mode: "" }); setPage(1); }} className="self-start text-sm font-bold text-blue-600 hover:text-blue-800">Clear all filters</button></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FilterInput label="Tracking number" value={filters.tracking} onChange={(value) => { setFilters({ ...filters, tracking: value }); setPage(1); }} />
            <FilterInput label="Client name" value={filters.client} onChange={(value) => { setFilters({ ...filters, client: value }); setPage(1); }} />
            <FilterSelect label="Shipment status" value={filters.status} options={[...new Set(shipments.map((item) => item.shipment_status).filter((item): item is string => Boolean(item)))]} onChange={(value) => { setFilters({ ...filters, status: value }); setPage(1); }} />
            <FilterInput label="Origin" value={filters.origin} onChange={(value) => { setFilters({ ...filters, origin: value }); setPage(1); }} />
            <FilterInput label="Destination" value={filters.destination} onChange={(value) => { setFilters({ ...filters, destination: value }); setPage(1); }} />
            <FilterSelect label="Transport mode" value={filters.mode} options={[...new Set(shipments.map((item) => item.transport_mode).filter((item): item is string => Boolean(item)))]} onChange={(value) => { setFilters({ ...filters, mode: value }); setPage(1); }} />
            <FilterInput label="From date" type="date" value={filters.from} onChange={(value) => { setFilters({ ...filters, from: value }); setPage(1); }} />
            <FilterInput label="To date" type="date" value={filters.to} onChange={(value) => { setFilters({ ...filters, to: value }); setPage(1); }} />
          </div>
        </section>

        <section className="admin-print-area overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><h2 className="text-xl font-extrabold">Shipment register</h2><p className="mt-1 text-sm text-slate-500">{sortedShipments.length} matching shipments</p></div><div className="print-hidden flex flex-wrap gap-2"><ActionButton onClick={() => exportRows("csv")}>Export CSV</ActionButton><ActionButton onClick={() => exportRows("excel")}>Export Excel</ActionButton><ActionButton onClick={() => window.print()}>Print</ActionButton></div></div>
          <div className="max-h-[42rem] overflow-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-[#071a33] text-xs uppercase tracking-wider text-blue-100"><tr><SortableHeader label="Tracking" sortKey="tracking_number" sort={sort} onSort={changeSort} /><SortableHeader label="Client" sortKey="client_name" sort={sort} onSort={changeSort} /><SortableHeader label="Status" sortKey="shipment_status" sort={sort} onSort={changeSort} /><SortableHeader label="Origin" sortKey="origin_country" sort={sort} onSort={changeSort} /><SortableHeader label="Destination" sortKey="destination_country" sort={sort} onSort={changeSort} /><SortableHeader label="Mode" sortKey="transport_mode" sort={sort} onSort={changeSort} /><SortableHeader label="Est. delivery" sortKey="estimated_delivery" sort={sort} onSort={changeSort} /><SortableHeader label="Created" sortKey="created_at" sort={sort} onSort={changeSort} /><th className="px-5 py-4 font-extrabold print:hidden">Documents</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{paginatedShipments.length ? paginatedShipments.map((item) => <tr key={item.id} className="hover:bg-blue-50/40"><td className="px-5 py-4 font-extrabold text-blue-700">{item.tracking_number}</td><td className="px-5 py-4 font-semibold">{item.client_name}</td><td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${statusStyle(item.shipment_status)}`}>{item.shipment_status ?? "Shipment Created"}</span></td><td className="px-5 py-4 text-slate-600">{item.origin_country}</td><td className="px-5 py-4 text-slate-600">{item.destination_country}</td><td className="px-5 py-4 font-semibold text-slate-600">{item.transport_mode ?? "—"}</td><td className="px-5 py-4 text-slate-600">{formatDate(item.estimated_delivery)}</td><td className="px-5 py-4 text-slate-600">{formatDate(item.created_at)}</td><td className="px-5 py-4 print:hidden"><button type="button" onClick={() => setDocumentShipment(item)} className="rounded-lg bg-blue-50 px-3 py-2 text-xs font-extrabold text-blue-700 hover:bg-blue-100">Generate</button></td></tr>) : <tr><td colSpan={9} className="px-5 py-16 text-center text-slate-500">No shipments match the selected filters.</td></tr>}</tbody>
            </table>
          </div>
          <div className="print-hidden flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-500">Showing {sortedShipments.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, sortedShipments.length)} of {sortedShipments.length}</p><div className="flex items-center gap-2"><button disabled={currentPage === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold disabled:opacity-40">Previous</button><span className="px-2 text-sm font-bold">Page {currentPage} of {pageCount}</span><button disabled={currentPage === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold disabled:opacity-40">Next</button></div></div>
        </section>

        <section className="print-hidden"><div className="mb-5"><p className="text-xs font-extrabold uppercase tracking-[0.2em] text-blue-600">Shipment intake</p><h2 className="mt-1 text-2xl font-extrabold tracking-tight">Create a shipment</h2></div><CreateShipment /></section>
      </div>
      {documentShipment && <ShipmentDocumentCenter shipment={documentShipment} onClose={() => setDocumentShipment(null)} />}
    </main>
  );
}

function KpiCard({ label, value, accent, icon }: { label: string; value: number; accent: "blue" | "violet" | "emerald" | "red" | "sky" | "cyan"; icon: string }) {
  const colors = { blue: "bg-blue-50 text-blue-700", violet: "bg-violet-50 text-violet-700", emerald: "bg-emerald-50 text-emerald-700", red: "bg-red-50 text-red-700", sky: "bg-sky-50 text-sky-700", cyan: "bg-cyan-50 text-cyan-700" }[accent];
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"><div className={`grid h-10 w-10 place-items-center rounded-xl text-lg font-black ${colors}`}>{icon}</div><p className="mt-5 text-3xl font-black tracking-tight">{value.toLocaleString()}</p><p className="mt-1 text-xs font-bold uppercase tracking-wider text-slate-500">{label}</p></article>;
}

function ChartCard({ title, subtitle, className, children }: { title: string; subtitle: string; className: string; children: React.ReactNode }) {
  return <article className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}><h3 className="font-extrabold">{title}</h3><p className="mt-1 text-xs text-slate-500">{subtitle}</p><div className="mt-6">{children}</div></article>;
}

function TrendChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  const points = data.map((item, index) => `${index * (100 / (data.length - 1))},${92 - (item.value / max) * 72}`).join(" ");
  return <div><svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-48 w-full overflow-visible" role="img" aria-label="Seven-day shipment trend"><defs><linearGradient id="trend-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563eb" stopOpacity=".28"/><stop offset="100%" stopColor="#2563eb" stopOpacity="0"/></linearGradient></defs><polygon points={`0,100 ${points} 100,100`} fill="url(#trend-fill)"/><polyline points={points} fill="none" stroke="#2563eb" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round"/></svg><div className="mt-2 grid grid-cols-7">{data.map((item) => <div key={item.label} className="text-center"><p className="text-xs font-extrabold">{item.value}</p><p className="mt-1 text-[0.65rem] text-slate-400">{item.label}</p></div>)}</div></div>;
}

function BarList({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  const max = Math.max(1, ...data.map((item) => item.value));
  return <div className="space-y-4">{data.length ? data.map((item) => <div key={item.label}><div className="mb-1.5 flex justify-between gap-3 text-xs"><span className="truncate font-bold text-slate-600">{item.label}</span><span className="font-extrabold">{item.value}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(5, item.value / max * 100)}%` }} /></div></div>) : <p className="py-12 text-center text-sm text-slate-400">No data available</p>}</div>;
}

function ModeChart({ air, sea }: { air: number; sea: number }) {
  const total = Math.max(1, air + sea);
  const airPercent = Math.round(air / total * 100);
  return <div className="flex flex-col items-center"><div className="grid h-36 w-36 place-items-center rounded-full" style={{ background: `conic-gradient(#2563eb 0 ${airPercent}%, #06b6d4 ${airPercent}% 100%)` }}><div className="grid h-24 w-24 place-items-center rounded-full bg-white text-center"><div><p className="text-2xl font-black">{air + sea}</p><p className="text-[0.65rem] font-bold uppercase text-slate-400">Shipments</p></div></div></div><div className="mt-6 flex w-full justify-around text-xs"><span className="font-bold text-blue-700">● Air {air}</span><span className="font-bold text-cyan-600">● Sea {sea}</span></div></div>;
}

function ActivityWidget({ title, items, empty, accent = "blue" }: { title: string; items: { primary: string; secondary: string; meta: string }[]; empty: string; accent?: "blue" | "emerald" | "violet" | "amber" }) {
  const dot = { blue: "bg-blue-500", emerald: "bg-emerald-500", violet: "bg-violet-500", amber: "bg-amber-500" }[accent];
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-extrabold">{title}</h3><div className="mt-4 divide-y divide-slate-100">{items.length ? items.map((item, index) => <div key={`${item.primary}-${index}`} className="flex gap-3 py-3 first:pt-0"><span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${dot}`} /><div className="min-w-0"><p className="truncate text-sm font-extrabold text-slate-800">{item.primary}</p><p className="mt-0.5 truncate text-xs text-slate-500">{item.secondary}</p><p className="mt-1 text-[0.65rem] font-bold uppercase tracking-wide text-slate-400">{item.meta}</p></div></div>) : <p className="py-10 text-center text-sm text-slate-400">{empty}</p>}</div></article>;
}

function FilterInput({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return <label><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100" /></label>;
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <label><span className="mb-1.5 block text-xs font-bold text-slate-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-100"><option value="">All</option>{options.map((option) => <option key={option}>{option}</option>)}</select></label>;
}

function ActionButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-extrabold text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-700">{children}</button>;
}

function SortableHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: SortKey; sort: { key: SortKey; direction: SortDirection }; onSort: (key: SortKey) => void }) {
  return <th className="px-5 py-4"><button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1.5 font-extrabold hover:text-white">{label}<span aria-hidden="true" className="text-blue-300">{sort.key === sortKey ? (sort.direction === "asc" ? "↑" : "↓") : "↕"}</span></button></th>;
}
