"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ActivityMonthlyRow, monthLabel } from "@/lib/activity";
import { SERIES, AXIS_PROPS, GRID_PROPS, TOOLTIP_PROPS } from "@/lib/chartTheme";

const OPERATORS: Record<string,string> = {
  PSG0038152: "Waymo",
  PSG0039080: "Cruise",
};
const PROGRAMS: Record<string,string> = {
  driverless: "Driverless deployment",
  drivered_pilot: "Drivered / pilot",
  unspecified: "Program not specified",
};
const METRICS = {
  trips: {label:"Passenger trips", key:"total_trips" as const, unit:"trips"},
  passengerMiles: {label:"Passenger miles", key:"total_passenger_miles_traveled" as const, unit:"passenger-miles"},
  passengers: {label:"Passengers carried", key:"total_passengers_carried" as const, unit:"passengers"},
};

export function ActivityExplorer({ rows }: { rows: ActivityMonthlyRow[] }) {
  const operatorIds = Array.from(new Set(rows.map(r=>r.operator_tcpid))).sort();
  const programs = Array.from(new Set(rows.map(r=>r.program))).sort();
  const [operator,setOperator] = useState("ALL");
  const [program,setProgram] = useState("ALL");
  const [metric,setMetric] = useState<keyof typeof METRICS>("trips");
  const cfg=METRICS[metric];

  const data=useMemo(()=>{
    const byMonth=new Map<string,{year:number;month:number;value:number}>();
    for(const r of rows){
      if(operator!=="ALL"&&r.operator_tcpid!==operator) continue;
      if(program!=="ALL"&&r.program!==program) continue;
      const key=`${r.calendar_year}-${r.calendar_month}`;
      const cur=byMonth.get(key)??{year:r.calendar_year,month:r.calendar_month,value:0};
      cur.value += Number(r[cfg.key] ?? 0);
      byMonth.set(key,cur);
    }
    return Array.from(byMonth.values()).sort((a,b)=>a.year-b.year||a.month-b.month).map(r=>({label:monthLabel(r.year,r.month),value:r.value}));
  },[rows,operator,program,cfg.key]);

  const latest=data.at(-1)?.value ?? 0;
  return <div>
    <div className="grid sm:grid-cols-3 gap-3 mb-5">
      <label className="filter-label">Company
        <select className="filter-select" value={operator} onChange={e=>setOperator(e.target.value)}>
          <option value="ALL">All reported operators</option>
          {operatorIds.map(id=><option key={id} value={id}>{OPERATORS[id] ?? id}</option>)}
        </select>
      </label>
      <label className="filter-label">Program
        <select className="filter-select" value={program} onChange={e=>setProgram(e.target.value)}>
          <option value="ALL">All programs</option>
          {programs.map(x=><option key={x} value={x}>{PROGRAMS[x] ?? x}</option>)}
        </select>
      </label>
      <label className="filter-label">Measure
        <select className="filter-select" value={metric} onChange={e=>setMetric(e.target.value as keyof typeof METRICS)}>
          {Object.entries(METRICS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
    </div>
    <div className="flex items-baseline justify-between mb-2">
      <div className="text-sm font-medium">{cfg.label}</div>
      <div className="text-sm tabular-nums"><strong>{Math.round(latest).toLocaleString()}</strong> <span className="text-neutral-500">latest month</span></div>
    </div>
    <ResponsiveContainer width="100%" height={350}>
      <LineChart data={data} margin={{top:8,right:18,bottom:8,left:4}}>
        <CartesianGrid {...GRID_PROPS}/>
        <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd"/>
        <YAxis {...AXIS_PROPS} tickFormatter={(v)=> v>=1_000_000?`${(v/1_000_000).toFixed(1)}M`:v>=1000?`${Math.round(v/1000)}K`:String(v)}/>
        <Tooltip {...TOOLTIP_PROPS} formatter={(v)=>`${Number(v).toLocaleString()} ${cfg.unit}`}/>
        <Line type="monotone" dataKey="value" name={cfg.label} stroke={SERIES.blue} strokeWidth={2.75} dot={false} activeDot={{r:5}}/>
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
