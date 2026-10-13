"use client";

import { useMemo, useState } from "react";
import { ComposableMap, Geographies, Geography, ZoomableGroup } from "react-simple-maps";

const WORLD_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

export type IncidentDetail = {title:string;who:string;trigger:string;deadline:string;recipient:string;contents:string;source:string;source_label:string;note:string;basis:string;reviewed:string};
export type CountryRow = {
  incident_detail?:IncidentDetail; incident_primary:boolean; requirement_details:Record<string,string>; reviewed_at:string;
  country:string; iso2:string; eu:boolean; evidence:string; scope:string; summary:string;
  incident_reporting:number; periodic_reporting:number; exposure_reporting:number; event_data:number;
  regulator_access:number; public_access:number; fixed_deadline:number; permit_specific:number; eu_type_approval_layer:number;
  sources:string[];
  open_data:number|null; avs_authorized:number|null; authorization_evidence:string; authorization_note:string; open_data_note:string;
};
type Dim = {key:string;label:string;description?:string};
type Dataset = {
  research_cutoff:string;
  methodology:string;
  common_eu_layer:{source:string};
  dimensions:Dim[];
  policy_elements:Dim[];
  countries:CountryRow[];
};

const NAME_ALIASES: Record<string,string> = {
  "Czech Republic":"Czechia",
  "United Kingdom":"United Kingdom",
};

function highlighted(row:CountryRow,key:string) {
  if(key==="incident_reporting")return row.incident_reporting===1&&row.incident_primary;
  if(key==="avs_authorized")return row.avs_authorized===1&&row.authorization_evidence==="A";
  return Number(row[key as keyof CountryRow])===1;
}
function mapStatus(row:CountryRow,key:string) {
  if(key==="incident_reporting")return row.incident_detail?.title??"See country reporting terms";
  if(key==="exposure_reporting"&&row.exposure_reporting===1)return "Distance reporting required — see schedule";
  if(key==="avs_authorized"&&row.avs_authorized===1)return "Conditional testing / operating route";
  return "See country details";
}

export function EuropePolicyExplorer({data}:{data:Dataset}) {
  const [metric,setMetric]=useState("incident_reporting");
  const [selected,setSelected]=useState<CountryRow|null>(data.countries.find(c=>c.country==="Spain")??null);
  const [zoom,setZoom]=useState(1);
  const [center,setCenter]=useState<[number,number]>([12,54]);
  const [hover,setHover]=useState<{text:string;x:number;y:number}|null>(null);

  const byName=useMemo(()=>new Map(data.countries.map(c=>[c.country,c])),[data]);
  const selectedDim=data.policy_elements.find(d=>d.key===metric);

  function fill(name:string){
    const row=byName.get(NAME_ALIASES[name]??name);
    if(!row) return "#efeee9";
    return highlighted(row,metric) ? "#2a78d6" : "#deddd8";
  }

  const yesCount=data.countries.filter(c=>highlighted(c,metric)).length;

  return <div>
    <div className="viz-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-sm font-semibold">Select a Policy Element</h2>
        <span className="text-xs text-neutral-500">{data.countries.length} jurisdictions · country-specific rules and sources</span>
      </div>
      <div className="flex flex-wrap gap-2" aria-label="Map layers">
        {data.policy_elements.map(d=><button key={d.key} type="button" aria-pressed={metric===d.key}
          onClick={()=>setMetric(d.key)}
          className={`min-h-10 rounded-md border px-3 py-2 text-sm leading-snug text-left transition-colors ${metric===d.key?"bg-[#244a6b] border-[#244a6b] text-white font-semibold":"bg-white border-neutral-200 text-neutral-700 hover:bg-neutral-50"}`}>
          {d.label}
        </button>)}
      </div>
      <p className="mt-3 text-sm text-neutral-600 leading-relaxed" aria-live="polite">{selectedDim?.description}</p>
    </div>

    <div className="grid xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-4 mt-3">
      <div className="viz-card p-4 min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
          <div>
            <h2 className="text-xl font-semibold">{selectedDim?.label}</h2>
            <p className="text-sm text-neutral-500">
              Blue: {yesCount} with a sourced national requirement or route. Grey: read country terms; no assumption of exemption.
            </p>
          </div>
          <span className="text-xs text-neutral-500">Research cutoff {data.research_cutoff}</span>
        </div>

        <label className="block text-xs text-neutral-600 mb-3">Select a country
          <select className="block w-full mt-1 border border-neutral-300 rounded-md bg-white px-3 py-2 text-sm" value={selected?.country??""} onChange={e=>setSelected(byName.get(e.target.value)??null)}>
            <option value="">Choose country</option>{data.countries.map(c=><option key={c.iso2} value={c.country}>{c.country}</option>)}
          </select>
        </label>
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
                      const detail=`${selectedDim?.label}: ${mapStatus(row,metric)}`;
                      setHover({text:`${row.country} · ${detail}`,x:evt.clientX,y:evt.clientY});
                    }}
                    onMouseMove={evt=>setHover(h=>h?{...h,x:evt.clientX,y:evt.clientY}:h)}
                    onMouseLeave={()=>setHover(null)}
                    role={row?"button":undefined} tabIndex={row?0:-1}
                    aria-label={row?`View ${row.country} requirements`:undefined}
                    onKeyDown={e=>{if(row&&(e.key==="Enter"||e.key===" ")){e.preventDefault();setSelected(row);}}}
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

      <div className="viz-card p-4 sm:p-5 min-w-0 min-h-[360px]">
        {selected ? <CountryDetail row={selected} dimensions={data.dimensions} metric={metric}/> :
          <div>
            <div className="eyebrow">Country detail</div>
            <h3 className="text-xl font-semibold mt-1">Select a country</h3>
            <p className="text-sm text-neutral-500 mt-2">The panel shows national reporting duties, scope and source links. EU countries also have the separate EU ADS type-approval layer where Regulation 2022/1426 applies.</p>
          </div>}
      </div>
    </div>

  </div>;
}

function CountryDetail({row,dimensions,metric}:{row:CountryRow;dimensions:Dim[];metric:string}) {
  const mainKeys=[metric,...["incident_reporting","exposure_reporting","open_data","avs_authorized"].filter(k=>k!==metric)];
  const incident=row.incident_detail;
  const detail=(key:string)=>row.requirement_details[key]??({
    incident_reporting:"A country-specific AV incident-report specification is not established in the available sources. This is a coverage gap, not an exemption from ordinary accident duties or applicable EU reporting.",
    periodic_reporting:"No common national schedule is established in the linked material. Additional reporting may be imposed by the individual permission.",
    event_data:"A separate national recording specification is not established in the linked material; consult the applicable vehicle approval and test permission.",
    regulator_access:incident?`Reporting recipient: ${incident.recipient}`:"The linked material does not establish a separate national data-demand specification.",
    public_access:"No specific release procedure is established in the linked material. Submission to a regulator does not make the records open data.",
    fixed_deadline:incident?.deadline??"No uniform national AV filing deadline is established in the linked material.",
    permit_specific:row.requirement_details.avs_authorized,
  } as Record<string,string>)[key];
  return <div className="break-words">
    <div className="eyebrow">Country requirements</div>
    <h3 className="text-2xl font-semibold mt-1">{row.country}</h3>
    <p className="text-xs text-neutral-500 mt-1">Scope: {row.scope} · Reviewed {row.reviewed_at}</p>
    <div className="space-y-4 mt-5">
      {mainKeys.map(key=><section key={key} className={`rounded-lg border p-4 ${key===metric?"border-blue-200 bg-blue-50/40":"border-neutral-200"}`}>
        <h4 className="text-sm font-semibold text-[#244a6b]">{dimensions.find(d=>d.key===key)?.label}</h4>
        {key==="incident_reporting"&&incident?<>
          <p className="font-semibold text-base mt-2 leading-relaxed">{incident.title}</p>
          <dl className="space-y-3 mt-3 text-sm leading-relaxed">
            {[["Who reports",incident.who],["When it applies",incident.trigger],["Deadline",incident.deadline],["Report to",incident.recipient],["What to submit",incident.contents]].map(([label,value])=><div key={label}><dt className="font-medium text-neutral-700">{label}</dt><dd className="text-neutral-600 mt-0.5">{value}</dd></div>)}
          </dl>
          {incident.note&&<p className="text-xs leading-relaxed text-neutral-600 mt-3">{incident.note}</p>}
          <a className="block underline text-xs leading-relaxed mt-3" href={incident.source} target="_blank" rel="noreferrer">{incident.source_label} ↗</a>
          <p className="text-xs text-neutral-500 mt-1">Source: {incident.basis}</p>
        </>:<><p className="text-sm leading-relaxed text-neutral-700 mt-2">{detail(key)}</p>
          {row.sources[0]&&<a href={row.sources[0]} target="_blank" rel="noreferrer" className="inline-block underline text-xs mt-3">Country source ↗</a>}
        </>}
      </section>)}
    </div>
    <details className="mt-4 border-t pt-4">
      <summary className="cursor-pointer text-sm font-semibold">More reporting, records and access requirements</summary>
      <dl className="space-y-4 mt-4 text-sm leading-relaxed">
        {dimensions.filter(d=>!mainKeys.includes(d.key)).map(d=><div key={d.key}><dt className="font-semibold">{d.label}</dt><dd className="mt-1 text-neutral-600">{detail(d.key)}</dd></div>)}
      </dl>
    </details>
    {row.eu&&<p className="mt-4 rounded-md bg-neutral-50 p-3 text-sm leading-relaxed">EU vehicle approval and local operating permission are separate. <a className="underline" href="#eu-authorization">How the EU layer works ↓</a></p>}
    <details className="mt-4 border-t pt-4"><summary className="cursor-pointer text-sm font-semibold">All country sources</summary>
      <div className="mt-2 space-y-2">{row.sources.length?row.sources.map((u,i)=><a key={u} href={u} target="_blank" rel="noreferrer" className="block text-xs underline break-words">{i+1}. {new URL(u).hostname.replace(/^www\./,"")} ↗</a>):<p className="text-sm text-neutral-500">No country-specific primary source is linked yet.</p>}</div>
    </details>
  </div>;
}
