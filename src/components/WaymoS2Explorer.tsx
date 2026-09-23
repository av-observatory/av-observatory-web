"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GRID_PROPS, AXIS_PROPS, TOOLTIP_PROPS, SERIES } from "@/lib/chartTheme";

declare global {
  interface Window {
    L?: any;
  }
}

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
  geometry: any;
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

type Metric = "cumulative" | "incremental";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const BLUE_RAMP = ["#edf4fd","#d5e7fb","#a9cef6","#78afea","#438ad8","#2468b7","#174b8a","#0b2f5f"];
const ORANGE_RAMP = ["#fff3e8","#fddfc6","#f8bd8e","#f29356","#df6c28","#b94b15","#8d3510","#63240c"];

function ensureLeafletCss() {
  if (document.querySelector('link[data-waymo-s2-leaflet="1"]')) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = LEAFLET_CSS;
  link.crossOrigin = "";
  link.dataset.waymoS2Leaflet = "1";
  document.head.appendChild(link);
}

function loadLeaflet(): Promise<any> {
  if (window.L) return Promise.resolve(window.L);
  const existing = document.querySelector<HTMLScriptElement>('script[data-waymo-s2-leaflet="1"]');
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(window.L), { once: true });
      existing.addEventListener("error", reject, { once: true });
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.crossOrigin = "";
    script.dataset.waymoS2Leaflet = "1";
    script.onload = () => resolve(window.L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function compactMiles(v:number) {
  const abs=Math.abs(v);
  if (abs >= 1_000_000) return `${(v/1_000_000).toFixed(abs>=10_000_000?0:1)}M`;
  if (abs >= 1_000) return `${(v/1_000).toFixed(abs>=100_000?0:1)}K`;
  return Math.round(v).toLocaleString();
}

function vintageLabel(v:string) {
  return `${v.slice(0,4)}-${v.slice(4,6)}`;
}

function percentile(sorted:number[], p:number) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length-1, Math.floor((sorted.length-1)*p))];
}

function quantileBreaks(values:number[]) {
  const positive=values.filter(v=>v>0&&Number.isFinite(v)).sort((a,b)=>a-b);
  if (!positive.length) return [0,1,2,3,4,5,6,7];
  return [0.10,0.25,0.40,0.55,0.70,0.82,0.92,0.98].map(p=>percentile(positive,p));
}

function rampIndex(v:number, breaks:number[]) {
  if (v<=0) return 0;
  for(let i=0;i<breaks.length;i++) if(v<=breaks[i]) return i;
  return breaks.length-1;
}

function escapeHtml(value:unknown) {
  return String(value??"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function S2LeafletMap({
  features,
  metric,
  breaks,
  totalMiles,
}: {
  features:S2Feature[];
  metric:Metric;
  breaks:number[];
  totalMiles:number;
}) {
  const containerRef=useRef<HTMLDivElement|null>(null);
  const mapRef=useRef<any>(null);

  useEffect(()=>{
    let cancelled=false;
    ensureLeafletCss();

    loadLeaflet().then(L=>{
      if(cancelled||!containerRef.current||!L)return;
      if(mapRef.current){mapRef.current.remove();mapRef.current=null;}

      const map=L.map(containerRef.current,{
        center:[36.5,-98],
        zoom:4,
        minZoom:2,
        maxZoom:16,
        zoomControl:true,
        scrollWheelZoom:true,
      });
      mapRef.current=map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
        maxZoom:19,
        attribution:"&copy; OpenStreetMap contributors",
      }).addTo(map);

      const bounds=L.latLngBounds([]);
      const layer=L.geoJSON({type:"FeatureCollection",features} as any,{
        style:(feature:any)=>{
          const p=feature?.properties??{};
          const value=metric==="cumulative"?Number(p.waymo_ro_miles||0):Number(p.incremental_miles||0);
          if(metric==="incremental"&&value<0){
            return {color:"#9f1d20",weight:0.65,opacity:0.95,fillColor:"#d9474d",fillOpacity:0.8};
          }
          const ramp=metric==="cumulative"?BLUE_RAMP:ORANGE_RAMP;
          const idx=rampIndex(value,breaks);
          return {
            color:"rgba(255,255,255,.8)",
            weight:0.55,
            opacity:0.9,
            fillColor:value<=0?"#e5e5e3":ramp[idx],
            fillOpacity:value<=0?0.28:0.84,
          };
        },
        onEachFeature:(feature:any,l:any)=>{
          const p=feature.properties??{};
          const cumulative=Number(p.waymo_ro_miles||0);
          const added=Number(p.incremental_miles||0);
          const value=metric==="cumulative"?cumulative:added;
          const share=totalMiles>0?cumulative/totalMiles*100:0;
          l.bindTooltip(
            `<div style="font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;min-width:180px">
              <div style="font-weight:700">${escapeHtml(p.county||"County unavailable")}, ${escapeHtml(p.state||"")}</div>
              <div style="font-size:15px;font-weight:700;margin-top:3px">${escapeHtml(compactMiles(value))} miles</div>
              <div style="color:#666;margin-top:2px">Cumulative: ${escapeHtml(compactMiles(cumulative))} · added: ${escapeHtml(compactMiles(added))}</div>
              <div style="color:#666">${share.toFixed(2)}% of selected release miles · S2 ${escapeHtml(p.s2_cell)}</div>
            </div>`,
            {sticky:true,direction:"top",opacity:0.96}
          );
          try{const b=l.getBounds();if(b?.isValid())bounds.extend(b);}catch{}
        },
      }).addTo(map);

      const fit=()=>{
        if(bounds.isValid()) map.fitBounds(bounds.pad(0.04),{maxZoom:10,animate:false});
      };
      fit();

      const Reset=L.Control.extend({
        options:{position:"topright"},
        onAdd:()=>{
          const btn=L.DomUtil.create("button","odd-leaflet-reset");
          btn.type="button";
          btn.innerHTML="Reset";
          btn.title="Fit to displayed S2 cells";
          L.DomEvent.disableClickPropagation(btn);
          L.DomEvent.on(btn,"click",fit);
          return btn;
        },
      });
      new Reset().addTo(map);
    });

    return ()=>{
      cancelled=true;
      if(mapRef.current){mapRef.current.remove();mapRef.current=null;}
    };
  },[features,metric,breaks,totalMiles]);

  return <div ref={containerRef} className="waymo-s2-leaflet-map" aria-label="Waymo VMT by S2 cell map" />;
}

export function WaymoS2Explorer({
  summary,
  geojson,
}: {
  summary:S2Summary;
  geojson:S2GeoJSON;
}) {
  const [vintage,setVintage]=useState(summary.latest_vintage);
  const [mapData,setMapData]=useState<S2GeoJSON>(geojson);
  const [loading,setLoading]=useState(false);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [metric,setMetric]=useState<Metric>("cumulative");
  const [state,setState]=useState("ALL");

  useEffect(()=>{
    if(vintage===summary.latest_vintage){
      setMapData(geojson);setLoadError(null);return;
    }
    let cancelled=false;
    setLoading(true);setLoadError(null);
    const base=window.location.pathname.startsWith("/av-observatory-web")?"/av-observatory-web":"";
    fetch(`${base}/data/waymo_s2_${vintage}.geojson`)
      .then(r=>{if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json();})
      .then((d:S2GeoJSON)=>{if(!cancelled){setMapData(d);setState("ALL");}})
      .catch(err=>{if(!cancelled)setLoadError(String(err));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[vintage,summary.latest_vintage,geojson]);

  const currentSummary=summary.vintages.find(v=>v.vintage_end===vintage)??summary.vintages.at(-1)!;
  const vintageFeatures=mapData.features;
  const states=useMemo(()=>Array.from(new Set(vintageFeatures.map(f=>f.properties.state).filter(Boolean))).sort(),[vintageFeatures]);
  const features=useMemo(()=>vintageFeatures.filter(f=>state==="ALL"||f.properties.state===state),[vintageFeatures,state]);

  const values=useMemo(()=>features.map(f=>metric==="cumulative"?f.properties.waymo_ro_miles:f.properties.incremental_miles),[features,metric]);
  const breaks=useMemo(()=>quantileBreaks(values),[values]);
  const selectedMiles=features.reduce((sum,f)=>sum+Number(f.properties.waymo_ro_miles||0),0);
  const selectedIncremental=features.reduce((sum,f)=>sum+Number(f.properties.incremental_miles||0),0);

  const rankedCells=useMemo(()=>features
    .slice()
    .sort((a,b)=>Number(b.properties.waymo_ro_miles||0)-Number(a.properties.waymo_ro_miles||0))
    .slice(0,10),[features]);

  const chartRows=summary.vintages.map(v=>({
    vintage:vintageLabel(v.vintage_end),
    cumulative:Number((v.cumulative_miles/1_000_000).toFixed(1)),
  }));

  const ramp=metric==="cumulative"?BLUE_RAMP:ORANGE_RAMP;

  return <div>
    <div className="viz-card p-4">
      <div className="grid md:grid-cols-3 gap-3">
        <label className="filter-label">S2 release
          <select className="filter-select" value={vintage} onChange={e=>setVintage(e.target.value)}>
            {summary.vintages.slice().reverse().map(v=><option key={v.vintage_end} value={v.vintage_end}>{vintageLabel(v.vintage_end)}</option>)}
          </select>
        </label>
        <label className="filter-label">Cell measure
          <select className="filter-select" value={metric} onChange={e=>setMetric(e.target.value as Metric)}>
            <option value="cumulative">VMT by cell · cumulative miles</option>
            <option value="incremental">VMT added since prior release</option>
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
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Miles in displayed cells</div><div className="text-2xl font-semibold tabular-nums mt-1">{compactMiles(selectedMiles)}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Miles added in release</div><div className="text-2xl font-semibold tabular-nums mt-1">{compactMiles(selectedIncremental)}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Displayed S2 cells</div><div className="text-2xl font-semibold tabular-nums mt-1">{features.length.toLocaleString()}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Negative revisions</div><div className="text-2xl font-semibold tabular-nums mt-1">{features.filter(f=>f.properties.incremental_miles<0).length}</div></div>
    </div>

    <div className="viz-card p-4 mt-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-xl font-semibold">Waymo VMT by S2 cell</h3>
          <div className="text-sm text-neutral-500 mt-1">
            {metric==="cumulative"
              ? "Each S2 cell is shaded by cumulative Waymo operational mileage in the selected benchmark release."
              : "Each S2 cell is shaded by mileage added since the prior benchmark release; negative revisions are red."}
          </div>
        </div>
        <div className="text-sm text-neutral-500">{loading?"Loading…":`${features.length.toLocaleString()} cells`}</div>
      </div>

      <div className="mt-4">
        <S2LeafletMap features={features} metric={metric} breaks={breaks} totalMiles={selectedMiles} />
      </div>

      <div className="mt-3">
        <div className="text-xs font-medium text-neutral-600 mb-1.5">{metric==="cumulative"?"Operational miles per cell":"Miles added per cell"}</div>
        <div className="flex flex-wrap gap-1">
          {breaks.map((b,i)=><div key={i} className="flex items-center gap-1.5 mr-2">
            <span className="inline-block w-5 h-3 rounded-sm border border-white" style={{background:ramp[i]}} />
            <span className="text-[11px] text-neutral-500">{i===0?`≤ ${compactMiles(b)}`:`${compactMiles(breaks[i-1])}–${compactMiles(b)}`}</span>
          </div>)}
          {metric==="incremental"&&<div className="flex items-center gap-1.5 mr-2"><span className="inline-block w-5 h-3 rounded-sm bg-[#d9474d]" /><span className="text-[11px] text-neutral-500">Negative revision</span></div>}
        </div>
      </div>

      {loadError&&<div className="text-xs text-red-700 mt-2">Could not load this vintage map: {loadError}</div>}
    </div>

    <div className="grid lg:grid-cols-[1.05fr_.95fr] gap-3 mt-3">
      <div className="viz-card p-4">
        <h3 className="font-semibold">Highest-mileage cells</h3>
        <div className="text-sm text-neutral-500 mb-2">Top cells in the current state/release filter, ranked by cumulative operational VMT.</div>
        <div className="divide-y divide-neutral-100">
          {rankedCells.map((f,i)=>{
            const p=f.properties;
            const share=selectedMiles>0?p.waymo_ro_miles/selectedMiles*100:0;
            return <div key={p.s2_cell} className="py-2 flex items-center gap-3">
              <div className="w-5 text-xs text-neutral-400 tabular-nums">{i+1}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{p.county||"County unavailable"}, {p.state||""}</div>
                <div className="text-[11px] text-neutral-500 truncate">S2 {p.s2_cell} · {share.toFixed(2)}% of displayed miles</div>
              </div>
              <div className="text-sm font-semibold tabular-nums">{compactMiles(p.waymo_ro_miles)} mi</div>
            </div>;
          })}
        </div>
      </div>

      <div className="viz-card p-4">
        <h3 className="font-semibold">Published mileage growth</h3>
        <div className="text-sm text-neutral-500">Cumulative operational miles represented by each S2 benchmark release.</div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartRows} margin={{top:18,right:10,bottom:5,left:0}}>
            <CartesianGrid {...GRID_PROPS}/>
            <XAxis dataKey="vintage" {...AXIS_PROPS}/>
            <YAxis {...AXIS_PROPS} tickFormatter={v=>`${v}M`}/>
            <Tooltip {...TOOLTIP_PROPS} formatter={(v)=>`${v}M miles`}/>
            <Line type="monotone" dataKey="cumulative" name="Cumulative miles" stroke={SERIES.blue} strokeWidth={2.5} dot={false}/>
          </LineChart>
        </ResponsiveContainer>
        <div className="mt-1 text-xs text-neutral-500">
          Release {vintageLabel(vintage)} contains {currentSummary.cell_count.toLocaleString()} cells and {compactMiles(currentSummary.cumulative_miles)} cumulative miles.
        </div>
      </div>
    </div>
  </div>;
}
