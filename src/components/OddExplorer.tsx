"use client";

import { useMemo, useState } from "react";
import { OddMap, OddPolygon, OddPoint, S2CellFeature } from "@/components/OddMap";

type OperationalLocation = {
  company: string;
  state: string;
  market: string;
  lat: number | null;
  lon: number | null;
  phase: string;
  activity_type?: string;
  evidence_status?: string;
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
type S2Collection = { type: "FeatureCollection"; features: S2CellFeature[] };

function geometryPoints(geometry:any,out:[number,number][]=[]){
  const walk=(x:any)=>{
    if(Array.isArray(x)&&typeof x[0]==="number"&&typeof x[1]==="number") out.push([x[0],x[1]]);
    else if(Array.isArray(x)) x.forEach(walk);
  };
  walk(geometry?.coordinates);
  return out;
}
function geometryCenter(geometry:any):[number,number]{
  const pts=geometryPoints(geometry);
  if(!pts.length)return [0,0];
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const [x,y] of pts){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  return [(minX+maxX)/2,(minY+maxY)/2];
}
function pointInRing([x,y]:[number,number],ring:number[][]){
  let inside=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++){
    const xi=ring[i][0],yi=ring[i][1],xj=ring[j][0],yj=ring[j][1];
    const hit=((yi>y)!==(yj>y))&&(x<((xj-xi)*(y-yi))/(yj-yi+1e-15)+xi);
    if(hit)inside=!inside;
  }
  return inside;
}
function pointInPolygon(point:[number,number],rings:number[][][]){
  if(!rings?.length||!pointInRing(point,rings[0]))return false;
  for(let i=1;i<rings.length;i++) if(pointInRing(point,rings[i]))return false;
  return true;
}
function pointInGeometry(point:[number,number],geometry:any){
  if(!geometry)return false;
  if(geometry.type==="Polygon")return pointInPolygon(point,geometry.coordinates);
  if(geometry.type==="MultiPolygon")return geometry.coordinates.some((poly:number[][][])=>pointInPolygon(point,poly));
  return false;
}

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
    "MOBILEYE VISION": "Mobileye",
    "MOBILEYE": "Mobileye",
  };
  return aliases[raw] ?? s.replace(/\s+(Inc\.?|LLC|Corp\.?|Corporation)$/i, "").trim();
}

function canonicalMarket(s: string) {
  const v = s.toLowerCase().replace(/,\s*[a-z]{2}$/i, "").replace(/[^a-z0-9]+/g, " ").trim();
  const aliases: Record<string,string> = {
    "san francisco bay area": "san francisco bay area",
    "sf bay area": "san francisco bay area",
    "san francisco": "san francisco bay area",
    "silicon valley": "san francisco bay area",
    "bay area": "san francisco bay area",
  };
  return aliases[v] ?? v;
}

export function OddExplorer({
  locations,
  history,
  geometries,
  currentGeometries,
  manufacturerNames = [],
  initialCompany = "ALL",
  hideCompanyFilter = false,
  excludeCompanies = [],
  s2Geojson,
}: {
  locations: OperationalLocation[];
  history: OddEvent[];
  geometries: FeatureCollection;
  currentGeometries?: FeatureCollection;
  manufacturerNames?: string[];
  initialCompany?: string;
  hideCompanyFilter?: boolean;
  excludeCompanies?: string[];
  s2Geojson?: S2Collection;
}) {
  const excluded = useMemo(() => new Set(excludeCompanies.map(canonicalCompany)), [excludeCompanies]);
  const companies = useMemo(
    () => Array.from(new Set([...manufacturerNames, ...locations.map(d=>d.company), ...history.map(d=>d.company)].map(canonicalCompany)))
      .filter(name => !excluded.has(name))
      .sort(),
    [manufacturerNames, locations, history, excluded]
  );
  const states = useMemo(
    () => Array.from(new Set([...locations.map(d=>d.state), ...history.map(d=>d.state)])).sort(),
    [locations, history]
  );
  const [company,setCompany]=useState(initialCompany);
  const [state,setState]=useState("ALL");
  const [market,setMarket]=useState("ALL");
  const markets = useMemo(() => Array.from(new Set(
    [...locations, ...history]
      .filter(d => !excluded.has(canonicalCompany(d.company)))
      .filter(d => company === "ALL" || canonicalCompany(d.company) === company)
      .filter(d => state === "ALL" || d.state === state)
      .map(d => d.market)
      .filter(Boolean)
  )).sort(), [locations, history, company, state]);
  const [phase,setPhase]=useState("deployment");
  const [evidence,setEvidence]=useState<"current"|"announced"|"historical">("current");
  const [vintage,setVintage]=useState<"current"|"history">("current");
  const [historyDate,setHistoryDate]=useState("LATEST");
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
      .filter(d => (d.evidence_status ?? "current") === "current")
      .filter(d => (d.activity_type ?? d.phase) === phase || phase === "ALL")
      .map(d => `${canonicalCompany(d.company).toLowerCase()}|${canonicalMarket(d.market)}|${d.state}`)
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

    // Do not draw schematic endpoint-to-endpoint lines as if they were road corridors.
    // Keep these records in the evidence table until a sourced road-following geometry exists.
    const precision = String(props.geometry_precision ?? "");
    const basis = String(props.geometry_basis ?? "");
    if (precision === "schematic_endpoints_not_exact_route" || basis === "route_corridor_endpoint_connection") {
      return [];
    }

    return [{
      feature,
      company: companyName,
      market: String(props.market ?? ""),
      state: String(props.state ?? ""),
      phase: String(props.phase ?? "deployment"),
      event_date: String(props.event_date ?? ""),
      event_type: "current_corridor",
      geometry_ref: basis + ":" + String(props.market ?? ""),
      geometry_type: String((feature.geometry as { type?: string })?.type ?? ""),
      source_url: props.source_url ? String(props.source_url) : undefined,
    }];
  }), [currentGeometries]);

  const latestPerMarket = useMemo(() => {
    const map = new Map<string, OddPolygon>();
    for (const p of allPolygons) {
      const key = `${canonicalCompany(p.company).toLowerCase()}|${canonicalMarket(p.market)}|${p.state}|${p.phase}`;
      const prior = map.get(key);
      if (!prior || (p.event_date ?? "") >= (prior.event_date ?? "")) map.set(key,p);
    }
    return Array.from(map.values());
  }, [allPolygons]);

  const historyDates = useMemo(() => Array.from(new Set(
    allPolygons.map(p => p.event_date).filter((d): d is string => Boolean(d))
  )).sort().reverse(), [allPolygons]);

  const historicalSnapshot = useMemo(() => {
    const cutoff = historyDate === "LATEST" ? "9999-12-31" : historyDate;
    const map = new Map<string, OddPolygon>();
    for (const p of allPolygons) {
      if ((p.event_date ?? "") > cutoff) continue;
      const key = `${canonicalCompany(p.company).toLowerCase()}|${canonicalMarket(p.market)}|${p.state}|${p.phase}`;
      const prior = map.get(key);
      if (!prior || (p.event_date ?? "") >= (prior.event_date ?? "")) map.set(key, p);
    }
    return Array.from(map.values());
  }, [allPolygons, historyDate]);

  const polygons = useMemo(() => {
    const currentGeos = currentRouteGeometries.filter(p => {
      const props = p.feature.properties ?? {};
      return String(props.evidence_status ?? "current") === evidence;
    });

    const currentGeoKeys = new Set(currentGeos.map(p =>
      `${canonicalCompany(p.company).toLowerCase()}|${canonicalMarket(p.market)}|${p.state}|${p.phase}`
    ));

    let base: OddPolygon[];
    if (evidence === "historical" || vintage === "history") {
      base = historicalSnapshot;
    } else if (evidence === "current") {
      // Current means current. Never substitute a historical polygon just because
      // a current market lacks a current boundary. Those markets remain visible
      // as points until a current polygon is sourced.
      base = currentGeos;
    } else {
      base = currentGeos;
    }

    return base.filter(p =>
      !excluded.has(canonicalCompany(p.company)) &&
      (company==="ALL" || canonicalCompany(p.company)===company) &&
      (state==="ALL" || p.state===state) &&
      (market==="ALL" || canonicalMarket(p.market)===canonicalMarket(market)) &&
      (phase==="ALL" || p.phase===phase)
    );
  }, [historicalSnapshot, currentRouteGeometries, company, state, market, phase, evidence, vintage, excluded]);

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
    !excluded.has(canonicalCompany(d.company)) &&
    d.lat !== null && d.lon !== null && Number.isFinite(d.lat) && Number.isFinite(d.lon) &&
    (company==="ALL"||canonicalCompany(d.company)===company) &&
    (state==="ALL"||d.state===state) &&
    (market==="ALL"||canonicalMarket(d.market)===canonicalMarket(market)) &&
    (phase==="ALL"||(d.activity_type ?? d.phase)===phase) &&
    ((d.evidence_status ?? "current")===evidence)
  ).map(d=>({
    company:d.company,
    market:d.market,
    state:d.state,
    lat:d.lat as number,
    lon:d.lon as number,
    phase:d.phase,
    status:d.status,
    mode:d.mode,
  })),[locations,company,state,market,phase,evidence]);

  const points = useMemo(() => {
    if (evidence === "historical" || vintage === "history") {
      return historicalPoints.filter(d =>
        !excluded.has(canonicalCompany(d.company)) &&
        (company==="ALL"||canonicalCompany(d.company)===company) &&
        (state==="ALL"||d.state===state) &&
        (market==="ALL"||canonicalMarket(d.market)===canonicalMarket(market)) &&
        (phase==="ALL"||d.phase===phase)
      );
    }
    return currentPoints;
  }, [vintage, evidence, historicalPoints, currentPoints, company, state, market, phase, excluded]);

  const polygonMarketKeys = useMemo(() => new Set(
    polygons
      .filter(p => p.geometry_type !== "LineString" && p.geometry_type !== "MultiLineString")
      .map(p => `${canonicalCompany(p.company).toLowerCase()}|${canonicalMarket(p.market)}|${p.state}`)
  ), [polygons]);

  const visiblePoints = useMemo(() => points.filter(p =>
    !polygonMarketKeys.has(`${canonicalCompany(p.company).toLowerCase()}|${canonicalMarket(p.market)}|${p.state}`)
  ), [points, polygonMarketKeys]);

  const marketFacets = useMemo(() => {
    const map = new Map<string, { market:string; state:string; polygons:OddPolygon[]; points:OddPoint[]; companies:Set<string>; s2Cells:S2CellFeature[] }>();
    const ensure = (marketName:string, stateName:string) => {
      const key = `${canonicalMarket(marketName)}|${stateName}`;
      if (!map.has(key)) map.set(key, { market:marketName, state:stateName, polygons:[], points:[], companies:new Set<string>(), s2Cells:[] });
      return map.get(key)!;
    };
    for (const p of polygons) {
      const facet = ensure(p.market, p.state);
      facet.polygons.push(p);
      facet.companies.add(canonicalCompany(p.company));
    }
    for (const p of visiblePoints) {
      const facet = ensure(p.market, p.state);
      facet.points.push(p);
      facet.companies.add(canonicalCompany(p.company));
    }

    if (evidence==="current" && vintage==="current" && s2Geojson?.features?.length) {
      const cellCenters=s2Geojson.features.map(cell=>({cell,center:geometryCenter(cell.geometry)}));
      for (const facet of map.values()) {
        if (!facet.companies.has("Waymo")) continue;
        const waymoPolygon=facet.polygons.find(p=>canonicalCompany(p.company)==="Waymo" && p.geometry_type!=="LineString" && p.geometry_type!=="MultiLineString");
        if (!waymoPolygon) continue;
        facet.s2Cells=cellCenters
          .filter(({center})=>pointInGeometry(center,waymoPolygon.feature.geometry))
          .map(x=>x.cell);
      }
    }

    return Array.from(map.values()).sort((a,b) =>
      a.state.localeCompare(b.state) || a.market.localeCompare(b.market)
    );
  }, [polygons, visiblePoints, s2Geojson, evidence, vintage]);

  const coverageRows = useMemo(() => companies.map(name => {
    const polygonCount = latestPerMarket.filter(p => canonicalCompany(p.company) === name).length + currentRouteGeometries.filter(p => canonicalCompany(p.company) === name).length;
    const currentMarketCount = locations.filter(d => canonicalCompany(d.company) === name && (d.evidence_status ?? "current") === "current").length;
    const historicPointCount = historicalPoints.filter(d => canonicalCompany(d.company) === name).length;
    const phases = Array.from(new Set([...history.filter(e => canonicalCompany(e.company) === name).map(e => e.phase), ...locations.filter(e => canonicalCompany(e.company) === name).map(e => e.phase)].filter(Boolean)));
    let coverage = "No current public ODD verified";
    if (currentMarketCount > 0 && polygonCount > 0) coverage = `${currentMarketCount} current market${currentMarketCount===1?"":"s"} · ${polygonCount} sourced geometr${polygonCount===1?"y":"ies"}`;
    else if (currentMarketCount > 0) coverage = `${currentMarketCount} current market${currentMarketCount===1?"":"s"} · point/corridor status only`;
    else if (polygonCount > 0 || historicPointCount > 0) coverage = "Historical geography only; no current market verified";
    return { name, polygonCount, currentMarketCount, historicPointCount, phases: phases.join(", "), coverage };
  }), [companies, latestPerMarket, currentRouteGeometries, locations, historicalPoints, history]);

  const evidenceRows = useMemo(() => locations.filter(d =>
    !excluded.has(canonicalCompany(d.company)) &&
    (company==="ALL" || canonicalCompany(d.company)===company) &&
    (state==="ALL" || d.state===state) &&
    (market==="ALL" || canonicalMarket(d.market)===canonicalMarket(market)) &&
    (phase==="ALL" || (d.activity_type ?? d.phase)===phase) &&
    ((d.evidence_status ?? "current")===evidence)
  ), [locations, company, state, market, phase, evidence, excluded]);

  return <div>
    <div className="viz-card p-4">
      <div className="grid md:grid-cols-3 xl:grid-cols-6 gap-3">
        {!hideCompanyFilter && <label className="filter-label">Company
          <select className="filter-select" value={company} onChange={e=>setCompany(e.target.value)}>
            <option value="ALL">All companies</option>
            {companies.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>}
        <label className="filter-label">State
          <select className="filter-select" value={state} onChange={e=>setState(e.target.value)}>
            <option value="ALL">All states</option>
            {states.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="filter-label">Market / corridor
          <select className="filter-select" value={market} onChange={e=>setMarket(e.target.value)}>
            <option value="ALL">All markets</option>
            {markets.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="filter-label">Phase
          <select className="filter-select" value={phase} onChange={e=>setPhase(e.target.value)}>
            <option value="deployment">Deployment / service</option>
            <option value="testing">Testing</option>
            <option value="ALL">Testing + deployment</option>
          </select>
        </label>
        <label className="filter-label">Evidence status
          <select className="filter-select" value={evidence} onChange={e=>setEvidence(e.target.value as "current"|"announced"|"historical")}>
            <option value="current">Current activity</option>
            <option value="announced">Announced future activity</option>
            <option value="historical">Historical</option>
          </select>
        </label>
        <label className="filter-label">Boundary view
          <select className="filter-select" value={vintage} onChange={e=>setVintage(e.target.value as "current"|"history")}>
            <option value="current">Current service areas</option>
            <option value="history">Historical snapshot</option>
          </select>
        </label>
        {vintage === "history" && <label className="filter-label">As of date
          <select className="filter-select" value={historyDate} onChange={e=>setHistoryDate(e.target.value)}>
            <option value="LATEST">Latest historical snapshot</option>
            {historyDates.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
        </label>}
      </div>
    </div>

    <div className="mt-3">
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <div>
          <h2 className="text-xl font-semibold">ODD and service-area markets</h2>
          <div className="text-sm text-neutral-500">{evidence==="current" ? "Each card is a separate current market / corridor. Exact boundaries are shown only where sourced; otherwise the market remains a point." : evidence==="announced" ? "Future markets mentioned by a source; not counted as current operation." : "Historical market snapshots."}</div>
        </div>
        <span className="text-sm text-neutral-500">{marketFacets.length} markets</span>
      </div>

      {marketFacets.length === 0 ? (
        <div className="viz-card p-5 text-sm text-neutral-500">No geography matches these filters.</div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {marketFacets.map((facet) => (
            <div key={`${canonicalMarket(facet.market)}-${facet.state}`} className="viz-card overflow-hidden">
              <div className="p-4 pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-lg">{facet.market}</h3>
                    <div className="text-sm text-neutral-500">{facet.state}</div>
                  </div>
                  <div className="text-xs text-neutral-400 text-right">
                    {facet.s2Cells.length > 0
                      ? `${facet.s2Cells.length.toLocaleString()} S2 cells · ${Math.round(facet.s2Cells.reduce((s,f)=>s+Number(f.properties?.waymo_ro_miles??0),0)).toLocaleString()} mi`
                      : facet.polygons.length > 0
                        ? `${facet.polygons.length} sourced geometr${facet.polygons.length===1?"y":"ies"}`
                        : "point evidence"}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Array.from(facet.companies).sort().map(name => <span key={name} className="badge">{name}</span>)}
                </div>
              </div>
              <div className="px-3 pb-3">
                <OddMap polygons={facet.polygons} points={facet.points} s2Features={facet.s2Cells} onPolygonClick={setSelected} compact hideLegend />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-neutral-600">
        <span><span className="inline-block w-3 h-3 align-middle mr-1 rounded-sm bg-[#2a78d6]/25 border border-[#184f95]" />Deployment/Service Boundary</span>
        <span><span className="inline-block w-3 h-3 align-middle mr-1 rounded-sm bg-[#eda100]/25 border border-[#a86f00]" />Testing Boundary</span>
        <span><span className="inline-block w-3 h-3 align-middle mr-1 rounded-sm bg-[#438ad8]" />Waymo VMT by S2 Cell</span>
        <span><span className="inline-block w-3 h-1 align-middle mr-1 bg-[#184f95]" />Road-Following Corridor</span>
        <span><span className="inline-block w-2.5 h-2.5 align-middle mr-1 rounded-full bg-[#eb6834]" />Current Market Without Sourced Polygon</span>
      </div>

      {selected && <div className="viz-card p-4 mt-3">
        <div className="text-xs uppercase tracking-wide text-neutral-500">Selected boundary</div>
        <div className="font-semibold mt-1">{selected.company} · {selected.market}</div>
        <div className="text-sm text-neutral-600 mt-1">{selected.phase} · {selected.event_date ?? "date unknown"}</div>
        {selected.source_url && <a className="text-sm underline inline-block mt-2" href={selected.source_url} target="_blank" rel="noreferrer">source</a>}
      </div>}
    </div>

    <div className="viz-card mt-3 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-baseline justify-between">
        <h3 className="font-semibold">Source-grounded geography records</h3>
        <span className="text-xs text-neutral-500">{evidenceRows.length} records in view</span>
      </div>
      <div className="overflow-x-auto max-h-[420px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#fcfcfb] text-left text-neutral-500">
            <tr><th>Company</th><th>Market / corridor</th><th>State</th><th>Activity</th><th>Evidence</th><th>Geometry basis</th><th>Source</th></tr>
          </thead>
          <tbody>{evidenceRows.map((d,i)=><tr key={`${d.company}-${d.market}-${i}`} className="border-t border-neutral-100">
            <td className="font-medium">{canonicalCompany(d.company)}</td>
            <td>{d.market}</td>
            <td>{d.state}</td>
            <td>{(d.activity_type ?? d.phase).replaceAll("_"," ")}</td>
            <td>{(d.evidence_status ?? "current").replaceAll("_"," ")}</td>
            <td className="text-neutral-600">{d.geometry_basis.replaceAll("_"," ")}</td>
            <td><a href={d.source_url} target="_blank" rel="noreferrer" className="underline">{d.source_date ?? "source"}</a></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>

    <div className="viz-card mt-3 overflow-hidden">
      <div className="px-4 py-3 border-b border-neutral-200 flex items-baseline justify-between">
        <h3 className="font-semibold">Manufacturer ODD coverage</h3>
        <span className="text-xs text-neutral-500">{coverageRows.filter(r=>r.polygonCount>0||r.currentMarketCount>0||r.historicPointCount>0).length} of {coverageRows.length} manufacturers/entities have sourced geography</span>
      </div>
      <div className="px-4 pb-2 text-xs text-neutral-500">“No current public ODD verified” means the Observatory has not yet found a defensible current testing/deployment geography for that entity; it does not mean the entity is inactive.</div>
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
