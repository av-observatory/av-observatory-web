export interface RegistryPermit {
  state: string;
  agency: string;
  company: string;
  permit_type_raw: string;
  permit_type_normalized: string;
  permit_id: string | null;
  approved_locations: string | null;
  source_url: string;
  captured_at: string;
  source_category?: "permit" | "operational_evidence";
}

export interface RegistryManufacturer {
  manufacturer_key: string;
  display_name: string;
  company_status?: "current_or_unknown" | "historical";
  status_note?: string | null;
  states: string[];
  state_count: number;
  permit_count: number;
  permits: RegistryPermit[];
}

export interface RegistryStateStatus {
  state: string;
  status: "no_permit_regime" | "permit_required_not_public" | "unclear";
  agency: string | null;
  note: string;
  sources: string[];
}

export interface StatePermitRegistry {
  dataset: string;
  methodology: string;
  states_with_company_level_data: string[];
  states_status_notes: RegistryStateStatus[];
  manufacturer_count: number;
  total_registry_entries?: number;
  total_permit_entries?: number; // backward compatibility with pre-audit snapshots
  manufacturers: RegistryManufacturer[];
  all_permits: RegistryPermit[];
}
