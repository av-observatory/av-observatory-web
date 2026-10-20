"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AXIS_PROPS, GRID_PROPS, LEGEND_PROPS, SERIES_ORDER, TOOLTIP_PROPS } from "@/lib/chartTheme";
import { useMonthAxis } from "@/components/MonthAxis";
import { isCompleteSgoMonth } from "@/lib/safety";
import { monthLabel } from "@/lib/activity";
import { companyName } from "@/components/SgoCompanyExplorer";
import { SgoShiftNotes } from "@/components/SgoShiftNotes";
import type { SgoIncidentRow } from "@/components/SgoDeepDive";

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const TOP = 7;

export function SgoCompanyMix({ rows }: { rows: SgoIncidentRow[] }) {
  const [mode, setMode] = useState<"count" | "share">("count");
  const data = useMemo(() => rows.flatMap(r => {
    const m = /^([A-Z]{3})-(\d{4})$/i.exec(r.incident_date || "");
    const i = m ? MONTHS.indexOf(m[1].toUpperCase()) : -1;
    if (!m || i < 0 || r.automation_system_engaged !== "ADS" || !isCompleteSgoMonth(Number(m[2]), i + 1)) return [];
    return [{ ym: Number(m[2]) * 12 + i, company: companyName(r.reporting_entities || r.reporting_entity || "") }];
  }), [rows]);

  const { names, series, years, table } = useMemo(() => {
    const totals = new Map<string, number>();
    for (const r of data) totals.set(r.company, (totals.get(r.company) ?? 0) + 1);
    const ranked = Array.from(totals).sort((a, b) => b[1] - a[1]).map(([n]) => n);
    const names = ranked.slice(0, TOP);
    const lo = Math.min(...data.map(r => r.ym)), hi = Math.max(...data.map(r => r.ym));
    const series = Array.from({ length: hi - lo + 1 }, (_, k) => {
      const ym = lo + k;
      const row: Record<string, number | string> = { label: monthLabel(Math.floor(ym / 12), (ym % 12) + 1), "All others": 0 };
      for (const n of names) row[n] = 0;
      for (const r of data) if (r.ym === ym) { const key = names.includes(r.company) ? r.company : "All others"; row[key] = (row[key] as number) + 1; }
      return row;
    });
    const years = Array.from(new Set(data.map(r => Math.floor(r.ym / 12)))).sort();
    const table = [...names, "All others"].map(n => ({ name: n, byYear: years.map(y => data.filter(r => Math.floor(r.ym / 12) === y && (n === "All others" ? !names.includes(r.company) : r.company === n)).length) }));
    return { names, series, years, table };
  }, [data]);

  const { axis, onResize } = useMonthAxis(series.length);
  if (!data.length) return null;
  const keys = [...names, "All others"];
  const yearTotals = years.map((_, i) => table.reduce((s, t) => s + t.byYear[i], 0));

  return <div className="mt-4">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <div><h3 className="text-lg font-semibold tracking-tight">Reported Crashes By Company</h3>
        <p className="text-sm text-neutral-600 mt-0.5 max-w-3xl">Monthly ADS crashes by incident month, credited to the ADS developer or operator. The industry total is growing as fleets scale, so a company's share shifts with deployment.</p></div>
      <div className="inline-flex rounded-lg border border-[#cbd9e8] overflow-hidden text-sm" role="group" aria-label="Chart units">
        {(["count", "share"] as const).map(m => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}
          className={`px-3 py-1.5 ${mode === m ? "bg-[#123b69] text-white" : "bg-white text-[#123b69]"}`}>{m === "count" ? "Crashes" : "Share of crashes"}</button>)}
      </div>
    </div>
    <div className="viz-card p-4 mt-2">
      <ResponsiveContainer width="100%" height={320} onResize={onResize}>
        <AreaChart data={series} stackOffset={mode === "share" ? "expand" : "none"} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid {...GRID_PROPS} /><XAxis dataKey="label" {...axis} />
          <YAxis {...AXIS_PROPS} allowDecimals={false} domain={mode === "share" ? [0, 1] : [0, "auto"]} ticks={mode === "share" ? [0, 0.25, 0.5, 0.75, 1] : undefined} tickFormatter={v => mode === "share" ? `${Math.round(Number(v) * 100)}%` : String(v)} />
          <Tooltip {...TOOLTIP_PROPS} /><Legend {...LEGEND_PROPS} />
          {keys.map((n, i) => <Area key={n} type="monotone" dataKey={n} stackId="1" stroke={SERIES_ORDER[i % SERIES_ORDER.length]} fill={SERIES_ORDER[i % SERIES_ORDER.length]} fillOpacity={0.75} />)}
        </AreaChart>
      </ResponsiveContainer>
      <div className="overflow-x-auto mt-3"><table className="w-full text-sm min-w-[520px]">
        <thead><tr className="text-left text-xs text-neutral-500"><th className="py-1.5">Company</th>{years.map(y => <th key={y} className="text-right">{y}</th>)}<th className="text-right">Total</th></tr></thead>
        <tbody>{table.map(t => <tr key={t.name} className="border-t border-[#e6edf3]"><td className="py-1.5 font-medium">{t.name}</td>{t.byYear.map((n, i) => <td key={i} className="text-right tabular-nums">{n.toLocaleString()}</td>)}<td className="text-right tabular-nums font-medium">{t.byYear.reduce((a, b) => a + b, 0).toLocaleString()}</td></tr>)}
          <tr className="border-t-2 border-[#cbd9e8] font-semibold"><td className="py-1.5">All ADS crashes</td>{yearTotals.map((n, i) => <td key={i} className="text-right tabular-nums">{n.toLocaleString()}</td>)}<td className="text-right tabular-nums">{yearTotals.reduce((a, b) => a + b, 0).toLocaleString()}</td></tr></tbody>
      </table></div>
      <SgoShiftNotes name="All companies" />
      <p className="text-xs text-neutral-500 mt-2">The latest year is partial. Counts are SGO reports, not adjusted for miles driven, and do not establish fault.</p>
    </div>
  </div>;
}
