export type RouteLocationPresentationInput = { name: string; code?: string | null; city?: string | null; country?: string | null };
function normalize(value: string | null | undefined) { return value?.trim().toLowerCase() ?? ""; }
export function facilityNameWithCode(location: RouteLocationPresentationInput) { const name = location.name.trim(); const code = location.code?.trim(); return !code || normalize(name).includes(`(${normalize(code)})`) ? name : `${name} (${code})`; }
export function cityCountryContext(location: RouteLocationPresentationInput) { const city = location.city?.trim() ?? ""; const country = location.country?.trim() ?? ""; if (!city) return country; return !country || normalize(city).includes(normalize(country)) ? city : `${city}, ${country}`; }
