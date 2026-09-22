"use client";

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { topEntitiesByIncidentCount, topStatesByIncidentCount, SgoMonthlyDataset, WaymoS2StateSummary, WaymoCaExposureRate, isCompleteSgoMonth } from "@/lib/safety";
import { monthLabel } from "@/lib/activity";
import { SERIES, AXIS_PROPS, GRID_PROPS, TOOLTIP_PROPS } from "@/lib/chartTheme";

export function TopEntitiesChart({ data }: { data: SgoMonthlyDataset }) {
  const rows = topEntitiesByIncidentCount(data, 12);
  if (rows.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={420}>
      <BarChart data={rows} layout="vertical" margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} vertical={true} horizontal={false} />
        <XAxis type="number" {...AXIS_PROPS} />
        <YAxis type="category" dataKey="entity" {...AXIS_PROPS} fontSize={11} width={180} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => Number(v).toLocaleString()} />
        <Bar dataKey="count" name="Incident reports" fill={SERIES.blue} radius={[0, 3, 3, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TopStatesChart({ data }: { data: SgoMonthlyDataset }) {
  const rows = topStatesByIncidentCount(data, 12);
  if (rows.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={360}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="state" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => Number(v).toLocaleString()} />
        <Bar dataKey="count" name="Incident reports" fill={SERIES.blue} radius={[3, 3, 0, 0]} maxBarSize={40} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function NationalTrendChart({ data }: { data: SgoMonthlyDataset }) {
  const rows = data.monthly_national_total.filter(r => isCompleteSgoMonth(r.year,r.month)).map((r) => ({
    label: monthLabel(r.year, r.month),
    count: r.incident_count,
  }));
  if (rows.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => Number(v).toLocaleString()} />
        <Line type="monotone" dataKey="count" name="Incident reports filed" stroke={SERIES.blue} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function WaymoStateMilesChart({ data }: { data: WaymoS2StateSummary }) {
  const rows = data.state_summary.map((s) => ({ state: s.state, miles: s.waymo_ro_miles }));
  if (rows.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="state" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} tickFormatter={(v) => (v / 1_000_000).toFixed(0) + "M"} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => Number(v).toLocaleString()} />
        <Bar dataKey="miles" name="Waymo reported operational miles" fill={SERIES.blue} radius={[3, 3, 0, 0]} maxBarSize={60} />
      </BarChart>
    </ResponsiveContainer>
  );
}

const VEHICLE_CLASS_LABELS: Record<string, string> = {
  light_duty: "Light-duty / passenger",
  trucking: "Trucking",
};

const PROGRAM_TYPE_LABELS: Record<string, string> = {
  commercial: "Commercial (has/had paid service)",
  testing: "Testing / development-stage",
  unknown: "Unclassified",
};

function stackedByKey(
  rows: { year: number; month: number; incident_count: number }[],
  keyFn: (r: { year: number; month: number; incident_count: number }) => string,
  labelMap: Record<string, string>
) {
  const keys = Array.from(new Set(rows.map(keyFn)));
  const byMonth = new Map<string, Record<string, number>>();
  for (const r of rows) {
    const mk = `${r.year}-${r.month}`;
    const existing = byMonth.get(mk) ?? {};
    const k = keyFn(r);
    existing[k] = (existing[k] ?? 0) + r.incident_count;
    byMonth.set(mk, existing);
  }
  const sortedKeys = Array.from(byMonth.keys()).sort((a, b) => {
    const [ay, am] = a.split("-").map(Number);
    const [by, bm] = b.split("-").map(Number);
    return ay !== by ? ay - by : am - bm;
  });
  const data = sortedKeys.map((mk) => {
    const [y, m] = mk.split("-").map(Number);
    const v = byMonth.get(mk)!;
    const out: Record<string, string | number> = { label: monthLabel(y, m) };
    for (const k of keys) out[labelMap[k] ?? k] = v[k] ?? 0;
    return out;
  });
  return { keys: keys.map((k) => labelMap[k] ?? k), data };
}

export function VehicleClassChart({ data: sgo }: { data: SgoMonthlyDataset }) {
  const { keys, data } = stackedByKey(
    sgo.monthly_by_vehicle_class.map((r) => ({ ...r, incident_count: r.incident_count })),
    (r) => (r as unknown as { vehicle_class: string }).vehicle_class,
    VEHICLE_CLASS_LABELS
  );
  if (data.length === 0) return <EmptyState />;
  const colors = [SERIES.blue, SERIES.orange];
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => Number(v).toLocaleString()} />
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId="1" fill={colors[i % colors.length]} maxBarSize={20} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ProgramTypeChart({ data: sgo }: { data: SgoMonthlyDataset }) {
  const { keys, data } = stackedByKey(
    sgo.monthly_by_program_type.map((r) => ({ ...r, incident_count: r.incident_count })),
    (r) => (r as unknown as { program_type: string }).program_type,
    PROGRAM_TYPE_LABELS
  );
  if (data.length === 0) return <EmptyState />;
  const colors = [SERIES.blue, SERIES.orange, SERIES.aqua];
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => Number(v).toLocaleString()} />
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} stackId="1" fill={colors[i % colors.length]} maxBarSize={20} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WaymoCaExposureChart({ data }: { data: WaymoCaExposureRate }) {
  const rows = data.monthly.map((r) => ({
    label: monthLabel(r.year, r.month),
    rate: r.incidents_per_million_miles,
  }));
  if (rows.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" />
        <YAxis {...AXIS_PROPS} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => `${v} / million mi`} />
        <Line type="monotone" dataKey="rate" name="SGO incidents per million CA miles" stroke={SERIES.red} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CountyMilesTable({ data, limit = 15 }: { data: WaymoS2StateSummary; limit?: number }) {
  const rows = data.county_summary.slice(0, limit);
  if (rows.length === 0) return <EmptyState />;
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-neutral-200 text-left text-neutral-500">
          <th className="py-2 pr-4 font-medium">County</th>
          <th className="py-2 pr-4 font-medium">State</th>
          <th className="py-2 pr-4 font-medium text-right">Waymo miles</th>
          <th className="py-2 font-medium text-right">S2 cells</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={`${r.state}-${r.county}`} className="border-b border-neutral-100">
            <td className="py-2 pr-4">{r.county}</td>
            <td className="py-2 pr-4 text-neutral-500">{r.state}</td>
            <td className="py-2 pr-4 text-right tabular-nums">{Math.round(r.waymo_ro_miles).toLocaleString()}</td>
            <td className="py-2 text-right tabular-nums text-neutral-500">{r.s2_cell_count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState() {
  return (
    <div className="h-80 flex items-center justify-center text-sm" style={{ color: "#898781" }}>
      No data yet.
    </div>
  );
}
