import { ActivityMonthlyDataset } from "./activity";
import { SgoMonthlyDataset, WaymoS2StateSummary } from "./safety";

export interface ChangeStat {
  value: number;
  pctChange: number | null;
}

function sumLastNMonths<T extends { year: number; month: number }>(
  rows: T[],
  valueFn: (r: T) => number,
  n: number,
  offset: number
): number {
  const sorted = [...rows].sort((a, b) => a.year - b.year || a.month - b.month);
  const monthIndex = (r: { year: number; month: number }) => r.year * 12 + r.month;
  const maxIdx = sorted.length ? Math.max(...sorted.map(monthIndex)) : 0;
  const windowEnd = maxIdx - offset * n;
  const windowStart = windowEnd - n + 1;
  return sorted
    .filter((r) => {
      const idx = monthIndex(r);
      return idx >= windowStart && idx <= windowEnd;
    })
    .reduce((sum, r) => sum + valueFn(r), 0);
}

function changeStat<T extends { year: number; month: number }>(
  rows: T[],
  valueFn: (r: T) => number
): ChangeStat {
  const latest = sumLastNMonths(rows, valueFn, 12, 0);
  const prior = sumLastNMonths(rows, valueFn, 12, 1);
  return {
    value: latest,
    pctChange: prior > 0 ? Math.round(((latest - prior) / prior) * 1000) / 10 : null,
  };
}

export function cpucTripsStat(cpuc: ActivityMonthlyDataset) {
  const byMonth = new Map<string, { year: number; month: number; trips: number }>();
  for (const r of cpuc.data) {
    const key = `${r.calendar_year}-${r.calendar_month}`;
    const existing = byMonth.get(key) ?? { year: r.calendar_year, month: r.calendar_month, trips: 0 };
    existing.trips += r.total_trips ?? 0;
    byMonth.set(key, existing);
  }
  const rows = Array.from(byMonth.values());
  const total = rows.reduce((s, r) => s + r.trips, 0);
  const change = changeStat(rows, (r) => r.trips);
  return { total, ...change };
}

export function sgoIncidentsStat(sgo: SgoMonthlyDataset) {
  const rows = sgo.monthly_national_total;
  const total = rows.reduce((s, r) => s + r.incident_count, 0);
  const change = changeStat(rows, (r) => r.incident_count);
  return { total, ...change };
}

export function waymoTotalMiles(waymoS2: WaymoS2StateSummary): number {
  return waymoS2.state_summary.reduce((s, r) => s + r.waymo_ro_miles, 0);
}

export function entitiesReportingStat(sgo: SgoMonthlyDataset) {
  const byYear = new Map<number, Set<string>>();
  for (const r of sgo.monthly_by_entity) {
    if (!byYear.has(r.year)) byYear.set(r.year, new Set());
    byYear.get(r.year)!.add(r.reporting_entity);
  }
  const years = Array.from(byYear.keys()).sort((a, b) => b - a);
  const latestYear = years[0];
  const priorYear = years[1];
  const latestSet = latestYear !== undefined ? byYear.get(latestYear)! : new Set<string>();
  const priorSet = priorYear !== undefined ? byYear.get(priorYear)! : new Set<string>();
  const newThisYear = Array.from(latestSet).filter((e) => !priorSet.has(e)).length;
  return {
    total: sgo.entities_represented.length,
    reportingLatestYear: latestSet.size,
    newThisYear: priorYear !== undefined ? newThisYear : null,
    latestYear,
  };
}

// Do not compute a state "incident rate" by dividing all-operator SGO
// incidents by Waymo-only mileage. Numerator and denominator describe
// different populations and the resulting ratio is not a valid safety rate.
