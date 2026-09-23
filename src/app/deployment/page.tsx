import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { CompanyDeploymentExplorer, type Location, type Geojson, type S2Geojson, type VintageSummary } from "@/components/CompanyDeploymentExplorer";
import { StatePermitRegistry } from "@/lib/registry";
import { MaAdtRegistry } from "@/lib/deployment";

async function loadJson<T>(filename: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "data", filename), "utf-8"));
}

export default async function DeploymentPage() {
  const [registry, ma, operational, geometries, latestS2, vintages] = await Promise.all([
    loadJson<StatePermitRegistry>("state_permit_registry.json"),
    loadJson<MaAdtRegistry>("ma_adt_testing_registry.json"),
    loadJson<{ locations: Location[] }>("operational_domains.json"),
    loadJson<Geojson>("odd_current_geometries.geojson"),
    loadJson<S2Geojson>("waymo_s2_latest.geojson"),
    loadJson<VintageSummary>("waymo_s2_vintage_summary.json"),
  ]);

  return <main className="max-w-7xl px-5 sm:px-8 py-6">
    <p className="eyebrow mb-3">United States · Deployment</p>
    <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Autonomous vehicle deployment</h1>
    <p className="mt-2 text-sm text-neutral-600 max-w-3xl">Choose a company to see documented testing and deployment. For Waymo, select a city to explore published S2 mileage or its service-area geography.</p>
    <div className="mt-5"><CompanyDeploymentExplorer locations={operational.locations} geometries={geometries} latestS2={latestS2} vintages={vintages} /></div>

    <details className="viz-card mt-7 p-5"><summary className="cursor-pointer font-semibold text-lg">Permit records and reporting context</summary>
      <p className="mt-2 text-sm text-neutral-600">The map shows documented activity, not every state authorization. A state permit may cover a narrower operating area; a published company roster is available only in some states. <Link className="underline text-[#184f95]" href="/policy/states">View state policy →</Link></p>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead className="text-left text-neutral-500"><tr><th>State</th><th>Status</th><th>Agency</th><th>Evidence</th></tr></thead><tbody>{registry.states_status_notes.map(s => <tr key={s.state} className="border-t border-neutral-100"><td>{s.state}</td><td>{s.status.replaceAll("_", " ")}</td><td>{s.agency ?? "—"}</td><td>{s.note}</td></tr>)}</tbody></table></div>
      <h3 className="font-semibold mt-6">Massachusetts testing reports</h3><p className="text-sm text-neutral-600 mt-1">{ma.coverage} {ma.important_caveat}</p>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-3">{ma.companies.map(c => <div className="border border-neutral-200 rounded-lg p-3 text-sm" key={c.company}><strong>{c.company}</strong><div className="text-neutral-600 mt-1">{c.testing_report_count} reports · last period {c.latest_period_end ?? "unavailable"}</div><a className="text-[#184f95] underline" href={c.documents[0]?.url ?? ma.source_list_url} target="_blank" rel="noreferrer">Source ↗</a></div>)}</div>
    </details>
  </main>;
}
