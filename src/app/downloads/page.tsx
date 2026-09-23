import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const DATA_DIR = join(process.cwd(), "public", "data");
const FORMATS = new Set(["json", "csv", "geojson"]);
const GROUPS = [
  { name: "Policy and Legislation", key: "policy", description: "Reviewed federal, state, and city actions and current bill records." },
  { name: "Crash and Trip Reporting", key: "reporting", description: "NHTSA crash reports and California CPUC trip data." },
  { name: "Manufacturers and Deployment", key: "operations", description: "Operator profiles, permits, service areas, and mapped activity." },
] as const;

function groupFor(name: string) {
  if (/policy|legislation/.test(name)) return "policy";
  if (/sgo_incidents|cpuc_activity|cpuc_vs_waymo|exposure_rate/.test(name)) return "reporting";
  return "operations";
}
function labelFor(name: string) {
  return name.replace(/\.(geojson|json|csv)$/, "").replaceAll("_", " ")
    .replace(/\b(sgo|cpuc|adt|odd|s2|vmt|ca)\b/gi, (match) => match.toUpperCase())
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function descriptionFor(name: string) {
  if (name === "legislation_tracker.json") return "Indexed federal and state bills; the live bill feed may have newer records.";
  if (name === "policy_tracker.json") return "Reviewed federal, state, and city policy actions and history.";
  if (name === "sgo_incidents.csv") return "One latest-version record per NHTSA SGO report ID.";
  if (name === "sgo_incidents_all_versions.csv") return "Original versioned reports; contains multiple versions of some reports.";
  if (name === "sgo_incidents_monthly.json") return "Monthly aggregates of latest-version SGO crash reports.";
  if (name.startsWith("cpuc_activity")) return "California CPUC monthly passenger trips, riders, and vehicle miles.";
  if (name === "manufacturer_profiles.json") return "Operator services, approaches, partnerships, and developments.";
  if (name === "operational_domains.json") return "Documented testing and deployment locations.";
  if (name.includes("odd")) return "Service area geometry or its historical record.";
  if (name.includes("waymo_s2")) return "Waymo S2 activity release or geographic summary; S2 mileage is not an official service boundary.";
  if (name === "state_permit_registry.json" || name === "ma_adt_testing_registry.json") return "Agency permit and testing registry snapshot.";
  return "Derived research dataset used by the Observatory.";
}
const files = readdirSync(DATA_DIR).filter(name => FORMATS.has(name.split(".").pop() ?? ""))
  .map(name => ({ name, group: groupFor(name), size: statSync(join(DATA_DIR, name)).size }));

export default function DownloadsPage() {
  return <main className="max-w-5xl px-8 py-8">
    <p className="eyebrow">Data / Downloads</p>
    <h1 className="text-4xl font-semibold tracking-tight text-[#0b1d33] mt-2">Data Catalog</h1>
    <p className="mt-3 max-w-3xl text-neutral-600 leading-relaxed">Download every machine readable dataset used by this site. Files are available directly from this deployed revision; the R2 archive stores immutable, checked snapshots. Review the linked tracker for sourcing and interpretation before reuse.</p>
    <p className="mt-2 text-sm text-neutral-600">{files.length} files · JSON, CSV, and GeoJSON</p>
    {GROUPS.map(group => <section key={group.key} className="mt-8">
      <h2 className="text-2xl font-semibold text-[#0b1d33]">{group.name}</h2>
      <p className="mt-1 text-sm text-neutral-600">{group.description}</p>
      <div className="mt-4 grid gap-3">
        {files.filter(file => file.group === group.key).map(file => <article key={file.name} className="bg-white border border-[#dce5ec] rounded-lg px-5 py-4 sm:flex sm:items-center sm:justify-between gap-6">
          <div className="min-w-0"><h3 className="font-semibold text-[#152b45]">{labelFor(file.name)}</h3><p className="text-sm text-neutral-600 mt-1">{descriptionFor(file.name)}</p><p className="text-xs text-neutral-500 mt-1 break-all">{file.name}</p></div>
          <a href={`${BASE_PATH}/data/${file.name}`} download className="inline-block mt-3 sm:mt-0 shrink-0 text-sm font-semibold text-[#184f95] underline underline-offset-2">Download {file.name.split(".").pop()?.toUpperCase()} ↗</a>
        </article>)}
      </div>
    </section>)}
    <p className="mt-8 text-sm text-neutral-600">The website updates these files when a new revision deploys. The separate live legislation feed may be newer than the bundled legislation snapshot.</p>
  </main>;
}
