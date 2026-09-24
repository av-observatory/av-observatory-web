"use client";

import { useMemo, useState } from "react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from "recharts";
import { GRID_PROPS, AXIS_PROPS, TOOLTIP_PROPS, SERIES } from "@/lib/chartTheme";

export type SgoIncidentRow = {
  report_id: string;
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
  city: string;
  state: string;
  roadway_type: string;
  crash_with: string;
  highest_injury_severity: string;
  within_odd: string;
  air_bag_deployment: string;
};

function hasValidFilingMonth(r:SgoIncidentRow) {
  const yearText = (r.report_year ?? "").trim();
  const monthText = (r.report_month ?? "").trim();
  if (!yearText || !monthText) return false;
  const y = Number(yearText), m = Number(monthText);
  return Number.isInteger(y) && y >= 2021 && Number.isInteger(m) && m >= 1 && m <= 12;
}
function complete(r:SgoIncidentRow) {
  if (!hasValidFilingMonth(r)) return true;
  const y=Number(r.report_year), m=Number(r.report_month);
  return y<2026 || (y===2026 && m<=7);
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
function ym(r:SgoIncidentRow){return `${r.report_year}-${String(r.report_month).padStart(2,"0")}`;}

export function SgoDeepDive({ rows }: { rows:SgoIncidentRow[] }) {
  const completeRows=useMemo(()=>rows.filter(complete),[rows]);
  const entities=useMemo(()=>Array.from(new Set(completeRows.map(r=>r.reporting_entity).filter(Boolean))).sort(),[completeRows]);
  const states=useMemo(()=>Array.from(new Set(completeRows.map(r=>r.state).filter(Boolean))).sort(),[completeRows]);
  const [entity,setEntity]=useState("ALL");
  const [state,setState]=useState("ALL");

  const filtered=useMemo(()=>completeRows.filter(r=>
    (entity==="ALL"||r.reporting_entity===entity) &&
    (state==="ALL"||r.state===state)
  ),[completeRows,entity,state]);

  const datedFiltered = useMemo(() => filtered.filter(hasValidFilingMonth), [filtered]);
  const undatedCount = filtered.length - datedFiltered.length;

  const monthly=useMemo(()=>{
    const m=new Map<string,number>();
    for(const r of datedFiltered){const k=ym(r);m.set(k,(m.get(k)||0)+1);}
    return Array.from(m,([month,count])=>({month,count})).sort((a,b)=>a.month.localeCompare(b.month));
  },[datedFiltered]);

  const crashWith=useMemo(()=>countBy(filtered,"crash_with",10),[filtered]);
  const severity=useMemo(()=>countBy(filtered,"highest_injury_severity",10,severityLabel),[filtered]);
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
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Reports in View</div><div className="text-2xl font-semibold mt-1 tabular-nums">{filtered.length.toLocaleString()}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Entities</div><div className="text-2xl font-semibold mt-1 tabular-nums">{new Set(filtered.map(r=>r.reporting_entity)).size}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">States</div><div className="text-2xl font-semibold mt-1 tabular-nums">{new Set(filtered.map(r=>r.state).filter(Boolean)).size}</div></div>
      <div className="viz-card p-3"><div className="text-xs text-neutral-500">Vehicle Make/Models</div><div className="text-2xl font-semibold mt-1 tabular-nums">{new Set(filtered.map(r=>[r.make,r.model].join("|"))).size}</div></div>
    </div>

    <div className="viz-card p-4 mt-3">
      <div className="font-semibold">Reports Over Time</div>
      <div className="text-sm text-neutral-500">
        Filing month for records with a valid filing month/year. August 2026 is excluded as incomplete.
        {undatedCount > 0 && ` ${undatedCount.toLocaleString()} records in this view lack filing month/year and are excluded from this trend only.`}
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={monthly} margin={{top:14,right:12,bottom:5,left:0}}>
          <CartesianGrid {...GRID_PROPS}/><XAxis dataKey="month" {...AXIS_PROPS} interval="preserveStartEnd"/><YAxis {...AXIS_PROPS} allowDecimals={false}/>
          <Tooltip {...TOOLTIP_PROPS}/><Line dataKey="count" name="Incident reports" stroke={SERIES.red} strokeWidth={2.5} dot={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>

    <div className="grid lg:grid-cols-2 gap-3 mt-3">
      <Breakdown title="What the AV collided with" subtitle="SGO 'Crash With' field" data={crashWith} />
      <Breakdown title="Highest alleged injury severity" subtitle="As reported in SGO filings" data={severity} />
      <Breakdown title="Roadway type" subtitle="Reported roadway classification" data={roadway} />
      <Breakdown title="Within reported ODD?" subtitle="Reporting entity's Within ODD field" data={withinOdd} />
      <Breakdown title="Air Bag Deployment" subtitle="Subject vehicle or crash partner; Unknown includes incomplete reports" data={airBags} />
      <Breakdown title="Vehicle make / model" subtitle="Most frequently represented vehicles in filtered reports" data={models} />
    </div>
  </div>;
}

function Breakdown({title,subtitle,data}:{title:string;subtitle:string;data:{name:string;count:number}[]}) {
  return <div className="viz-card p-4">
    <div className="font-semibold">{title}</div>
    <div className="text-sm text-neutral-500">{subtitle}</div>
    <ResponsiveContainer width="100%" height={Math.max(280,data.length*32+35)}>
      <BarChart data={data} layout="vertical" margin={{top:10,right:15,bottom:5,left:30}}>
        <CartesianGrid {...GRID_PROPS}/><XAxis type="number" {...AXIS_PROPS} allowDecimals={false}/><YAxis type="category" dataKey="name" {...AXIS_PROPS} width={135} tick={{fontSize:11}}/>
        <Tooltip {...TOOLTIP_PROPS}/><Bar dataKey="count" name="Reports" fill={SERIES.blue}/>
      </BarChart>
    </ResponsiveContainer>
  </div>;
}
