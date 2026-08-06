import { SHIPMENT_STAGES, shipmentStageIndex } from "./lib/shipment-status";

type ShipmentHistory = { id: number; status: string; location: string | null; note: string | null; created_at: string };
type ShipmentTimelineProps = { shipmentStatus: string | null; history: ShipmentHistory[] };

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

export default function ShipmentTimeline({ shipmentStatus, history }: ShipmentTimelineProps) {
  const chronological = [...history].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const currentIndex = shipmentStageIndex(chronological.at(-1)?.status ?? shipmentStatus);
  const events = new Map<number, ShipmentHistory>();
  chronological.forEach((event) => events.set(shipmentStageIndex(event.status), event));

  return (
    <section className="rounded-[1.75rem] border border-slate-200/80 bg-white p-5 shadow-[0_22px_55px_-28px_rgba(15,23,42,0.32)] sm:p-8 lg:p-10" aria-labelledby="shipment-progress-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-blue-600">Live progress</p><h2 id="shipment-progress-title" className="mt-1 text-2xl font-extrabold tracking-[-0.02em]">Shipment Progress</h2></div>
        <p className="text-sm font-bold text-slate-500">Milestone {currentIndex + 1} of {SHIPMENT_STAGES.length}</p>
      </div>

      <ol className="mt-8 hidden grid-cols-7 md:grid" aria-label="Shipment progress overview">
        {SHIPMENT_STAGES.map((stage, index) => {
          const complete = index < currentIndex;
          const current = index === currentIndex;
          const event = events.get(index);
          return <li key={stage} className="relative flex min-w-0 flex-col items-center px-1 text-center">
            {index < SHIPMENT_STAGES.length - 1 && <span aria-hidden="true" className={`absolute left-1/2 top-5 h-1 w-full ${index < currentIndex ? "bg-emerald-500" : "bg-slate-200"}`} />}
            <span className={`relative z-10 grid h-10 w-10 place-items-center rounded-full border-2 text-sm font-black ${complete ? "border-emerald-500 bg-emerald-500 text-white" : current ? "border-orange-500 bg-orange-500 text-white shadow-[0_0_0_7px_rgba(249,115,22,.14)]" : "border-slate-300 bg-white text-slate-400"}`}>{complete ? <CheckIcon /> : index + 1}</span>
            <span className={`mt-3 text-[0.7rem] font-extrabold leading-4 ${current ? "text-orange-700" : complete ? "text-emerald-700" : "text-slate-400"}`}>{stage}</span>
            {event && <time dateTime={event.created_at} className="mt-1 text-[0.62rem] leading-4 text-slate-400">{formatDateTime(event.created_at)}</time>}
          </li>;
        })}
      </ol>

      <div className="mt-8 border-t border-slate-100 pt-7"><p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-slate-400">Tracking history</p><h3 className="mt-1 text-xl font-black tracking-tight text-slate-900">Shipment Timeline</h3></div>
      <ol className="mt-7" aria-label="Shipment tracking history">
        {SHIPMENT_STAGES.map((stage, index) => {
          const event = events.get(index);
          const complete = index < currentIndex;
          const current = index === currentIndex;
          return <li key={stage} className="relative flex min-h-24 gap-4 last:min-h-0 sm:gap-5">
            {index < SHIPMENT_STAGES.length - 1 && <span aria-hidden="true" className={`absolute left-6 top-12 h-[calc(100%-2rem)] w-1 -translate-x-1/2 rounded-full ${index < currentIndex ? "bg-emerald-500" : "bg-slate-200"}`} />}
            <span className={`relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 shadow-[0_0_0_6px] ${complete ? "border-emerald-600 bg-emerald-600 text-white shadow-emerald-100" : current ? "border-orange-500 bg-orange-500 text-white shadow-orange-100" : "border-slate-300 bg-white text-slate-400 shadow-slate-100"}`}><StageIcon index={index} /></span>
            <div className="min-w-0 flex-1 pb-8 pt-0.5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div><h4 className={`text-base font-bold sm:text-lg ${current ? "text-orange-700" : complete ? "text-emerald-800" : "text-slate-500"}`}>{stage}</h4><span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider ${current ? "bg-orange-50 text-orange-700" : complete ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{current ? "Current stage" : complete ? "Completed" : "Upcoming"}</span></div>
                {event && <time dateTime={event.created_at} className="shrink-0 text-sm font-medium text-slate-500">{formatDateTime(event.created_at)}</time>}
              </div>
              {event?.location && <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-700"><PinIcon />{event.location}</p>}
              {event?.note && <p className="mt-2 rounded-xl bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-600">{event.note}</p>}
            </div>
          </li>;
        })}
      </ol>
      {!history.length && <p className="mt-7 rounded-2xl border border-blue-100 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-800">Detailed tracking updates will appear here as the shipment moves. Milestones shown above reflect the current shipment status; no event dates have been inferred.</p>}
    </section>
  );
}

function IconBase({ children, className = "h-5 w-5" }: { children: React.ReactNode; className?: string }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>{children}</svg>; }
function CheckIcon() { return <IconBase className="h-4 w-4"><path d="m5 12 4 4L19 6" /></IconBase>; }
function PinIcon() { return <IconBase className="h-4 w-4 text-blue-600"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></IconBase>; }
function StageIcon({ index }: { index: number }) {
  const paths = [<g key="package"><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></g>,<g key="pickup"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></g>,<g key="warehouse"><path d="M4 8h16v12H4zM8 4h8v4M4 13h16"/></g>,<g key="transit"><path d="M4 12h16M14 6l6 6-6 6M4 7h6M4 17h6"/></g>,<g key="customs"><path d="M4 9h16M6 9V7l6-4 6 4v2M7 9v8M12 9v8M17 9v8M4 17h16v3H4z"/></g>,<g key="delivery"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><path d="m7 12 2 2 3-4"/></g>,<path key="delivered" d="m5 12 4 4L19 6"/>];
  return <IconBase>{paths[index]}</IconBase>;
}
