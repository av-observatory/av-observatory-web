export interface SgoMonthlyDataset {
  dataset: string;
  source: string;
  coverage: string;
  notes: string;
  row_count: number;
  states_represented: string[];
  entities_represented: string[];
  vehicle_class_and_program_type_note?: string;
  entity_classification?: Record<string, { vehicle_class: string; program_type: string }>;
  monthly_national_total: { year: number; month: number; incident_count: number }[];
  monthly_by_state: { year: number; month: number; state: string; incident_count: number }[];
  monthly_by_entity: { year: number; month: number; reporting_entity: string; incident_count: number }[];
  monthly_by_vehicle_class: { year: number; month: number; vehicle_class: string; incident_count: number }[];
  monthly_by_program_type: { year: number; month: number; program_type: string; incident_count: number }[];
}

export interface WaymoCaExposureRate {
  title: string;
  purpose: string;
  methodology_note: string;
  months_included: number;
  total_waymo_ca_vmt: number;
  total_waymo_ca_sgo_incidents: number;
  overall_incidents_per_million_miles: number | null;
  monthly: {
    year: number;
    month: number;
    waymo_ca_vmt: number;
    waymo_ca_sgo_incidents: number;
    incidents_per_million_miles: number | null;
  }[];
}

export interface WaymoS2StateSummary {
  dataset: string;
  source: string;
  vintage_end: string;
  coverage: string;
  notes: Record<string, string>;
  state_summary: {
    state: string;
    waymo_ro_miles: number;
    hpms_benchmark_vmt: number;
    s2_cell_count: number;
    benchmark_crash_counts_by_outcome: Record<string, number>;
    implied_human_benchmark_rate_per_million_miles: Record<string, number>;
  }[];
  county_summary: {
    state: string;
    county: string;
    waymo_ro_miles: number;
    hpms_benchmark_vmt: number;
    s2_cell_count: number;
  }[];
}

export interface ReconciliationCheck {
  title: string;
  purpose: string;
  cpuc_side: {
    source: string;
    months_covered: number;
    month_range: [string, string] | null;
    note: string;
    total_vmt: number;
  };
  waymo_s2_side: {
    source: string;
    vintage_end: string;
    note: string;
    total_miles: number;
  };
  caveats: string[];
}

export function topEntitiesByIncidentCount(d: SgoMonthlyDataset, n = 10) {
  const totals = new Map<string, number>();
  for (const row of d.monthly_by_entity) {
    totals.set(row.reporting_entity, (totals.get(row.reporting_entity) ?? 0) + row.incident_count);
  }
  return Array.from(totals.entries())
    .map(([entity, count]) => ({ entity, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

export function topStatesByIncidentCount(d: SgoMonthlyDataset, n = 10) {
  const totals = new Map<string, number>();
  for (const row of d.monthly_by_state) {
    totals.set(row.state, (totals.get(row.state) ?? 0) + row.incident_count);
  }
  return Array.from(totals.entries())
    .map(([state, count]) => ({ state, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}
