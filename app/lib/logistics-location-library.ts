import { supabase } from "./supabase";
import type { SavedRouteStopType } from "./saved-routes";

export const LOCATION_TYPES = ["airport", "seaport", "border_post", "warehouse", "distribution_centre", "customs_facility", "rail_terminal", "inland_container_depot", "cargo_terminal", "delivery_depot", "other"] as const;
export type LogisticsLocationType = (typeof LOCATION_TYPES)[number];
export type LogisticsLocationRecord = { id: string; name: string; country: string; country_code: string; country_secondary: string | null; country_secondary_code: string | null; city: string | null; location_type: LogisticsLocationType; code: string | null; secondary_code: string | null; latitude: number | null; longitude: number | null; address: string | null; status: "Active" | "Archived"; notes: string | null; source: string; source_reference: string | null; verified: boolean; admin_managed: boolean; created_at?: string; updated_at?: string };

export const LOCATION_TYPE_LABELS: Record<LogisticsLocationType, string> = { airport: "Airport", seaport: "Seaport", border_post: "Border Post", warehouse: "Warehouse", distribution_centre: "Distribution Centre", customs_facility: "Customs Facility", rail_terminal: "Rail Terminal", inland_container_depot: "Inland Container Depot", cargo_terminal: "Cargo Terminal", delivery_depot: "Delivery Depot", other: "Other" };
export function locationTypeLabel(type: LogisticsLocationType, name = "") { return type === "inland_container_depot" && /dry\s*port/i.test(name) ? "Dry Port" : LOCATION_TYPE_LABELS[type]; }
const PRIORITIES: Record<string, LogisticsLocationType[]> = { air: ["airport", "cargo_terminal", "warehouse"], sea: ["seaport", "cargo_terminal", "inland_container_depot"], road: ["border_post", "warehouse", "distribution_centre", "customs_facility"] };

export function routeStopType(type: LogisticsLocationType): SavedRouteStopType { return ({ airport: "airport", seaport: "port", border_post: "border", warehouse: "warehouse", distribution_centre: "distribution_centre", customs_facility: "customs", rail_terminal: "rail_terminal", inland_container_depot: "transit_hub", cargo_terminal: "transit_hub", delivery_depot: "delivery_depot", other: "other" } as const)[type]; }
export function prioritizedLocationTypes(transportMode: string) { const preferred = PRIORITIES[transportMode.trim().toLowerCase()] ?? []; return [...preferred, ...LOCATION_TYPES.filter((type) => !preferred.includes(type))]; }

export async function listLocationCountries() {
  const { data, error } = await supabase.rpc("list_logistics_location_countries");
  return { data: (data ?? []).map((item: { country: string; country_code: string }) => ({ country: item.country, countryCode: item.country_code })), error };
}

export async function searchLocations({ query, country, city, type, types, verified, includeArchived = false, page = 0, pageSize = 20 }: { query?: string; country?: string; city?: string; type?: LogisticsLocationType | ""; types?: LogisticsLocationType[]; verified?: "verified" | "unverified" | ""; includeArchived?: boolean; page?: number; pageSize?: number }) {
  let request = supabase.from("logistics_locations").select("id, name, country, country_code, country_secondary, country_secondary_code, city, location_type, code, secondary_code, latitude, longitude, address, status, notes, source, source_reference, verified, admin_managed, created_at, updated_at", { count: "exact" });
  if (!includeArchived) request = request.eq("status", "Active");
  if (country) request = request.eq("country", country);
  if (city) request = request.ilike("city", `%${city.trim().replaceAll("%", "")}%`);
  if (type) request = request.eq("location_type", type);
  else if (types?.length) request = request.in("location_type", types);
  if (verified === "verified") request = request.eq("verified", true);
  if (verified === "unverified") request = request.eq("verified", false);
  const safe = query?.trim().replaceAll(",", " ").replaceAll("%", "") ?? "";
  if (safe) request = request.or(`name.ilike.%${safe}%,city.ilike.%${safe}%,country.ilike.%${safe}%,code.ilike.%${safe}%,secondary_code.ilike.%${safe}%`);
  const from = page * pageSize;
  const { data, error, count } = await request.order("name").range(from, from + pageSize - 1);
  return { data: (data ?? []) as LogisticsLocationRecord[], error, count: count ?? 0 };
}
