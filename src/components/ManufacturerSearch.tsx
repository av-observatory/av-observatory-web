"use client";

import { useMemo, useState } from "react";
import { RegistryManufacturer, RegistryPermit, RegistryStateStatus } from "@/lib/registry";
import { UsStateMap } from "@/components/UsStateMap";

const TYPE_LABELS: Record<string, string> = {
  testing_with_driver: "Testing · drivered",
  driverless_testing: "Testing · driverless",
  drivered_deployment: "Deployment · drivered",
  driverless_deployment: "Deployment · driverless",
  deployment: "Deployment · driver status unspecified",
  testing_registry: "Testing · driver status unspecified",
  federal_disclosure: "Operational / federal evidence",
};

const TYPE_OPTIONS = [
  ["all", "All statuses"],
  ["testing", "Testing"],
  ["deployment", "Deployment"],
] as const;
const DRIVER_OPTIONS = [
  ["all", "Drivered + driverless"],
  ["drivered", "Drivered"],
  ["driverless", "Driverless"],
] as const;

function realState(s: string) { return s !== "US"; }
function phase(p: RegistryPermit) {
  if (p.permit_type_normalized.includes("deployment")) return "deployment";
  if (p.permit_type_normalized.includes("testing") || p.permit_type_normalized === "testing_registry") return "testing";
  return "evidence";
}
function driverMode(p: RegistryPermit) {
  if (p.permit_type_normalized === "testing_with_driver" || p.permit_type_normalized === "drivered_deployment") return "drivered";
  if (p.permit_type_normalized === "driverless_testing" || p.permit_type_normalized === "driverless_deployment") return "driverless";
  return "unspecified";
}

type OperationalLocation = {
  company: string; state: string; market: string; lat: number | null; lon: number | null;
  status: string; mode: string; geometry_basis: string; source_url: string; note?: string;
};

function canonicalCompany(s: string) {
  return s.toUpperCase().replace(/[^A-Z0-9]+/g, " ").replace(/\b(INC|LLC|CORP|CORPORATION)\b/g, "").replace(/\s+/g, " ").trim();
}

export function ManufacturerSearch({
  manufacturers,
  stateStatuses = [],
  operationalLocations = [],
}: {
  manufacturers: RegistryManufacturer[];
  stateStatuses?: RegistryStateStatus[];
  operationalLocations?: OperationalLocation[];
}) {
  const [company, setCompany] = useState("ALL");
  const [state, setState] = useState("ALL");
  const [type, setType] = useState("all");
  const [driver, setDriver] = useState("all");
  const [evidence, setEvidence] = useState<"authorizations" | "all">("authorizations");
  const [includeHistorical, setIncludeHistorical] = useState(false);

  const states = useMemo(() => Array.from(new Set([
    ...manufacturers.flatMap(m => m.permits.map(p => p.state).filter(realState)),
    ...stateStatuses.map(s => s.state),
    ...operationalLocations.map(s => s.state),
  ])).sort(), [manufacturers, stateStatuses]);

  const statusByState = useMemo(() => Object.fromEntries(stateStatuses.map(s => [s.state, s])), [stateStatuses]);

  const nationalCategories = useMemo(() => {
    const out: Record<string, string> = {};
    const operational = new Set<string>();
    const roster = new Set<string>();
    for (const m of manufacturers) {
      for (const p of m.permits) {
        if (!realState(p.state)) continue;
        if (p.source_category === "operational_evidence") operational.add(p.state);
        else roster.add(p.state);
      }
    }
    for (const s of operational) out[s] = "operational";
    for (const s of roster) out[s] = "public_roster";
    for (const s of stateStatuses) {
      if (s.status === "permit_required_not_public") out[s.state] = "permit_regime";
      else if (!out[s.state] && s.status === "unclear") out[s.state] = "unclear";
    }
    return out;
  }, [manufacturers, stateStatuses]);

  const rows = useMemo(() => manufacturers.flatMap(m => m.permits.map(p => ({ m, p }))).filter(({m,p}) => {
    if (!includeHistorical && m.company_status === "historical") return false;
    if (company !== "ALL" && m.manufacturer_key !== company) return false;
    if (state !== "ALL" && p.state !== state) return false;
    if (evidence === "authorizations" && p.source_category === "operational_evidence") return false;
    if (type !== "all" && phase(p) !== type) return false;
    if (driver !== "all" && driverMode(p) !== driver) return false;
    return true;
  }), [manufacturers, company, state, type, driver, evidence, includeHistorical]);

  const mapStates = Array.from(new Set(rows.map(({p}) => p.state).filter(realState)));
  const useNationalCategoryMap = company === "ALL" && state === "ALL" && type === "all" && driver === "all" && evidence === "authorizations";
  const selectedStatus = state !== "ALL" ? statusByState[state] : undefined;
  const operationalMarkers = useMemo(() => {
    // Operating-market points are a different evidence type from permit/registry records.
    // Never overlay them on an authorization-only view because that makes a point (e.g. Zoox
    // in San Francisco) look like the only company covered by the selected permit filters.
    if (evidence !== "all") return [];
    return operationalLocations.filter(loc => {
      if (loc.lat === null || loc.lon === null || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lon)) return false;
      if (state !== "ALL" && loc.state !== state) return false;
      if (company !== "ALL") {
        const selected = manufacturers.find(m => m.manufacturer_key === company);
        if (!selected) return false;
        if (canonicalCompany(loc.company) !== canonicalCompany(selected.display_name) &&
            !canonicalCompany(selected.display_name).startsWith(canonicalCompany(loc.company))) return false;
      }
      return true;
    }).map(loc => ({
      name: loc.market,
      coordinates: [loc.lon as number, loc.lat as number] as [number, number],
      company: loc.company,
      status: loc.status,
      mode: loc.mode,
    }));
  }, [operationalLocations, state, company, manufacturers, evidence]);

  const matchingCompanies = useMemo(() => Array.from(
    new Map(rows.map(({m}) => [m.manufacturer_key, m.display_name])).values()
  ).sort(), [rows]);

  const companyCount = matchingCompanies.length;
  const permitCount = rows.filter(({p}) => p.source_category !== "operational_evidence").length;
  const evidenceCount = rows.filter(({p}) => p.source_category === "operational_evidence").length;

  return <div>
    <div className="viz-card p-4">
      <div className="grid md:grid-cols-3 xl:grid-cols-5 gap-3">
        <Filter label="Company" value={company} onChange={setCompany}>
          <option value="ALL">All current companies</option>
          {manufacturers.filter(m => includeHistorical || m.company_status !== "historical").map(m => <option key={m.manufacturer_key} value={m.manufacturer_key}>{m.display_name}</option>)}
        </Filter>
        <Filter label="State" value={state} onChange={setState}>
          <option value="ALL">All states</option>{states.map(s => <option key={s}>{s}</option>)}
        </Filter>
        <Filter label="Program" value={type} onChange={setType}>
          {TYPE_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </Filter>
        <Filter label="Driver status" value={driver} onChange={setDriver}>
          {DRIVER_OPTIONS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
        </Filter>
        <Filter label="Evidence" value={evidence} onChange={(v) => setEvidence(v as "authorizations" | "all")}>
          <option value="authorizations">Permits / registries</option><option value="all">Include operational evidence</option>
        </Filter>
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-xs text-neutral-600">
        <input type="checkbox" checked={includeHistorical} onChange={e => setIncludeHistorical(e.target.checked)} />
        Include discontinued companies/programs
      </label>
    </div>

    <div className="grid lg:grid-cols-[1.45fr_.55fr] gap-5 mt-5">
      <div className="viz-card p-5">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <div className="eyebrow">{evidence === "authorizations" ? "Authorization footprint" : "Geographic footprint"}</div>
            <h3 className="text-xl font-semibold mt-1">
              {evidence === "authorizations" ? "States with matching permit / registry records" : "Where the selected AV activity is documented"}
            </h3>
          </div>
          <div className="text-right text-xs text-neutral-500">{mapStates.length} states</div>
        </div>
        {useNationalCategoryMap ? (
          <UsStateMap
            categoryByAbbrev={nationalCategories}
            categories={{
              public_roster: { label: "Public company-level permit / registry roster", color: "#1f5fae" },
              permit_regime: { label: "Permit / authorization required; holder roster not public", color: "#6da7ec" },
              operational: { label: "Documented operation; no public holder roster ingested", color: "#9fd3c7" },
              unclear: { label: "Regulatory status under review", color: "#d8d6cf" },
            }}
            markers={operationalMarkers}
            onStateClick={(abbr) => abbr && setState(abbr)}
          />
        ) : (
          <UsStateMap highlightAbbrevs={mapStates} highlightLabel="Matches filters" markers={operationalMarkers} onStateClick={(abbr) => abbr && setState(abbr)} />
        )}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-500">
          {evidence === "all" && <span>● Orange points = currently documented operating markets</span>}
          <span>{evidence === "authorizations" ? "Permit / registry records are state-level unless a source publishes a more specific ODD." : "Click a state to filter."}</span>
        </div>
        {matchingCompanies.length > 0 && (
          <div className="mt-3 border-t border-neutral-200 pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 mb-2">
              Companies matching these filters
            </div>
            <div className="flex flex-wrap gap-1.5">
              {matchingCompanies.map(name => <span key={name} className="badge">{name}</span>)}
            </div>
          </div>
        )}
        {selectedStatus && (
          <div className="mt-3 border-t border-neutral-200 pt-3 text-sm">
            <div className="font-medium">{selectedStatus.state} · {selectedStatus.agency ?? "State regulatory status"}</div>
            <div className="text-neutral-600 mt-1">{selectedStatus.note}</div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-1 gap-3">
        <Kpi value={companyCount} label="companies" />
        <Kpi value={mapStates.length} label="states" />
        <Kpi value={permitCount} label="authorization / registry records" />
        <Kpi value={evidenceCount} label="operational-evidence records" />
      </div>
    </div>

    <div className="mt-5 viz-card overflow-hidden">
      <div className="px-5 py-4 border-b border-neutral-200"><h3 className="font-semibold">Records behind this view</h3><p className="text-xs text-neutral-500 mt-1">Source vocabulary is preserved alongside the Observatory classification.</p></div>
      <div className="overflow-x-auto max-h-[520px]">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-[#fcfcfb] text-left text-neutral-500"><tr><th>Company</th><th>State</th><th>Status</th><th>Evidence</th><th>Date</th><th>Source</th></tr></thead>
          <tbody>{rows.map(({m,p},i) => <tr key={i} className="border-t border-neutral-100">
            <td><span className="font-medium">{m.display_name}</span>{m.company_status === "historical" && <span className="ml-2 badge">historical</span>}</td>
            <td>{p.state}</td><td>{TYPE_LABELS[p.permit_type_normalized] ?? p.permit_type_raw}<div className="text-xs text-neutral-400">{p.permit_type_raw}</div></td>
            <td>{p.source_category === "operational_evidence" ? "Observed evidence" : "Authorization / registry"}</td>
            <td className="tabular-nums text-neutral-500">{p.captured_at}</td>
            <td><a href={p.source_url} target="_blank" rel="noreferrer" className="underline">source</a></td>
          </tr>)}</tbody>
        </table>
      </div>
    </div>
  </div>;
}

function Filter({label,value,onChange,children}:{label:string;value:string;onChange:(v:string)=>void;children:React.ReactNode}) {
  return <label className="text-xs font-medium text-neutral-600">{label}<select value={value} onChange={e=>onChange(e.target.value)} className="mt-1 block w-full bg-white border border-neutral-300 rounded-md px-2.5 py-2 text-sm text-neutral-900">{children}</select></label>
}
function Kpi({value,label}:{value:number;label:string}) { return <div className="viz-card p-4"><div className="text-3xl font-semibold tabular-nums">{value}</div><div className="text-xs uppercase tracking-wide text-neutral-500 mt-1">{label}</div></div> }
