"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LOCATION_TYPE_LABELS, listLocationCountries, locationTypeLabel, prioritizedLocationTypes, routeStopType, searchLocations, type LogisticsLocationRecord, type LogisticsLocationType } from "../lib/logistics-location-library";
import { COORDINATES_UNAVAILABLE_MESSAGE, hasUsableVerifiedCoordinates } from "../lib/route-journey-estimates";
import type { EditableRouteStop } from "../lib/saved-routes";

const TRANSPORT_TYPES: Record<string, LogisticsLocationType[]> = {
  Air: ["airport", "cargo_terminal", "warehouse", "distribution_centre"],
  Sea: ["seaport", "inland_container_depot", "cargo_terminal", "warehouse", "rail_terminal"],
  Road: ["border_post", "warehouse", "distribution_centre", "customs_facility", "inland_container_depot", "rail_terminal"],
};
const GROUP_ORDER = ["Airports", "Seaports", "Dry Ports & Inland Depots", "Border Posts", "Warehouses", "Distribution Centers", "Rail Terminals", "Other Logistics Locations"];
function groupName(type: LogisticsLocationType) { return ({ airport: "Airports", seaport: "Seaports", inland_container_depot: "Dry Ports & Inland Depots", border_post: "Border Posts", warehouse: "Warehouses", distribution_centre: "Distribution Centers", rail_terminal: "Rail Terminals" } as Partial<Record<LogisticsLocationType, string>>)[type] ?? "Other Logistics Locations"; }
export function countryFlag(code?: string | null) { return code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((letter) => 127397 + letter.charCodeAt(0))) : "🌐"; }

export default function LogisticsLocationSelector({ transportMode, onAdd }: { transportMode: string; onAdd: (stop: EditableRouteStop) => void }) {
  const initialMode = ["Air", "Sea", "Road"].includes(transportMode) ? transportMode : "All";
  const [transportFilter, setTransportFilter] = useState(initialMode);
  const [countries, setCountries] = useState<Array<{ country: string; countryCode: string }>>([]);
  const [countryCode, setCountryCode] = useState(""); const [type, setType] = useState<LogisticsLocationType | "">(""); const [query, setQuery] = useState("");
  const [results, setResults] = useState<LogisticsLocationRecord[]>([]); const [selected, setSelected] = useState<LogisticsLocationRecord | null>(null);
  const [message, setMessage] = useState(""); const [searchError, setSearchError] = useState(""); const [searching, setSearching] = useState(false);
  const types = useMemo(() => prioritizedLocationTypes(transportFilter), [transportFilter]);
  const grouped = useMemo(() => GROUP_ORDER.map((group) => ({ group, locations: results.filter((location) => groupName(location.location_type) === group) })).filter((entry) => entry.locations.length), [results]);

  const loadCountries = useCallback(async () => { const result = await listLocationCountries(); if (result.error) setMessage(result.error.message); else setCountries(result.data); }, []);
  useEffect(() => {
    // The ISO country reference is independent from location-table coverage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCountries();
  }, [loadCountries]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (!countryCode && !type && query.trim().length < 2) { setResults([]); setSearchError(""); setSearching(false); return; }
      setSearching(true); setMessage(""); setSearchError("");
      const transportTypes = transportFilter === "All" ? undefined : TRANSPORT_TYPES[transportFilter];
      void searchLocations({ countryCode, type, types: type ? undefined : transportTypes, query, verified: "verified", pageSize: 40 }).then((result) => { setResults(result.data); setSearching(false); if (result.error) setSearchError(`Unable to search logistics locations: ${result.error.message}`); });
    }, 180);
    return () => window.clearTimeout(timer);
  }, [countryCode, query, transportFilter, type]);

  function addSelected() {
    if (!selected) { setMessage("Select a verified logistics location first."); return; }
    if (process.env.NODE_ENV === "development") {
      console.debug("[BALO ROUTE DEBUG] SELECTED LOCATION", {
        id: selected.id,
        name: selected.name,
        latitude: selected.latitude,
        longitude: selected.longitude,
        latitudeType: typeof selected.latitude,
        longitudeType: typeof selected.longitude,
        location: selected,
      });
    }
    onAdd({ id: crypto.randomUUID(), name: selected.name, country: selected.country, city: selected.city ?? selected.country, stop_type: routeStopType(selected.location_type), code: selected.code, operational_notes: null, onward_transport: null, logistics_location_id: selected.id, logistics_location: { country_code: selected.country_code, location_type: selected.location_type, secondary_code: selected.secondary_code, latitude: selected.latitude, longitude: selected.longitude, verified: selected.verified } });
    setSelected(null); setQuery(""); setResults([]); setMessage("Verified location added to the route.");
  }

  return <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4" aria-labelledby="add-location-title">
    <div><p className="text-[0.6rem] font-black uppercase tracking-[0.15em] text-blue-600">Production location library</p><h4 id="add-location-title" className="mt-1 text-sm font-black text-[#071a33]">+ Add verified stop</h4><p className="mt-1 text-xs text-slate-500">Search by official code, city, country, facility type, or any part of the location name.</p></div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <label><Label>Transport mode</Label><select value={transportFilter} onChange={(event) => { setTransportFilter(event.target.value); setType(""); setSelected(null); }} className="field"><option>All</option><option>Air</option><option>Sea</option><option>Road</option></select></label>
      <label><Label>Country</Label><select value={countryCode} onChange={(event) => { setCountryCode(event.target.value); setSelected(null); }} className="field"><option value="">All countries</option>{countries.map((item) => <option key={item.countryCode} value={item.countryCode}>{countryFlag(item.countryCode)} {item.country}</option>)}</select></label>
      <label><Label>Location type</Label><select value={type} onChange={(event) => { setType(event.target.value as LogisticsLocationType | ""); setSelected(null); }} className="field"><option value="">All location types</option>{types.map((item) => <option key={item} value={item}>{LOCATION_TYPE_LABELS[item]}</option>)}</select></label>
      <label><Label>Search locations</Label><input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="JNB, Walvis Bay, warehouse..." className="field" autoComplete="off" /></label>
    </div>
    <div className="mt-3 max-h-96 overflow-y-auto" aria-live="polite">
      {!searching && !searchError && !countryCode && !type && query.trim().length < 2 && <p className="rounded-xl border border-dashed border-blue-200 bg-white p-4 text-xs font-bold text-slate-500">Search by airport, seaport, city, country or code.</p>}
      {searching && <p className="p-3 text-xs font-bold text-slate-500">Searching production locations...</p>}
      {!searching && searchError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">{searchError}</p>}
      {!searching && !searchError && (countryCode || type || query.trim().length >= 2) && results.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-xs font-bold text-slate-500">No matching logistics locations found.</p>}
      {!searching && !searchError && grouped.map(({ group, locations }) => <section key={group} className="mb-3 last:mb-0"><h5 className="sticky top-0 z-10 border-b border-blue-100 bg-blue-50/95 px-2 py-2 text-[0.62rem] font-black uppercase tracking-[0.14em] text-blue-800 backdrop-blur">{group} <span className="text-blue-400">{locations.length}</span></h5><div className="grid gap-2 pt-2">{locations.map((location) => { const codes = [location.code, location.secondary_code].filter(Boolean); return <button type="button" key={location.id} onClick={() => setSelected(location)} className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left ${selected?.id === location.id ? "border-blue-500 bg-blue-50 ring-2 ring-blue-100" : "border-slate-200 bg-white hover:border-blue-200"}`}><span className="flex min-w-0 items-center gap-3"><span className="text-xl" aria-label={location.country}>{countryFlag(location.country_code)}</span><span className="min-w-0"><span className="block truncate text-xs font-black text-slate-800">{location.name}</span><span className="mt-1 block text-[0.65rem] font-semibold text-slate-500">{location.city || "City not listed"}, {location.country}</span><span className="mt-0.5 block text-[0.6rem] font-bold text-blue-600">{locationTypeLabel(location.location_type, location.name)}{codes.length ? ` • ${codes.join(" • ")}` : ""}</span></span></span><span className="rounded-full bg-emerald-50 px-2 py-1 text-[0.58rem] font-black uppercase text-emerald-700">Verified</span></button>; })}</div></section>)}
    </div>
    {selected && !hasUsableVerifiedCoordinates(selected) && <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{COORDINATES_UNAVAILABLE_MESSAGE}</p>}
    <div className="mt-3 flex justify-end"><button type="button" disabled={!selected} onClick={addSelected} className="rounded-xl bg-blue-600 px-5 py-2.5 text-xs font-black text-white hover:bg-blue-700 disabled:opacity-40">Add Selected Stop</button></div>
    {message && <p role="status" className="mt-3 text-xs font-bold text-slate-600">{message}</p>}
  </section>;
}
function Label({ children }: { children: React.ReactNode }) { return <span className="mb-1 block text-[0.6rem] font-black uppercase tracking-wider text-slate-500">{children}</span>; }
