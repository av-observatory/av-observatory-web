import { promises as fs } from "fs";
import path from "path";
import { OddExplorer } from "@/components/OddExplorer";
import { WaymoS2Explorer } from "@/components/WaymoS2Explorer";
import { DeploymentTabs } from "@/components/DeploymentTabs";

async function loadJson<T>(filename: string): Promise<T> {
  const file = path.join(process.cwd(), "public", "data", filename);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

export default async function WaymoDeploymentPage() {
  const odd = await loadJson<{ locations: { company:string; state:string; market:string; lat:number|null; lon:number|null; phase:string; status:string; mode:string; geometry_basis:string; source_url:string; note?:string }[] }>("operational_domains.json");
  const oddHistory = await loadJson<{ historical_events: { date:string; event_type:string; phase:string; company:string; market:string; state:string; geometry_ref?:string|null; geometry_basis?:string; source_url?:string|null }[] }>("odd_history.json");
  const oddGeometries = await loadJson<{ type:"FeatureCollection"; features:{ type:"Feature"; properties?:Record<string,unknown>; geometry:unknown }[] }>("odd_geometries.geojson");
  const oddCurrentGeometries = await loadJson<{ type:"FeatureCollection"; features:{ type:"Feature"; properties?:Record<string,unknown>; geometry:unknown }[] }>("odd_current_geometries.geojson");
  const s2Summary = await loadJson<any>("waymo_s2_vintage_summary.json");
  const s2Geo = await loadJson<any>("waymo_s2_latest.geojson");

  return (
    <div className="max-w-6xl px-8 py-6">
      <p className="eyebrow mb-3">United States · Deployment · Waymo</p>
      <h1 className="text-4xl font-semibold tracking-tight">Waymo Deployment Explorer</h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
        Current rider-service areas, historical boundary snapshots, and observed S2 mileage are separated so the map does not mix vintages or evidence types.
      </p>
      <DeploymentTabs active="waymo" />

      <section id="service-areas" className="mt-8">
        <div className="mb-2">
          <h2 className="text-xl font-semibold tracking-tight">Service areas and ODD history</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Current service-area boundaries are shown by default. Switch to Historical snapshot to inspect the latest known boundary as of a selected date.
          </p>
        </div>
        <OddExplorer
          locations={odd.locations}
          history={oddHistory.historical_events}
          geometries={oddGeometries}
          currentGeometries={oddCurrentGeometries}
          manufacturerNames={["Waymo"]}
          initialCompany="Waymo"
          hideCompanyFilter
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
    </div>
  );
}
