"use client";

import {
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { ActivityMonthlyRow, monthLabel } from "@/lib/activity";
import { SERIES, AXIS_PROPS, GRID_PROPS, TOOLTIP_PROPS, LEGEND_PROPS } from "@/lib/chartTheme";

function reportedRows(rows: ActivityMonthlyRow[]) {
  return rows
    .filter(r => r.total_trips !== null && r.total_vmt_all_periods !== null)
    .sort((a,b) => a.calendar_year-b.calendar_year || a.calendar_month-b.calendar_month);
}

function fmtPct(x: number | null) {
  return x === null ? "—" : `${(x*100).toFixed(1)}%`;
}
function fmt1(x: number | null) {
  return x === null ? "—" : x.toFixed(1);
}
function derived(r: ActivityMonthlyRow) {
  const trips = r.total_trips ?? 0;
  const p1 = r.total_vmt_period1 ?? 0;
  const p2 = r.total_vmt_period2 ?? 0;
  const p3 = r.total_vmt_period3 ?? 0;
  const total = p1+p2+p3;
  const waiting = r.total_waiting_hours ?? 0;
  const waitMin = trips > 0 ? waiting*60/trips : null;
  const avgTrip = trips > 0 && r.total_passenger_miles_traveled != null ? r.total_passenger_miles_traveled/trips : null;
  const ridersPerTrip = trips > 0 && r.total_passengers_carried != null ? r.total_passengers_carried/trips : null;
  const occupied = total > 0 ? p3/total : null;
  const deadhead = total > 0 ? (p1+p2)/total : null;
  const p1Share = total > 0 ? p1/total : null;
  const pickupShare = total > 0 ? p2/total : null;
  const movingHours14 = p1/14;
  const parkedHours14 = Math.max(0, waiting-movingHours14);
  const parkedMinTrip14 = trips > 0 ? parkedHours14*60/trips : null;
  return {trips,p1,p2,p3,total,waiting,waitMin,avgTrip,ridersPerTrip,occupied,deadhead,p1Share,pickupShare,parkedHours14,parkedMinTrip14};
}

export function ActivityCompositeStats({ rows, company }: { rows: ActivityMonthlyRow[]; company: string }) {
  const data = reportedRows(rows);
  const row = data.at(-1);
  if (!row) return null;
  const d=derived(row);
  const label=monthLabel(row.calendar_year,row.calendar_month);
  const stats=[
    ["Trips in Latest Month", d.trips.toLocaleString(), label],
    ["Riders per Trip", d.ridersPerTrip === null ? "—" : d.ridersPerTrip.toFixed(2), "Passengers carried ÷ trips"],
    ["Wait Time per Trip", d.waitMin===null?"—":`${d.waitMin.toFixed(1)} min`, "P1 waiting hours ÷ trips"],
    ["Average Rider Miles per Trip", d.avgTrip===null?"—":`${d.avgTrip.toFixed(1)} mi`, "Passenger miles ÷ trips"],
    ["Unoccupied Share", fmtPct(d.deadhead), "P1 + P2 ÷ total VMT"],
  ];
  return <div>
    <div className="flex items-baseline justify-between mb-2">
      <h2 className="text-xl font-semibold tracking-tight">{company} Operating Indicators</h2>
      <span className="text-sm text-neutral-500">{label}</span>
    </div>
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {stats.map(([label,value,note])=><div key={label} className="viz-card p-4">
        <div className="text-xs text-neutral-500 font-medium">{label}</div>
        <div className="text-2xl font-semibold tracking-tight tabular-nums mt-1">{value}</div>
        <div className="text-xs text-neutral-500 mt-1 leading-snug">{note}</div>
      </div>)}
    </div>
  </div>;
}

export function ActivityWaitingTime({ rows }: { rows: ActivityMonthlyRow[] }) {
  const data=reportedRows(rows).map(r=>{
    const d=derived(r);
    return {
      label:monthLabel(r.calendar_year,r.calendar_month),
      hours:Math.round(d.waiting),
      minutes:d.waitMin===null?null:Number(d.waitMin.toFixed(1)),
      parkedHours14:Math.round(d.parkedHours14),
      parkedMinTrip14:d.parkedMinTrip14===null?null:Number(d.parkedMinTrip14.toFixed(1)),
    };
  });
  return <div className="grid lg:grid-cols-2 gap-3">
    <div className="viz-card p-4">
      <div className="font-semibold">Total Waiting Time</div>
      <div className="text-sm text-neutral-500">P1 hours: unassigned between trips, whether moving or stationary.</div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{top:14,right:15,bottom:4,left:4}}>
          <CartesianGrid {...GRID_PROPS}/><XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd"/><YAxis {...AXIS_PROPS} tickFormatter={v=>`${Math.round(v/1000)}K`}/>
          <Tooltip {...TOOLTIP_PROPS} formatter={v=>`${Number(v).toLocaleString()} hours`}/>
          <Line type="monotone" dataKey="hours" name="Waiting Hours" stroke={SERIES.violet} strokeWidth={2.5} dot={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
    <div className="viz-card p-4">
      <div className="font-semibold">Waiting Time per Trip</div>
      <div className="text-sm text-neutral-500">A fleet-efficiency measure: P1 waiting hours divided by passenger trips.</div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{top:14,right:15,bottom:4,left:4}}>
          <CartesianGrid {...GRID_PROPS}/><XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd"/><YAxis {...AXIS_PROPS} unit=" min"/>
          <Tooltip {...TOOLTIP_PROPS} formatter={v=>`${v} min/trip`}/>
          <Line type="monotone" dataKey="minutes" name="Waiting Minutes / Trip" stroke={SERIES.blue} strokeWidth={2.5} dot={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>;
}

export function ActivityVmtUtilization({ rows }: { rows: ActivityMonthlyRow[] }) {
  const data=reportedRows(rows).map(r=>{
    const d=derived(r);
    return {
      label:monthLabel(r.calendar_year,r.calendar_month),
      "P3 · passenger aboard":Math.round(d.p3),
      "P2 · pickup":Math.round(d.p2),
      "P1 · idle / positioning":Math.round(d.p1),
      occupied:d.occupied===null?null:Number((d.occupied*100).toFixed(1)),
      deadhead:d.deadhead===null?null:Number((d.deadhead*100).toFixed(1)),
    };
  });
  return <div className="grid lg:grid-cols-2 gap-3">
    <div className="viz-card p-4">
      <div className="font-semibold">VMT by Trip Period</div>
      <div className="text-sm text-neutral-500">Occupied, pickup, and unassigned / positioning miles.</div>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={data} margin={{top:14,right:15,bottom:4,left:4}}>
          <CartesianGrid {...GRID_PROPS}/><XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd"/><YAxis {...AXIS_PROPS} tickFormatter={v=>`${(v/1_000_000).toFixed(0)}M`}/>
          <Tooltip {...TOOLTIP_PROPS} formatter={v=>`${Number(v).toLocaleString()} mi`}/><Legend {...LEGEND_PROPS}/>
          <Area dataKey="P3 · passenger aboard" stackId="1" stroke={SERIES.blue} fill={SERIES.blue} fillOpacity={0.85}/>
          <Area dataKey="P2 · pickup" stackId="1" stroke={SERIES.aqua} fill={SERIES.aqua} fillOpacity={0.85}/>
          <Area dataKey="P1 · idle / positioning" stackId="1" stroke="#cde2fb" fill="#cde2fb" fillOpacity={0.9}/>
        </AreaChart>
      </ResponsiveContainer>
    </div>
    <div className="viz-card p-4">
      <div className="font-semibold">Utilization of Vehicle Miles</div>
      <div className="text-sm text-neutral-500">Passenger-occupied share versus all miles without a passenger.</div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{top:14,right:15,bottom:4,left:4}}>
          <CartesianGrid {...GRID_PROPS}/><XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd"/><YAxis {...AXIS_PROPS} domain={[0,100]} unit="%"/>
          <Tooltip {...TOOLTIP_PROPS} formatter={v=>`${v}%`}/><Legend {...LEGEND_PROPS}/>
          <Line type="monotone" dataKey="occupied" name="Passenger-Occupied VMT" stroke={SERIES.blue} strokeWidth={2.5} dot={false}/>
          <Line type="monotone" dataKey="deadhead" name="Non-Passenger VMT" stroke={SERIES.orange} strokeWidth={2.5} dot={false}/>
        </LineChart>
      </ResponsiveContainer>
    </div>
  </div>;
}

export function ActivityParkingEstimate({ rows }: { rows: ActivityMonthlyRow[] }) {
  const data=reportedRows(rows).map(r=>{
    const d=derived(r);
    return {
      label:monthLabel(r.calendar_year,r.calendar_month),
      hours:Math.round(d.parkedHours14),
      minutes:d.parkedMinTrip14===null?null:Number(d.parkedMinTrip14.toFixed(1)),
    };
  });
  const latest=data.at(-1);
  if(!latest) return null;
  return <div className="viz-card p-4">
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <div>
        <div className="font-semibold">Estimated Stationary P1 Time</div>
        <div className="text-sm text-neutral-500">Sensitivity estimate assuming P1 movement averages 14 mph: waiting hours − (P1 miles ÷ 14 mph).</div>
      </div>
      <div className="text-right">
        <div className="text-xl font-semibold tabular-nums">{latest.hours.toLocaleString()} h</div>
        <div className="text-sm text-neutral-500">{latest.minutes} min/trip · Latest Month</div>
      </div>
    </div>
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{top:14,right:15,bottom:4,left:4}}>
        <CartesianGrid {...GRID_PROPS}/><XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd"/><YAxis {...AXIS_PROPS} tickFormatter={v=>`${Math.round(v/1000)}K`}/>
        <Tooltip {...TOOLTIP_PROPS} formatter={v=>`${Number(v).toLocaleString()} estimated stationary hours`}/>
        <Line type="monotone" dataKey="hours" name="Estimated Stationary P1 Hours" stroke={SERIES.aqua} strokeWidth={2.5} dot={false}/>
      </LineChart>
    </ResponsiveContainer>
    <div className="text-xs text-neutral-500">This is an assumption-based estimate, not directly reported parking time.</div>
  </div>;
}
