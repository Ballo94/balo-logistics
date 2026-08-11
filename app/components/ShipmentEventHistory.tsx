import type { ShipmentEvent, ShipmentEventType } from "../lib/shipment-events";

export default function ShipmentEventHistory({ events }: { events: ShipmentEvent[] }) {
  return <section aria-labelledby="shipment-events-title">
    <div className="mb-2.5"><p className="text-[0.58rem] font-extrabold uppercase tracking-[0.18em] text-blue-600">Newest first</p><h2 id="shipment-events-title" className="text-lg font-black tracking-tight text-slate-950">Shipment History</h2></div>
    <div className="overflow-hidden rounded-[1.25rem] border border-slate-200/70 bg-white shadow-[0_15px_38px_-27px_rgba(15,23,42,.34)]">
      {!events.length ? <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No shipment events have been recorded.</p> : <ol className="px-3 py-2 sm:px-4">
        {events.map((event, index) => {
          const date = formatEventTime(event.event_time);
          const current = index === 0;
          return <li key={event.id} className={`relative grid grid-cols-[2.25rem_minmax(0,1fr)] gap-2.5 rounded-xl px-1.5 py-2.5 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-3 sm:px-2 ${current ? "bg-gradient-to-r from-blue-50 to-cyan-50/40 ring-1 ring-inset ring-blue-100" : ""}`}>
            {index < events.length - 1 && <span aria-hidden="true" className="absolute bottom-[-0.65rem] left-[1.6rem] top-10 w-0.5 bg-slate-200 sm:left-[1.75rem]" />}
            <span className={`relative z-10 grid h-9 w-9 place-items-center rounded-xl border shadow-sm sm:h-10 sm:w-10 ${current ? "border-blue-600 bg-blue-600 text-white shadow-blue-200" : eventTone(event.event_type)}`}><EventIcon type={event.event_type} /></span>
            <div className="min-w-0">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4"><div><p className="text-[0.56rem] font-black uppercase tracking-[0.12em] text-blue-600">{event.event_type}</p><h3 className="mt-0.5 text-sm font-black text-slate-900">{event.title}</h3></div><time dateTime={event.event_time} className="shrink-0 text-[0.66rem] font-bold text-slate-500 sm:text-right"><span className="block text-slate-700">{date.date}</span><span>{date.time}</span></time></div>
              <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-600"><PinIcon />{event.city}, {event.country}</p>
              {event.description && <p className="mt-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{event.description}</p>}
            </div>
          </li>;
        })}
      </ol>}
    </div>
  </section>;
}

function formatEventTime(value: string) { const date = new Date(value); if (Number.isNaN(date.getTime())) return { date: value, time: "" }; return { date: new Intl.DateTimeFormat("en", { day: "2-digit", month: "short", year: "numeric" }).format(date), time: new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit" }).format(date) }; }
function eventTone(type: ShipmentEventType) { if (type === "Delivered") return "border-emerald-300 bg-emerald-100 text-emerald-700"; if (type === "Delayed" || type === "Exception" || type === "Returned") return "border-red-200 bg-red-50 text-red-700"; return "border-yellow-300 bg-yellow-100 text-[#725600]"; }
function Icon({ children }: { children: React.ReactNode }) { return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">{children}</svg>; }
function PinIcon() { return <Icon><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/></Icon>; }
function EventIcon({ type }: { type: ShipmentEventType }) {
  if (type.includes("Flight")) return <Icon><path d="m3 14 18-7-6 7 4 3-16-1 5-3Z"/></Icon>;
  if (type.includes("Sea")) return <Icon><path d="M3 15h18l-3 5H7Z"/><path d="M7 15V8h10v7M10 8V4h4v4"/></Icon>;
  if (type.includes("Warehouse")) return <Icon><path d="M4 9 12 4l8 5v11H4Z"/><path d="M8 20v-7h8v7"/></Icon>;
  if (type === "Customs Clearance") return <Icon><path d="M4 9h16M6 9V7l6-4 6 4v2M7 9v8M12 9v8M17 9v8M4 17h16v3H4z"/></Icon>;
  if (type === "Delivered") return <Icon><path d="m5 12 4 4L19 6"/></Icon>;
  if (type === "Delayed" || type === "Exception" || type === "Returned") return <Icon><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 17h.01"/></Icon>;
  if (type === "Out For Delivery" || type === "Local Distribution" || type === "Shipment Collected") return <Icon><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/></Icon>;
  return <Icon><path d="m4 7 8-4 8 4-8 4-8-4Z"/><path d="M4 7v10l8 4 8-4V7M12 11v10"/></Icon>;
}
