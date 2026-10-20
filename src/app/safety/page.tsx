import { promises as fs } from "fs";
import path from "path";
import { SgoMonthlyDataset, isCompleteSgoMonth, SGO_COMPLETE_THROUGH } from "@/lib/safety";
import { monthLabel } from "@/lib/activity";
import { ChartCard } from "@/components/ChartCard";
import { StatTile } from "@/components/StatTile";
import { SafetyExplorer } from "@/components/SafetyExplorer";
import { UsStateMap } from "@/components/UsStateMap";
import { TopEntitiesChart } from "@/components/SafetyCharts";
import type { SgoIncidentRow } from "@/components/SgoDeepDive";
import { SgoCompanyExplorer } from "@/components/SgoCompanyExplorer";
import { SgoSeriousCrashList, type MediaLink, type SeriousCrash, type MediaContext, type ReviewedSource } from "@/components/SgoSeriousCrashList";

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

async function loadCanonicalCrashes(): Promise<SgoIncidentRow[]> {
  const raw = await fs.readFile(path.join(process.cwd(), "public", "data", "sgo_crashes.csv"), "utf-8");
  const table = parseCsv(raw);
  const headers = table.shift() ?? [];
  const idx = new Map(headers.map((h, i) => [h, i]));
  const details = parseCsv(await fs.readFile(path.join(process.cwd(), "public", "data", "sgo_crash_details.csv"), "utf-8"));
  const detailHeader = details.shift() ?? [];
  const detailIdx = new Map(detailHeader.map((h, i) => [h, i]));
  const airBags = new Map(details.map(r => [r[detailIdx.get("report_id") ?? -1], r[detailIdx.get("air_bag_deployment") ?? -1]]));
  const read = (r: string[], key: string) => r[idx.get(key) ?? -1] ?? "";
  return table.filter(r => r.length > 1).map(r => {
    const reportIds = read(r, "report_ids");
    const entities = read(r, "reporting_entities");
    const bags = reportIds.split(";").map(id => airBags.get(id)).filter(Boolean) as string[];
    return {
      incident_id: read(r, "incident_id"),
      report_ids: reportIds,
      report_id: reportIds.split(";")[0] || "",
      reporting_entities: entities,
      reporting_entity: entities,
      incident_date: read(r, "incident_date"),
      city: read(r, "city"),
      state: read(r, "state"),
      make: read(r, "make"),
      model: read(r, "model"),
      crash_with: read(r, "crash_with"),
      roadway_type: read(r, "roadway_type"),
      highest_injury_severity: read(r, "severity"),
      within_odd: read(r, "within_odd"),
      automation_system_engaged: read(r, "automation_system_engaged"),
      air_bag_deployment: bags.find(v => !/^(unknown|not reported)$/i.test(v)) ?? bags[0] ?? "Unknown",
      report_version: "", report_type: "", report_month: "", report_year: "",
      engagement_status: "", operating_entity: "",
    } as SgoIncidentRow;
  });
}

export default async function SafetyPage() {
  const [sgo, incidentRows, canonicalCrashes, seriousCrashes, mediaContext, mediaLinkStore] = await Promise.all([
    loadJson<SgoMonthlyDataset>("sgo_crashes_monthly.json"),
    loadSgoRows(),
    loadCanonicalCrashes(),
    fs.readFile(path.join(process.cwd(), "public", "data", "sgo_serious_fatal_crashes.csv"), "utf-8").then(raw => {
      const rows = parseCsv(raw); const header = rows.shift() ?? [];
      return rows.filter(r => r.length > 1).map(r => Object.fromEntries(header.map((key, i) => [key, r[i] ?? ""])) as SeriousCrash);
    }),
    loadJson<{records:MediaContext[];reviewed_sources:ReviewedSource[]}>("sgo_media_context.json"),
    loadJson<{crashes:Record<string,{media:MediaLink[]}>}>("sgo_serious_media_links.json").catch(()=>({crashes:{}})),
  ]);

  const completeThrough = monthLabel(SGO_COMPLETE_THROUGH.year, SGO_COMPLETE_THROUGH.month);
  const excludedLabel = monthLabel(SGO_COMPLETE_THROUGH.year + (SGO_COMPLETE_THROUGH.month === 12 ? 1 : 0), SGO_COMPLETE_THROUGH.month % 12 + 1);
  const completedCrashRows = canonicalCrashes.filter(r => {
    const match = /^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{4})$/i.exec(r.incident_date);
    if (!match) return false;
    const month = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"].indexOf(match[1].toUpperCase()) + 1;
    return isCompleteSgoMonth(Number(match[2]), month);
  });
  const incidentsByState: Record<string, number> = {};
  for (const r of sgo.monthly_by_state) {
    if (!isCompleteSgoMonth(r.year, r.month)) continue;
    incidentsByState[r.state] = (incidentsByState[r.state] ?? 0) + r.incident_count;
  }

  // Serious/fatal cases share the canonical incident population; curated narratives
  // are annotations, never a second source of crash counts.
  const seriousCases: SeriousCrash[] = completedCrashRows
    .filter(r => r.automation_system_engaged === "ADS" && /^(Serious|Fatal)/i.test(r.highest_injury_severity))
    .map(r => {
      const ids = new Set((r.report_ids || "").split(";").map(x => x.trim()));
      const reviewed = seriousCrashes.find(c => c.report_ids.split(";").some(id => ids.has(id.trim())));
      return {
        incident_key: r.incident_id || r.report_id,
        incident_date: r.incident_date,
        city: r.city,
        state: r.state,
        reporting_entities: r.reporting_entities || r.reporting_entity,
        report_ids: r.report_ids || r.report_id,
        severity: r.highest_injury_severity,
        make: r.make,
        model: r.model,
        crash_with: r.crash_with,
        roadway_type: r.roadway_type,
        engagement_status: r.automation_system_engaged,
        air_bag_deployment: reviewed?.air_bag_deployment ?? r.air_bag_deployment,
        source_url: reviewed?.source_url ?? "https://static.nhtsa.gov/odi/ffdd/sgo-2021-01/SGO-2021-01_Incident_Reports_ADS.csv",
      };
    });

  return (
    <div className="max-w-6xl px-8 py-6">
      <p className="eyebrow mb-3">United States · Crash Reporting</p>
      <h1 className="text-4xl font-semibold tracking-tight max-w-3xl">US Crash Tracker</h1>
      <p className="mt-2 text-sm text-neutral-600 max-w-3xl">NHTSA SGO incident reports by reporting entity, geography, vehicle, roadway, collision counterpart, injury severity, and reported ODD status. {excludedLabel} is currently incomplete and excluded.</p>

      <div className="mt-5 grid sm:grid-cols-3 gap-2.5">
        <StatTile label="Deduplicated Crashes" value={completedCrashRows.length.toLocaleString()} caption={`Unique dated crashes through ${completeThrough}; cross-entity filings merged`} />
        <StatTile label="States Represented" value={new Set(completedCrashRows.map(r => r.state).filter(Boolean)).size.toString()} caption="States appearing in reported incidents" />
        <StatTile label="Reporting Entities" value={new Set(completedCrashRows.flatMap(r => (r.reporting_entities ?? "").split(";").filter(Boolean))).size.toString()} caption="ADS reporting entities represented" />
      </div>

      <section id="trends" className="mt-7">
        <h2 className="text-xl font-semibold tracking-tight">Reported Crashes Over Time</h2>
        <div className="viz-card p-4 mt-2"><SafetyExplorer data={sgo} /></div>
      </section>

      <section id="geography" className="mt-5 grid lg:grid-cols-5 gap-3">
        <div className="lg:col-span-3">
          <ChartCard title="Where Incidents Are Reported" subtitle="Cumulative deduplicated NHTSA SGO crash counts by state. Darker shading means more reported crashes, not necessarily greater risk." source="NHTSA Standing General Order 2021-01">
            <UsStateMap valueByAbbrev={incidentsByState} />
          </ChartCard>
        </div>
        <div id="entities" className="lg:col-span-2">
          <ChartCard title="Reporting Entities" subtitle="All-time deduplicated crash count by reporting entity. A crash reported by multiple entities is counted once nationally, but may appear under each involved reporting entity in this breakdown." source="NHTSA Standing General Order 2021-01">
            <TopEntitiesChart data={sgo} />
          </ChartCard>
        </div>
      </section>

      <SgoSeriousCrashList
        crashes={seriousCases}
        media={mediaContext.records}
        reviewedSources={mediaContext.reviewed_sources}
        mediaLinks={Object.fromEntries(Object.entries(mediaLinkStore.crashes).map(([k, v]) => [k, v.media]))}
        excludedMonth={excludedLabel}
      />

      <SgoCompanyExplorer rows={canonicalCrashes} serious={seriousCases} />
    </div>
  );
}
