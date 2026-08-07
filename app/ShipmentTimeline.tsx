import { getShipmentStageIndex, type MilestoneIcon, type ShipmentState } from "./lib/shipment-state";

type ShipmentHistory = { id: number; status: string; location: string | null; note: string | null; created_at: string };
type ShipmentTimelineProps = { state: ShipmentState; history: ShipmentHistory[]; originCountry: string; destinationCountry: string };

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { date: value, time: "" };
  return {
    date: new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(date),
  };
}

export default function ShipmentTimeline({ state, history, originCountry, destinationCountry }: ShipmentTimelineProps) {
  const chronological = [...history].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const events = new Map<number, ShipmentHistory>();
  chronological.forEach((event) => events.set(getShipmentStageIndex(event.status), event));

  return (
    <section className="rounded-[1.5rem] border border-slate-200/80 bg-white p-3.5 shadow-[0_18px_45px_-28px_rgba(15,23,42,0.32)] sm:p-4" aria-labelledby="shipment-progress-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[0.64rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">Live progress</p><h2 id="shipment-progress-title" className="mt-1 text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">Shipment Progress</h2></div>
        <p className="text-xs font-bold text-slate-500">Milestone {state.stageIndex + 1} of {state.milestones.length}</p>
      </div>

      <ol className="mt-4" aria-label="Shipment progress timeline">
        {state.milestones.map((milestone) => {
          const event = events.get(milestone.index);
          const timestamp = event ? formatDateTime(event.created_at) : null;
          const location = splitLocation(event?.location, milestone.index < 4 ? originCountry : destinationCountry);
          const complete = milestone.state === "completed";
          const current = milestone.state === "current";
          return <li key={milestone.key} className="relative flex min-h-14 gap-2.5 last:min-h-0 sm:gap-3">
            {milestone.index < state.milestones.length - 1 && <span aria-hidden="true" className={`absolute left-5 top-10 h-[calc(100%-1.5rem)] w-1 -translate-x-1/2 rounded-full ${milestone.index < state.stageIndex ? "bg-[#f6c945]" : "bg-slate-200"}`} />}
            {current && <span aria-hidden="true" className="track-map-pulse absolute left-0 top-0 h-10 w-10 rounded-full bg-blue-400"/>}
            <span className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 shadow-[0_0_0_5px] ${complete ? "border-[#e4b72e] bg-[#f6c945] text-[#071a33] shadow-yellow-100" : current ? "border-blue-600 bg-blue-600 text-white shadow-blue-100" : "border-slate-300 bg-white text-slate-400 shadow-slate-100"}`}>{complete ? <CheckIcon/> : <StageIcon icon={milestone.icon} />}</span>
            <div className="min-w-0 flex-1 pb-3 pt-0.5">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div><h3 className={`text-sm font-bold sm:text-base ${current ? "text-blue-800" : complete ? "text-[#725600]" : "text-slate-500"}`}>{milestone.label}</h3><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${current ? "bg-blue-50 text-blue-700" : complete ? "bg-yellow-50 text-[#725600]" : "bg-slate-100 text-slate-500"}`}>{current ? "Current checkpoint" : complete ? "Completed" : "Upcoming"}</span></div>
                {event && timestamp && <time dateTime={event.created_at} className="shrink-0 text-left text-xs font-semibold text-slate-500 sm:text-right"><span className="block font-bold text-slate-700">{timestamp.date}</span><span className="mt-0.5 block">{timestamp.time}</span></time>}
              </div>
              {event?.location && <div className="mt-2 flex items-start gap-2 text-sm"><PinIcon/><p><span className="block font-bold text-slate-700">{location.city}</span>{location.country && <span className="mt-0.5 block text-xs font-semibold text-slate-400">{location.country}</span>}</p></div>}
              <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 shadow-sm">{event?.note || (current ? state.statusNote : complete ? "This shipment checkpoint has been completed." : "Updates will appear when the shipment reaches this checkpoint.")}</p>
            </div>
          </li>;
        })}
      </ol>
      {!history.length && <p className="mt-5 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">Detailed tracking updates will appear here as the shipment moves. Milestones reflect the current shipment status; no event dates have been inferred.</p>}
    </section>
  );
}

function splitLocation(value: string | null | undefined, fallbackCountry: string) {
  if (!value) return { city: "", country: fallbackCountry };
  const parts = value.split(",").map((part) => part.trim()).filter(Boolean);
  return { city: parts[0] || value, country: parts.length > 1 ? parts.at(-1) || fallbackCountry : fallbackCountry };
}

function IconBase({ children, className = "h-5 w-5" }: { children: React.ReactNode; className?: string }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>{children}</svg>; }
function CheckIcon() { return <IconBase className="h-4 w-4"><path d="m5 12 4 4L19 6" /></IconBase>; }
function PinIcon() { return <IconBase className="h-4 w-4 text-blue-600"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></IconBase>; }
function StageIcon({ icon }: { icon: MilestoneIcon }) {
  if (icon === "air") return <IconBase><path d="m2 16 20-8-6 7 5 3-19-1 5-2Z"/></IconBase>;
  if (icon === "sea") return <IconBase><path d="M3 15h18l-3 5H7Z"/><path d="M7 15V8h10v7M10 8V4h4v4"/></IconBase>;
  if (icon === "road" || icon === "collection" || icon === "delivery") return <IconBase><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></IconBase>;
  if (icon === "warehouse") return <IconBase><path d="M4 8h16v12H4zM8 4h8v4M4 13h16"/></IconBase>;
  if (icon === "customs") return <IconBase><path d="M4 9h16M6 9V7l6-4 6 4v2M7 9v8M12 9v8M17 9v8M4 17h16v3H4z"/></IconBase>;
  if (icon === "delivered") return <IconBase><path d="m5 12 4 4L19 6"/></IconBase>;
  return <IconBase><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></IconBase>;
}
