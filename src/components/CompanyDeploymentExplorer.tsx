"use client";

import { useEffect, useMemo, useState } from "react";
import { OddMap, type OddPoint, type OddPolygon, type S2CellFeature } from "@/components/OddMap";

export type Location = {
  company: string; state: string; market: string; lat: number | null; lon: number | null;
  phase: string; activity_type?: string; evidence_status?: string; status: string;
  mode: string; geometry_basis: string; source_url: string; note?: string;
};
type Feature = { type: "Feature"; properties?: Record<string, unknown>; geometry: { type: string; coordinates: unknown } };
type S2Feature = S2CellFeature & { properties: S2CellFeature["properties"] & { vintage_end?: string } };
export type Geojson = { type: "FeatureCollection"; features: Feature[] };
export type S2Geojson = { type: "FeatureCollection"; features: S2Feature[]; metadata?: Record<string, unknown> };
export type VintageSummary = { latest_vintage: string; vintages: { vintage_end: string }[] };

const freight = new Set(["Aurora", "Gatik", "Kodiak AI", "PlusAI", "Torc", "Waabi"]);
const logoDomains: Record<string, string> = {
  Waymo: "waymo.com", Zoox: "zoox.com", Tesla: "tesla.com", Motional: "motional.com",
  Avride: "avride.ai", Beep: "ridebeep.com", "May Mobility": "maymobility.com",
  Nuro: "nuro.ai", WeRide: "weride.ai", Mobileye: "mobileye.com",
  "MOIA America": "moia.io", Aurora: "aurora.tech", Gatik: "gatik.ai",
  "Kodiak AI": "kodiak.ai", PlusAI: "plus.ai", Torc: "torc.ai", Waabi: "waabi.ai",
  Glydways: "glydways.com", "Tensor Auto": "tensor.auto", "AutoMo USA LLC": "automo.ai",
  "Mercedes-Benz R&D North America": "mercedes-benz.com",
};

function key(market: string, state: string) { return `${market}|${state}`; }
function phase(loc: Location) { return loc.activity_type ?? loc.phase; }
function current(loc: Location) { return (loc.evidence_status ?? "current") === "current" && ["testing", "deployment"].includes(phase(loc)) && !/authorized|permit|planned/i.test(loc.status); }
function s2ForCity(city: string, state: string, cells: S2Feature[]) {
  const counties: Record<string, string[]> = {
    "San Francisco Bay Area|CA": ["San Francisco", "San Mateo", "Santa Clara"],
    "Los Angeles|CA": ["Los Angeles"],
    "Phoenix|AZ": ["Maricopa"],
    "Austin|TX": ["Travis"],
    "Atlanta|GA": ["DeKalb", "Fulton"],
  };
  const stateName: Record<string, string> = { CA: "California", AZ: "Arizona", TX: "Texas", GA: "Georgia" };
  return cells.filter(f => f.properties.state === stateName[state] && counties[key(city, state)]?.includes(f.properties.county ?? ""));
}

export function CompanyDeploymentExplorer({ locations, geometries, latestS2, vintages, waymoOnly = false }: {
  locations: Location[]; geometries: Geojson; latestS2: S2Geojson; vintages: VintageSummary; waymoOnly?: boolean;
}) {
  const [company, setCompany] = useState("Waymo");
  const [city, setCity] = useState("San Francisco Bay Area|CA");
  const [vintage, setVintage] = useState(vintages.latest_vintage);
  const [s2Data, setS2Data] = useState(latestS2);
  const [loadedVintage, setLoadedVintage] = useState(vintages.latest_vintage);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    if (vintage === vintages.latest_vintage) return;
    const controller = new AbortController();
    const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${base}/data/waymo_s2_${vintage}.geojson`, { signal: controller.signal })
      .then(r => { if (!r.ok) throw Error(String(r.status)); return r.json(); })
      .then((data: S2Geojson) => { setS2Data(data); setLoadedVintage(vintage); setLoadError(false); })
      .catch(e => { if (e.name !== "AbortError") setLoadError(true); });
    return () => controller.abort();
  }, [vintage, vintages.latest_vintage]);

  const companies = useMemo(() => Array.from(new Set(locations.filter(x => current(x) && (!waymoOnly || x.company === "Waymo")).map(x => x.company)))
    .sort((a, b) => a === "Waymo" ? -1 : b === "Waymo" ? 1 : a.localeCompare(b)), [locations, waymoOnly]);
  const selectedLocations = useMemo(() => locations.filter(x => x.company === company && current(x)), [locations, company]);
  const companyGeometries = useMemo(() => geometries.features.filter(f => {
    const p = f.properties ?? {};
    return p.company === company && (p.evidence_status ?? "current") === "current" &&
      ["testing", "deployment"].includes(String(p.activity_type ?? p.phase)) && !/authorized|permit|planned/i.test(String(p.status ?? "")) &&
      p.geometry_precision !== "schematic_endpoints_not_exact_route" && p.geometry_basis !== "route_corridor_endpoint_connection";
  }), [geometries, company]);

  const markets = useMemo(() => {
    const map = new Map<string, { market: string; state: string; testing: boolean; deployment: boolean }>();
    for (const x of selectedLocations) {
      const id = key(x.market, x.state);
      const value = map.get(id) ?? { market: x.market, state: x.state, testing: false, deployment: false };
      value[phase(x) as "testing" | "deployment"] = true;
      map.set(id, value);
    }
    for (const f of companyGeometries) {
      const p = f.properties ?? {};
      const market = String(p.market ?? ""), state = String(p.state ?? "");
      if (!market || !state) continue;
      const id = key(market, state);
      const value = map.get(id) ?? { market, state, testing: false, deployment: false };
      value[String(p.activity_type ?? p.phase) as "testing" | "deployment"] = true;
      map.set(id, value);
    }
    return Array.from(map.values()).sort((a, b) => a.market.localeCompare(b.market));
  }, [selectedLocations, companyGeometries]);
  const selectedCity = company === "Waymo" ? (markets.find(m => key(m.market, m.state) === city) ?? markets[0]) : undefined;
  const visibleLocations = company === "Waymo" && selectedCity
    ? selectedLocations.filter(x => key(x.market, x.state) === key(selectedCity.market, selectedCity.state))
    : selectedLocations;
  const visibleGeometries = company === "Waymo" && selectedCity
    ? companyGeometries.filter(f => key(String(f.properties?.market), String(f.properties?.state)) === key(selectedCity.market, selectedCity.state))
    : companyGeometries;
  const polygons: OddPolygon[] = visibleGeometries.map(f => ({
    feature: f, company, market: String(f.properties?.market ?? ""), state: String(f.properties?.state ?? ""),
    phase: String(f.properties?.activity_type ?? f.properties?.phase ?? "deployment"),
    event_date: String(f.properties?.event_date ?? ""), geometry_ref: String(f.properties?.geometry_basis ?? ""),
    geometry_type: f.geometry.type, source_url: String(f.properties?.source_url ?? ""),
  }));
  const polygonKeys = new Set(polygons.filter(p => !p.geometry_type?.includes("LineString")).map(p => key(p.market, p.state) + "|" + p.phase));
  const points: OddPoint[] = visibleLocations.filter(x => x.lat != null && x.lon != null && !polygonKeys.has(key(x.market, x.state) + "|" + phase(x)))
    .map(x => ({ company, market: x.market, state: x.state, lat: x.lat!, lon: x.lon!, phase: phase(x), status: x.status, mode: x.mode }));
  const s2Ready = vintage === vintages.latest_vintage || loadedVintage === vintage;
  const s2LoadError = vintage !== vintages.latest_vintage && loadError;
  const s2Cells = company === "Waymo" && selectedCity && !s2LoadError && s2Ready
    ? s2ForCity(selectedCity.market, selectedCity.state, (vintage === vintages.latest_vintage ? latestS2 : s2Data).features) : [];
  const hasBoundary = polygons.some(p => p.phase === "deployment");
  const hasS2 = s2Cells.length > 0;
  const selectedSource = visibleLocations.find(x => phase(x) === "deployment")?.source_url ?? polygons.find(p => p.phase === "deployment")?.source_url ?? visibleLocations[0]?.source_url ?? polygons[0]?.source_url;

  function chooseCompany(name: string) {
    setCompany(name);
    if (name === "Waymo") setCity("San Francisco Bay Area|CA");
  }

  return <div>
    {!waymoOnly && <div className="viz-card p-4 sm:p-5">
      <h2 className="text-xl font-semibold text-[#0b1d33]">Select a company</h2>
      <p className="text-sm text-neutral-600 mt-1">Current testing and deployment locations supported by the linked record. An announced market is excluded until activity is documented.</p>
      {[
        { title: "Passenger, delivery and shuttle", names: companies.filter(n => !freight.has(n)) },
        { title: "Autonomous trucking", names: companies.filter(n => freight.has(n)) },
      ].map(group => <section key={group.title} className="mt-5"><h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">{group.title}</h3>
        <div className="flex flex-wrap gap-2">{group.names.map(name => <button key={name} type="button" onClick={() => chooseCompany(name)} aria-pressed={company === name}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${company === name ? "border-[#123b69] bg-[#eaf2fa] text-[#0b1d33] ring-1 ring-[#123b69]" : "border-neutral-200 bg-white text-neutral-700 hover:border-[#7ca7d0]"}`}>
          {logoDomains[name] ? <img src={`https://www.google.com/s2/favicons?domain=${logoDomains[name]}&sz=64`} alt="" className="w-7 h-7 object-contain" /> : <span aria-hidden="true" className="w-7 h-7 rounded bg-neutral-100 text-neutral-600 flex items-center justify-center font-bold">{name[0]}</span>}
          {name}</button>)}</div></section>)}
    </div>}

    <div className="grid lg:grid-cols-[240px_minmax(0,1fr)] gap-4 mt-4 items-start">
      <aside className="viz-card p-4"><h2 className="font-semibold text-lg">{company} locations</h2>
        <p className="text-sm text-neutral-600 mt-1">{markets.length} documented {markets.length === 1 ? "area" : "areas"}</p>
        {company === "Waymo" && <p className="text-xs text-neutral-500 mt-2">Select a city to update the map.</p>}
        <div className="mt-3 space-y-1 max-h-[560px] overflow-y-auto">{markets.map(m => <button key={key(m.market, m.state)} type="button" onClick={() => company === "Waymo" && setCity(key(m.market, m.state))}
          aria-pressed={company === "Waymo" ? key(m.market, m.state) === key(selectedCity?.market ?? "", selectedCity?.state ?? "") : undefined}
          className={`w-full rounded-md p-2 text-left ${company === "Waymo" ? "cursor-pointer hover:bg-[#f2f6fa]" : "cursor-default"} ${company === "Waymo" && selectedCity && key(m.market, m.state) === key(selectedCity.market, selectedCity.state) ? "bg-[#eaf2fa] ring-1 ring-[#83a9cc]" : ""}`}>
          <span className="block text-sm font-medium text-[#0b1d33]">{m.market} <span className="font-normal text-neutral-500">{m.state}</span></span>
          <span className="block text-xs text-neutral-600 mt-0.5">{[m.deployment && "Deployment", m.testing && "Testing"].filter(Boolean).join(" · ")}</span>
        </button>)}</div>
      </aside>
      <section className="viz-card p-4 sm:p-5 min-w-0"><div className="flex flex-wrap items-start justify-between gap-3"><div>
        <div className="eyebrow">{company === "Waymo" ? "City geography" : "Company geography"}</div>
        <h2 className="text-xl font-semibold mt-1">{selectedCity ? `${selectedCity.market}, ${selectedCity.state}` : `${company} · United States`}</h2>
        <p className="text-sm text-neutral-600 mt-1">{company === "Waymo" ? !s2Ready && !s2LoadError ? "Loading the selected S2 release." : hasS2 ? `${s2Cells.length.toLocaleString()} published S2 cells with operational miles; the service boundary is context.` : hasBoundary ? "No S2 mileage published for this city in this release; showing the sourced service boundary." : "No S2 mileage or sourced boundary for this area; showing its documented market point." : "Blue shows documented deployment; amber shows testing. Points indicate markets without a sourced boundary."}</p>
        </div>{company === "Waymo" && <label className="text-sm text-neutral-600">S2 release <select className="block mt-1 border border-neutral-300 bg-white rounded p-2 text-sm" value={vintage} onChange={e => setVintage(e.target.value)}>{vintages.vintages.filter(v => v.vintage_end >= "202506").slice().reverse().map(v => <option key={v.vintage_end} value={v.vintage_end}>{v.vintage_end.slice(0,4)}–{v.vintage_end.slice(4)}</option>)}</select></label>}</div>
        {company === "Waymo" && !s2Ready && !s2LoadError && <p role="status" className="text-sm text-neutral-600 mt-3">Loading this S2 release…</p>}
        {s2LoadError && <p role="status" className="text-sm text-amber-800 mt-3">This S2 release could not load; showing the available boundary or point.</p>}
        <div className="mt-4"><OddMap key={`${company}|${selectedCity ? key(selectedCity.market, selectedCity.state) : "all"}|${vintage}`} polygons={polygons} points={points} s2Features={s2Cells} /></div>
        {selectedSource && <a href={selectedSource} target="_blank" rel="noreferrer" className="text-sm underline text-[#184f95] inline-block mt-3">Current activity source ↗</a>}
        {company === "Waymo" && hasS2 && <p className="text-xs text-neutral-500 mt-2">S2 cells record operational mileage, including miles outside passenger service. Northern and Southern California cell groups are analytical reporting areas, not official ODD boundaries.</p>}
      </section>
    </div>
  </div>;
}
