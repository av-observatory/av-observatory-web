import { promises as fs } from "fs";
import path from "path";
import { OddExplorer } from "@/components/OddExplorer";

async function loadJson<T>(filename: string): Promise<T> {
  const file = path.join(process.cwd(), "public", "data", filename);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

type OperationalLocation = {
  company: string; state: string; market: string; lat: number | null; lon: number | null;
  phase: string; status: string; mode: string; geometry_basis: string;
  source_url: string; source_date?: string; geometry_path?: string; note?: string;
};
type OddEvent = {
  date:string; event_type:string; phase:string; company:string; market:string;
  state:string; geometry_ref?:string|null; geometry_basis?:string; source_url?:string|null;
};
type Feature = { type:"Feature"; properties?:Record<string,unknown>; geometry:unknown };

export default async function OddPage() {
  const [odd, history, geometries, currentGeometries] = await Promise.all([
    loadJson<{ locations: OperationalLocation[] }>("operational_domains.json"),
    loadJson<{ historical_events: OddEvent[] }>("odd_history.json"),
    loadJson<{ type:"FeatureCollection"; features:Feature[] }>("odd_geometries.geojson"),
    loadJson<{ type:"FeatureCollection"; features:Feature[] }>("odd_current_geometries.geojson"),
  ]);

  return (
    <div className="max-w-6xl px-8 py-6">
      <p className="eyebrow mb-3">Deployment · ODD / service areas</p>
      <h1 className="text-4xl font-semibold tracking-tight">ODD and service-area geography</h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
        Interactive testing and deployment boundaries. This same analysis is integrated into the Deployment page.
      </p>
      <section className="mt-5">
        <OddExplorer locations={odd.locations} history={history.historical_events} geometries={geometries} currentGeometries={currentGeometries} />
      </section>
    </div>
  );
}
