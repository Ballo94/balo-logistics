import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv";
const COUNTRIES_URL = "https://davidmegginson.github.io/ourairports-data/countries.csv";
const WPI_URL = "https://services-eu1.arcgis.com/BuS9rtTsYEV5C0xh/arcgis/rest/services/World_Port_Index/FeatureServer/0/query";
const OUTPUT = path.join(process.cwd(), "supabase", "data", "global-locations");
const COUNTRY_OUTPUT = path.join(process.cwd(), "app", "data", "logistics-countries.json");
const CHUNK_SIZE = 500;
const execFileAsync = promisify(execFile);
const ISO_SUPPLEMENTS = [{ code: "BV", name: "Bouvet Island" }];

function parseCsv(text) {
  const rows = [];
  let row = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(value); value = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); if (row.some(Boolean)) rows.push(row); row = []; value = "";
    } else value += char;
  }
  row.push(value); if (row.some(Boolean)) rows.push(row);
  const [headers, ...records] = rows;
  return records.map((cells) => Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? ""])));
}

async function downloadText(url) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const executable = process.platform === "win32" ? "curl.exe" : "curl";
      const { stdout } = await execFileAsync(executable, ["-L", "--fail", "--silent", "--show-error", "--retry", "2", "--max-time", "180", url], { encoding: "utf8", maxBuffer: 30 * 1024 * 1024, timeout: 190_000 });
      return stdout;
    } catch (error) {
      if (attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
    }
  }
  throw new Error(`Unable to download ${url}`);
}

function normalizeCountry(value) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

async function loadPorts(countryByName) {
  const records = [];
  for (let offset = 0; ; offset += 2000) {
    const url = new URL(WPI_URL);
    url.search = new URLSearchParams({ where: "1=1", outFields: "INDEX_NO,PORT_NAME,COUNTRY,LATITUDE,LONGITUDE", returnGeometry: "false", orderByFields: "OBJECTID", resultOffset: String(offset), resultRecordCount: "2000", f: "json" }).toString();
    const response = await fetch(url, { headers: { "User-Agent": "Balo-Logistics-Dataset-Builder/1.0" }, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) throw new Error(`World Port Index returned ${response.status}`);
    const payload = await response.json();
    if (payload.error) throw new Error(payload.error.message);
    const features = payload.features ?? [];
    records.push(...features.map(({ attributes }) => attributes));
    if (features.length < 2000) break;
  }
  return records.flatMap((port) => {
    const rawCountry = String(port.COUNTRY ?? "").toUpperCase();
    const country = countryByCode.get(rawCountry) ?? countryByName.get(normalizeCountry(rawCountry));
    if (!country || !port.PORT_NAME) return [];
    return [{ name: port.PORT_NAME.trim(), country: country.name, country_code: country.code, city: port.PORT_NAME.trim(), location_type: "seaport", code: null, secondary_code: null, latitude: Number(port.LATITUDE) || null, longitude: Number(port.LONGITUDE) || null, source: "nga_world_port_index", source_reference: String(port.INDEX_NO), verified: true }];
  });
}

async function writeChunks(prefix, records) {
  for (let offset = 0; offset < records.length; offset += CHUNK_SIZE) {
    const sequence = String(offset / CHUNK_SIZE + 1).padStart(3, "0");
    await writeFile(path.join(OUTPUT, `${prefix}-${sequence}.json`), `${JSON.stringify(records.slice(offset, offset + CHUNK_SIZE), null, 2)}\n`);
  }
}

await rm(OUTPUT, { recursive: true, force: true });
await mkdir(OUTPUT, { recursive: true });
await mkdir(path.dirname(COUNTRY_OUTPUT), { recursive: true });

const countryCsv = await downloadText(COUNTRIES_URL);
const airportCsv = await downloadText(AIRPORTS_URL);
const sourceCountries = parseCsv(countryCsv).filter((country) => /^[A-Z]{2}$/.test(country.code));
const countries = [...sourceCountries.map(({ code, name }) => ({ code, name })), ...ISO_SUPPLEMENTS.filter((supplement) => !sourceCountries.some((country) => country.code === supplement.code))].sort((a, b) => a.name.localeCompare(b.name));
const countryByCode = new Map(countries.map((country) => [country.code, country]));
const countryByName = new Map(countries.map((country) => [normalizeCountry(country.name), country]));

const airports = parseCsv(airportCsv).flatMap((airport) => {
  const country = countryByCode.get(airport.iso_country);
  const commercial = airport.scheduled_service === "yes" || (airport.type === "large_airport" && airport.iata_code);
  if (!country || !commercial || !airport.iata_code || !airport.name) return [];
  return [{ name: airport.name, country: country.name, country_code: country.code, city: airport.municipality || null, location_type: "airport", code: airport.iata_code, secondary_code: airport.icao_code || airport.gps_code || null, latitude: Number(airport.latitude_deg) || null, longitude: Number(airport.longitude_deg) || null, source: "ourairports", source_reference: airport.id, verified: true }];
});
const ports = await loadPorts(countryByName);

await writeFile(COUNTRY_OUTPUT, `${JSON.stringify(countries, null, 2)}\n`);
await writeChunks("airports", airports);
await writeChunks("seaports", ports);
await writeFile(path.join(OUTPUT, "manifest.json"), `${JSON.stringify({ generated_at: new Date().toISOString(), sources: { countries: COUNTRIES_URL, airports: AIRPORTS_URL, seaports: WPI_URL }, filters: { airports: "IATA-coded airports with scheduled service, plus IATA-coded large airports", seaports: "All commercially selected World Port Index records with an ISO-mappable country" }, counts: { countries: countries.length, airports: airports.length, seaports: ports.length }, chunk_size: CHUNK_SIZE }, null, 2)}\n`);

console.log(`Generated ${countries.length} countries/territories, ${airports.length} airports, and ${ports.length} seaports.`);
