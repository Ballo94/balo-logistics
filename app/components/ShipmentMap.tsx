"use client";

import "leaflet/dist/leaflet.css";

import { divIcon, LatLngBoundsExpression, LatLngExpression } from "leaflet";
import { useEffect, useState } from "react";
import { MapContainer, Marker, Polyline, Popup, TileLayer, useMap } from "react-leaflet";

type ShipmentMapProps = {
  origin: string;
  currentLocation: string | null;
  destination: string;
};

type MapPoint = {
  label: "Origin" | "Current location" | "Destination";
  name: string;
  position: LatLngExpression;
};

type GeocodingResult = {
  lat: string;
  lon: string;
};

const coordinateCache = new Map<string, LatLngExpression>();

async function geocode(location: string, signal: AbortSignal) {
  const cached = coordinateCache.get(location);
  if (cached) return cached;

  const query = new URLSearchParams({ q: location, format: "jsonv2", limit: "1" });
  const response = await fetch(`https://nominatim.openstreetmap.org/search?${query}`, {
    headers: { "Accept-Language": "en" },
    signal,
  });
  if (!response.ok) throw new Error("Location lookup failed");

  const [result] = (await response.json()) as GeocodingResult[];
  if (!result) return null;
  const position: LatLngExpression = [Number(result.lat), Number(result.lon)];
  coordinateCache.set(location, position);
  return position;
}

function markerIcon(kind: MapPoint["label"]) {
  const isCurrent = kind === "Current location";
  const color = isCurrent ? "#2563eb" : kind === "Origin" ? "#0f172a" : "#10b981";
  return divIcon({
    className: "shipment-map-marker",
    iconAnchor: [16, 16],
    popupAnchor: [0, -18],
    html: `<span style="display:block;width:32px;height:32px;border-radius:9999px;background:${color};border:4px solid white;box-shadow:0 4px 14px rgba(15,23,42,.35)${isCurrent ? ";outline:8px solid rgba(37,99,235,.22)" : ""}"></span>`,
  });
}

function FitMapToRoute({ points }: { points: MapPoint[] }) {
  const map = useMap();

  useEffect(() => {
    if (points.length === 1) map.setView(points[0].position, 8);
    if (points.length > 1) {
      map.fitBounds(points.map((point) => point.position) as LatLngBoundsExpression, {
        padding: [42, 42],
        maxZoom: 8,
      });
    }
  }, [map, points]);

  return null;
}

export default function ShipmentMap({ origin, currentLocation, destination }: ShipmentMapProps) {
  const locationKey = `${origin}\u0000${currentLocation ?? ""}\u0000${destination}`;
  const [mapResult, setMapResult] = useState<{ key: string; points: MapPoint[]; error: string }>({
    key: "",
    points: [],
    error: "",
  });

  useEffect(() => {
    const controller = new AbortController();
    const locations = [
      { label: "Origin" as const, name: origin },
      ...(currentLocation?.trim() ? [{ label: "Current location" as const, name: currentLocation }] : []),
      { label: "Destination" as const, name: destination },
    ];

    void Promise.all(
      locations.map(async (location) => ({ ...location, position: await geocode(location.name, controller.signal) })),
    )
      .then((results) => {
        setMapResult({
          key: locationKey,
          points: results.filter((point): point is MapPoint => point.position !== null),
          error: "",
        });
      })
      .catch((lookupError: unknown) => {
        if (lookupError instanceof DOMException && lookupError.name === "AbortError") return;
        setMapResult({ key: locationKey, points: [], error: "The shipment locations could not be plotted right now." });
      });

    return () => controller.abort();
  }, [currentLocation, destination, locationKey, origin]);

  const points = mapResult.key === locationKey ? mapResult.points : [];
  const loading = mapResult.key !== locationKey;
  const error = mapResult.key === locationKey ? mapResult.error : "";
  const route = points.map((point) => point.position);

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-slate-200/80 bg-white shadow-[0_18px_45px_-22px_rgba(15,23,42,0.28)] lg:col-span-2">
      <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-7 sm:py-6">
        <div>
          <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.2em] text-blue-600">Live route</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-[-0.02em]">Shipment Map</h2>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs font-semibold text-slate-600" aria-label="Map legend">
          <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-slate-950" />Origin</span>
          <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-blue-600 ring-4 ring-blue-100" />Current</span>
          <span><i className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />Destination</span>
        </div>
      </div>

      <div className="relative h-[22rem] w-full sm:h-[28rem]">
        {loading && <div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-100 text-sm font-semibold text-slate-500">Plotting shipment route...</div>}
        {error && <div className="absolute inset-0 z-[500] flex items-center justify-center bg-slate-100 px-6 text-center text-sm font-semibold text-slate-600">{error}</div>}
        <MapContainer center={[0, 0]} zoom={2} scrollWheelZoom className="h-full w-full" aria-label="Interactive shipment route map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitMapToRoute points={points} />
          {route.length > 1 && <Polyline positions={route} pathOptions={{ color: "#2563eb", weight: 4, opacity: 0.8, dashArray: "10 8" }} />}
          {points.map((point) => (
            <Marker key={point.label} position={point.position} icon={markerIcon(point.label)} zIndexOffset={point.label === "Current location" ? 1000 : 0}>
              <Popup><strong>{point.label}</strong><br />{point.name}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </section>
  );
}
