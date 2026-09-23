import { promises as fs } from "fs";
import path from "path";
import { OddExplorer } from "@/components/OddExplorer";

async function loadJson<T>(filename: string): Promise<T> {
  const file = path.join(process.cwd(), "public", "data", filename);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

type OperationalLocation = {
  company: string;
  state: string;
  market: string;
  lat: number;
  lon: number;
  phase: string;
  status: string;
  mode: string;
  geometry_basis: string;
  source_url: string;
  source_date?: string;
  geometry_path?: string;
  note?: string;
};

export default async function OddPage() {
  const odd = await loadJson<{ locations: OperationalLocation[] }>("operational_domains.json");

  return (
    <div className="max-w-6xl px-8 py-6">
      <p className="eyebrow mb-3">Operational design domains</p>
      <h1 className="text-4xl font-semibold tracking-tight">Where AVs actually operate</h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">
        Company testing and deployment footprints, kept separate because an AV developer may test in a much larger or different geography than it serves in deployment.
      </p>

      <section className="mt-5">
        <OddExplorer locations={odd.locations} />
      </section>

      <div className="mt-5 text-xs text-neutral-500 max-w-4xl leading-relaxed">
        Geometry is labeled by provenance and phase. Testing ODDs are not assumed to equal deployment ODDs. Waymo S2 mileage is treated as deployment/operational exposure only, not testing exposure.
      </div>
    </div>
  );
}
