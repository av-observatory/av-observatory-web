"use client";

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";

const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type CountryRow = {
  country:string; iso2:string; eu:boolean; evidence:string; scope:string; summary:string;
  incident_reporting:number; periodic_reporting:number; exposure_reporting:number; event_data:number;
  regulator_access:number; public_access:number; fixed_deadline:number; permit_specific:number; eu_type_approval_layer:number;
  sources:string[];
};
type Dim = {key:string;label:string};
type Dataset = {
  research_cutoff:string;
  methodology:string;
  common_eu_layer:{source:string};
  dimensions:Dim[];
  countries:CountryRow[];
};

const NAME_ALIASES: Record<string,string> = {
  "Czech Republic":"Czechia",
  "United Kingdom":"United Kingdom",
};

const EVIDENCE_COLOR: Record<string,string> = {
  "A":"#184f95",
  "A/B":"#3987e5",
  "A/C":"#6da7ec",
  "B":"#86b6ef",
  "B/C":"#b9d2ef",
  "C":"#deddd8",
};

export function EuropePolicyExplorer({data}:{data:Dataset}) {
  const [metric,setMetric]=useState("evidence");
  const [selected,setSelected]=useState<CountryRow|null>(null);
  const [zoom,setZoom]=useState(1);
  const [center,setCenter]=useState<[number,number]>([12,54]);
  const [hover,setHover]=useState<{text:string;x:number;y:number}|null>(null);

  const byName=useMemo(()=>new Map(data.countries.map(c=>[c.country,c])),[data]);
  const selectedDim=data.dimensions.find(d=>d.key===metric);

  function fill(name:string){
    const row=byName.get(NAME_ALIASES[name]??name);
    if(!row) return "#efeee9";
    if(metric==="evidence") return EVIDENCE_COLOR[row.evidence]??"#deddd8";
    return Number(row[metric as keyof CountryRow])===1 ? "#2a78d6" : "#deddd8";
  }

  const yesCount=metric==="evidence" ? data.countries.filter(c=>c.evidence.startsWith("A")).length :
    data.countries.filter(c=>Number(c[metric as keyof CountryRow])===1).length;

  return <div>
    <div className="viz-card p-4">
      <div className="grid md:grid-cols-[1fr_auto] gap-3 items-end">
        <label className="filter-label">Map layer
          <select className="filter-select" value={metric} onChange={e=>setMetric(e.target.value)}>
            <option value="evidence">Evidence strength</option>
            {data.dimensions.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}
          </select>
        </label>
        <div className="text-sm text-neutral-500 pb-2">
          {metric==="evidence" ? `${yesCount} countries with primary-source evidence` : `${yesCount} of ${data.countries.length} countries: requirement/access established`}
        </div>
      </div>
    </div>

    <div className="grid lg:grid-cols-[1.45fr_.55fr] gap-3 mt-3">
      <div className="viz-card p-4">
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <div>
            <h2 className="text-xl font-semibold">European AV reporting requirements</h2>
            <p className="text-sm text-neutral-500">
              {metric==="evidence" ? "Evidence grade for the national assessment." : `${selectedDim?.label}: blue means established in the current review; grey means not established, not necessarily absent.`}
            </p>
          </div>
          <span className="text-xs text-neutral-500">Research cutoff {data.research_cutoff}</span>
        </div>

        <div className="relative">
          <div className="absolute right-2 top-2 z-[2] flex gap-1">
            <button className="map-control" onClick={()=>setZoom(z=>Math.min(8,z*1.4))}>+</button>
            <button className="map-control" onClick={()=>setZoom(z=>Math.max(1,z/1.4))}>−</button>
            <button className="map-control px-2" onClick={()=>{setZoom(1);setCenter([12,54]);}}>Reset</button>
          </div>
          <ComposableMap projection="geoMercator" projectionConfig={{center:[12,54],scale:620}} width={900} height={620} style={{width:"100%",height:"auto"}}>
            <ZoomableGroup zoom={zoom} center={center} minZoom={1} maxZoom={8}
              onMoveEnd={({coordinates,zoom:z})=>{setCenter(coordinates as [number,number]);setZoom(z??1);}}>
              <Geographies geography={WORLD_URL}>
                {({geographies})=>geographies.map(g=>{
                  const name=String(g.properties?.name??"");
                  const row=byName.get(NAME_ALIASES[name]??name);
                  const europe=row!==undefined;
                  return <Geography key={g.rsmKey} geography={g}
                    fill={europe?fill(name):"#f5f4f1"}
                    stroke="#ffffff" strokeWidth={0.7/zoom}
                    onMouseEnter={evt=>{
                      if(!row)return;
                      const detail=metric==="evidence"?`Evidence ${row.evidence}`:`${selectedDim?.label}: ${Number(row[metric as keyof CountryRow])===1?"Established":"Not established in review"}`;
                      setHover({text:`${row.country} · ${detail}`,x:evt.clientX,y:evt.clientY});
                    }}
                    onMouseMove={evt=>setHover(h=>h?{...h,x:evt.clientX,y:evt.clientY}:h)}
                    onMouseLeave={()=>setHover(null)}
                    onClick={()=>row&&setSelected(row)}
                    style={{outline:"none",cursor:europe?"pointer":"default"}}
                  />;
                })}
              </Geographies>
            </ZoomableGroup>
          </ComposableMap>
          <div className="mt-1 text-xs text-neutral-500">Drag to pan · scroll or controls to zoom · click a country for the legal/reporting detail.</div>
          {hover&&<div className="fixed z-30 pointer-events-none bg-neutral-900 text-white text-xs rounded px-2 py-1" style={{left:hover.x+12,top:hover.y+12}}>{hover.text}</div>}
        </div>
      </div>

      <div className="viz-card p-4 min-h-[360px]">
        {selected ? <CountryDetail row={selected} dimensions={data.dimensions}/> :
          <div>
            <div className="eyebrow">Country detail</div>
            <h3 className="text-xl font-semibold mt-1">Select a country</h3>
            <p className="text-sm text-neutral-500 mt-2">The panel shows national reporting duties, scope, evidence strength and source links. EU countries also have the separate EU ADS type-approval layer where Regulation 2022/1426 applies.</p>
          </div>}
      </div>
    </div>

  </div>;
}

function CountryDetail({row,dimensions}:{row:CountryRow;dimensions:Dim[]}) {
  return <div>
    <div className="flex items-start justify-between gap-3">
      <div><div className="eyebrow">Country detail</div><h3 className="text-2xl font-semibold mt-1">{row.country}</h3></div>
      <span className="badge">Evidence {row.evidence}</span>
    </div>
    <div className="text-xs text-neutral-500 mt-1">{row.scope}</div>
    <p className="text-sm text-neutral-700 mt-3 leading-relaxed">{row.summary}</p>
    <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-4">
      {dimensions.map(d=><div key={d.key} className="flex items-center justify-between border-b border-neutral-100 pb-1 text-xs">
        <span className="text-neutral-500">{d.label}</span>
        <strong>{Number(row[d.key as keyof CountryRow])===1?"Yes":"Not established"}</strong>
      </div>)}
    </div>
    <div className="mt-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Sources</div>
      <div className="mt-1 space-y-1">
        {row.sources.length?row.sources.map((u,i)=><a key={u} href={u} target="_blank" rel="noreferrer" className="block text-xs underline break-all">Source {i+1}</a>):<span className="text-xs text-neutral-500">No primary source linked in current review.</span>}
      </div>
    </div>
  </div>;
}
