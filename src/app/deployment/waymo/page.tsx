import { promises as fs } from "fs";
import path from "path";
import Link from "next/link";
import { CompanyDeploymentExplorer, type Location, type Geojson, type S2Geojson, type VintageSummary } from "@/components/CompanyDeploymentExplorer";

async function loadJson<T>(filename: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.join(process.cwd(), "public", "data", filename), "utf-8"));
}

export default async function WaymoDeploymentPage() {
  const [operational, geometries, latestS2, vintages] = await Promise.all([
    loadJson<{ locations: Location[] }>("operational_domains.json"),
    loadJson<Geojson>("odd_current_geometries.geojson"),
    loadJson<S2Geojson>("waymo_s2_latest.geojson"),
    loadJson<VintageSummary>("waymo_s2_vintage_summary.json"),
  ]);
  return <main className="max-w-7xl px-5 sm:px-8 py-6">
    <p className="eyebrow mb-3">United States · Deployment</p>
    <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Waymo deployment</h1>
    <p className="text-sm text-neutral-600 mt-2">Select a city to explore S2 operational mileage or its documented service-area geography. The same map also covers other companies.</p>
    <Link href="/deployment" className="text-sm text-[#184f95] underline inline-block mt-2">Deployment overview →</Link>
    <div className="mt-5"><CompanyDeploymentExplorer locations={operational.locations} geometries={geometries} latestS2={latestS2} vintages={vintages} /></div>
  </main>;
}
