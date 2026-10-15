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

/**
 * Maps month-sorted rows to chart points and inserts a label-only point for
 * every calendar month with no row, so the x axis stays continuous and lines
 * break across unreported months instead of connecting over them.
 */
export function mapWithMonthGaps<R extends { calendar_year: number; calendar_month: number }, O extends { label: string }>(
  rows: R[],
  fn: (row: R) => O,
): Array<O | { label: string }> {
  const out: Array<O | { label: string }> = [];
  let prev: R | undefined;
  for (const row of rows) {
    if (prev) {
      let gap = (row.calendar_year - prev.calendar_year) * 12 + (row.calendar_month - prev.calendar_month) - 1;
      let y = prev.calendar_year;
      let m = prev.calendar_month;
      while (gap-- > 0) {
        m += 1;
        if (m > 12) { m = 1; y += 1; }
        out.push({ label: monthLabel(y, m) });
      }
    }
    out.push(fn(row));
    prev = row;
  }
  return out;
}
