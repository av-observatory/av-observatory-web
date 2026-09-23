"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ComposableMap, Geographies, Geography, ZoomableGroup,
} from "react-simple-maps";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";
import { GRID_PROPS, AXIS_PROPS, TOOLTIP_PROPS, LEGEND_PROPS, SERIES } from "@/lib/chartTheme";

type S2Feature = {
  type: "Feature";
  properties: {
    vintage_end: string;
    state: string;
    county: string;
    s2_cell: string;
    waymo_ro_miles: number;
    incremental_miles: number;
    exposure_phase: string;
  };
  geometry: unknown;
};

type S2GeoJSON = {
  type: "FeatureCollection";
  metadata?: Record<string, unknown>;
  features: S2Feature[];
};

type VintageSummary = {
  vintage_end: string;
  vintage_start: string | null;
  cell_count: number;
  cumulative_miles: number;
  incremental_miles_vs_prior_release: number;
  negative_revision_cells: number;
  states: { state:string; cumulative_miles:number; cell_count:number }[];
};

type S2Summary = {
  dataset: string;
  source: string;
  phase: string;
  latest_vintage: string;
  vintages: VintageSummary[];
};

const RAMP = ["#e8f1fd","#cde2fb","#9ec5f4","#6da7ec","#3987e5","#256abf","#184f95","#0d366b"];

function compactMiles(v:number) {
  if (Math.abs(v) >= 1_000_000) return `${(v/1_000_000).toFixed(v>=10_000_000?0:1)}M`;
  if (Math.abs(v) >= 1_000) return `${(v/1_000).toFixed(0)}K`;
  return Math.round(v).toLocaleString();
}

function vintageLabel(v:string) {
  return `${v.slice(0,4)}-${v.slice(4,6)}`;
}

export function WaymoS2Explorer({
  summary,
  geojson,
}: {
  summary: S2Summary;
  geojson: S2GeoJSON;
}) {
  const [vintage,setVintage]=useState(summary.latest_vintage);
  const [mapData,setMapData]=useState<S2GeoJSON>(geojson);
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [metric,setMetric]=useState<"cumulative"|"incremental">("incremental");
  const [state,setState]=useState("ALL");
  const [zoom,setZoom]=useState(1);
  const [center,setCenter]=useState<[number,number]>([-98,37]);
  const [hover,setHover]=useState<{text:string;x:number;y:number}|null>(null);

  useEffect(() => {
    if (vintage === summary.latest_vintage) {
      setMapData(geojson);
      setLoadError(null);
      return;
    }
    let cancelled=false;
    setLoading(true);
    setLoadError(null);
    const base = window.location.pathname.startsWith("/av-observatory-web") ? "/av-observatory-web" : "";
    fetch(`${base}/data/waymo_s2_${vintage}.geojson`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d:S2GeoJSON) => { if(!cancelled){setMapData(d);setState("ALL");} })
      .catch(err => { if(!cancelled)setLoadError(String(err)); })
      .finally(() => { if(!cancelled)setLoading(false); });
    return () => { cancelled=true; };
  }, [vintage, summary.latest_vintage, geojson]);

  const currentSummary = summary.vintages.find(v=>v.vintage_end===vintage) ?? summary.vintages.at(-1)!;
  const vintageFeatures = mapData.features;
  const states = useMemo(
    ()=>Array.from(new Set(vintageFeatures.map(f=>f.properties.state).filter(Boolean))).sort(),
    [vintageFeatures]
  );
  const features = useMemo(
    ()=>vintageFeatures.filter(f=>state==="ALL"||f.properties.state===state),
    [vintageFeatures,state]
  );

  const values = features.map(f=>metric==="cumulative" ? f.properties.waymo_ro_miles : f.properties.incremental_miles);
  const positiveMax = Math.max(1, ...values.filter(v=>v>0));

  const collection = useMemo(()=>({type:"FeatureCollection" as const,features}),[features]);

  function fillFor(v:number) {
    if (metric==="incremental" && v<0) return "#e34948";
    if (v<=0) return "#efeee9";
    const t=Math.sqrt(v/positiveMax);
    return RAMP[Math.min(RAMP.length-1,Math.floor(t*(RAMP.length-1)))];
  }

  const chartRows=summary.vintages.map(v=>({
    vintage:vintageLabel(v.vintage_end),
    cumulative:Number((v.cumulative_miles/1_000_000).toFixed(1)),
    incremental:Number((v.incremental_miles_vs_prior_release/1_000_000).toFixed(1)),
  }));

  return <div>
    <div className="viz-card p-4">
      <div className="grid md:grid-cols-3 gap-3">
        <label className="filter-label">S2 release
          <select className="filter-select" value={vintage} onChange={e=>setVintage(e.target.value)}>
            {summary.vintages.slice().reverse().map(v=><option key={v.vintage_end} value={v.vintage_end}>{vintageLabel(v.vintage_end)}</option>)}
          </select>
        </label>
        <label className="filter-label">Map measure
          <select className="filter-select" value={metric} onChange={e=>setMetric(e.target.value as "cumulative"|"incremental")}>
            <option value="incremental">Miles added since prior release</option>
            <option value="cumulative">Cumulative Waymo RO miles</option>
          </select>
        </label>
        <label className="filter-label">State
          <select className="filter-select" value={state} onChange={e=>setState(e.target.value)}>
            <option value="ALL">All states</option>
            {states.map(s=><option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-3">
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Cumulative miles</div><div className="text-2xl font-semibold tabular-nums mt-1">{compactMiles(currentSummary.cumulative_miles)}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Miles since prior release</div><div className="text-2xl font-semibold tabular-nums mt-1">{compactMiles(currentSummary.incremental_miles_vs_prior_release)}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">S2 cells</div><div className="text-2xl font-semibold tabular-nums mt-1">{currentSummary.cell_count.toLocaleString()}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Negative cell revisions</div><div className="text-2xl font-semibold tabular-nums mt-1">{currentSummary.negative_revision_cells}</div></div>
    </div>

    <div className="grid lg:grid-cols-[1.55fr_.45fr] gap-3 mt-3">
      <div className="viz-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h3 className="font-semibold">Observed Waymo deployment footprint</h3>
            <div className="text-sm text-neutral-500">Published S2 release {vintageLabel(vintage)}. Waymo operational mileage is deployment exposure, not a testing ODD.</div>
          </div>
          <span className="text-sm text-neutral-500">{loading ? "Loading…" : `${features.length.toLocaleString()} cells`}</span>
        </div>
        <div className="relative mt-2">
          <div className="absolute right-2 top-2 z-[2] flex gap-1">
            <button className="map-control" onClick={()=>setZoom(z=>Math.min(12,z*1.5))}>+</button>
            <button className="map-control" onClick={()=>setZoom(z=>Math.max(1,z/1.5))}>−</button>
            <button className="map-control px-2" onClick={()=>{setZoom(1);setCenter([-98,37]);}}>Reset</button>
          </div>
          <ComposableMap projection="geoAlbersUsa" width={900} height={540} style={{width:"100%",height:"auto"}}>
            <ZoomableGroup
              zoom={zoom}
              center={center}
              minZoom={1}
              maxZoom={12}
              onMoveEnd={({coordinates,zoom:z})=>{setCenter(coordinates as [number,number]);setZoom(z??1);}}
            >
              <Geographies geography="https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json">
                {({geographies})=>geographies.map(g=><Geography key={g.rsmKey} geography={g} fill="#f3f2ef" stroke="#d7d5ce" strokeWidth={0.8/zoom} style={{outline:"none"}} />)}
              </Geographies>
              <Geographies geography={collection}>
                {({geographies})=>geographies.map(g=>{
                  const p=g.properties as S2Feature["properties"];
                  const value=metric==="cumulative"?p.waymo_ro_miles:p.incremental_miles;
                  return <Geography
                    key={g.rsmKey}
                    geography={g}
                    fill={fillFor(value)}
                    stroke="#ffffff"
                    strokeWidth={0.35/zoom}
                    onMouseEnter={evt=>setHover({text:`${p.state||"State unspecified"} · ${p.county||"County unspecified"} · ${compactMiles(value)} mi · S2 ${p.s2_cell}`,x:evt.clientX,y:evt.clientY})}
                    onMouseMove={evt=>setHover(h=>h?{...h,x:evt.clientX,y:evt.clientY}:h)}
                    onMouseLeave={()=>setHover(null)}
                    style={{outline:"none",cursor:"pointer"}}
                  />;
                })}
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
          {loadError && <div className="text-xs text-red-700 mb-1">Could not load this vintage map: {loadError}</div>}
          <div className="text-xs text-neutral-500">Drag to pan · scroll or controls to zoom · hover a cell for mileage and geography. Red cells are negative revisions between releases.</div>
          {hover&&<div className="fixed z-30 pointer-events-none bg-neutral-900 text-white text-xs rounded px-2 py-1 max-w-sm" style={{left:hover.x+12,top:hover.y+12}}>{hover.text}</div>}
        </div>
      </div>

      <div className="viz-card p-4">
        <h3 className="font-semibold">Mileage growth by release</h3>
        <div className="text-sm text-neutral-500">Cumulative and incremental operational miles represented in each S2 benchmark release.</div>
        <ResponsiveContainer width="100%" height={310}>
          <LineChart data={chartRows} margin={{top:18,right:10,bottom:5,left:0}}>
            <CartesianGrid {...GRID_PROPS}/>
            <XAxis dataKey="vintage" {...AXIS_PROPS}/>
            <YAxis {...AXIS_PROPS} tickFormatter={v=>`${v}M`}/>
            <Tooltip {...TOOLTIP_PROPS} formatter={(v)=>`${v}M miles`}/>
            <Legend {...LEGEND_PROPS}/>
            <Line type="monotone" dataKey="cumulative" name="Cumulative" stroke={SERIES.blue} strokeWidth={2.5} dot={false}/>
            <Line type="monotone" dataKey="incremental" name="Added since prior release" stroke={SERIES.orange} strokeWidth={2.5} dot={false}/>
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-2 text-xs text-neutral-500">Select any published release above to map the footprint at that vintage. Releases before 2025-12 lack the newer explicit state/county attributes, but their S2 geometry is retained.</div>
      </div>
    </div>
  </div>;
}
