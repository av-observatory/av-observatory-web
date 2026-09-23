import { promises as fs } from "fs";
import path from "path";
import { MaAdtRegistry } from "@/lib/deployment";
import { StatePermitRegistry } from "@/lib/registry";
import { ManufacturerSearch } from "@/components/ManufacturerSearch";
import { OddExplorer } from "@/components/OddExplorer";
import { WaymoS2Explorer } from "@/components/WaymoS2Explorer";

async function loadJson<T>(filename: string): Promise<T> {
  const file = path.join(process.cwd(), "public", "data", filename);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

const STATUS_LABELS: Record<string, string> = {
  no_permit_regime: "No AV-specific permit regime found",
  permit_required_not_public: "Permit required, but no public roster",
  unclear: "Unclear -- needs further research",
};

export default async function DeploymentPage() {
  const ma = await loadJson<MaAdtRegistry>("ma_adt_testing_registry.json");
  const registry = await loadJson<StatePermitRegistry>("state_permit_registry.json");
  const odd = await loadJson<{ locations: { company:string; state:string; market:string; lat:number|null; lon:number|null; phase:string; status:string; mode:string; geometry_basis:string; source_url:string; note?:string }[] }>("operational_domains.json");
  const oddHistory = await loadJson<{ historical_events: { date:string; event_type:string; phase:string; company:string; market:string; state:string; geometry_ref?:string|null; geometry_basis?:string; source_url?:string|null }[] }>("odd_history.json");
  const oddGeometries = await loadJson<{ type:"FeatureCollection"; features:{ type:"Feature"; properties?:Record<string,unknown>; geometry:unknown }[] }>("odd_geometries.geojson");
  const oddCurrentGeometries = await loadJson<{ type:"FeatureCollection"; features:{ type:"Feature"; properties?:Record<string,unknown>; geometry:unknown }[] }>("odd_current_geometries.geojson");
  const s2Summary = await loadJson<any>("waymo_s2_vintage_summary.json");
  const s2Geo = await loadJson<any>("waymo_s2_latest.geojson");

  return (
    <div className="max-w-6xl px-8 py-6">
      <p className="eyebrow mb-3">United States · Deployment</p>
      <h1 className="text-4xl font-semibold tracking-tight">
        Autonomous Vehicle Deployment Explorer
      </h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
        Company-level permits, testing registries, deployment authority, and documented operation across U.S. states.
      </p>

      <section className="mt-5">
        <ManufacturerSearch manufacturers={registry.manufacturers} stateStatuses={registry.states_status_notes} operationalLocations={odd.locations} />
      </section>

      <section id="odd" className="mt-8">
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <div>
            <h2 className="text-xl font-semibold tracking-tight">ODD and service-area geography</h2>
            <p className="text-sm text-neutral-600 mt-1">Actual sourced operating-area polygons, separated from state authorization. Testing and deployment boundaries remain distinct.</p>
          </div>
        </div>
        <OddExplorer
          locations={odd.locations}
          history={oddHistory.historical_events}
          geometries={oddGeometries}
          currentGeometries={oddCurrentGeometries}
          manufacturerNames={registry.manufacturers.map(m => m.display_name)}
        />
      </section>

      <section id="s2" className="mt-8">
        <div className="mb-2">
          <h2 className="text-xl font-semibold tracking-tight">Observed deployment footprint · Waymo S2</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Cell-level Waymo operational mileage across published benchmark vintages, including incremental mileage between releases.
          </p>
        </div>
        <WaymoS2Explorer summary={s2Summary} geojson={s2Geo} />
      </section>

      <section id="regulatory" className="mt-7">
        <h2 className="text-xl font-semibold tracking-tight">State regulatory coverage</h2>
        <div className="mt-4 overflow-x-auto viz-card">
          <table className="w-full text-sm">
            <thead className="text-left text-neutral-500">
              <tr><th>State</th><th>Status</th><th>Agency</th><th>What we know</th></tr>
            </thead>
            <tbody>
              {registry.states_status_notes.map((s) => (
                <tr key={s.state} className="border-t border-neutral-100">
                  <td className="font-semibold">{s.state}</td>
                  <td>{STATUS_LABELS[s.status] ?? s.status}</td>
                  <td>{s.agency ?? "—"}</td>
                  <td className="text-neutral-600">{s.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-7">
        <h2 className="text-xl font-semibold tracking-tight">Massachusetts (detail)</h2>
        <p className="mt-1 text-neutral-600">{ma.coverage}</p>
        <p className="mt-3 text-sm text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-lg p-3">
          {ma.important_caveat}
        </p>

        <div className="mt-4 space-y-3">
          {ma.companies.map((c) => (
            <div key={c.company} className="bg-white border border-neutral-200 rounded-lg p-4">
              <div className="flex items-baseline justify-between">
                <h3 className="font-semibold">{c.company}</h3>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    c.status_basis === "recent_report_on_file"
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-neutral-100 text-neutral-600"
                  }`}
                >
                  {c.status_basis === "recent_report_on_file"
                    ? "Reported within 18 months"
                    : `No report filed in ${c.months_since_last_report} months`}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <dt className="text-neutral-500">Reports filed</dt>
                  <dd className="tabular-nums">{c.testing_report_count}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">First reporting period</dt>
                  <dd>{c.earliest_period_start ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-neutral-500">Last reporting period</dt>
                  <dd>{c.latest_period_end ?? "—"}</dd>
                </div>
              </dl>
              <details className="mt-3">
                <summary className="text-sm text-neutral-500 cursor-pointer">
                  {c.documents.length} source documents
                </summary>
                <ul className="mt-2 text-sm space-y-1">
                  {c.documents.map((d) => (
                    <li key={d.url}>
                      <a href={d.url} target="_blank" rel="noreferrer" className="text-[#0b1d33] underline">
                        {d.title}
                      </a>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </div>

        <div className="mt-4 text-xs text-neutral-400">
          Source:{" "}
          <a href={ma.source_list_url} target="_blank" rel="noreferrer" className="underline">
            {ma.source}
          </a>
          . Captured {ma.captured_at}.
        </div>
      </section>

    </div>
  );
}
