type ShipmentHistory = {
  id: number;
  status: string;
  location: string | null;
  note: string | null;
  created_at: string;
};

type ShipmentTimelineProps = {
  shipmentStatus: string | null;
  history: ShipmentHistory[];
};

const stages = [
  { title: "Shipment Created", icon: PackageIcon },
  { title: "Picked Up", icon: PickupIcon },
  { title: "In Transit", icon: TransitIcon },
  { title: "Customs Clearance", icon: CustomsIcon },
  { title: "Out for Delivery", icon: DeliveryIcon },
  { title: "Delivered", icon: CheckIcon },
] as const;

function normalizeStatus(status: string | null | undefined) {
  const value = status?.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ") ?? "";

  if (/delivered|complete/.test(value)) return 5;
  if (/out for delivery|with courier|last mile/.test(value)) return 4;
  if (/custom|clearance|cleared/.test(value)) return 3;
  if (/in transit|warehouse|hub|departed|arrived/.test(value)) return 2;
  if (/picked up|pickup|collected/.test(value)) return 1;
  if (/created|booked|pending|registered|label/.test(value)) return 0;
  return 0;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ShipmentTimeline({ shipmentStatus, history }: ShipmentTimelineProps) {
  const chronologicalHistory = [...history].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const latestHistory = chronologicalHistory.at(-1);
  const currentIndex = normalizeStatus(latestHistory?.status ?? shipmentStatus);
  const eventsByStage = new Map<number, ShipmentHistory>();

  chronologicalHistory.forEach((event) => {
    eventsByStage.set(normalizeStatus(event.status), event);
  });

  return (
    <section className="rounded-[1.5rem] border border-slate-200/80 bg-white p-5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.28)] sm:p-8">
      <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-blue-600">Live progress</p>
      <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <h2 className="text-2xl font-extrabold tracking-[-0.02em]">Shipment Timeline</h2>
        <p className="text-sm font-medium text-slate-500">
          Step {currentIndex + 1} of {stages.length}
        </p>
      </div>

      <ol className="mt-9" aria-label="Shipment progress">
        {stages.map((stage, index) => {
          const event = eventsByStage.get(index);
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const state = isComplete ? "complete" : isCurrent ? "current" : "future";
          const Icon = stage.icon;

          const colors = {
            complete: {
              icon: "border-emerald-600 bg-emerald-600 text-white shadow-emerald-100",
              line: "bg-emerald-500",
              title: "text-emerald-800",
              label: "Completed",
            },
            current: {
              icon: "border-blue-600 bg-blue-600 text-white shadow-blue-100",
              line: "bg-slate-200",
              title: "text-blue-700",
              label: "Current stage",
            },
            future: {
              icon: "border-slate-300 bg-white text-slate-400 shadow-slate-100",
              line: "bg-slate-200",
              title: "text-slate-500",
              label: "Upcoming",
            },
          }[state];

          return (
            <li key={stage.title} className="relative flex min-h-24 gap-4 last:min-h-0 sm:gap-5">
              {index < stages.length - 1 && (
                <span aria-hidden="true" className={`absolute left-[23px] top-12 h-[calc(100%-2rem)] w-1 -translate-x-1/2 rounded-full ${colors.line}`} />
              )}
              <span className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 shadow-[0_0_0_6px] ${colors.icon}`}>
                <Icon />
              </span>
              <div className="min-w-0 flex-1 pb-8 pt-0.5">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                  <div>
                    <h3 className={`text-base font-bold sm:text-lg ${colors.title}`}>{stage.title}</h3>
                    <span className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wider ${isCurrent ? "bg-blue-100 text-blue-700" : isComplete ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {colors.label}
                    </span>
                  </div>
                  {event && (
                    <time dateTime={event.created_at} className="shrink-0 text-sm font-medium text-slate-500">
                      {formatDateTime(event.created_at)}
                    </time>
                  )}
                </div>
                {event?.location && <p className="mt-2 text-sm font-semibold text-slate-700">{event.location}</p>}
                {event?.note && <p className="mt-1 text-sm leading-6 text-slate-500">{event.note}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function IconBase({ children }: { children: React.ReactNode }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">{children}</svg>;
}

function PackageIcon() {
  return <IconBase><path d="m4 7 8-4 8 4-8 4-8-4Z" /><path d="M4 7v10l8 4 8-4V7M12 11v10" /></IconBase>;
}
function PickupIcon() {
  return <IconBase><path d="M3 6h11v11H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></IconBase>;
}
function TransitIcon() {
  return <IconBase><path d="M4 12h16M14 6l6 6-6 6M4 7h6M4 17h6" /></IconBase>;
}
function CustomsIcon() {
  return <IconBase><path d="M4 9h16M6 9V7l6-4 6 4v2M7 9v8M12 9v8M17 9v8M4 17h16v3H4z" /></IconBase>;
}
function DeliveryIcon() {
  return <IconBase><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><path d="m7 12 2 2 3-4" /><circle cx="7" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></IconBase>;
}
function CheckIcon() {
  return <IconBase><path d="m5 12 4 4L19 6" /></IconBase>;
}
