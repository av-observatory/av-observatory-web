"use client";

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";

export type EuropeCrashIncident = {
  incident_id:string;
  date:string;
  country:string;
  city:string;
  operator:string;
  manufacturer:string;
  vehicle:string;
  automation:string;
  crash_with:string;
  injury_severity:string;
  fatalities:number|null;
  injuries:number|null;
  narrative:string;
  source_class:string;
  verification:string;
  sources:string[];
};

export type EuropeCountry = {
  country:string;
  verified_incidents:number;
  status:string;
};

const GEO_URL="https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json";

const MAP_NAME_ALIASES:Record<string,string>={
  "Bosnia and Herz.":"Bosnia and Herzegovina",
  "Czech Republic":"Czechia",
  "Macedonia":"North Macedonia",
  "Moldova":"Moldova",
  "Russian Federation":"Russia",
  "Türkiye":"Turkey",
  "United Kingdom":"United Kingdom",
  "Vatican":"Vatican City"
};

function niceDate(raw:string) {
  const [y,m,d]=raw.split("-").map(Number);
  if(!y||!m||!d) return raw;
  return new Date(Date.UTC(y,m-1,d)).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
}

export function EuropeCrashTracker({incidents,countries}:{incidents:EuropeCrashIncident[];countries:EuropeCountry[]}) {
  const [country,setCountry]=useState("ALL");
  const [selected,setSelected]=useState(incidents[0]?.incident_id??"");
  const counts=useMemo(()=>new Map(countries.map(x=>[x.country,x.verified_incidents])),[countries]);
  const allowed=useMemo(()=>new Set(countries.map(x=>x.country)),[countries]);

  const rows=useMemo(()=>incidents
    .filter(x=>country==="ALL"||x.country===country)
    .sort((a,b)=>String(b.date).localeCompare(String(a.date))),[incidents,country]);
  const active=rows.find(x=>x.incident_id===selected)??rows[0];

  const selectCountry=(name:string)=>{
    if(!allowed.has(name)) return;
    setCountry(name);
    setSelected("");
  };

  return <div>
    <div className="viz-card p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <label className="filter-label">Country
          <select className="filter-select min-w-[210px]" value={country} onChange={e=>{setCountry(e.target.value);setSelected("");}}>
            <option value="ALL">All European Countries</option>
            {countries.map(x=><option key={x.country} value={x.country}>{x.country} · {x.verified_incidents}</option>)}
          </select>
        </label>
        <button type="button" className="text-sm text-[#184f95] underline" onClick={()=>{setCountry("ALL");setSelected("");}}>Reset map</button>
      </div>

      <div className="mt-4 rounded-lg border border-[#dce5ec] bg-[#f8fbfd] overflow-hidden">
        <ComposableMap projection="geoAzimuthalEqualArea" projectionConfig={{rotate:[-15,-52,0],scale:700}} width={900} height={620} style={{width:"100%",height:"auto"}}>
          <ZoomableGroup center={[15,52]} zoom={1} minZoom={1} maxZoom={5}>
          <Geographies geography={GEO_URL}>
            {({geographies})=>geographies.map(geo=>{
              const raw=String(geo.properties?.name??"");
              const name=MAP_NAME_ALIASES[raw]??raw;
              const inScope=allowed.has(name);
              if(!inScope) return null;
              const n=counts.get(name)??0;
              const selectedCountry=country===name;
              return <Geography
                key={geo.rsmKey}
                geography={geo}
                onClick={()=>selectCountry(name)}
                role="button"
                tabIndex={0}
                onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();selectCountry(name);}}}
                aria-label={`${name}: ${n} verified crash${n===1?"":"es"}`}
                style={{
                  default:{fill:selectedCountry?"#bfdcf4":n>0?"#d9eaf7":"#eef2f5",stroke:"#8fa6bb",strokeWidth:0.6,outline:"none",cursor:"pointer"},
                  hover:{fill:n>0?"#c8e0f2":"#e2e8ed",stroke:"#52779d",strokeWidth:0.8,outline:"none",cursor:"pointer"},
                  pressed:{fill:"#bfdcf4",stroke:"#173d65",strokeWidth:1,outline:"none"}
                }}
              />;
            })}
          </Geographies>
          </ZoomableGroup>
        </ComposableMap>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-neutral-600 mt-2">
        <span><span className="inline-block w-3 h-3 rounded-sm bg-[#d9eaf7] border border-[#8fa6bb] mr-1 align-[-1px]"/>Verified crash(es)</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-[#eef2f5] border border-[#8fa6bb] mr-1 align-[-1px]"/>No verified crashes currently in tracker</span>
      </div>
    </div>

    <section className="mt-5">
      <div className="flex items-end justify-between gap-3">
        <div><h3 className="font-semibold text-[#152b45]">Country Coverage</h3><p className="text-sm text-neutral-600 mt-1">All in-scope European countries are listed, including those with zero verified crashes.</p></div>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">
        {countries.map(item=><button key={item.country} type="button" onClick={()=>selectCountry(item.country)}
          className={`flex items-center justify-between gap-3 rounded border px-3 py-2 text-left text-sm ${country===item.country?"border-[#173d65] bg-[#e8f2fb]":"border-[#dce5ec] bg-white hover:bg-[#f7fafc]"}`}>
          <span>{item.country}</span><strong className="tabular-nums text-[#123b69]">{item.verified_incidents}</strong>
        </button>)}
      </div>
    </section>

    <section className="mt-6">
      <h3 className="font-semibold text-[#152b45]">{country==="ALL"?"Verified Crash Records":`${country} · Verified Crash Records`}</h3>
      <div className="mt-3 grid gap-2.5">
        {rows.map(item=><button key={item.incident_id} type="button" onClick={()=>setSelected(item.incident_id)}
          className={`text-left rounded-lg border p-4 transition-colors ${active?.incident_id===item.incident_id?"border-[#173d65] bg-[#e8f2fb]":"border-[#dce5ec] bg-white hover:bg-[#f4f8fc]"}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-[#123b69]">{niceDate(item.date)} · {item.city}, {item.country}</div>
              <div className="mt-1 font-semibold text-[#152b45]">{item.operator} · {item.vehicle}</div>
            </div>
            <span className="text-sm font-semibold text-[#98601d]">{item.injury_severity}</span>
          </div>
          <div className="mt-2 text-sm text-neutral-600">{item.crash_with} · {item.automation}</div>
        </button>)}
        {rows.length===0&&<div className="viz-card p-8 text-sm text-neutral-500">No verified crashes currently in the tracker for {country}. This does not mean no crashes occurred.</div>}
      </div>
    </section>

    {active&&<article className="viz-card p-5 mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Verified Beta Record</p><h3 className="text-xl font-semibold text-[#152b45] mt-1">{active.city}, {active.country} · {active.operator}</h3></div>
        <span className="text-sm font-semibold text-[#123b69]">{active.verification}</span>
      </div>
      <p className="text-sm leading-relaxed mt-4">{active.narrative}</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm mt-4 pt-4 border-t border-[#dce5ec]">
        <div><span className="block text-neutral-500">Date</span>{niceDate(active.date)}</div>
        <div><span className="block text-neutral-500">Vehicle</span>{active.manufacturer} · {active.vehicle}</div>
        <div><span className="block text-neutral-500">Collision With</span>{active.crash_with}</div>
        <div><span className="block text-neutral-500">Injury Outcome</span>{active.injury_severity}</div>
        <div><span className="block text-neutral-500">Automation</span>{active.automation}</div>
        <div><span className="block text-neutral-500">Source Class</span>{active.source_class}</div>
      </div>
      <div className="flex flex-wrap gap-3 mt-4">{active.sources.map((url,i)=><a key={url} href={url} className="text-sm text-[#184f95] underline" target="_blank" rel="noreferrer">Source {i+1} ↗</a>)}</div>
    </article>}
  </div>;
}
