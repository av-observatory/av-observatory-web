"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ActivityMonthlyRow, monthLabel } from "@/lib/activity";
import { SERIES, AXIS_PROPS, GRID_PROPS, TOOLTIP_PROPS } from "@/lib/chartTheme";

const METRICS = {
  trips: {label:"Passenger Trips", key:"total_trips" as const, unit:"trips"},
  passengerMiles: {label:"Passenger Miles", key:"total_passenger_miles_traveled" as const, unit:"passenger-miles"},
  passengers: {label:"Passengers Carried", key:"total_passengers_carried" as const, unit:"passengers"},
};

export function ActivityExplorer({ rows }: { rows: ActivityMonthlyRow[] }) {
  const [metric,setMetric] = useState<keyof typeof METRICS>("trips");
  const cfg=METRICS[metric];

  const data=useMemo(()=>{
    const byMonth=new Map<string,{year:number;month:number;value:number}>();
    for(const r of rows){
      if (r[cfg.key] === null) continue;
      const key=`${r.calendar_year}-${r.calendar_month}`;
      const cur=byMonth.get(key)??{year:r.calendar_year,month:r.calendar_month,value:0};
      cur.value += Number(r[cfg.key] ?? 0);
      byMonth.set(key,cur);
    }
    return Array.from(byMonth.values()).sort((a,b)=>a.year-b.year||a.month-b.month).map(r=>({label:monthLabel(r.year,r.month),value:r.value}));
  },[rows,cfg.key]);

  const latest=data.at(-1)?.value ?? 0;
  return <div>
    <div className="grid sm:grid-cols-2 gap-3 mb-5">
      <label className="filter-label">Measure
        <select className="filter-select" value={metric} onChange={e=>setMetric(e.target.value as keyof typeof METRICS)}>
          {Object.entries(METRICS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
    </div>
    <div className="flex items-baseline justify-between mb-2">
      <div className="text-sm font-medium">{cfg.label}</div>
      <div className="text-sm tabular-nums"><strong>{Math.round(latest).toLocaleString()}</strong> <span className="text-neutral-500">{data.at(-1)?.label ?? "No reported month"}</span></div>
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
