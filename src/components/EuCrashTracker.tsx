"use client";

import { useMemo, useState } from "react";

export type EuCrashIncident = {
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
  fatalities:number;
  injuries:number;
  narrative:string;
  source_class:string;
  verification:string;
  sources:string[];
};

function niceDate(raw:string) {
  const [y,m,d]=raw.split("-").map(Number);
  if(!y||!m||!d) return raw;
  return new Date(Date.UTC(y,m-1,d)).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
}

export function EuCrashTracker({incidents}:{incidents:EuCrashIncident[]}) {
  const countries=useMemo(()=>Array.from(new Set(incidents.map(x=>x.country))).sort(),[incidents]);
  const [country,setCountry]=useState("ALL");
  const [selected,setSelected]=useState(incidents[0]?.incident_id??"");
  const rows=useMemo(()=>incidents
    .filter(x=>country==="ALL"||x.country===country)
    .sort((a,b)=>b.date.localeCompare(a.date)),[incidents,country]);
  const active=rows.find(x=>x.incident_id===selected)??rows[0];

  return <div>
    <div className="viz-card p-4">
      <label className="filter-label">Country
        <select className="filter-select" value={country} onChange={e=>{setCountry(e.target.value);setSelected("");}}>
          <option value="ALL">All EU Countries</option>
          {countries.map(x=><option key={x}>{x}</option>)}
        </select>
      </label>
    </div>

    <div className="mt-4 grid gap-2.5">
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
      {rows.length===0&&<div className="viz-card p-8 text-sm text-neutral-500">No incidents currently verified for this filter.</div>}
    </div>

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
