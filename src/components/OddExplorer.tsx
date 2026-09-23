"use client";

import { useMemo, useState } from "react";
import { OddMap, OddPolygon, OddPoint } from "@/components/OddMap";

type OperationalLocation = {
  company: string;
  state: string;
  market: string;
  lat: number | null;
  lon: number | null;
  phase: string;
  status: string;
  mode: string;
  geometry_basis: string;
  source_url: string;
  source_date?: string;
  geometry_path?: string;
  note?: string;
};

type OddEvent = {
  date: string;
  event_type: string;
  phase: string;
  company: string;
  market: string;
  state: string;
  geometry_ref?: string | null;
  geometry_basis?: string;
  source_url?: string | null;
};

type Feature = {
  type: "Feature";
  properties?: Record<string, unknown>;
  geometry: unknown;
};
type FeatureCollection = { type: "FeatureCollection"; features: Feature[] };

function canonicalCompany(s: string) {
  const raw = s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\b(INC|LLC|CORP|CORPORATION|TECHNOLOGIES|OPERATIONS)\b/g, "").replace(/\s+/g, " ").trim();
  const aliases: Record<string,string> = {
    "WAYMO": "Waymo",
    "ZOOX": "Zoox",
    "TESLA ROBOTAXI": "Tesla",
    "TESLA": "Tesla",
    "MAY MOBILITY": "May Mobility",
    "AVRIDE": "Avride",
    "AURORA": "Aurora",
    "KODIAK AI": "Kodiak AI",
    "NURO": "Nuro",
    "MOIA AMERICA": "MOIA America",
    "VOLKSWAGEN GROUP OF AMERICA": "MOIA America",
    "VOLKSWAGEN": "MOIA America",
    "MOTIONAL": "Motional",
    "GLYDWAYS": "Glydways",
    "GATIK AI": "Gatik",
    "GATIK": "Gatik",
    "PLUSAI": "PlusAI",
    "PLUS": "PlusAI",
    "WERIDE AI": "WeRide",
    "WERIDE": "WeRide",
    "WAABI": "Waabi",
    "TORC ROBOTICS": "Torc",
    "TORC": "Torc",
    "BEEP": "Beep",
  };
  return aliases[raw] ?? s.replace(/\s+(Inc\.?|LLC|Corp\.?|Corporation)$/i, "").trim();
}

function canonicalMarket(s: string) {
  const v = s.toLowerCase().replace(/,\s*[a-z]{2}$/i, "").replace(/[^a-z0-9]+/g, " ").trim();
  const aliases: Record<string,string> = {
    "san francisco bay area": "san francisco",
    "sf bay area": "san francisco",
  };
  return aliases[v] ?? v;
}

export function OddExplorer({
  locations,
  history,
  geometries,
  currentGeometries,
  manufacturerNames = [],
}: {
  locations: OperationalLocation[];
  history: OddEvent[];
  geometries: FeatureCollection;
  currentGeometries?: FeatureCollection;
  manufacturerNames?: string[];
}) {
  const companies = useMemo(
    () => Array.from(new Set([...manufacturerNames, ...locations.map(d=>d.company), ...history.map(d=>d.company)].map(canonicalCompany))).sort(),
    [manufacturerNames, locations, history]
  );
  const states = useMemo(
    () => Array.from(new Set([...locations.map(d=>d.state), ...history.map(d=>d.state)])).sort(),
    [locations, history]
  );
  const [company,setCompany]=useState("ALL");
  const [state,setState]=useState("ALL");
  const [phase,setPhase]=useState("deployment");
  const [vintage,setVintage]=useState<"current"|"history">("current");
  const [selected,setSelected]=useState<OddPolygon|null>(null);

  const eventByGeometry = useMemo(() => {
    const map = new Map<string, OddEvent>();
    for (const e of history) {
      if (!e.geometry_ref || !String(e.geometry_ref).endsWith(".geojson")) continue;
      const prior = map.get(e.geometry_ref);
      if (!prior || e.date >= prior.date) map.set(e.geometry_ref, e);
    }
    return map;
  }, [history]);

  const currentMarketKeys = useMemo(() => new Set(
    locations
      .filter(d => d.phase === phase || phase === "ALL")
      .map(d => `${d.company.toLowerCase()}|${canonicalMarket(d.market)}|${d.state}`)
  ), [locations, phase]);

  const allPolygons = useMemo<OddPolygon[]>(() => geometries.features.flatMap(feature => {
    const ref = String(feature.properties?.geometry_ref ?? "");
    const e = eventByGeometry.get(ref);
    if (!e) return [];
    return [{
      feature,
      company: e.company,
      market: e.market,
      state: e.state,
      phase: e.phase,
      event_date: e.date,
      event_type: e.event_type,
      geometry_ref: ref,
      geometry_type: String((feature.geometry as { type?: string })?.type ?? ""),
      source_url: e.source_url ?? undefined,
    }];
  }), [geometries, eventByGeometry]);

  const currentRouteGeometries = useMemo<OddPolygon[]>(() => (currentGeometries?.features ?? []).flatMap(feature => {
    const props = feature.properties ?? {};
    const companyName = String(props.company ?? "");
    if (!companyName) return [];
    return [{
      feature,
      company: companyName,
      market: String(props.market ?? ""),
      state: String(props.state ?? ""),
      phase: String(props.phase ?? "deployment"),
      event_date: String(props.event_date ?? ""),
      event_type: "current_corridor",
      geometry_ref: String(props.geometry_basis ?? "current-route-corridor") + ":" + String(props.market ?? ""),
      geometry_type: String((feature.geometry as { type?: string })?.type ?? ""),
      source_url: props.source_url ? String(props.source_url) : undefined,
    }];
  }), [currentGeometries]);

  const latestPerMarket = useMemo(() => {
    const map = new Map<string, OddPolygon>();
    for (const p of allPolygons) {
      const key = `${p.company.toLowerCase()}|${canonicalMarket(p.market)}|${p.state}|${p.phase}`;
      const prior = map.get(key);
      if (!prior || (p.event_date ?? "") >= (prior.event_date ?? "")) map.set(key,p);
    }
    return Array.from(map.values());
  }, [allPolygons]);

  const polygons = useMemo(() => {
    const base = vintage === "history" ? [...allPolygons, ...currentRouteGeometries] : [...latestPerMarket.filter(p =>
      currentMarketKeys.has(`${p.company.toLowerCase()}|${canonicalMarket(p.market)}|${p.state}`)
    ), ...currentRouteGeometries];
    return base.filter(p =>
      (company==="ALL" || canonicalCompany(p.company)===company) &&
      (state==="ALL" || p.state===state) &&
      (phase==="ALL" || p.phase===phase)
    );
  }, [allPolygons, latestPerMarket, currentRouteGeometries, currentMarketKeys, company, state, phase, vintage]);

  const historicalPoints = useMemo<OddPoint[]>(() => history.flatMap(e => {
    const raw = String(e.geometry_ref ?? "");
    const m = raw.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
    if (!m) return [];
    return [{
      company:e.company,
      market:e.market,
      state:e.state,
      lon:Number(m[1]),
      lat:Number(m[2]),
      phase:e.phase,
      status:e.event_type,
      mode:"historical",
    }];
  }), [history]);

  const currentPoints = useMemo<OddPoint[]>(() => locations.filter(d =>
    d.lat !== null && d.lon !== null && Number.isFinite(d.lat) && Number.isFinite(d.lon) &&
    (company==="ALL"||canonicalCompany(d.company)===company) &&
    (state==="ALL"||d.state===state) &&
    (phase==="ALL"||d.phase===phase)
  ).map(d=>({
    company:d.company,
    market:d.market,
    state:d.state,
    lat:d.lat as number,
    lon:d.lon as number,
    phase:d.phase,
    status:d.status,
    mode:d.mode,
  })),[locations,company,state,phase]);

  const points = useMemo(() => {
    if (vintage === "history") {
      return historicalPoints.filter(d =>
        (company==="ALL"||canonicalCompany(d.company)===company) &&
        (state==="ALL"||d.state===state) &&
        (phase==="ALL"||d.phase===phase)
      );
    }
    return currentPoints;
  }, [vintage, historicalPoints, currentPoints, company, state, phase]);

  const coverageRows = useMemo(() => companies.map(name => {
    const polygonCount = latestPerMarket.filter(p => canonicalCompany(p.company) === name).length + currentRouteGeometries.filter(p => canonicalCompany(p.company) === name).length;
    const currentMarketCount = locations.filter(d => canonicalCompany(d.company) === name).length;
    const historicPointCount = historicalPoints.filter(d => canonicalCompany(d.company) === name).length;
    const phases = Array.from(new Set([...history.filter(e => canonicalCompany(e.company) === name).map(e => e.phase), ...locations.filter(e => canonicalCompany(e.company) === name).map(e => e.phase)].filter(Boolean)));
    let coverage = "No current public ODD verified";
    if (currentMarketCount > 0 && polygonCount > 0) coverage = `${currentMarketCount} current market${currentMarketCount===1?"":"s"} · ${polygonCount} sourced geometr${polygonCount===1?"y":"ies"}`;
    else if (currentMarketCount > 0) coverage = `${currentMarketCount} current market${currentMarketCount===1?"":"s"} · point/corridor status only`;
    else if (polygonCount > 0 || historicPointCount > 0) coverage = "Historical geography only; no current market verified";
    return { name, polygonCount, currentMarketCount, historicPointCount, phases: phases.join(", "), coverage };
  }), [companies, latestPerMarket, currentRouteGeometries, locations, historicalPoints, history]);

  return <div>
    <div className="viz-card p-4">
      <div className="grid md:grid-cols-4 gap-3">
        <label className="filter-label">Company
          <select className="filter-select" value={company} onChange={e=>setCompany(e.target.value)}>
            <option value="ALL">All companies</option>
            {companies.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="filter-label">State
          <select className="filter-select" value={state} onChange={e=>setState(e.target.value)}>
            <option value="ALL">All states</option>
            {states.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="filter-label">Phase
          <select className="filter-select" value={phase} onChange={e=>setPhase(e.target.value)}>
            <option value="deployment">Deployment / service</option>
            <option value="testing">Testing</option>
            <option value="planned">Planned / announced</option>
            <option value="ALL">Testing + deployment + planned</option>
          </select>
        </label>
        <label className="filter-label">Boundary view
          <select className="filter-select" value={vintage} onChange={e=>setVintage(e.target.value as "current"|"history")}>
            <option value="current">Latest boundary for current markets</option>
            <option value="history">All historical boundaries</option>
          </select>
        </label>
      </div>
    </div>

    <div className="grid lg:grid-cols-[1.55fr_.45fr] gap-3 mt-3">
      <div className="viz-card p-4">
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <div>
            <h2 className="text-xl font-semibold">ODD and service-area boundaries</h2>
            <div className="text-sm text-neutral-500">{vintage==="current" ? "Latest sourced polygon for markets currently tracked as operating." : "Historical polygon archive."}</div>
          </div>
          <span className="text-sm text-neutral-500">{polygons.length} geometries</span>
        </div>
        <OddMap polygons={polygons} points={points} onPolygonClick={setSelected} />
      </div>

      <div className="grid gap-3 content-start">
        <div className="viz-card p-4"><div className="text-3xl font-semibold tabular-nums">{new Set(points.map(d=>d.company)).size}</div><div className="text-sm text-neutral-500">companies in current market layer</div></div>
        <div className="viz-card p-4"><div className="text-3xl font-semibold tabular-nums">{new Set(points.map(d=>d.state)).size}</div><div className="text-sm text-neutral-500">states</div></div>
        <div className="viz-card p-4"><div className="text-3xl font-semibold tabular-nums">{polygons.length}</div><div className="text-sm text-neutral-500">displayed sourced geometries</div></div>
        {selected && <div className="viz-card p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Selected boundary</div>
          <div className="font-semibold mt-1">{selected.company} · {selected.market}</div>
          <div className="text-sm text-neutral-600 mt-1">{selected.phase} · {selected.event_date ?? "date unknown"}</div>
          <div className="text-xs text-neutral-500 mt-2 break-all">{selected.geometry_ref}</div>
          {selected.source_url && <a className="text-sm underline inline-block mt-2" href={selected.source_url} target="_blank" rel="noreferrer">source</a>}
        </div>}
      </div>
    </div>

    <div className="viz-card mt-3 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-baseline justify-between">
        <h3 className="font-semibold">Manufacturer ODD coverage</h3>
        <span className="text-xs text-neutral-500">{coverageRows.filter(r=>r.polygonCount>0||r.currentMarketCount>0||r.historicPointCount>0).length} of {coverageRows.length} manufacturers have sourced geography</span>
      </div>
      <div className="overflow-x-auto max-h-[340px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#fcfcfb] text-left text-neutral-500"><tr><th>Manufacturer</th><th>Coverage</th><th>Phases seen</th></tr></thead>
          <tbody>{coverageRows.map(r=><tr key={r.name} className="border-t border-neutral-100"><td className="font-medium">{r.name}</td><td>{r.coverage}</td><td className="text-neutral-600">{r.phases || "—"}</td></tr>)}</tbody>
        </table>
      </div>
    </div>

    <div className="viz-card mt-3 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-baseline justify-between">
        <h3 className="font-semibold">Boundaries behind this view</h3>
        <span className="text-xs text-neutral-500">Blue = deployment · yellow = testing</span>
      </div>
      <div className="overflow-x-auto max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#fcfcfb] text-left text-neutral-500">
            <tr><th>Company</th><th>Market</th><th>State</th><th>Phase</th><th>Date</th><th>Geometry</th><th>Source</th></tr>
          </thead>
          <tbody>
            {polygons.sort((a,b)=>(b.event_date??"").localeCompare(a.event_date??"")).map((p,i)=><tr key={i} className="border-t border-neutral-100">
              <td className="font-medium">{p.company}</td>
              <td>{p.market}</td>
              <td>{p.state}</td>
              <td>{p.phase}</td>
              <td>{p.event_date ?? "—"}</td>
              <td className="text-neutral-600">{p.geometry_ref}</td>
              <td>{p.source_url ? <a href={p.source_url} target="_blank" rel="noreferrer" className="underline">source</a> : "—"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </div>
  </div>;
}
