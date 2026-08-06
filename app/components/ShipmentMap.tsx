"use client";

type ShipmentMapProps = {
  origin: string;
  currentLocation: string | null;
  destination: string;
  transportMode?: string | null;
};

function pointFromLabel(label: string, fallbackX: number) {
  if (!label.trim()) return { x: fallbackX, y: 52 };
  const hash = [...label].reduce((total, character) => total + character.charCodeAt(0), 0);
  return { x: fallbackX, y: 34 + (hash % 32) };
}

export default function ShipmentMap({ origin, currentLocation, destination, transportMode }: ShipmentMapProps) {
  const start = pointFromLabel(origin, 14);
  const current = pointFromLabel(currentLocation?.trim() || `${origin}-${destination}`, 51);
  const end = pointFromLabel(destination, 86);
  const curve = `M ${start.x} ${start.y} Q 50 12 ${end.x} ${end.y}`;
  const mode = transportMode?.trim().toLowerCase();

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_22px_55px_-28px_rgba(15,23,42,0.32)]" aria-labelledby="shipment-map-title">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-6">
        <div>
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-blue-600">Route visualization</p>
          <h2 id="shipment-map-title" className="mt-1 text-2xl font-extrabold tracking-[-0.02em]">Shipment Map</h2>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-600" aria-label="Map legend">
          <Legend color="bg-slate-950" label="Origin" />
          <Legend color="bg-orange-500 ring-4 ring-orange-100" label="Current" />
          <Legend color="bg-emerald-500" label="Destination" />
        </div>
      </div>

      <div className="relative isolate min-h-[24rem] overflow-hidden bg-[#071a33] px-5 py-8 text-white sm:min-h-[30rem] sm:px-8">
        <div aria-hidden="true" className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(148,163,184,.28)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,.28)_1px,transparent_1px)] [background-size:40px_40px]" />
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" role="img" aria-label={`Route from ${origin} through ${currentLocation || "the latest reported position"} to ${destination}`}>
          <defs><linearGradient id="route-gradient" x1="0" x2="1"><stop stopColor="#38bdf8"/><stop offset="0.55" stopColor="#f97316"/><stop offset="1" stopColor="#34d399"/></linearGradient></defs>
          <g fill="#1e3a5f" opacity=".8">
            <path d="M4 38 13 23l14-6 10 8-4 12-15 7-6 17-8-5Z"/><path d="m43 25 13-10 18 5 6 12-8 7-12-5-7 11-11-5Z"/><path d="m68 56 15-8 13 10-4 18-17 8-9-11Z"/><path d="m18 67 13-9 8 9-4 17-14 2-7-10Z"/>
          </g>
          <path d={curve} fill="none" stroke="#0ea5e9" strokeWidth="1.8" opacity=".3" strokeLinecap="round" />
          <path d={curve} fill="none" stroke="url(#route-gradient)" strokeWidth=".75" strokeDasharray="3 2" strokeLinecap="round" />
          <MapMarker point={start} kind="origin" />
          <MapMarker point={current} kind="current" />
          <MapMarker point={end} kind="destination" />
          <g transform={`translate(${current.x - 2.2} ${current.y - 10})`} fill="none" stroke="white" strokeWidth=".7" strokeLinecap="round" strokeLinejoin="round">
            {mode === "sea" ? <><path d="M0 5h8l-1.5 3H2Z"/><path d="M2 5V2h4v3M4 2V0"/></> : <><path d="m0 5 8-3-3 4 3 2-8-1 2-1Z"/></>}
          </g>
        </svg>

        <div className="relative z-10 mt-56 grid gap-3 sm:mt-72 sm:grid-cols-3">
          <LocationLabel eyebrow="Origin" value={origin} />
          <LocationLabel eyebrow="Current position" value={currentLocation?.trim() || "Awaiting location update"} active />
          <LocationLabel eyebrow="Destination" value={destination} />
        </div>
        <p className="relative z-10 mt-4 text-xs leading-5 text-blue-200">Route visualization is schematic and represents shipment milestones rather than precise geographic coordinates.</p>
      </div>
    </section>
  );
}

function MapMarker({ point, kind }: { point: { x: number; y: number }; kind: "origin" | "current" | "destination" }) {
  const color = kind === "origin" ? "#0f172a" : kind === "current" ? "#f97316" : "#10b981";
  return <g transform={`translate(${point.x} ${point.y})`}><circle r={kind === "current" ? 4.5 : 3.5} fill={color} opacity=".22" className={kind === "current" ? "track-map-pulse" : ""}/><circle r="2.1" fill={color} stroke="white" strokeWidth=".8"/><circle r=".55" fill="white"/></g>;
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span><i aria-hidden="true" className={`mr-1.5 inline-block h-2.5 w-2.5 rounded-full ${color}`} />{label}</span>;
}

function LocationLabel({ eyebrow, value, active = false }: { eyebrow: string; value: string; active?: boolean }) {
  return <div className={`rounded-2xl border px-4 py-3 backdrop-blur ${active ? "border-orange-400/40 bg-orange-500/15" : "border-white/10 bg-white/5"}`}><p className={`text-[0.62rem] font-extrabold uppercase tracking-[0.16em] ${active ? "text-orange-200" : "text-blue-300"}`}>{eyebrow}</p><p className="mt-1 truncate text-sm font-bold text-white" title={value}>{value}</p></div>;
}
