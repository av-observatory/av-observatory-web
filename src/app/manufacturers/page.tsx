import { promises as fs } from "fs";
import path from "path";
import { ManufacturerTracker } from "@/components/ManufacturerTracker";
import type { Location, Geojson } from "@/components/CompanyDeploymentExplorer";
import { buildProfiles } from "@/lib/manufacturers";
export default async function ManufacturersPage() {
  const [operational, geometries] = await Promise.all(["operational_domains.json","odd_current_geometries.geojson"].map(async file=>JSON.parse(await fs.readFile(path.join(process.cwd(),"public/data",file),"utf8"))));
  const locations = (operational as {locations:Location[]}).locations;
  const shapes = geometries as Geojson;
  const profileRows = [...locations.filter(x=>x.evidence_status === "current" && ["testing","deployment"].includes(x.activity_type ?? x.phase)),...shapes.features.filter(f=>f.properties?.evidence_status === "current" && f.properties.company).map(f=>({company:String(f.properties?.company),mode:String(f.properties?.mode ?? "passenger"),market:String(f.properties?.market),state:String(f.properties?.state),source_url:String(f.properties?.source_url ?? ""),source_date:String(f.properties?.event_date ?? "")}))];
  const profiles = buildProfiles(profileRows);
  return <main className="max-w-7xl px-8 py-8"><p className="eyebrow">Operations / U.S. Manufacturers</p><h1 className="text-4xl font-semibold mt-3 text-[#0b1d33]">Manufacturers Tracker</h1><p className="mt-3 text-base text-neutral-600 max-w-3xl">Choose a manufacturer, read its operating model and partnerships, then inspect documented service areas, freight corridors, and testing points. A permit or announcement alone is not mapped as current activity.</p><ManufacturerTracker locations={locations} geometries={shapes} profiles={profiles} /></main>;
}
