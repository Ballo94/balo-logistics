import { SHIPMENT_STAGES, shipmentStageIndex } from "./lib/shipment-status";

type ShipmentHistory = { id: number; status: string; location: string | null; note: string | null; created_at: string };
type ShipmentTimelineProps = { shipmentStatus: string | null; history: ShipmentHistory[]; originCountry: string; destinationCountry: string; originLabel: string; destinationLabel: string; transportMode: string | null };

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: "" };
  return {
    date: new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

export default function ShipmentTimeline({ shipmentStatus, history, originCountry, destinationCountry, originLabel, destinationLabel, transportMode }: ShipmentTimelineProps) {
  const chronological = [...history].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const currentIndex = shipmentStageIndex(chronological.at(-1)?.status ?? shipmentStatus);
  const events = new Map<number, ShipmentHistory>();
  chronological.forEach((event) => events.set(shipmentStageIndex(event.status), event));

  return (
    <section className="rounded-[1.5rem] border border-slate-200/80 bg-white p-4 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.32)] sm:p-5" aria-labelledby="shipment-progress-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[0.64rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">Live progress</p><h2 id="shipment-progress-title" className="mt-1 text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">Shipment Progress</h2></div>
        <p className="text-xs font-bold text-slate-500">Milestone {currentIndex + 1} of {SHIPMENT_STAGES.length}</p>
      </div>

      <ol className="mt-5" aria-label="Shipment progress timeline">
        {SHIPMENT_STAGES.map((stage, index) => {
          const event = events.get(index);
          const complete = index < currentIndex;
          const current = index === currentIndex;
          const timestamp = event ? formatDateTime(event.created_at) : null;
          const location = splitLocation(event?.location, index < 4 ? originCountry : destinationCountry);
          const title = timelineTitle(stage, transportMode, originLabel, destinationLabel);
          return <li key={stage} className="relative flex min-h-16 gap-3 last:min-h-0 sm:gap-3.5">
            {index < SHIPMENT_STAGES.length - 1 && <span aria-hidden="true" className={`absolute left-5 top-10 h-[calc(100%-1.5rem)] w-1 -translate-x-1/2 rounded-full ${index < currentIndex ? "bg-[#f6c945]" : "bg-slate-200"}`} />}
            {current && <span aria-hidden="true" className="track-map-pulse absolute left-0 top-0 h-10 w-10 rounded-full bg-blue-400"/>}
            <span className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 shadow-[0_0_0_5px] ${complete ? "border-[#e4b72e] bg-[#f6c945] text-[#071a33] shadow-yellow-100" : current ? "border-blue-600 bg-blue-600 text-white shadow-blue-100" : "border-slate-300 bg-white text-slate-400 shadow-slate-100"}`}>{complete ? <CheckIcon/> : <StageIcon index={index} mode={transportMode} />}</span>
            <div className="min-w-0 flex-1 pb-4 pt-0.5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div><h3 className={`text-sm font-bold sm:text-base ${current ? "text-blue-800" : complete ? "text-[#725600]" : "text-slate-500"}`}>{title}</h3><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${current ? "bg-blue-50 text-blue-700" : complete ? "bg-yellow-50 text-[#725600]" : "bg-slate-100 text-slate-500"}`}>{current ? "Current checkpoint" : complete ? "Completed" : "Upcoming"}</span></div>
                {event && timestamp && <time dateTime={event.created_at} className="shrink-0 text-left text-xs font-semibold text-slate-500 sm:text-right"><span className="block font-bold text-slate-700">{timestamp.date}</span><span className="mt-0.5 block">{timestamp.time}</span></time>}
              </div>
              {event?.location && <div className="mt-2 flex items-start gap-2 text-sm"><PinIcon/><p><span className="block font-bold text-slate-700">{location.city}</span>{location.country && <span className="mt-0.5 block text-xs font-semibold text-slate-400">{location.country}</span>}</p></div>}
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 shadow-sm">{event?.note || (current ? "Your shipment is currently at this operational milestone." : complete ? "This shipment checkpoint has been completed." : "Updates will appear when the shipment reaches this checkpoint.")}</p>
            </div>
          </li>;
        })}
      </ol>
      {!history.length && <p className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">Detailed tracking updates will appear here as the shipment moves. Milestones shown above reflect the current shipment status; no event dates have been inferred.</p>}
    </section>
  );
}

function timelineTitle(stage: string, transportMode: string | null, origin: string, destination: string) {
  const mode = transportMode?.toLowerCase() ?? "";
  if (stage === "In Warehouse") return mode.includes("air") ? `Arrived at ${origin}` : mode.includes("sea") ? "Loaded on Vessel" : mode.includes("road") ? "Loaded on Truck" : "Warehouse Processing";
  if (stage === "In Transit") return mode.includes("sea") ? "In Transit – At Sea" : mode.includes("air") ? `In Air Transit to ${destination}` : mode.includes("road") ? `Road Transit to ${destination}` : "In Transit";
  if (stage === "Customs Clearance") return "Customs Clearance";
  return stage;
}

function splitLocation(value: string | null | undefined, fallbackCountry: string) {
  if (!value) return { city: "", country: fallbackCountry };
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return { city: parts[0] || value, country: parts.length > 1 ? parts.at(-1) || fallbackCountry : fallbackCountry };
}

function IconBase({ children, className = "h-5 w-5" }: { children: React.ReactNode; className?: string }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>{children}</svg>; }
function CheckIcon() { return <IconBase className="h-4 w-4"><path d="m5 12 4 4L19 6" /></IconBase>; }
function PinIcon() { return <IconBase className="h-4 w-4 text-blue-600"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></IconBase>; }
function StageIcon({ index, mode }: { index: number; mode: string | null }) {
  const transport = mode?.toLowerCase() ?? "";
  if ((index === 2 || index === 3) && transport.includes("air")) return <IconBase><path d="m2 16 20-8-6 7 5 3-19-1 5-2Z"/></IconBase>;
  if ((index === 2 || index === 3) && (transport.includes("sea") || transport.includes("ocean"))) return <IconBase><path d="M3 15h18l-3 5H7Z"/><path d="M7 15V8h10v7M10 8V4h4v4"/></IconBase>;
  if ((index === 2 || index === 3) && (transport.includes("road") || transport.includes("truck"))) return <IconBase><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></IconBase>;
  const paths = [<g key="package"><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></g>,<g key="pickup"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></g>,<g key="warehouse"><path d="M4 8h16v12H4zM8 4h8v4M4 13h16"/></g>,<g key="transit"><path d="M4 12h16M14 6l6 6-6 6M4 7h6M4 17h6"/></g>,<g key="customs"><path d="M4 9h16M6 9V7l6-4 6 4v2M7 9v8M12 9v8M17 9v8M4 17h16v3H4z"/></g>,<g key="delivery"><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><path d="m7 12 2 2 3-4"/></g>,<path key="delivered" d="m5 12 4 4L19 6"/>];
  return <IconBase>{paths[index]}</IconBase>;
}
