import { promises as fs } from "fs";
import path from "path";
import { buildProfiles } from "./manufacturers";
export async function currentCompanyProfiles() {
  const odd = JSON.parse(await fs.readFile(path.join(process.cwd(), "public/data/operational_domains.json"), "utf8"));
  const polygons = JSON.parse(await fs.readFile(path.join(process.cwd(), "public/data/odd_current_geometries.geojson"), "utf8"));
  const rows = odd.locations.filter((r: {activity_type?: string;phase:string;evidence_status?:string;status:string}) =>
    (r.activity_type ?? r.phase) === "deployment" && (r.evidence_status ?? "current") === "current" && !/planned|authorized|permit/i.test(r.status));
  for (const f of polygons.features) {
    const p = f.properties ?? {};
    if ((p.activity_type ?? p.phase) === "deployment" && (p.evidence_status ?? "current") === "current" && p.company)
      rows.push({company:p.company,mode:p.mode ?? "passenger",market:p.market,state:p.state,source_url:p.source_url ?? "",source_date:p.event_date ?? ""});
  }
  return buildProfiles(rows);
}
