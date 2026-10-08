import { promises as fs } from "fs";
import path from "path";
import { SgoMonthlyDataset, isCompleteSgoMonth } from "@/lib/safety";
import { ChartCard } from "@/components/ChartCard";
import { StatTile } from "@/components/StatTile";
import { SafetyExplorer } from "@/components/SafetyExplorer";
import { UsStateMap } from "@/components/UsStateMap";
import { TopEntitiesChart } from "@/components/SafetyCharts";
import { SgoDeepDive, SgoIncidentRow } from "@/components/SgoDeepDive";
import { SgoSeriousCrashList, type SeriousCrash, type MediaContext, type ReviewedSource } from "@/components/SgoSeriousCrashList";

async function loadJson<T>(filename: string): Promise<T> {
  const file = path.join(process.cwd(), "public", "data", filename);
  const raw = await fs.readFile(file, "utf-8");
  return JSON.parse(raw);
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else {
      if (ch === '"') quoted = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n") { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
      else field += ch;
    }
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

async function loadSgoRows(): Promise<SgoIncidentRow[]> {
  const file = path.join(process.cwd(), "public", "data", "sgo_incidents.csv");
  const raw = await fs.readFile(file, "utf-8");
  const rows = parseCsv(raw);
  const details = parseCsv(await fs.readFile(path.join(process.cwd(), "public", "data", "sgo_crash_details.csv"), "utf-8"));
  const detailHeader = details.shift() ?? [];
  const detailIdx = new Map(detailHeader.map((h, i) => [h, i]));
  const bags = new Map(details.map(r => [r[detailIdx.get("report_id") ?? -1], r[detailIdx.get("air_bag_deployment") ?? -1]]));
  const header = rows.shift() ?? [];
  const idx = new Map(header.map((h,i)=>[h,i]));
  const fields: (keyof SgoIncidentRow)[] = [
    "report_id","report_version","reporting_entity","report_type","report_month","report_year",
    "make","model","automation_system_engaged","engagement_status","operating_entity","incident_date",
    "city","state","roadway_type","crash_with","highest_injury_severity","within_odd"
  ];
  return rows.filter(r=>r.length>1).map(r=>{
    const out = {} as SgoIncidentRow;
    for (const key of fields) out[key] = r[idx.get(key) ?? -1] ?? "";
    out.air_bag_deployment = bags.get(out.report_id) ?? "Unknown";
    return out;
  });
}

export default async function SafetyPage() {
  const [sgo, incidentRows, seriousCrashes, mediaContext] = await Promise.all([
    loadJson<SgoMonthlyDataset>("sgo_incidents_monthly.json"),
    loadSgoRows(),
    fs.readFile(path.join(process.cwd(), "public", "data", "sgo_serious_fatal_crashes.csv"), "utf-8").then(raw => {
      const rows = parseCsv(raw); const header = rows.shift() ?? [];
      return rows.filter(r => r.length > 1).map(r => Object.fromEntries(header.map((key, i) => [key, r[i] ?? ""])) as SeriousCrash);
    }),
    loadJson<{records:MediaContext[];reviewed_sources:ReviewedSource[]}>("sgo_media_context.json"),
  ]);

  const incidentsByState: Record<string, number> = {};
  for (const r of sgo.monthly_by_state) {
    if (!isCompleteSgoMonth(r.year, r.month)) continue;
    incidentsByState[r.state] = (incidentsByState[r.state] ?? 0) + r.incident_count;
  }

  return (
    <div className="max-w-6xl px-8 py-6">
      <p className="eyebrow mb-3">United States · Crash Reporting</p>
      <h1 className="text-4xl font-semibold tracking-tight max-w-3xl">AV Crash Reporting</h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">NHTSA SGO incident reports by reporting entity, geography, vehicle, roadway, collision counterpart, injury severity, and reported ODD status. August 2026 is currently incomplete and excluded.</p>

      <div className="mt-5 grid sm:grid-cols-3 gap-2.5">
        <StatTile label="Incident Reports" value={sgo.row_count.toLocaleString()} caption="NHTSA SGO records in the Observatory" />
        <StatTile label="States Represented" value={sgo.states_represented.length.toString()} caption="States appearing in reported incidents" />
        <StatTile label="Reporting Entities" value={sgo.entities_represented.length.toString()} caption="ADS reporting entities represented" />
      </div>

      <section id="trends" className="mt-7">
        <h2 className="text-xl font-semibold tracking-tight">Incident Reports Over Time</h2>
        <div className="viz-card p-4 mt-2"><SafetyExplorer data={sgo} /></div>
      </section>

      <section id="geography" className="mt-5 grid lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3">
          <ChartCard title="Where Incidents Are Reported" subtitle="Cumulative NHTSA SGO incident-report counts by state. Darker shading means more reports, not necessarily greater risk." source="NHTSA Standing General Order 2021-01">
            <UsStateMap valueByAbbrev={incidentsByState} />
          </ChartCard>
        </div>
        <div id="entities" className="lg:col-span-2">
          <ChartCard title="Reporting Entities" subtitle="All-time report count by entity. Exposure differs substantially across operators." source="NHTSA Standing General Order 2021-01">
            <TopEntitiesChart data={sgo} />
          </ChartCard>
        </div>
      </section>

      <SgoSeriousCrashList
        crashes={[
          ...seriousCrashes,
          ...incidentRows
            .filter(r => r.reporting_entity === "Tesla, Inc." && r.automation_system_engaged === "ADS" && (/^Serious/i.test(r.highest_injury_severity) || /^Fatal/i.test(r.highest_injury_severity)))
            .filter(r => !seriousCrashes.some(c => c.report_ids.split(";").map(id => id.trim()).includes(r.report_id)))
            .map(r => ({
              incident_key: `tesla-${r.report_id}`,
              incident_date: r.incident_date,
              city: r.city,
              state: r.state,
              reporting_entities: r.reporting_entity,
              report_ids: r.report_id,
              severity: r.highest_injury_severity,
              make: r.make,
              model: r.model,
              crash_with: r.crash_with,
              roadway_type: r.roadway_type,
              engagement_status: r.engagement_status || r.automation_system_engaged,
              air_bag_deployment: r.air_bag_deployment,
              source_url: "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv",
            }))
        ]}
        media={mediaContext.records}
        reviewedSources={mediaContext.reviewed_sources}
      />

      <section className="mt-7">
        <div className="mb-2">
          <h2 className="text-xl font-semibold tracking-tight">Inside the SGO Reports</h2>
          <p className="text-sm text-neutral-600 mt-1">
            Filter the incident-level database and inspect how report characteristics differ across manufacturers, states, road environments, crash counterparts, and alleged injury severity.
          </p>
        </div>
        <SgoDeepDive rows={incidentRows} />
      </section>

    </div>
  );
}
