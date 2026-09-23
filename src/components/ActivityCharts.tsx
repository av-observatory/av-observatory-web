"use client";

import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ActivityMonthlyRow, monthLabel, sortRows } from "@/lib/activity";
import { SERIES, AXIS_PROPS, GRID_PROPS, TOOLTIP_PROPS, LEGEND_PROPS } from "@/lib/chartTheme";

function aggregateByMonth(rows: ActivityMonthlyRow[]) {
  const byMonth = new Map<string, { year: number; month: number; trips: number; vmt: number; pmt: number }>();
  for (const r of rows) {
    const key = `${r.calendar_year}-${r.calendar_month}`;
    const existing = byMonth.get(key) ?? { year: r.calendar_year, month: r.calendar_month, trips: 0, vmt: 0, pmt: 0 };
    existing.trips += r.total_trips ?? 0;
    existing.vmt += r.total_vmt_all_periods ?? 0;
    existing.pmt += r.total_passenger_miles_traveled ?? 0;
    byMonth.set(key, existing);
  }
  return sortRows(
    Array.from(byMonth.values()).map((v) => ({
      calendar_year: v.year,
      calendar_month: v.month,
      total_trips: v.trips,
      total_vmt_all_periods: v.vmt,
      total_passenger_miles_traveled: v.pmt,
    })) as unknown as ActivityMonthlyRow[]
  ).map((r) => ({
    label: monthLabel(r.calendar_year, r.calendar_month),
    trips: r.total_trips,
    vmt: r.total_vmt_all_periods,
    pmt: r.total_passenger_miles_traveled,
  }));
}

export function TripsChart({ rows }: { rows: ActivityMonthlyRow[] }) {
  const data = aggregateByMonth(rows);
  if (data.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} tickFormatter={(v) => (v / 1_000_000).toFixed(1) + "M"} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => Number(v).toLocaleString()} />
        <Line type="monotone" dataKey="trips" name="Passenger Trips" stroke={SERIES.blue} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function VmtChart({ rows }: { rows: ActivityMonthlyRow[] }) {
  const data = aggregateByMonth(rows);
  if (data.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} tickFormatter={(v) => (v / 1_000_000).toFixed(1) + "M"} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => Number(v).toLocaleString()} />
        <Line type="monotone" dataKey="vmt" name="Total VMT" stroke={SERIES.blue} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function aggregateVmtPeriods(rows: ActivityMonthlyRow[]) {
  const byMonth = new Map<string, { year: number; month: number; p1: number; p2: number; p3: number }>();
  for (const r of rows) {
    const key = `${r.calendar_year}-${r.calendar_month}`;
    const existing = byMonth.get(key) ?? { year: r.calendar_year, month: r.calendar_month, p1: 0, p2: 0, p3: 0 };
    existing.p1 += r.total_vmt_period1 ?? 0;
    existing.p2 += r.total_vmt_period2 ?? 0;
    existing.p3 += r.total_vmt_period3 ?? 0;
    byMonth.set(key, existing);
  }
  return sortRows(
    Array.from(byMonth.values()).map((v) => ({
      calendar_year: v.year,
      calendar_month: v.month,
    })) as unknown as ActivityMonthlyRow[]
  ).map((r) => {
    const v = byMonth.get(`${r.calendar_year}-${r.calendar_month}`)!;
    return {
      label: monthLabel(r.calendar_year, r.calendar_month),
      "Occupied (Period 3)": Math.round(v.p3),
      "En route to pickup (Period 2)": Math.round(v.p2),
      "Idle / positioning (Period 1)": Math.round(v.p1),
    };
  });
}

const VMT_PERIOD_COLORS = [SERIES.blue, SERIES.aqua, "#cde2fb"];

// Definitions per CPUC's own Trip-Level Data Dictionary (see
// docs/methodology/cpuc-data-dictionary.md): Period 1 = idle/positioning
// miles (not carrying a passenger, not en route to one); Period 2 = en
// route to pickup after accepting a trip; Period 3 = occupied, passenger
// aboard. Non-passenger VMT = Period 1 + Period 2.
export function VmtPeriodChart({ rows }: { rows: ActivityMonthlyRow[] }) {
  const data = aggregateVmtPeriods(rows);
  if (data.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={340}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} tickFormatter={(v) => (v / 1_000_000).toFixed(1) + "M"} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => Number(v).toLocaleString()} />
        <Legend {...LEGEND_PROPS} />
        <Area type="monotone" dataKey="Occupied (Period 3)" stackId="1" stroke={VMT_PERIOD_COLORS[0]} fill={VMT_PERIOD_COLORS[0]} fillOpacity={0.85} />
        <Area type="monotone" dataKey="En route to pickup (Period 2)" stackId="1" stroke={VMT_PERIOD_COLORS[1]} fill={VMT_PERIOD_COLORS[1]} fillOpacity={0.85} />
        <Area type="monotone" dataKey="Idle / positioning (Period 1)" stackId="1" stroke={VMT_PERIOD_COLORS[2]} fill={VMT_PERIOD_COLORS[2]} fillOpacity={0.85} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function aggregateNonPassengerShare(rows: ActivityMonthlyRow[]) {
  const byMonth = new Map<string, { year: number; month: number; p1: number; p2: number; p3: number }>();
  for (const r of rows) {
    const key = `${r.calendar_year}-${r.calendar_month}`;
    const existing = byMonth.get(key) ?? { year: r.calendar_year, month: r.calendar_month, p1: 0, p2: 0, p3: 0 };
    existing.p1 += r.total_vmt_period1 ?? 0;
    existing.p2 += r.total_vmt_period2 ?? 0;
    existing.p3 += r.total_vmt_period3 ?? 0;
    byMonth.set(key, existing);
  }
  return sortRows(
    Array.from(byMonth.values()).map((v) => ({
      calendar_year: v.year,
      calendar_month: v.month,
    })) as unknown as ActivityMonthlyRow[]
  ).map((r) => {
    const v = byMonth.get(`${r.calendar_year}-${r.calendar_month}`)!;
    const total = v.p1 + v.p2 + v.p3;
    return {
      label: monthLabel(r.calendar_year, r.calendar_month),
      nonPassengerSharePct: total > 0 ? Math.round(((v.p1 + v.p2) / total) * 1000) / 10 : null,
    };
  });
}

// Non-passenger VMT = Period 1 (idle/positioning) + Period 2 (en route to
// pickup), i.e. all miles driven without a passenger aboard. This is the
// deadheading-style metric named in the original Observatory brief, made
// possible by CPUC's own Trip-Level Data Dictionary definitions.
export function NonPassengerShareChart({ rows }: { rows: ActivityMonthlyRow[] }) {
  const data = aggregateNonPassengerShare(rows);
  if (data.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => `${v}%`} />
        <Line type="monotone" dataKey="nonPassengerSharePct" name="Non-Passenger VMT Share" stroke={SERIES.orange} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function aggregateWaitingHours(rows: ActivityMonthlyRow[]) {
  const byMonth = new Map<string, { year: number; month: number; waiting: number }>();
  for (const r of rows) {
    const key = `${r.calendar_year}-${r.calendar_month}`;
    const existing = byMonth.get(key) ?? { year: r.calendar_year, month: r.calendar_month, waiting: 0 };
    existing.waiting += r.total_waiting_hours ?? 0;
    byMonth.set(key, existing);
  }
  return sortRows(
    Array.from(byMonth.values()).map((v) => ({
      calendar_year: v.year,
      calendar_month: v.month,
    })) as unknown as ActivityMonthlyRow[]
  ).map((r) => {
    const v = byMonth.get(`${r.calendar_year}-${r.calendar_month}`)!;
    return {
      label: monthLabel(r.calendar_year, r.calendar_month),
      waitingHours: Math.round(v.waiting),
    };
  });
}

export function WaitingHoursChart({ rows }: { rows: ActivityMonthlyRow[] }) {
  const data = aggregateWaitingHours(rows);
  if (data.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} tickFormatter={(v) => Number(v).toLocaleString()} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => `${Number(v).toLocaleString()} hours`} />
        <Line type="monotone" dataKey="waitingHours" name="Total Reported Waiting Hours" stroke={SERIES.violet} strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const PROGRAM_LABELS: Record<string, string> = {
  driverless: "Driverless Deployment",
  drivered_pilot: "Drivered / Pilot (testing, safety driver present)",
  unspecified: "Unspecified (pre-2023 reporting, program not distinguished)",
};

function aggregateTripsByProgram(rows: ActivityMonthlyRow[]) {
  const programs = Array.from(new Set(rows.map((r) => r.program)));
  const byMonth = new Map<string, { year: number; month: number } & Record<string, number>>();
  for (const r of rows) {
    const key = `${r.calendar_year}-${r.calendar_month}`;
    const existing = byMonth.get(key) ?? ({ year: r.calendar_year, month: r.calendar_month } as { year: number; month: number } & Record<string, number>);
    existing[r.program] = (existing[r.program] ?? 0) + (r.total_trips ?? 0);
    byMonth.set(key, existing);
  }
  const monthKeys = sortRows(
    Array.from(byMonth.values()).map((v) => ({
      calendar_year: v.year,
      calendar_month: v.month,
    })) as unknown as ActivityMonthlyRow[]
  );
  return { programs, data: monthKeys.map((r) => {
    const v = byMonth.get(`${r.calendar_year}-${r.calendar_month}`)!;
    const out: Record<string, string | number> = { label: monthLabel(r.calendar_year, r.calendar_month) };
    for (const p of programs) out[PROGRAM_LABELS[p] ?? p] = Math.round(v[p] ?? 0);
    return out;
  }) };
}

const PROGRAM_COLORS = [SERIES.blue, SERIES.orange, SERIES.aqua];

export function TripsByProgramChart({ rows }: { rows: ActivityMonthlyRow[] }) {
  const { programs, data } = aggregateTripsByProgram(rows);
  if (data.length === 0) return <EmptyState />;
  return (
    <ResponsiveContainer width="100%" height={340}>
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="label" {...AXIS_PROPS} />
        <YAxis {...AXIS_PROPS} tickFormatter={(v) => (v / 1_000).toFixed(0) + "K"} />
        <Tooltip {...TOOLTIP_PROPS} formatter={(v) => Number(v).toLocaleString()} />
        <Legend {...LEGEND_PROPS} />
        {programs.map((p, i) => (
          <Area
            key={p}
            type="monotone"
            dataKey={PROGRAM_LABELS[p] ?? p}
            stackId="1"
            stroke={PROGRAM_COLORS[i % PROGRAM_COLORS.length]}
            fill={PROGRAM_COLORS[i % PROGRAM_COLORS.length]}
            fillOpacity={0.85}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function EmptyState() {
  return (
    <div className="h-80 flex items-center justify-center text-sm" style={{ color: "#898781" }}>
      No data yet — run the CPUC ingest + publish pipeline to populate this chart.
    </div>
  );
}
