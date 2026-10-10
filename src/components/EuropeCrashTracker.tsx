"use client";

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography } from "react-simple-maps";

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

const ISO_NUMERIC_TO_COUNTRY:Record<string,string>={
  "008":"Albania","020":"Andorra","051":"Armenia","040":"Austria","031":"Azerbaijan",
  "112":"Belarus","056":"Belgium","070":"Bosnia and Herzegovina","100":"Bulgaria","191":"Croatia",
  "196":"Cyprus","203":"Czechia","208":"Denmark","233":"Estonia","246":"Finland","250":"France",
  "268":"Georgia","276":"Germany","300":"Greece","348":"Hungary","352":"Iceland","372":"Ireland",
  "380":"Italy","398":"Kazakhstan","383":"Kosovo","428":"Latvia","438":"Liechtenstein","440":"Lithuania",
  "442":"Luxembourg","470":"Malta","498":"Moldova","492":"Monaco","499":"Montenegro","528":"Netherlands",
  "807":"North Macedonia","578":"Norway","616":"Poland","620":"Portugal","642":"Romania","643":"Russia",
  "674":"San Marino","688":"Serbia","703":"Slovakia","705":"Slovenia","724":"Spain","752":"Sweden",
  "756":"Switzerland","792":"Turkey","804":"Ukraine","826":"United Kingdom","336":"Vatican City"
};

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
        <ComposableMap projection="geoMercator" projectionConfig={{center:[15,54],scale:520}} width={900} height={560} style={{width:"100%",height:"auto"}}>
          <Geographies geography={GEO_URL}>
            {({geographies})=>geographies.map(geo=>{
              const raw=String(geo.properties?.name??"");
              const id=String(geo.id??"").padStart(3,"0");
              const name=ISO_NUMERIC_TO_COUNTRY[id]??MAP_NAME_ALIASES[raw]??raw;
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
                fill={selectedCountry?"#bfdcf4":n>0?"#d9eaf7":"#eef2f5"}
                stroke={selectedCountry?"#173d65":"#8fa6bb"}
                strokeWidth={selectedCountry?1.2:0.6}
                style={{
                  default:{outline:"none",cursor:"pointer"},
                  hover:{outline:"none",cursor:"pointer",opacity:0.82},
                  pressed:{outline:"none",cursor:"pointer",opacity:0.72}
                } as any}
              />;
            })}
          </Geographies>
        </ComposableMap>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-neutral-600 mt-2">
        <span><span className="inline-block w-3 h-3 rounded-sm bg-[#d9eaf7] border border-[#8fa6bb] mr-1 align-[-1px]"/>Verified crash(es)</span>
        <span><span className="inline-block w-3 h-3 rounded-sm bg-[#eef2f5] border border-[#8fa6bb] mr-1 align-[-1px]"/>No verified crashes currently in tracker</span>
      </div>
    </div>

    <section className="mt-6">
      <h3 className="font-semibold text-[#152b45]">{country==="ALL"?"Verified Crash Records":`${country} · Verified Crash Records`}</h3>
      <div className="mt-3 grid gap-2.5">
        {rows.map(item=>{
          const isOpen=selected===item.incident_id;
          return <div key={item.incident_id}
            className={`rounded-lg border transition-colors overflow-hidden ${isOpen?"border-[#173d65] bg-[#e8f2fb]":"border-[#dce5ec] bg-white hover:bg-[#f4f8fc]"}`}>
            <button type="button" onClick={()=>setSelected(isOpen?"":item.incident_id)}
              aria-expanded={isOpen}
              className="w-full text-left p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-[#123b69]">{niceDate(item.date)} · {item.city}, {item.country}</div>
                  <div className="mt-1 font-semibold text-[#152b45]">{item.operator} · {item.vehicle}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[#98601d]">{item.injury_severity}</span>
                  <span className="text-[#184f95] text-lg" aria-hidden="true">{isOpen?"−":"+"}</span>
                </div>
              </div>
              <div className="mt-2 text-sm text-neutral-600">{item.crash_with} · {item.automation}</div>
            </button>

            {isOpen&&<div className="px-4 pb-5">
              <div className="border-t border-[#bfd2e5] pt-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="eyebrow">Crash Details</p>
                  <span className="text-sm font-semibold text-[#123b69]">{item.verification}</span>
                </div>
                <p className="text-sm leading-relaxed mt-3">{item.narrative}</p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm mt-4 pt-4 border-t border-[#bfd2e5]">
                  <div><span className="block text-neutral-500">Date</span>{niceDate(item.date)}</div>
                  <div><span className="block text-neutral-500">Vehicle</span>{item.manufacturer} · {item.vehicle}</div>
                  <div><span className="block text-neutral-500">Collision With</span>{item.crash_with}</div>
                  <div><span className="block text-neutral-500">Injury Outcome</span>{item.injury_severity}</div>
                  <div><span className="block text-neutral-500">Automation</span>{item.automation}</div>
                  <div><span className="block text-neutral-500">Source Class</span>{item.source_class}</div>
                </div>
                <div className="flex flex-wrap gap-3 mt-4">{item.sources.map((url,i)=><a key={url} href={url} className="text-sm text-[#184f95] underline" target="_blank" rel="noreferrer">Source {i+1} ↗</a>)}</div>
              </div>
            </div>}
          </div>;
        })}
        {rows.length===0&&<div className="viz-card p-8 text-sm text-neutral-500">No verified crashes currently in the tracker for {country}. This does not mean no crashes occurred.</div>}
      </div>
    </section>
  </div>;
}
