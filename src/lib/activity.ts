export interface ActivityMonthlyRow {
  operator_tcpid: string;
  program: string;
  calendar_year: number;
  calendar_month: number;
  total_trips: number | null;
  total_waiting_hours: number | null;
  total_vmt_period1: number | null;
  total_vmt_period2: number | null;
  total_vmt_period3: number | null;
  total_vmt_zev: number | null;
  total_passengers_carried: number | null;
  total_passenger_miles_traveled: number | null;
  total_wavs_available: number | null;
  total_wavs_requested: number | null;
  total_wavs_declined_unavailable: number | null;
  total_wavs_fulfilled: number | null;
  total_vmt_all_periods: number | null;
}

export interface ActivityMonthlyDataset {
  dataset: string;
  source?: string;
  unit_notes?: Record<string, string>;
  row_count?: number;
  data: ActivityMonthlyRow[];
}

export function monthLabel(year: number, month: number): string {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", timeZone: "UTC" });
}

export function sortRows(rows: ActivityMonthlyRow[]): ActivityMonthlyRow[] {
  return [...rows].sort((a, b) =>
    a.calendar_year !== b.calendar_year
      ? a.calendar_year - b.calendar_year
      : a.calendar_month - b.calendar_month
  );
}
