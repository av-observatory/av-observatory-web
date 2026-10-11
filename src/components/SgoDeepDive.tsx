"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, LabelList, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GRID_PROPS, AXIS_PROPS, TOOLTIP_PROPS, SERIES } from "@/lib/chartTheme";

export type SgoIncidentRow = {
  report_id: string;
  report_ids?: string;
  reporting_entities?: string;
  incident_id?: string;
  report_version: string;
  reporting_entity: string;
  report_type: string;
  report_month: string;
  report_year: string;
  make: string;
  model: string;
  automation_system_engaged: string;
  engagement_status: string;
  operating_entity: string;
  incident_date: string;
  city: string;
  state: string;
  roadway_type: string;
  crash_with: string;
  highest_injury_severity: string;
  within_odd: string;
  air_bag_deployment: string;
};

function complete(r:SgoIncidentRow) {
  const match = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{4})$/i.exec(r.incident_date || "");
  if (!match) return false; // Undated events remain in canonical source, not in dated analyses.
  const month = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"].indexOf(match[1].toUpperCase())+1;
  return Number(match[2]) < 2026 || (Number(match[2])===2026 && month<=7);
}
function countBy(rows:SgoIncidentRow[], key:keyof SgoIncidentRow, limit=12, label=(s:string)=>s) {
  const m=new Map<string,number>();
  for(const r of rows){const v=label((r[key]||"Unknown").trim()||"Unknown");m.set(v,(m.get(v)||0)+1);}
  return Array.from(m,([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,limit);
}
function severityLabel(raw:string) {
  if (/^(No Injuries Reported|No Injured Reported|Property Damage\. No Injured Reported)$/i.test(raw)) return "No Injuries";
  return raw.replace(" W/O Hospitalization", ", No Hospital").replace(" W/ Hospitalization", ", Hospitalized");
}
function oddLabel(raw:string) {
  if (/^\[?REDACTED/i.test(raw)) return "Redacted";
  if (/^Unknown/i.test(raw)) return "Unknown";
  if (/^No, see Narrative/i.test(raw)) return "No";
  return raw;
}
function vehicleLabel(make:string,model:string) {
  const normalizedMake = ({JAGUAR:"Jaguar",JLR:"Jaguar",HYUNDAI:"Hyundai",TESLA:"Tesla",TOYOTA:"Toyota",ZOOX:"Zoox",ZEEKR:"Zeekr"} as Record<string,string>)[make.trim()] ?? make.trim();
  const normalizedModel = /^i[- ]?pace$/i.test(model.trim()) ? "I-PACE" : model.trim();
  if (normalizedMake.toLowerCase() === normalizedModel.toLowerCase()) return normalizedMake;
  return [normalizedMake,normalizedModel].filter(Boolean).join(" ") || "Unknown";
}
export function SgoDeepDive({ rows }: { rows:SgoIncidentRow[] }) {
  const completeRows=useMemo(()=>rows.filter(complete),[rows]);
  const entities = useMemo(() => {
    const names = completeRows.flatMap(r =>
      (r.reporting_entities || r.reporting_entity || "").split(";").filter(Boolean)
    );
    return Array.from(new Set(names)).sort();
  }, [completeRows]);
  const states=useMemo(()=>Array.from(new Set(completeRows.map(r=>r.state).filter(Boolean))).sort(),[completeRows]);
  const [entity,setEntity]=useState("ALL");
  const [state,setState]=useState("ALL");

  const filtered=useMemo(()=>completeRows.filter(r=>
    (entity==="ALL"||(r.reporting_entities || r.reporting_entity || "").split(";").includes(entity)) &&
    (state==="ALL"||r.state===state)
  ),[completeRows,entity,state]);

  const crashWith=useMemo(()=>countBy(filtered,"crash_with",10),[filtered]);
  const severity=useMemo(()=>countBy(filtered,"highest_injury_severity",50,severityLabel),[filtered]);
  const roadway=useMemo(()=>countBy(filtered,"roadway_type",10),[filtered]);
  const withinOdd=useMemo(()=>countBy(filtered,"within_odd",8,oddLabel),[filtered]);
  const airBags=useMemo(()=>countBy(filtered,"air_bag_deployment",3),[filtered]);
  const models=useMemo(()=> {
    const m=new Map<string,number>();
    for(const r of filtered){
      const label=vehicleLabel(r.make,r.model);
      m.set(label,(m.get(label)||0)+1);
    }
    return Array.from(m,([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,12);
  },[filtered]);

  return <div>
    <div className="viz-card p-4">
      <div className="grid md:grid-cols-2 gap-3">
        <label className="filter-label">Reporting Entity
          <select className="filter-select" value={entity} onChange={e=>setEntity(e.target.value)}>
            <option value="ALL">All Reporting Entities</option>
            {entities.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
        <label className="filter-label">State
          <select className="filter-select" value={state} onChange={e=>setState(e.target.value)}>
            <option value="ALL">All States</option>
            {states.map(x=><option key={x}>{x}</option>)}
          </select>
        </label>
      </div>
    </div>

    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-3">
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Deduplicated Crashes</div><div className="text-2xl font-semibold mt-1 tabular-nums">{filtered.length.toLocaleString()}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Entities</div><div className="text-2xl font-semibold mt-1 tabular-nums">{new Set(filtered.flatMap(r=>(r.reporting_entities || r.reporting_entity || "").split(";").filter(Boolean))).size}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">States</div><div className="text-2xl font-semibold mt-1 tabular-nums">{new Set(filtered.map(r=>r.state).filter(Boolean)).size}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Vehicle Make/Models</div><div className="text-2xl font-semibold mt-1 tabular-nums">{new Set(filtered.map(r=>[r.make,r.model].join("|"))).size}</div></div>
    </div>

    <div className="grid lg:grid-cols-2 gap-3 mt-3">
      <Breakdown title="What the AV collided with" subtitle="SGO 'Crash With' field" data={crashWith} />
      <Breakdown title="Highest alleged injury severity" subtitle="As reported in SGO filings" data={severity} />
      <Breakdown title="Roadway type" subtitle="Reported roadway classification" data={roadway} />
      <Breakdown title="Within reported ODD?" subtitle="Reporting entity's Within ODD field" data={withinOdd} />
      <Breakdown title="Air Bag Deployment" subtitle="Subject vehicle or crash partner; Unknown includes incomplete reports" data={airBags} />
      <Breakdown title="Vehicle make / model" subtitle="Most frequently represented vehicles in filtered crashes" data={models} />
    </div>
  </div>;
}

function Breakdown({title,subtitle,data}:{title:string;subtitle:string;data:{name:string;count:number}[]}) {
  const total=data.reduce((sum,row)=>sum+row.count,0);
  const rows=data.map(row=>({...row,pct:total>0?row.count/total*100:0}));
  return <div className="viz-card p-4">
    <div className="font-semibold">{title}</div>
    <div className="text-sm text-neutral-500">{subtitle}</div>
    <ResponsiveContainer width="100%" height={Math.max(280,rows.length*32+35)}>
      <BarChart data={rows} layout="vertical" margin={{top:10,right:15,bottom:5,left:30}}>
        <CartesianGrid {...GRID_PROPS}/>
        <XAxis type="number" {...AXIS_PROPS} domain={[0,100]} tickFormatter={(v)=>`${v}%`}/>
        <YAxis type="category" dataKey="name" {...AXIS_PROPS} width={135} tick={{fontSize:11}}/>
        <Tooltip {...TOOLTIP_PROPS} formatter={(v,name,item)=>[
          `${Number(v).toFixed(1)}% (${Number(item.payload.count).toLocaleString()} crashes)`,
          "Share of crashes"
        ]}/>
        <Bar dataKey="pct" name="Share of crashes" fill={SERIES.blue}>
          <LabelList dataKey="pct" position="right" formatter={(v)=>`${Number(v).toFixed(1)}%`} style={{fontSize:11,fill:"#5f5f5f"}} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
