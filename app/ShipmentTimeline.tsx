import { canonicalizeShipmentStatus, getShipmentStageIndex, normalizeShipmentStatus, type MilestoneIcon, type ShipmentState, type TimelineState } from "./lib/shipment-state";
import type { CheckpointKind, RouteJourney, RouteLeg } from "./lib/route-intelligence";
import { checkpointIndexForStatus, type RouteJourneyPresentation } from "./lib/route-intelligence/presentation";

type ShipmentHistory = { status: string; location: string | null; created_at: string };
type Props = { state: ShipmentState; journey: RouteJourney | null; route: RouteJourneyPresentation | null; history: ShipmentHistory[]; originCountry: string; destinationCountry: string };
type DisplayMilestone = { key: string; label: string; index: number; state: TimelineState; icon: MilestoneIcon; location?: string };

function formatDateTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return { date: value, time: "" }; return { date: new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date), time: new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(date) }; }

function routeIcon(kind: CheckpointKind, mode: RouteJourney["transportMode"]): MilestoneIcon {
  if (kind === "shipment_created") return "package";
  if (kind === "collected") return "collection";
  if (kind === "origin_warehouse" || kind === "destination_warehouse" || kind === "transit_processing") return "warehouse";
  if (kind === "export_customs" || kind === "import_customs" || kind === "border_customs") return "customs";
  if (kind === "out_for_delivery") return "delivery";
  if (kind === "delivered") return "delivered";
  return mode === "air" ? "air" : mode === "sea" ? "sea" : "road";
}

export default function ShipmentTimeline({ state, journey, route, history, originCountry, destinationCountry }: Props) {
  const chronological = [...history].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const currentIndex = route?.currentIndex ?? state.stageIndex;
  const milestones: DisplayMilestone[] = journey && route ? journey.checkpoints.map((item, index) => ({ key: item.id, label: item.label, index, state: index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming", icon: routeIcon(item.kind, journey.transportMode), location: item.location.name })) : state.milestones;
  const recordedIndexes = chronological.map((event) => {
    const exactRouteIndex = journey?.checkpoints.findIndex((checkpoint) => normalizeShipmentStatus(checkpoint.label) === normalizeShipmentStatus(event.status)) ?? -1;
    return journey ? exactRouteIndex >= 0 ? exactRouteIndex : checkpointIndexForStatus(journey, canonicalizeShipmentStatus(event.status)) : getShipmentStageIndex(event.status);
  });
  const recordedStatuses = new Set(chronological.map((event) => normalizeShipmentStatus(event.status)));
  const recordedCanonicalStatuses = new Set(chronological.map((event) => canonicalizeShipmentStatus(event.status)));
  const plannedMilestones = milestones.filter((milestone) => milestone.index >= currentIndex
    && !recordedStatuses.has(normalizeShipmentStatus(milestone.label))
    && !recordedCanonicalStatuses.has(canonicalizeShipmentStatus(milestone.label)));
  const recordedThroughIndex = recordedIndexes.length ? Math.max(...recordedIndexes) : -1;

  if (journey?.legs.length) {
    const activeLegIndex = getActiveLegIndex(journey, currentIndex, state.canonicalStatus === "delivered");
    return <div className="grid gap-3"><RecordedHistory history={chronological} currentStatus={state.displayStatus} originCountry={originCountry}/><JourneyLegTimeline journey={journey} activeLegIndex={activeLegIndex} completedCheckpointIndex={recordedThroughIndex} delivered={state.canonicalStatus === "delivered"} /></div>;
  }

  return <section className="rounded-[1.25rem] border border-slate-200/70 bg-white p-3.5 shadow-[0_16px_42px_-27px_rgba(15,23,42,0.36)]" aria-labelledby="shipment-progress-title">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[0.64rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">Live progress</p><h2 id="shipment-progress-title" className="mt-1 text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">Shipment Progress</h2></div><p className="text-xs font-bold text-slate-500">Checkpoint {currentIndex + 1} of {milestones.length}</p></div>
    <RecordedHistory history={chronological} currentStatus={state.displayStatus} originCountry={originCountry} embedded />
    <p className="mt-4 border-t border-slate-100 pt-3 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-slate-400">Current and upcoming journey</p>
    <ol className="mt-3" aria-label="Current and upcoming shipment checkpoints">{plannedMilestones.map((milestone) => {
      const location = splitLocation(milestone.location, destinationCountry); const current = milestone.index === currentIndex;
      return <li key={milestone.key} className="relative flex min-h-14 gap-2.5 last:min-h-0 sm:gap-3">
        <span aria-hidden="true" className="absolute left-5 top-10 h-[calc(100%-1.5rem)] w-1 -translate-x-1/2 rounded-full bg-slate-200" />
        {current && <span aria-hidden="true" className="track-map-pulse absolute left-0 top-0 h-10 w-10 rounded-full bg-blue-400"/>}
        <span className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 shadow-[0_0_0_5px] ${current ? "border-blue-600 bg-blue-600 text-white shadow-blue-100" : "border-slate-300 bg-white text-slate-400 shadow-slate-100"}`}><StageIcon icon={milestone.icon} /></span>
        <div className="min-w-0 flex-1 pb-3 pt-0.5"><div><h3 className={`text-sm font-bold sm:text-base ${current ? "text-blue-800" : "text-slate-500"}`}>{milestone.label}</h3><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${current ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-500"}`}>{current ? "Current checkpoint" : "Upcoming"}</span></div>
          {milestone.location && <div className="mt-2 flex items-start gap-2 text-sm"><PinIcon/><p><span className="block font-bold text-slate-700">{location.city}</span>{location.country && <span className="mt-0.5 block text-xs font-semibold text-slate-400">{location.country}</span>}</p></div>}
          <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600 shadow-sm">{current ? state.statusNote : "Updates will appear when the shipment reaches this checkpoint."}</p>
        </div>
      </li>;
    })}</ol>
  </section>;
}

function RecordedHistory({ history, currentStatus, originCountry, embedded = false }: { history: ShipmentHistory[]; currentStatus: string; originCountry: string; embedded?: boolean }) {
  const content = history.length ? <ol className="mt-3" aria-label="Recorded shipment events">{history.map((event, index) => { const timestamp = formatDateTime(event.created_at); const location = splitLocation(event.location, originCountry); const current = index === history.length - 1 && normalizeShipmentStatus(event.status) === normalizeShipmentStatus(currentStatus); return <li key={`${event.created_at}-${event.status}-${index}`} className="relative flex min-h-14 gap-2.5 last:min-h-0 sm:gap-3">{index < history.length - 1 && <span aria-hidden="true" className="absolute left-5 top-10 h-[calc(100%-1.5rem)] w-1 -translate-x-1/2 rounded-full bg-[#f6c945]"/>}<span className={`relative z-10 grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 shadow-[0_0_0_5px] ${current ? "border-blue-600 bg-blue-600 text-white shadow-blue-100" : "border-[#e4b72e] bg-[#f6c945] text-[#071a33] shadow-yellow-100"}`}>{current ? <StageIcon icon="package"/> : <CheckIcon/>}</span><div className="min-w-0 flex-1 pb-3 pt-0.5"><div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4"><div><h3 className={`text-sm font-bold sm:text-base ${current ? "text-blue-800" : "text-[#725600]"}`}>{event.status}</h3><span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider ${current ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-[#725600]"}`}>{current ? "Current recorded event" : "Recorded"}</span></div><time dateTime={event.created_at} className="shrink-0 text-left text-xs font-semibold text-slate-500 sm:text-right"><span className="block font-bold text-slate-700">{timestamp.date}</span><span className="mt-0.5 block">{timestamp.time}</span></time></div>{event.location && <div className="mt-2 flex items-start gap-2 text-sm"><PinIcon/><p><span className="block font-bold text-slate-700">{location.city}</span>{location.country && <span className="mt-0.5 block text-xs font-semibold text-slate-400">{location.country}</span>}</p></div>}</div></li>; })}</ol> : <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-xs leading-5 text-blue-800">No recorded shipment events are available yet.</p>;
  if (embedded) return <div><p className="mt-4 text-[0.62rem] font-extrabold uppercase tracking-[0.16em] text-blue-600">Completed / recorded events</p>{content}</div>;
  return <section className="rounded-[1.25rem] border border-slate-200/70 bg-white p-3.5 shadow-[0_16px_42px_-27px_rgba(15,23,42,0.36)]" aria-labelledby="recorded-history-title"><p className="text-[0.64rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">Actual shipment activity</p><h2 id="recorded-history-title" className="mt-1 text-xl font-extrabold tracking-[-0.02em] sm:text-2xl">Recorded Events</h2>{content}</section>;
}

function getActiveLegIndex(journey: RouteJourney, currentCheckpointIndex: number, delivered: boolean) {
  if (delivered) return journey.legs.length - 1;
  const checkpointPositions = new Map(journey.checkpoints.map((checkpoint, index) => [checkpoint.id, index]));
  const index = journey.legs.findIndex((leg) => {
    const finalCheckpoint = Math.max(...leg.checkpointIds.map((id) => checkpointPositions.get(id) ?? -1));
    return currentCheckpointIndex <= finalCheckpoint;
  });
  return index < 0 ? Math.max(0, journey.legs.length - 1) : index;
}

function JourneyLegTimeline({ journey, activeLegIndex, completedCheckpointIndex, delivered }: { journey: RouteJourney; activeLegIndex: number; completedCheckpointIndex: number; delivered: boolean }) {
  return <section className="overflow-hidden rounded-[1.25rem] border border-slate-200/70 bg-white shadow-[0_16px_42px_-27px_rgba(15,23,42,0.38)]" aria-labelledby="shipment-progress-title">
    <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-blue-50/70 px-4 py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[0.58rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">Shipment journey</p><h2 id="shipment-progress-title" className="text-lg font-black tracking-[-0.025em] text-[#071a33]">Route Timeline</h2></div>
        <p className="text-xs font-bold text-slate-500">{journey.legs.length} {journey.legs.length === 1 ? "journey leg" : "journey legs"}</p>
      </div>
    </div>
    <ol className="px-3 py-2 sm:px-4" aria-label="Shipment journey legs">
      {journey.legs.map((leg, index) => {
        const checkpointPositions = new Map(journey.checkpoints.map((checkpoint, checkpointIndex) => [checkpoint.id, checkpointIndex]));
        const legFinalCheckpoint = Math.max(...leg.checkpointIds.map((id) => checkpointPositions.get(id) ?? -1));
        const status = index === activeLegIndex && !delivered ? "current" : delivered || legFinalCheckpoint <= completedCheckpointIndex ? "completed" : "pending";
        return <JourneyLegItem key={leg.id} leg={leg} index={index} total={journey.legs.length} status={status} />;
      })}
    </ol>
  </section>;
}

function JourneyLegItem({ leg, index, total, status }: { leg: RouteLeg; index: number; total: number; status: "completed" | "current" | "pending" }) {
  const current = status === "current";
  const completed = status === "completed";
  const mode = leg.displayMode ?? titleCase(leg.transportMode);
  return <li className={`relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2.5 rounded-xl px-1.5 py-2 transition-colors sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-3 sm:px-2 ${current ? "bg-gradient-to-r from-blue-50 to-cyan-50/40 ring-1 ring-inset ring-blue-100 shadow-sm" : ""}`}>
    {index < total - 1 && <span aria-hidden="true" className={`absolute bottom-[-0.7rem] left-[1.6rem] top-10 w-0.5 sm:left-[1.75rem] ${completed ? "bg-[#f6c945]" : "bg-slate-200"}`} />}
    <span className={`relative z-10 grid h-9 w-9 place-items-center rounded-xl border shadow-sm sm:h-10 sm:w-10 ${completed ? "border-yellow-300 bg-[#f6c945] text-[#071a33]" : current ? "border-blue-600 bg-blue-600 text-white shadow-blue-200" : "border-slate-200 bg-slate-50 text-slate-400"}`}>
      {completed ? <CheckIcon /> : <TransportIcon mode={mode} />}
    </span>
    <div className="min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.6rem] font-black uppercase tracking-[0.11em] ${current ? "bg-blue-600 text-white" : completed ? "bg-yellow-100 text-[#725600]" : "bg-slate-100 text-slate-500"}`}><TransportIcon mode={mode} compact />{mode}</span>
        <span className={`text-[0.6rem] font-extrabold uppercase tracking-[0.12em] ${current ? "text-blue-700" : completed ? "text-[#8a6800]" : "text-slate-400"}`}>{current ? "Current leg" : completed ? "Completed" : "Pending"}</span>
      </div>
      <div className="mt-2 grid items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
        <LocationLabel eyebrow="Origin" name={leg.origin.name} detail={[leg.origin.city, leg.origin.country].filter(Boolean).join(", ")} />
        <span aria-hidden="true" className={`hidden h-px w-8 sm:block ${completed ? "bg-yellow-400" : current ? "bg-blue-400" : "bg-slate-200"}`} />
        <LocationLabel eyebrow="Destination" name={leg.destination.name} detail={[leg.destination.city, leg.destination.country].filter(Boolean).join(", ")} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 border-t border-slate-100 pt-2 text-[0.68rem] font-semibold text-slate-500">
        <LegMetric icon={<ClockIcon />} label="Estimated duration" value={formatDuration(leg.estimatedDurationHours)} />
        <LegMetric icon={<DistanceIcon />} label="Estimated distance" value={formatDistance(leg.estimatedDistanceKm)} />
      </div>
    </div>
  </li>;
}

function LocationLabel({ eyebrow, name, detail }: { eyebrow: string; name: string; detail: string }) { return <div className="min-w-0"><p className="text-[0.56rem] font-black uppercase tracking-[0.13em] text-slate-400">{eyebrow}</p><p className="mt-0.5 break-words text-xs font-black leading-4 text-slate-800 sm:text-sm">{name}</p>{detail && <p className="mt-0.5 text-[0.65rem] font-medium text-slate-500">{detail}</p>}</div>; }
function LegMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <span className="inline-flex items-center gap-1.5" title={label}>{icon}<span className="text-slate-400">{label}:</span><strong className="text-slate-700">{value}</strong></span>; }
function formatDuration(hours: number | null | undefined) { if (hours == null) return "To be confirmed"; if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"}`; const days = hours / 24; return `${Number.isInteger(days) ? days : days.toFixed(1)} days`; }
function formatDistance(distance: number | null | undefined) { return distance == null ? "To be confirmed" : `${new Intl.NumberFormat("en").format(distance)} km`; }
function titleCase(value: string) { return value.charAt(0).toUpperCase() + value.slice(1); }

function splitLocation(value: string | null | undefined, fallbackCountry: string) { if (!value) return { city: "", country: fallbackCountry }; const parts = value.split(",").map((part) => part.trim()).filter(Boolean); return { city: parts[0] || value, country: parts.length > 1 ? parts.at(-1) || fallbackCountry : fallbackCountry }; }
function IconBase({ children, className = "h-5 w-5" }: { children: React.ReactNode; className?: string }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>{children}</svg>; }
function CheckIcon() { return <IconBase className="h-4 w-4"><path d="m5 12 4 4L19 6" /></IconBase>; }
function PinIcon() { return <IconBase className="h-4 w-4 text-blue-600"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></IconBase>; }
function ClockIcon() { return <IconBase className="h-3.5 w-3.5"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></IconBase>; }
function DistanceIcon() { return <IconBase className="h-3.5 w-3.5"><circle cx="5" cy="17" r="2"/><circle cx="19" cy="7" r="2"/><path d="M7 17h3c4 0 2-10 6-10h1"/></IconBase>; }
function TransportIcon({ mode, compact = false }: { mode: string; compact?: boolean }) {
  const className = compact ? "h-3 w-3" : "h-5 w-5";
  const normalized = mode.toLowerCase();
  if (normalized === "air") return <IconBase className={className}><path d="m3 14 18-7-6 7 4 3-16-1 5-3Z"/><path d="m10 11-3-5 2-1 5 4"/></IconBase>;
  if (normalized === "sea") return <IconBase className={className}><path d="M3 15h18l-3 5H7Z"/><path d="M7 15V8h10v7M10 8V4h4v4"/></IconBase>;
  if (normalized === "rail") return <IconBase className={className}><rect x="6" y="3" width="12" height="15" rx="2"/><path d="M8 8h8M9 21l3-3 3 3M9 14h.01M15 14h.01"/></IconBase>;
  if (normalized === "courier") return <IconBase className={className}><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></IconBase>;
  if (normalized === "internal transfer") return <IconBase className={className}><path d="M5 8h13l-3-3M19 16H6l3 3"/></IconBase>;
  return <IconBase className={className}><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></IconBase>;
}
function StageIcon({ icon }: { icon: MilestoneIcon }) { if (icon === "air") return <IconBase><path d="m2 16 20-8-6 7 5 3-19-1 5-2Z"/></IconBase>; if (icon === "sea") return <IconBase><path d="M3 15h18l-3 5H7Z"/><path d="M7 15V8h10v7M10 8V4h4v4"/></IconBase>; if (icon === "road" || icon === "collection" || icon === "delivery") return <IconBase><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></IconBase>; if (icon === "warehouse") return <IconBase><path d="M4 8h16v12H4zM8 4h8v4M4 13h16"/></IconBase>; if (icon === "customs") return <IconBase><path d="M4 9h16M6 9V7l6-4 6 4v2M7 9v8M12 9v8M17 9v8M4 17h16v3H4z"/></IconBase>; if (icon === "delivered") return <IconBase><path d="m5 12 4 4L19 6"/></IconBase>; return <IconBase><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></IconBase>; }
