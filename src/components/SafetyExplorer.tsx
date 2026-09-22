"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { SgoMonthlyDataset } from "@/lib/safety";
import { monthLabel } from "@/lib/activity";
import { SERIES, AXIS_PROPS, GRID_PROPS, TOOLTIP_PROPS } from "@/lib/chartTheme";

type Scope = "national" | "state" | "operator";

export function SafetyExplorer({ data }: { data: SgoMonthlyDataset }) {
  const [scope, setScope] = useState<Scope>("national");
  const [state, setState] = useState(data.states_represented[0] ?? "");
  const [operator, setOperator] = useState(data.entities_represented[0] ?? "");

  const rows = useMemo(() => {
    const source =
      scope === "national"
        ? data.monthly_national_total.map(r => ({ year: r.year, month: r.month, count: r.incident_count }))
        : scope === "state"
          ? data.monthly_by_state.filter(r => r.state === state).map(r => ({ year: r.year, month: r.month, count: r.incident_count }))
          : data.monthly_by_entity.filter(r => r.reporting_entity === operator).map(r => ({ year: r.year, month: r.month, count: r.incident_count }));

    return [...source]
      .sort((a,b) => a.year - b.year || a.month - b.month)
      .map(r => ({ label: monthLabel(r.year, r.month), count: r.count }));
  }, [data, scope, state, operator]);

  const total = rows.reduce((s,r)=>s+r.count,0);

  return (
    <div>
      <div className="flex flex-wrap gap-3 items-end mb-5">
        <label className="filter-label">View
          <select className="filter-select" value={scope} onChange={e=>setScope(e.target.value as Scope)}>
            <option value="national">United States</option>
            <option value="state">State</option>
            <option value="operator">Reporting entity</option>
          </select>
        </label>
        {scope === "state" && <label className="filter-label">State
          <select className="filter-select min-w-[150px]" value={state} onChange={e=>setState(e.target.value)}>
            {[...data.states_represented].sort().map(s=><option key={s}>{s}</option>)}
          </select>
        </label>}
        {scope === "operator" && <label className="filter-label">Company / entity
          <select className="filter-select min-w-[240px]" value={operator} onChange={e=>setOperator(e.target.value)}>
            {[...data.entities_represented].sort().map(s=><option key={s}>{s}</option>)}
          </select>
        </label>}
        <div className="ml-auto text-right">
          <div className="text-2xl font-semibold tabular-nums">{total.toLocaleString()}</div>
          <div className="text-xs text-neutral-500">reports in selected series</div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={350}>
        <LineChart data={rows} margin={{top:8,right:18,bottom:8,left:4}}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" />
          <YAxis {...AXIS_PROPS} allowDecimals={false} />
          <Tooltip {...TOOLTIP_PROPS} formatter={(v)=>Number(v).toLocaleString()} />
          <Line type="monotone" dataKey="count" name="Incident reports" stroke={SERIES.blue} strokeWidth={2.75} dot={false} activeDot={{r:5}} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
