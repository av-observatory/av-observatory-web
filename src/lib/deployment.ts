export interface MaAdtCompany {
  company: string;
  testing_report_count: number;
  earliest_period_start: string | null;
  latest_period_end: string | null;
  latest_approval_date: string | null;
  status_basis: "recent_report_on_file" | "no_report_in_18mo";
  months_since_last_report: number | null;
  documents: { title: string; doc_type: string; url: string }[];
}

export interface MaAdtRegistry {
  dataset: string;
  source: string;
  source_list_url: string;
  coverage: string;
  important_caveat: string;
  captured_at: string;
  companies: MaAdtCompany[];
}
