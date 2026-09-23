import { promises as fs } from "fs";
import path from "path";
import { WaymoS2Explorer } from "@/components/WaymoS2Explorer";
import { DeploymentTabs } from "@/components/DeploymentTabs";

async function loadJson<T>(filename: string): Promise<T> {
  const file = path.join(process.cwd(), "public", "data", filename);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

export default async function WaymoDeploymentPage() {
  const odd = await loadJson<{ locations: { company:string; state:string; market:string; lat:number|null; lon:number|null; phase:string; status:string; mode:string; geometry_basis:string; source_url:string; note?:string }[] }>("operational_domains.json");
  const oddCurrentGeometries = await loadJson<{ type:"FeatureCollection"; features:{ type:"Feature"; properties?:Record<string,unknown>; geometry:unknown }[] }>("odd_current_geometries.geojson");
  const s2Summary = await loadJson<any>("waymo_s2_vintage_summary.json");
  const s2Geo = await loadJson<any>("waymo_s2_latest.geojson");

  return (
    <div className="max-w-6xl px-8 py-6">
      <p className="eyebrow mb-3">United States · Deployment · Waymo</p>
      <h1 className="text-4xl font-semibold tracking-tight">Waymo Deployment Explorer</h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
        Current Waymo markets with observed S2 mileage where published, using current service-area boundaries as context and as the fallback where VMT has not yet been reported.
      </p>
      <DeploymentTabs active="waymo" />

      <section id="s2" className="mt-8">
        <div className="mb-2">
          <h2 className="text-xl font-semibold tracking-tight">Waymo markets and observed deployment</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Market-by-market views prioritize published S2 VMT. Current service-area polygons remain as context and fill gaps where Waymo has not yet published cell-level mileage.
          </p>
        </div>
        <WaymoS2Explorer summary={s2Summary} geojson={s2Geo} serviceGeojson={oddCurrentGeometries} locations={odd.locations} />
      </section>
    </div>
  );
}
