"use client";

import { useMemo, useState } from "react";
import { LineChart, Line, ReferenceLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { SgoMonthlyDataset, isCompleteSgoMonth, SGO_COMPLETE_THROUGH } from "@/lib/safety";
import { useMonthAxis } from "@/components/MonthAxis";
import { monthLabel } from "@/lib/activity";
import { eventsFor, markerNumbers } from "@/lib/trendEvents";
import { SERIES, AXIS_PROPS, GRID_PROPS, TOOLTIP_PROPS } from "@/lib/chartTheme";

type Scope = "national" | "state" | "operator";

export function SafetyExplorer({ data }: { data: SgoMonthlyDataset }) {
  const [scope, setScope] = useState<Scope>("national");
  const [state, setState] = useState(data.states_represented[0] ?? "");
  const [operator, setOperator] = useState(data.entities_represented[0] ?? "");

  const rows = useMemo(() => {
    const source =
      scope === "national"
        ? data.monthly_national_total.filter(r => isCompleteSgoMonth(r.year,r.month)).map(r => ({ year: r.year, month: r.month, count: r.incident_count }))
        : scope === "state"
          ? data.monthly_by_state.filter(r => r.state === state && isCompleteSgoMonth(r.year,r.month)).map(r => ({ year: r.year, month: r.month, count: r.incident_count }))
          : data.monthly_by_entity.filter(r => r.reporting_entity === operator && isCompleteSgoMonth(r.year,r.month)).map(r => ({ year: r.year, month: r.month, count: r.incident_count }));

    return [...source]
      .sort((a,b) => a.year - b.year || a.month - b.month)
      .map(r => ({ label: monthLabel(r.year, r.month), count: r.count }));
  }, [data, scope, state, operator]);

  const { axis, onResize } = useMonthAxis(rows.length);
  const events = useMemo(() => eventsFor(
    e => scope === "operator" ? e.companies.length === 0 || e.companies.some(n => operator.toLowerCase().includes(n.toLowerCase())) : e.national,
    new Set(rows.map(r => r.label))), [rows, scope, operator]);
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
          <div className="text-xs text-neutral-500">crashes in selected series</div>
        </div>
      </div>
      <div className="text-xs text-neutral-500 mb-2">Complete through {monthLabel(SGO_COMPLETE_THROUGH.year, SGO_COMPLETE_THROUGH.month)}; the newest filing month is excluded because it is still incomplete.</div>
      <ResponsiveContainer width="100%" height={350} onResize={onResize}>
        <LineChart data={rows} margin={{top:22,right:18,bottom:8,left:4}}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...axis} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} />
          <Tooltip {...TOOLTIP_PROPS} formatter={(v)=>Number(v).toLocaleString()} />
          {markerNumbers(events).map(m => <ReferenceLine key={m.label} x={m.label} stroke="#8a97a6" strokeDasharray="3 3" label={{ value: m.text, position: "top", fill: "#123b69", fontSize: 12, fontWeight: 700 }} />)}
          <Line type="monotone" dataKey="count" name="Reported crashes" stroke={SERIES.blue} strokeWidth={2.75} dot={false} activeDot={{r:5}} />
        </LineChart>
      </ResponsiveContainer>
      {events.length > 0 && <div className="mt-3 border-t border-[#dce5ec] pt-3">
        <div className="text-sm font-semibold text-[#152b45]">What changed over time</div>
        <p className="text-xs text-neutral-500 mt-0.5">Numbered markers show when rules or operations changed. They are context, not proven causes of a rise or fall in reports.</p>
        <ol className="mt-2 space-y-2">{events.map(e => <li key={e.month + e.title} className="flex gap-2.5 text-sm">
          <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#123b69] text-xs font-bold text-white">{e.n}</span>
          <span><strong className="text-[#152b45]">{e.label} · {e.title}.</strong> <span className="text-neutral-700">{e.text}</span> <a href={e.source_url} target="_blank" rel="noreferrer" className="text-[#184f95] underline">{e.source_label} ↗</a></span></li>)}</ol>
      </div>}
    </div>
  );
}
